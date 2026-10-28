import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  generateDungeon,
  evaluateEnemySteering,
  computeTouchJoystickVector,
  CAMERA_PRESETS,
  computeCameraOrbitOffset,
  computeCameraRelativeMovement,
  resolveSmoothDungeonMovement,
  type CameraPresetId,
  type GeneratedDungeon,
  type EnemyArchetype,
} from './rules';
import {
  createProceduralTextures,
  createPlayerHeroMesh,
  createEnemyMesh,
  createDungeonPropMesh,
} from './models3d';
import { sound } from './sound';

export interface HudTelemetrySnapshot {
  hp: number;
  maxHp: number;
  floor: number;
  runGold: number;
  runKills: number;
  runChests: number;
  runSecrets: number;
  dashCooldown: number;
  novaCooldown: number;
  nearbyPrompt: string | null;
  playerGridX: number;
  playerGridZ: number;
  dungeon: GeneratedDungeon;
  activeEnemyCoords: { x: number; z: number; archetype: EnemyArchetype }[];
  activePropCoords: { x: number; z: number; type: string }[];
  cameraYawDeg: number;
  cameraDistance: number;
}

export interface DungeonCanvasProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  floor: number;
  seedOverride?: number;
  avatarColor: string;
  playerStats: {
    maxHp: number;
    attackDamage: number;
    defense: number;
    critChance: number;
    moveSpeedMultiplier: number;
    attackRangeBonus: number;
    lifeOnKill: number;
    hpRegenPerSec: number;
    novaDamage: number;
    novaCooldownMax: number;
    dashCooldownMax: number;
    goldMultiplier: number;
  };
  healTriggerCount: number;
  novaTriggerCount: number;
  dashTriggerCount: number;
  attackTriggerCount: number;
  interactTriggerCount: number;
  touchMoveVector?: { moveX: number; moveZ: number };
  sprintEnabled?: boolean;
  cameraAutoFollow?: boolean;
  cameraPreset: CameraPresetId;
  cameraRotateInput?: number;
  cameraZoomStepCount?: number;
  cameraZoomStepDir?: 'in' | 'out';
  cameraResetTriggerCount?: number;
  onTelemetryUpdate: (snap: HudTelemetrySnapshot) => void;
  onCollectGold: (amount: number) => void;
  onOpenChest: (goldAmount: number) => void;
  onDiscoverSecret: () => void;
  onEnemyKilled: (archetype: EnemyArchetype) => void;
  onSkillUsed: () => void;
  onFloorCleared: () => void;
  onPlayerDefeated: () => void;
  onTogglePause: () => void;
}

// Module-scope reusable math objects for Zero-GC inside the render loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface LiveEnemy {
  id: string;
  archetype: EnemyArchetype;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  state: 'idle' | 'windup' | 'charging' | 'recover' | 'ko';
  stateTimer: number;
  chargeDirX: number;
  chargeDirZ: number;
  hitFlashTimer: number;
  meshGroup: THREE.Group;
  bodyGroup: THREE.Group;
  telegraphMesh: THREE.Object3D;
  hitFlashMaterials: THREE.MeshStandardMaterial[];
}

interface LiveProp {
  id: string;
  type: 'chest' | 'gold' | 'shrine' | 'secret_altar';
  x: number;
  z: number;
  value: number;
  collected: boolean;
  mesh: THREE.Group;
}

interface LiveProjectile {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  damage: number;
  mesh: THREE.Mesh;
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  colorHex: number;
}

export const DungeonCanvas: React.FC<DungeonCanvasProps> = (props) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef<DungeonCanvasProps>(props);
  propsRef.current = props;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software-WebGL Guard per Three.js skill
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fogColor = new THREE.Color(0x0b0912);
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(0x0b0912, 0.042);

    // 2. Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      55,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      90,
    );

    // 3. Balanced Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x6366f1, 0x1e1b2e, 0.85);
    hemiLight.position.set(0, 25, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 1.85);
    keyLight.position.set(16, 26, 14);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      const d = 24;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 60;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);
    scene.add(keyLight.target);

    // Warm torch point light following hero
    const heroTorch = new THREE.PointLight(0xf59e0b, 3.2, 16, 1.6);
    heroTorch.position.set(0, 3.2, 0);
    scene.add(heroTorch);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAnisotropy);

    // Root container for level geometry so floor transitions rebuild cleanly
    const levelGroup = new THREE.Group();
    scene.add(levelGroup);

    // Player Hero Mesh
    const heroModel = createPlayerHeroMesh(propsRef.current.avatarColor, textures.contactShadow);
    scene.add(heroModel.root);

    // Arcane Nova Shockwave Ring Mesh
    const novaRingGeo = new THREE.RingGeometry(0.4, 1.0, 32);
    novaRingGeo.rotateX(-Math.PI / 2);
    const novaRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const novaRingMesh = new THREE.Mesh(novaRingGeo, novaRingMat);
    novaRingMesh.position.y = 0.15;
    novaRingMesh.visible = false;
    scene.add(novaRingMesh);

    // Click-to-Move / Floor Target Waypoint Ring Mesh
    const waypointRingGeo = new THREE.RingGeometry(0.28, 0.46, 24);
    waypointRingGeo.rotateX(-Math.PI / 2);
    const waypointRingMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const waypointRingMesh = new THREE.Mesh(waypointRingGeo, waypointRingMat);
    waypointRingMesh.position.y = 0.08;
    waypointRingMesh.visible = false;
    scene.add(waypointRingMesh);

    // Pooled 64-Particle InstancedMesh Ring Buffer
    const PARTICLE_COUNT = 64;
    const particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleInstanced = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_COUNT);
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particles: PooledParticle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.5,
      scale: 1,
      colorHex: 0xfbbf24,
    }));
    let particleCursor = 0;

    const spawnParticles = (
      x: number,
      y: number,
      z: number,
      count: number,
      colorHex: number,
      speed = 4.2,
    ) => {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_COUNT;
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random() * 0.8);
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(angle) * spd;
        p.vy = 1.8 + Math.random() * 3.2;
        p.vz = Math.sin(angle) * spd;
        p.life = 0;
        p.maxLife = 0.28 + Math.random() * 0.25;
        p.scale = 0.7 + Math.random() * 0.9;
        p.colorHex = colorHex;
      }
    };

    // Pooled Enemy Ranged Projectiles
    const projectiles: LiveProjectile[] = Array.from({ length: 12 }, () => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xe879f9 }),
      );
      m.visible = false;
      scene.add(m);
      return {
        active: false,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        life: 0,
        damage: 12,
        mesh: m,
      };
    });

    // Mutable Simulation State
    let currentDungeon: GeneratedDungeon = generateDungeon(
      propsRef.current.floor,
      propsRef.current.seedOverride,
    );
    let builtFloorKey = '';
    let playerX = 0;
    let playerZ = 0;
    let playerVx = 0;
    let playerVz = 0;
    let playerFacing = 0;
    let waypointTargetX: number | null = null;
    let waypointTargetZ: number | null = null;
    let playerHp = propsRef.current.playerStats.maxHp;
    let walkDist = 0;
    let squashX = 1;
    let squashY = 1;
    let swingTimer = 0;
    let swingCooldown = 0;
    let dashTimer = 0;
    let dashCooldown = 0;
    let novaCooldown = 0;
    let novaVisualTimer = 0;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    const initPreset = CAMERA_PRESETS[propsRef.current.cameraPreset] ?? CAMERA_PRESETS.isometric;
    let cameraYawOffset = 0;
    let targetCameraYawOffset = 0;
    let cameraPitch = initPreset.pitch;
    let targetCameraPitch = initPreset.pitch;
    let cameraDistance = initPreset.distance;
    let targetCameraDistance = initPreset.distance;
    let lastCameraPresetId: CameraPresetId = propsRef.current.cameraPreset;
    let runGold = 0;
    let runKills = 0;
    let runChests = 0;
    let runSecrets = 0;
    let defeatTriggered = false;
    let exitPortalMesh: THREE.Group | null = null;
    let exitWorldX = 0;
    let exitWorldZ = 0;

    const liveEnemies: LiveEnemy[] = [];
    const liveProps: LiveProp[] = [];

    const gridToWorld = (gx: number, gz: number) => ({
      x: gx * currentDungeon.tileSize,
      z: gz * currentDungeon.tileSize,
    });

    const isWalkableWorld = (wx: number, wz: number, radius = 0.45): boolean => {
      const ts = currentDungeon.tileSize;
      const checkPoints = [
        [wx - radius, wz - radius],
        [wx + radius, wz - radius],
        [wx - radius, wz + radius],
        [wx + radius, wz + radius],
      ];
      for (const [px, pz] of checkPoints) {
        const gx = Math.round(px / ts);
        const gz = Math.round(pz / ts);
        if (
          gz < 0 ||
          gz >= currentDungeon.height ||
          gx < 0 ||
          gx >= currentDungeon.width ||
          currentDungeon.grid[gz][gx] === 'wall'
        ) {
          return false;
        }
      }
      return true;
    };

    const buildDungeonLevel = (floorNum: number, seedOverride?: number) => {
      currentDungeon = generateDungeon(floorNum, seedOverride);
      builtFloorKey = `${floorNum}_${seedOverride ?? 'std'}`;

      // Clear previous level meshes
      while (levelGroup.children.length > 0) {
        const child = levelGroup.children[0];
        levelGroup.remove(child);
      }
      liveEnemies.length = 0;
      liveProps.length = 0;
      projectiles.forEach((p) => {
        p.active = false;
        p.mesh.visible = false;
      });

      const ts = currentDungeon.tileSize;
      let floorCount = 0;
      let wallCount = 0;
      for (let z = 0; z < currentDungeon.height; z++) {
        for (let x = 0; x < currentDungeon.width; x++) {
          if (currentDungeon.grid[z][x] === 'wall') wallCount++;
          else floorCount++;
        }
      }

      const floorGeo = new THREE.BoxGeometry(ts, 0.25, ts);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.floorColor,
        bumpMap: textures.floorBump,
        bumpScale: 0.04,
        roughness: 0.78,
        metalness: 0.15,
      });
      const floorInstanced = new THREE.InstancedMesh(floorGeo, floorMat, Math.max(1, floorCount));
      floorInstanced.receiveShadow = !isSoftwareGl;

      const wallGeo = new THREE.BoxGeometry(ts, 3.6, ts);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: textures.wallColor,
        bumpMap: textures.wallBump,
        bumpScale: 0.06,
        roughness: 0.72,
        metalness: 0.18,
      });
      const wallInstanced = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, wallCount));
      wallInstanced.castShadow = !isSoftwareGl;
      wallInstanced.receiveShadow = !isSoftwareGl;

      let fIdx = 0;
      let wIdx = 0;
      for (let z = 0; z < currentDungeon.height; z++) {
        for (let x = 0; x < currentDungeon.width; x++) {
          const wx = x * ts;
          const wz = z * ts;
          if (currentDungeon.grid[z][x] === 'wall') {
            // Only place visible wall blocks if adjacent to a non-wall tile to save fillrate
            let nearFloor = false;
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nz = z + dz;
                const nx = x + dx;
                if (
                  nz >= 0 &&
                  nz < currentDungeon.height &&
                  nx >= 0 &&
                  nx < currentDungeon.width &&
                  currentDungeon.grid[nz][nx] !== 'wall'
                ) {
                  nearFloor = true;
                }
              }
            }
            if (nearFloor) {
              _vec3A.set(wx, 1.8, wz);
              _quat.identity();
              _scale.set(1, 0.96 + ((x * 7 + z * 13) % 9) * 0.01, 1);
              _mat4.compose(_vec3A, _quat, _scale);
              wallInstanced.setMatrixAt(wIdx, _mat4);
              const shade = 0.85 + ((x * 3 + z * 5) % 4) * 0.05;
              _color.setRGB(shade, shade * 0.97, shade * 1.03);
              wallInstanced.setColorAt(wIdx, _color);
              wIdx++;
            }
          } else {
            _vec3A.set(wx, -0.125, wz);
            _quat.identity();
            _scale.set(1, 1, 1);
            _mat4.compose(_vec3A, _quat, _scale);
            floorInstanced.setMatrixAt(fIdx, _mat4);
            const shade = 0.9 + ((x + z) % 2) * 0.08;
            _color.setRGB(shade, shade, shade * 1.04);
            floorInstanced.setColorAt(fIdx, _color);
            fIdx++;
          }
        }
      }

      wallInstanced.count = wIdx;
      floorInstanced.count = fIdx;
      wallInstanced.instanceMatrix.needsUpdate = true;
      if (wallInstanced.instanceColor) wallInstanced.instanceColor.needsUpdate = true;
      wallInstanced.computeBoundingSphere();

      floorInstanced.instanceMatrix.needsUpdate = true;
      if (floorInstanced.instanceColor) floorInstanced.instanceColor.needsUpdate = true;
      floorInstanced.computeBoundingSphere();

      levelGroup.add(floorInstanced, wallInstanced);

      // Spawn Player on open path facing +X
      const spawnWorld = gridToWorld(currentDungeon.spawn.gx, currentDungeon.spawn.gz);
      playerX = spawnWorld.x;
      playerZ = spawnWorld.z;
      playerVx = 0;
      playerVz = 0;
      waypointTargetX = null;
      waypointTargetZ = null;
      waypointRingMesh.visible = false;
      playerFacing = currentDungeon.spawnFacingAngle;
      playerHp = propsRef.current.playerStats.maxHp;
      defeatTriggered = false;

      // Immediately position camera using aligned computeCameraOrbitOffset so Frame 1 looks straight along +X
      const initOrbit = computeCameraOrbitOffset(cameraYawOffset, cameraPitch, cameraDistance);
      camera.position.set(
        playerX + initOrbit.offsetX,
        initOrbit.offsetY,
        playerZ + initOrbit.offsetZ,
      );
      camera.lookAt(playerX + 1.1, 0.9, playerZ);
      heroModel.root.position.set(playerX, 0, playerZ);
      heroModel.root.rotation.y = -playerFacing;
      heroTorch.position.set(playerX, 3.2, playerZ);
      keyLight.position.set(playerX + 12, 24, playerZ + 10);
      keyLight.target.position.set(playerX, 0, playerZ);

      // Place Decorative Torch Braziers flanking the starting chamber corridor for dramatic lighting
      const brazierOffsets = [
        { gx: currentDungeon.spawn.gx + 1, gz: currentDungeon.spawn.gz - 1 },
        { gx: currentDungeon.spawn.gx + 1, gz: currentDungeon.spawn.gz + 1 },
        { gx: currentDungeon.spawn.gx + 4, gz: currentDungeon.spawn.gz - 1 },
      ];
      brazierOffsets.forEach((bo) => {
        if (
          bo.gz >= 1 &&
          bo.gz < currentDungeon.height - 1 &&
          bo.gx >= 1 &&
          bo.gx < currentDungeon.width - 1 &&
          currentDungeon.grid[bo.gz][bo.gx] !== 'wall'
        ) {
          const bw = gridToWorld(bo.gx, bo.gz);
          const brazierMesh = createDungeonPropMesh('brazier', textures.contactShadow);
          brazierMesh.position.set(bw.x, 0, bw.z);
          levelGroup.add(brazierMesh);
        }
      });

      // Place Exit Portal
      const exitWorld = gridToWorld(currentDungeon.exit.gx, currentDungeon.exit.gz);
      exitWorldX = exitWorld.x;
      exitWorldZ = exitWorld.z;
      exitPortalMesh = createDungeonPropMesh('exit', textures.contactShadow);
      exitPortalMesh.position.set(exitWorldX, 0, exitWorldZ);
      levelGroup.add(exitPortalMesh);

      // Spawn Props & Enemies
      currentDungeon.spawns.forEach((sp) => {
        const wPos = gridToWorld(sp.gx, sp.gz);
        if (sp.type === 'enemy' && sp.enemyArchetype) {
          const em = createEnemyMesh(sp.enemyArchetype, textures.contactShadow);
          em.root.position.set(wPos.x, 0, wPos.z);
          levelGroup.add(em.root);
          liveEnemies.push({
            id: sp.id,
            archetype: sp.enemyArchetype,
            x: wPos.x,
            z: wPos.z,
            vx: 0,
            vz: 0,
            hp: sp.value,
            maxHp: sp.value,
            state: 'idle',
            stateTimer: 0,
            chargeDirX: 1,
            chargeDirZ: 0,
            hitFlashTimer: 0,
            meshGroup: em.root,
            bodyGroup: em.bodyGroup,
            telegraphMesh: em.telegraphMesh,
            hitFlashMaterials: em.hitFlashMaterials,
          });
        } else if (
          sp.type === 'chest' ||
          sp.type === 'gold' ||
          sp.type === 'shrine' ||
          sp.type === 'secret_altar'
        ) {
          const pm = createDungeonPropMesh(sp.type, textures.contactShadow);
          pm.position.set(wPos.x, 0, wPos.z);
          levelGroup.add(pm);
          liveProps.push({
            id: sp.id,
            type: sp.type,
            x: wPos.x,
            z: wPos.z,
            value: sp.value,
            collected: false,
            mesh: pm,
          });
        }
      });

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
    };

    buildDungeonLevel(propsRef.current.floor, propsRef.current.seedOverride);

    // Unified Input Hub (Held vs Edge-Triggered JustPressed + Input Buffering)
    const keysHeld = new Set<string>();
    const keysJustPressed = new Set<string>();
    let attackBufferTimer = 0;
    let dashBufferTimer = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if typing inside an input/textarea (e.g., In-Game-Chat)
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const code = e.code;
      if (!keysHeld.has(code)) {
        keysJustPressed.add(code);
      }
      keysHeld.add(code);

      if (code === 'Space' || code === 'KeyJ') {
        attackBufferTimer = 0.14;
      }
      if (code === 'KeyQ') {
        dashBufferTimer = 0.14;
      }
      if (code === 'Escape' || code === 'KeyP') {
        if (propsRef.current.gameState === 'playing' || propsRef.current.gameState === 'paused') {
          e.preventDefault();
          propsRef.current.onTogglePause();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    // Raycaster + Ground Plane for Click-to-Move / Floor Target Selection
    const floorRaycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHitPoint = new THREE.Vector3();

    const screenToFloorWorld = (clientX: number, clientY: number): { x: number; z: number } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      floorRaycaster.setFromCamera(pointerNdc, camera);
      const hit = floorRaycaster.ray.intersectPlane(groundPlane, groundHitPoint);
      if (!hit) return null;
      return { x: hit.x, z: hit.z };
    };

    // Direct Canvas Touch & Mouse Camera Orbit / Pinch Zoom / Click-to-Move Support
    let leftTouchId: number | null = null;
    let leftTouchOriginX = 0;
    let leftTouchOriginY = 0;
    let canvasTouchMoveX = 0;
    let canvasTouchMoveZ = 0;

    let rightTouchId: number | null = null;
    let rightTouchStartX = 0;
    let rightTouchStartY = 0;
    let rightTouchLastX = 0;
    let rightTouchLastY = 0;
    let rightTouchTotalDrag = 0;
    let pinchLastDist: number | null = null;

    let isMouseDraggingCamera = false;
    let mouseDragButton = 0;
    let mouseDragStartX = 0;
    let mouseDragStartY = 0;
    let mouseDragLastX = 0;
    let mouseDragLastY = 0;
    let mouseDragTotalDist = 0;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      isMouseDraggingCamera = true;
      mouseDragButton = e.button;
      mouseDragStartX = e.clientX;
      mouseDragStartY = e.clientY;
      mouseDragLastX = e.clientX;
      mouseDragLastY = e.clientY;
      mouseDragTotalDist = 0;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDraggingCamera || propsRef.current.gameState !== 'playing') return;
      const dx = e.clientX - mouseDragLastX;
      const dy = e.clientY - mouseDragLastY;
      mouseDragLastX = e.clientX;
      mouseDragLastY = e.clientY;
      mouseDragTotalDist += Math.hypot(dx, dy);

      if (mouseDragTotalDist > 5) {
        targetCameraYawOffset += dx * 0.0068;
        targetCameraPitch = Math.max(0.3, Math.min(1.32, targetCameraPitch + dy * 0.0045));
      }
    };

    const handleMouseUp = () => {
      if (isMouseDraggingCamera && mouseDragTotalDist <= 6 && propsRef.current.gameState === 'playing') {
        const floorPt = screenToFloorWorld(mouseDragStartX, mouseDragStartY);
        if (mouseDragButton === 2 && floorPt) {
          // Right-click on floor sets a free Click-to-Move destination waypoint
          if (isWalkableWorld(floorPt.x, floorPt.z, 0.25)) {
            waypointTargetX = floorPt.x;
            waypointTargetZ = floorPt.z;
            waypointRingMesh.position.set(floorPt.x, 0.08, floorPt.z);
            waypointRingMesh.visible = true;
          }
        } else {
          // Left-click: if clicking a walkable floor spot > 2.6m away and no enemy is within melee reach, move toward it or attack
          if (floorPt) {
            const distToClick = Math.hypot(floorPt.x - playerX, floorPt.z - playerZ);
            const enemyNearPlayer = liveEnemies.some(
              (en) => en.state !== 'ko' && Math.hypot(en.x - playerX, en.z - playerZ) <= 3.1,
            );
            const enemyNearClick = liveEnemies.find(
              (en) => en.state !== 'ko' && Math.hypot(en.x - floorPt.x, en.z - floorPt.z) <= 2.2,
            );
            if (enemyNearClick) {
              playerFacing = Math.atan2(enemyNearClick.z - playerZ, enemyNearClick.x - playerX);
              if (Math.hypot(enemyNearClick.x - playerX, enemyNearClick.z - playerZ) > 2.4) {
                waypointTargetX = enemyNearClick.x;
                waypointTargetZ = enemyNearClick.z;
                waypointRingMesh.position.set(enemyNearClick.x, 0.08, enemyNearClick.z);
                waypointRingMesh.visible = true;
              }
              attackBufferTimer = 0.14;
            } else if (!enemyNearPlayer && distToClick > 2.2 && isWalkableWorld(floorPt.x, floorPt.z, 0.25)) {
              waypointTargetX = floorPt.x;
              waypointTargetZ = floorPt.z;
              waypointRingMesh.position.set(floorPt.x, 0.08, floorPt.z);
              waypointRingMesh.visible = true;
            } else {
              attackBufferTimer = 0.14;
            }
          } else {
            attackBufferTimer = 0.14;
          }
        }
      }
      isMouseDraggingCamera = false;
    };

    const handleWheel = (e: WheelEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * 1.1;
      targetCameraDistance = Math.max(6.0, Math.min(22.0, targetCameraDistance + delta));
    };

    const handleCanvasTouchStart = (e: TouchEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      if (e.touches.length === 2) {
        pinchLastDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
      const rect = renderer.domElement.getBoundingClientRect();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const relX = t.clientX - rect.left;
        if (relX < rect.width * 0.5 && leftTouchId === null) {
          leftTouchId = t.identifier;
          leftTouchOriginX = t.clientX;
          leftTouchOriginY = t.clientY;
          canvasTouchMoveX = 0;
          canvasTouchMoveZ = 0;
        } else if (relX >= rect.width * 0.5 && rightTouchId === null) {
          rightTouchId = t.identifier;
          rightTouchStartX = t.clientX;
          rightTouchStartY = t.clientY;
          rightTouchLastX = t.clientX;
          rightTouchLastY = t.clientY;
          rightTouchTotalDrag = 0;
        }
      }
    };

    const handleCanvasTouchMove = (e: TouchEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      if (e.touches.length === 2) {
        const curDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (pinchLastDist !== null) {
          const diff = pinchLastDist - curDist;
          targetCameraDistance = Math.max(6.0, Math.min(22.0, targetCameraDistance + diff * 0.035));
        }
        pinchLastDist = curDist;
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === leftTouchId) {
          const joy = computeTouchJoystickVector(
            leftTouchOriginX,
            leftTouchOriginY,
            t.clientX,
            t.clientY,
            48,
          );
          canvasTouchMoveX = joy.moveX;
          canvasTouchMoveZ = joy.moveZ;
        } else if (t.identifier === rightTouchId && e.touches.length === 1) {
          const dx = t.clientX - rightTouchLastX;
          const dy = t.clientY - rightTouchLastY;
          rightTouchLastX = t.clientX;
          rightTouchLastY = t.clientY;
          rightTouchTotalDrag += Math.hypot(dx, dy);
          // Dragging on the right half of the 3D scene smoothly orbits and tilts the camera!
          if (rightTouchTotalDrag > 10) {
            targetCameraYawOffset += dx * 0.007;
            targetCameraPitch = Math.max(0.32, Math.min(1.28, targetCameraPitch + dy * 0.0045));
          }
        }
      }
    };

    const handleCanvasTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchLastDist = null;
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === leftTouchId) {
          leftTouchId = null;
          canvasTouchMoveX = 0;
          canvasTouchMoveZ = 0;
        } else if (t.identifier === rightTouchId) {
          rightTouchId = null;
          if (propsRef.current.gameState === 'playing') {
            if (rightTouchTotalDrag <= 12) {
              // Quick tap on right half triggers melee attack
              attackBufferTimer = 0.14;
            }
          }
        }
      }
    };

    const clearInputs = () => {
      keysHeld.clear();
      keysJustPressed.clear();
      leftTouchId = null;
      rightTouchId = null;
      pinchLastDist = null;
      isMouseDraggingCamera = false;
      canvasTouchMoveX = 0;
      canvasTouchMoveZ = 0;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearInputs);
    window.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', handleCanvasTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', handleCanvasTouchMove, { passive: true });
    renderer.domElement.addEventListener('touchend', handleCanvasTouchEnd, { passive: true });
    renderer.domElement.addEventListener('touchcancel', handleCanvasTouchEnd, { passive: true });

    let currentCanvasW = container.clientWidth || window.innerWidth;
    let currentCanvasH = container.clientHeight || window.innerHeight;

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w === currentCanvasW && h === currentCanvasH) return;
      currentCanvasW = w;
      currentCanvasH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // Track external button trigger counters from HUD
    let prevHealCount = propsRef.current.healTriggerCount;
    let prevNovaCount = propsRef.current.novaTriggerCount;
    let prevDashCount = propsRef.current.dashTriggerCount;
    let prevAttackCount = propsRef.current.attackTriggerCount;
    let prevInteractCount = propsRef.current.interactTriggerCount;
    let prevZoomStepCount = propsRef.current.cameraZoomStepCount ?? 0;
    let prevCameraResetCount = propsRef.current.cameraResetTriggerCount ?? 0;

    const triggerMeleeSwing = () => {
      if (swingCooldown > 0) return;
      swingCooldown = 0.36;
      swingTimer = 0.24;
      squashX = 1.18;
      squashY = 0.86;
      sound.playSwing();

      const stats = propsRef.current.playerStats;
      const attackReach = 2.65 + stats.attackRangeBonus;
      let hitAny = false;

      for (const enemy of liveEnemies) {
        if (enemy.state === 'ko') continue;
        const dx = enemy.x - playerX;
        const dz = enemy.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist <= attackReach) {
          const isCrit = Math.random() * 100 < stats.critChance;
          const dmg = Math.round(stats.attackDamage * (isCrit ? 1.65 : 1.0));
          enemy.hp -= dmg;
          enemy.hitFlashTimer = 0.08;
          hitAny = true;

          // Knockback impulse away from player
          const inv = 1 / (dist || 1);
          const kx = enemy.x + dx * inv * 0.75;
          const kz = enemy.z + dz * inv * 0.75;
          if (isWalkableWorld(kx, kz, 0.45)) {
            enemy.x = kx;
            enemy.z = kz;
          }

          spawnParticles(enemy.x, 1.0, enemy.z, isCrit ? 18 : 10, isCrit ? 0xfbbf24 : 0xf87171, 5.2);

          if (enemy.hp <= 0) {
            enemy.hp = 0;
            enemy.state = 'ko';
            enemy.stateTimer = 0.38;
            enemy.telegraphMesh.visible = false;
            runKills += 1;
            playerHp = Math.min(stats.maxHp, playerHp + stats.lifeOnKill);
            hitstopTimer = 0.055; // Brief heavy-impact simulation hitstop
            cameraTrauma = Math.min(1, cameraTrauma + 0.45);
            sound.playEnemyKill();
            propsRef.current.onEnemyKilled(enemy.archetype);
          } else {
            hitstopTimer = Math.max(hitstopTimer, isCrit ? 0.045 : 0.025);
            cameraTrauma = Math.min(1, cameraTrauma + (isCrit ? 0.3 : 0.16));
            sound.playHitEnemy(isCrit);
          }
        }
      }

      if (!hitAny) {
        // Spawn subtle sword slash sparks in front of hero
        spawnParticles(
          playerX + Math.cos(playerFacing) * 1.4,
          1.0,
          playerZ + Math.sin(playerFacing) * 1.4,
          4,
          0x38bdf8,
          2.6,
        );
      }
    };

    const triggerShadowDash = () => {
      if (dashCooldown > 0) return;
      dashCooldown = propsRef.current.playerStats.dashCooldownMax;
      dashTimer = 0.18;
      squashX = 0.82;
      squashY = 1.22;
      sound.playDash();
      spawnParticles(playerX, 0.6, playerZ, 12, 0x38bdf8, 4.5);
      propsRef.current.onSkillUsed();
    };

    const triggerArcaneNova = () => {
      if (novaCooldown > 0) return;
      const stats = propsRef.current.playerStats;
      novaCooldown = stats.novaCooldownMax;
      novaVisualTimer = 0.42;
      novaRingMesh.visible = true;
      novaRingMesh.position.set(playerX, 0.18, playerZ);
      cameraTrauma = Math.min(1, cameraTrauma + 0.4);
      sound.playSecretFound();
      spawnParticles(playerX, 0.8, playerZ, 24, 0x38bdf8, 6.5);
      propsRef.current.onSkillUsed();

      for (const enemy of liveEnemies) {
        if (enemy.state === 'ko') continue;
        const dx = enemy.x - playerX;
        const dz = enemy.z - playerZ;
        const dist = Math.hypot(dx, dz);
        if (dist <= 5.2) {
          enemy.hp -= stats.novaDamage;
          enemy.hitFlashTimer = 0.1;
          const inv = 1 / (dist || 1);
          const kx = enemy.x + dx * inv * 1.35;
          const kz = enemy.z + dz * inv * 1.35;
          if (isWalkableWorld(kx, kz, 0.45)) {
            enemy.x = kx;
            enemy.z = kz;
          }
          if (enemy.hp <= 0) {
            enemy.hp = 0;
            enemy.state = 'ko';
            enemy.stateTimer = 0.38;
            enemy.telegraphMesh.visible = false;
            runKills += 1;
            sound.playEnemyKill();
            propsRef.current.onEnemyKilled(enemy.archetype);
          }
        }
      }
    };

    const triggerInteract = () => {
      // Check exit portal first
      if (Math.hypot(exitWorldX - playerX, exitWorldZ - playerZ) <= 2.4) {
        sound.playVictory();
        propsRef.current.onFloorCleared();
        return;
      }
      // Check chests, shrines, secret altars
      for (const prop of liveProps) {
        if (prop.collected) continue;
        const dist = Math.hypot(prop.x - playerX, prop.z - playerZ);
        if (dist <= 2.4) {
          prop.collected = true;
          prop.mesh.visible = false;
          if (prop.type === 'chest') {
            const goldGain = Math.round(prop.value * propsRef.current.playerStats.goldMultiplier);
            runGold += goldGain;
            runChests += 1;
            sound.playPickupGold();
            spawnParticles(prop.x, 0.8, prop.z, 22, 0xfbbf24, 5.5);
            propsRef.current.onOpenChest(goldGain);
          } else if (prop.type === 'shrine') {
            playerHp = Math.min(propsRef.current.playerStats.maxHp, playerHp + prop.value);
            sound.playPickupGold();
            spawnParticles(prop.x, 1.0, prop.z, 18, 0x34d399, 4.5);
          } else if (prop.type === 'secret_altar') {
            runSecrets += 1;
            runGold += prop.value;
            sound.playSecretFound();
            spawnParticles(prop.x, 1.2, prop.z, 28, 0xc084fc, 6.2);
            propsRef.current.onDiscoverSecret();
          }
          return;
        }
      }
    };

    // Clock & Software-WebGL Paced Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let lastTelemetryTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05); // Clamped frame delta time
      const elapsed = clock.getElapsedTime();
      const currentProps = propsRef.current;

      // Rebuild level if floor or seed changed
      const desiredKey = `${currentProps.floor}_${currentProps.seedOverride ?? 'std'}`;
      if (desiredKey !== builtFloorKey) {
        buildDungeonLevel(currentProps.floor, currentProps.seedOverride);
      }

      // Sync dynamic avatar armor color
      heroModel.trimMaterials.forEach((m) => {
        m.color.set(currentProps.avatarColor || '#f59e0b');
        m.emissive.set(currentProps.avatarColor || '#f59e0b');
      });

      // Handle external HUD button triggers
      if (currentProps.healTriggerCount !== prevHealCount) {
        prevHealCount = currentProps.healTriggerCount;
        playerHp = Math.min(currentProps.playerStats.maxHp, playerHp + 45);
        spawnParticles(playerX, 1.0, playerZ, 14, 0x34d399, 4.0);
        sound.playPickupGold();
      }
      if (currentProps.novaTriggerCount !== prevNovaCount) {
        prevNovaCount = currentProps.novaTriggerCount;
        if (currentProps.gameState === 'playing') triggerArcaneNova();
      }
      if (currentProps.dashTriggerCount !== prevDashCount) {
        prevDashCount = currentProps.dashTriggerCount;
        if (currentProps.gameState === 'playing') triggerShadowDash();
      }
      if (currentProps.attackTriggerCount !== prevAttackCount) {
        prevAttackCount = currentProps.attackTriggerCount;
        if (currentProps.gameState === 'playing') triggerMeleeSwing();
      }
      if (currentProps.interactTriggerCount !== prevInteractCount) {
        prevInteractCount = currentProps.interactTriggerCount;
        if (currentProps.gameState === 'playing') triggerInteract();
      }
      if (currentProps.cameraPreset !== lastCameraPresetId) {
        lastCameraPresetId = currentProps.cameraPreset;
        const pCfg = CAMERA_PRESETS[currentProps.cameraPreset] ?? CAMERA_PRESETS.isometric;
        targetCameraPitch = pCfg.pitch;
        targetCameraDistance = pCfg.distance;
        camera.fov = pCfg.fov;
        camera.updateProjectionMatrix();
      }
      if ((currentProps.cameraZoomStepCount ?? 0) !== prevZoomStepCount) {
        prevZoomStepCount = currentProps.cameraZoomStepCount ?? 0;
        const dir = currentProps.cameraZoomStepDir === 'in' ? -1.8 : 1.8;
        targetCameraDistance = Math.max(6.0, Math.min(22.0, targetCameraDistance + dir));
      }
      if ((currentProps.cameraResetTriggerCount ?? 0) !== prevCameraResetCount) {
        prevCameraResetCount = currentProps.cameraResetTriggerCount ?? 0;
        const pCfg = CAMERA_PRESETS[currentProps.cameraPreset] ?? CAMERA_PRESETS.isometric;
        targetCameraYawOffset = 0;
        targetCameraPitch = pCfg.pitch;
        targetCameraDistance = pCfg.distance;
      }

      if (currentProps.gameState === 'title') {
        // Stage 1: Live World Camera Pan over the torchlit starting chamber (y=9.4 clears 3.6m walls)
        const panX = Math.sin(elapsed * 0.45) * 1.2;
        const panZ = Math.cos(elapsed * 0.45) * 1.2;
        camera.position.set(playerX - 6.2 + panX, 9.4, playerZ + 6.2 + panZ);
        camera.lookAt(playerX + 1.8, 0.85, playerZ - 0.4);
        heroModel.root.position.set(playerX + 0.8, 0, playerZ);
        heroModel.root.rotation.y = -0.35 + Math.sin(elapsed * 0.8) * 0.15;
        heroTorch.position.set(playerX + 1.5, 3.4, playerZ);
        keyLight.position.set(playerX + 12, 24, playerZ + 10);
        keyLight.target.position.set(playerX + 1.5, 0, playerZ);
      } else if (currentProps.gameState === 'playing') {
        // Advance hitstop & camera shake in real dt
        if (hitstopTimer > 0) {
          hitstopTimer = Math.max(0, hitstopTimer - dt);
        }
        const simDt = hitstopTimer > 0 ? 0 : dt;

        // Cooldowns & Input Buffers
        swingCooldown = Math.max(0, swingCooldown - dt);
        dashCooldown = Math.max(0, dashCooldown - dt);
        novaCooldown = Math.max(0, novaCooldown - dt);
        attackBufferTimer = Math.max(0, attackBufferTimer - dt);
        dashBufferTimer = Math.max(0, dashBufferTimer - dt);

        if (attackBufferTimer > 0 && swingCooldown <= 0) {
          attackBufferTimer = 0;
          triggerMeleeSwing();
        }
        if (dashBufferTimer > 0 && dashCooldown <= 0) {
          dashBufferTimer = 0;
          triggerShadowDash();
        }
        if (keysJustPressed.has('KeyF')) {
          triggerArcaneNova();
        }
        if (keysJustPressed.has('KeyE')) {
          triggerInteract();
        }
        if (keysJustPressed.has('KeyN')) {
          const pCfg = CAMERA_PRESETS[currentProps.cameraPreset] ?? CAMERA_PRESETS.isometric;
          targetCameraYawOffset = 0;
          targetCameraPitch = pCfg.pitch;
          targetCameraDistance = pCfg.distance;
        }

        // Camera Orbit & Zoom via Keyboard ([Comma]/[Period] or [BracketLeft]/[BracketRight], [+]/[-]) + HUD/Touch Button Input
        let camRotVel = currentProps.cameraRotateInput ?? 0;
        if (keysHeld.has('Comma') || keysHeld.has('BracketLeft')) camRotVel -= 1;
        if (keysHeld.has('Period') || keysHeld.has('BracketRight')) camRotVel += 1;
        if (Math.abs(camRotVel) > 0.01) {
          targetCameraYawOffset += camRotVel * 2.1 * dt;
        }
        if (keysHeld.has('Equal') || keysHeld.has('NumpadAdd')) {
          targetCameraDistance = Math.max(6.0, targetCameraDistance - 7.5 * dt);
        }
        if (keysHeld.has('Minus') || keysHeld.has('NumpadSubtract')) {
          targetCameraDistance = Math.min(22.0, targetCameraDistance + 7.5 * dt);
        }

        // Smoothly damp camera orbit parameters
        cameraYawOffset = THREE.MathUtils.damp(cameraYawOffset, targetCameraYawOffset, 10, dt);
        cameraPitch = THREE.MathUtils.damp(cameraPitch, targetCameraPitch, 10, dt);
        cameraDistance = THREE.MathUtils.damp(cameraDistance, targetCameraDistance, 10, dt);

        // Passive HP regeneration from Runenpfad skill
        if (currentProps.playerStats.hpRegenPerSec > 0 && playerHp > 0) {
          playerHp = Math.min(
            currentProps.playerStats.maxHp,
            playerHp + currentProps.playerStats.hpRegenPerSec * simDt,
          );
        }

        // Player Movement (WASD / Arrow Keys + Virtual Touch Joystick / D-Pad + Canvas Touch + Click-to-Move Waypoint), rotated by active Camera Yaw
        let rawForward = canvasTouchMoveX + (currentProps.touchMoveVector?.moveX ?? 0);
        let rawRight = canvasTouchMoveZ + (currentProps.touchMoveVector?.moveZ ?? 0);
        if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp')) rawForward += 1;
        if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown')) rawForward -= 1;
        if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft')) rawRight -= 1;
        if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight')) rawRight += 1;

        const hasDirectInput = Math.hypot(rawForward, rawRight) > 0.04;
        if (hasDirectInput) {
          // Manual WASD or Joystick input immediately cancels any floor click waypoint
          waypointTargetX = null;
          waypointTargetZ = null;
          waypointRingMesh.visible = false;
        }

        const camRel = computeCameraRelativeMovement(rawForward, rawRight, cameraYawOffset);
        let desiredDirX = camRel.worldMoveX;
        let desiredDirZ = camRel.worldMoveZ;
        let inputMagnitude = Math.min(1, Math.hypot(rawForward, rawRight));

        // If no manual directional input, steer smoothly toward active Click-to-Move floor waypoint
        if (!hasDirectInput && waypointTargetX !== null && waypointTargetZ !== null) {
          const wdx = waypointTargetX - playerX;
          const wdz = waypointTargetZ - playerZ;
          const wDist = Math.hypot(wdx, wdz);
          if (wDist <= 0.35) {
            waypointTargetX = null;
            waypointTargetZ = null;
            waypointRingMesh.visible = false;
          } else {
            desiredDirX = wdx / wDist;
            desiredDirZ = wdz / wDist;
            inputMagnitude = Math.min(1, Math.max(0.45, wDist / 1.5));
            waypointRingMesh.rotation.z = elapsed * 2.5;
          }
        }

        if (simDt > 0) {
          const moveLen = Math.hypot(desiredDirX, desiredDirZ);
          const isSprinting =
            Boolean(currentProps.sprintEnabled) ||
            keysHeld.has('ShiftLeft') ||
            keysHeld.has('ShiftRight');
          const sprintBoost = isSprinting ? 1.38 : 1.0;
          const dashBoost = dashTimer > 0 ? 2.55 : 1.0;
          if (dashTimer > 0) dashTimer = Math.max(0, dashTimer - simDt);

          const maxSpeed =
            6.6 * currentProps.playerStats.moveSpeedMultiplier * sprintBoost * dashBoost;

          if (moveLen > 0.01 || dashTimer > 0) {
            const normX = moveLen > 0.01 ? desiredDirX / moveLen : Math.cos(playerFacing);
            const normZ = moveLen > 0.01 ? desiredDirZ / moveLen : Math.sin(playerFacing);
            const effectiveMag = dashTimer > 0 ? 1.0 : Math.max(0.25, inputMagnitude);
            const targetVx = normX * maxSpeed * effectiveMag;
            const targetVz = normZ * maxSpeed * effectiveMag;

            // Responsive exponential velocity acceleration (22) for instant, fluid 360-degree steering
            playerVx = THREE.MathUtils.damp(playerVx, targetVx, 22, simDt);
            playerVz = THREE.MathUtils.damp(playerVz, targetVz, 22, simDt);

            const targetAngle = Math.atan2(normZ, normX);
            const diff = Math.atan2(
              Math.sin(targetAngle - playerFacing),
              Math.cos(targetAngle - playerFacing),
            );
            playerFacing += diff * (1 - Math.exp(-16 * simDt));

            // Optional Smart Auto-Follow Camera gently aligns behind hero when turning corners
            if (currentProps.cameraAutoFollow && !isMouseDraggingCamera && rightTouchId === null) {
              const angleDiff = Math.atan2(
                Math.sin(playerFacing - targetCameraYawOffset),
                Math.cos(playerFacing - targetCameraYawOffset),
              );
              targetCameraYawOffset += angleDiff * 1.65 * simDt;
            }
          } else {
            // Smooth momentum deceleration when input released
            playerVx = THREE.MathUtils.damp(playerVx, 0, 18, simDt);
            playerVz = THREE.MathUtils.damp(playerVz, 0, 18, simDt);
          }

          const currentSpeed = Math.hypot(playerVx, playerVz);
          if (currentSpeed > 0.05) {
            const resolved = resolveSmoothDungeonMovement({
              dungeon: currentDungeon,
              x: playerX,
              z: playerZ,
              vx: playerVx,
              vz: playerVz,
              dt: simDt,
              radius: 0.35,
            });
            playerX = resolved.x;
            playerZ = resolved.z;
            walkDist += currentSpeed * simDt;

            if (isSprinting && Math.random() < 0.32) {
              spawnParticles(playerX, 0.15, playerZ, 1, 0xfde68a, 1.4);
            }
          }

          // Auto-pickup Gold Piles on walk-over
          for (const prop of liveProps) {
            if (prop.collected) continue;
            const dist = Math.hypot(prop.x - playerX, prop.z - playerZ);
            if (prop.type === 'gold' && dist <= 1.45) {
              prop.collected = true;
              prop.mesh.visible = false;
              const goldGain = Math.round(
                prop.value * currentProps.playerStats.goldMultiplier,
              );
              runGold += goldGain;
              sound.playPickupGold();
              spawnParticles(prop.x, 0.5, prop.z, 14, 0xfbbf24, 4.2);
              currentProps.onCollectGold(goldGain);
            }
          }

          // Update Enemies with Crowd Token Pool
          let activeAttackers = 0;
          const maxAttackers = currentDungeon.difficultyParams.maxConcurrentAttackers;
          for (const e of liveEnemies) {
            if (e.state === 'windup' || e.state === 'charging') activeAttackers++;
          }

          for (const enemy of liveEnemies) {
            if (enemy.hitFlashTimer > 0) {
              enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
              enemy.hitFlashMaterials.forEach((m) => {
                m.emissiveIntensity = enemy.hitFlashTimer > 0 ? 1.8 : 0.28;
              });
            }

            if (enemy.state === 'ko') {
              enemy.stateTimer -= simDt;
              enemy.bodyGroup.rotation.x = THREE.MathUtils.lerp(
                enemy.bodyGroup.rotation.x,
                -Math.PI * 0.48,
                1 - Math.exp(-12 * simDt),
              );
              enemy.bodyGroup.scale.setScalar(Math.max(0.01, enemy.stateTimer * 2.5));
              if (enemy.stateTimer <= 0) {
                enemy.meshGroup.visible = false;
              }
              continue;
            }

            const dx = playerX - enemy.x;
            const dz = playerZ - enemy.z;
            const distToPlayer = Math.hypot(dx, dz) || 0.001;
            const faceAngle = Math.atan2(dz, dx);
            enemy.meshGroup.rotation.y = -faceAngle;

            if (enemy.state === 'windup') {
              enemy.stateTimer -= simDt;
              enemy.telegraphMesh.visible = true;
              if (enemy.stateTimer <= 0) {
                enemy.telegraphMesh.visible = false;
                if (enemy.archetype === 'swarmer') {
                  if (distToPlayer <= 2.35 && dashTimer <= 0) {
                    const rawDmg = Math.round(
                      12 * currentDungeon.difficultyParams.enemyDamageMultiplier,
                    );
                    const mitigated = Math.max(
                      3,
                      rawDmg - Math.floor(currentProps.playerStats.defense * 0.25),
                    );
                    playerHp = Math.max(0, playerHp - mitigated);
                    cameraTrauma = Math.min(1, cameraTrauma + 0.38);
                    sound.playPlayerHurt();
                    spawnParticles(playerX, 1.0, playerZ, 12, 0xef4444, 4.5);
                  }
                  enemy.state = 'recover';
                  enemy.stateTimer = 0.65;
                } else if (enemy.archetype === 'ranged') {
                  // Fire arcane projectile along locked aim direction
                  const proj = projectiles.find((p) => !p.active);
                  if (proj) {
                    proj.active = true;
                    proj.x = enemy.x;
                    proj.z = enemy.z;
                    proj.vx = (dx / distToPlayer) * 8.2;
                    proj.vz = (dz / distToPlayer) * 8.2;
                    proj.life = 2.2;
                    proj.damage = Math.round(
                      14 * currentDungeon.difficultyParams.enemyDamageMultiplier,
                    );
                    proj.mesh.position.set(proj.x, 0.9, proj.z);
                    proj.mesh.visible = true;
                  }
                  enemy.state = 'recover';
                  enemy.stateTimer = 0.95;
                } else {
                  // Charger transitions into bull-rush charge
                  enemy.state = 'charging';
                  enemy.stateTimer = 0.55;
                }
              }
              continue;
            }

            if (enemy.state === 'charging') {
              enemy.stateTimer -= simDt;
              const steer = evaluateEnemySteering({
                archetype: 'charger',
                enemyX: enemy.x,
                enemyZ: enemy.z,
                playerX,
                playerZ,
                baseSpeed: 3.1 * currentDungeon.difficultyParams.enemySpeedMultiplier,
                elapsedTime: elapsed,
                isCharging: true,
                chargeDirX: enemy.chargeDirX,
                chargeDirZ: enemy.chargeDirZ,
              });
              const nx = enemy.x + steer.vx * simDt;
              const nz = enemy.z + steer.vz * simDt;
              if (isWalkableWorld(nx, nz, 0.5)) {
                enemy.x = nx;
                enemy.z = nz;
              } else {
                enemy.stateTimer = 0; // Hit wall
              }
              if (Math.hypot(playerX - enemy.x, playerZ - enemy.z) <= 1.35 && dashTimer <= 0) {
                const rawDmg = Math.round(
                  18 * currentDungeon.difficultyParams.enemyDamageMultiplier,
                );
                const mitigated = Math.max(
                  4,
                  rawDmg - Math.floor(currentProps.playerStats.defense * 0.25),
                );
                playerHp = Math.max(0, playerHp - mitigated);
                cameraTrauma = Math.min(1, cameraTrauma + 0.55);
                hitstopTimer = 0.05;
                sound.playPlayerHurt();
                spawnParticles(playerX, 1.0, playerZ, 18, 0xef4444, 5.5);
                enemy.state = 'recover';
                enemy.stateTimer = 0.9;
              } else if (enemy.stateTimer <= 0) {
                enemy.state = 'recover';
                enemy.stateTimer = 0.85;
              }
              enemy.meshGroup.position.set(enemy.x, 0, enemy.z);
              continue;
            }

            if (enemy.state === 'recover') {
              enemy.stateTimer -= simDt;
              if (enemy.stateTimer <= 0) enemy.state = 'idle';
              continue;
            }

            // Idle/Move steering policy
            if (distToPlayer <= 14.5) {
              const steer = evaluateEnemySteering({
                archetype: enemy.archetype,
                enemyX: enemy.x,
                enemyZ: enemy.z,
                playerX,
                playerZ,
                baseSpeed: 2.75 * currentDungeon.difficultyParams.enemySpeedMultiplier,
                elapsedTime: elapsed,
              });

              if (steer.desiredAction !== 'move' && activeAttackers < maxAttackers) {
                activeAttackers++;
                enemy.state = 'windup';
                enemy.stateTimer =
                  enemy.archetype === 'swarmer'
                    ? 0.38
                    : enemy.archetype === 'ranged'
                      ? 0.58
                      : 0.68;
                enemy.chargeDirX = dx / distToPlayer;
                enemy.chargeDirZ = dz / distToPlayer;
                enemy.telegraphMesh.visible = true;
                sound.playTelegraph();
              } else {
                const nx = enemy.x + steer.vx * simDt;
                const nz = enemy.z + steer.vz * simDt;
                if (isWalkableWorld(nx, enemy.z, 0.45)) enemy.x = nx;
                if (isWalkableWorld(enemy.x, nz, 0.45)) enemy.z = nz;
              }
            }
            enemy.meshGroup.position.set(enemy.x, 0, enemy.z);
          }

          // Update Ranged Projectiles
          for (const proj of projectiles) {
            if (!proj.active) continue;
            proj.life -= simDt;
            proj.x += proj.vx * simDt;
            proj.z += proj.vz * simDt;
            proj.mesh.position.set(proj.x, 0.9, proj.z);
            if (!isWalkableWorld(proj.x, proj.z, 0.15) || proj.life <= 0) {
              proj.active = false;
              proj.mesh.visible = false;
              spawnParticles(proj.x, 0.9, proj.z, 6, 0xe879f9, 3.0);
              continue;
            }
            if (Math.hypot(proj.x - playerX, proj.z - playerZ) <= 0.85 && dashTimer <= 0) {
              proj.active = false;
              proj.mesh.visible = false;
              const mitigated = Math.max(
                3,
                proj.damage - Math.floor(currentProps.playerStats.defense * 0.25),
              );
              playerHp = Math.max(0, playerHp - mitigated);
              cameraTrauma = Math.min(1, cameraTrauma + 0.35);
              sound.playPlayerHurt();
              spawnParticles(playerX, 1.0, playerZ, 12, 0xe879f9, 4.2);
            }
          }

          // Check Player Defeat
          if (playerHp <= 0 && !defeatTriggered) {
            defeatTriggered = true;
            sound.playDefeat();
            window.setTimeout(() => {
              propsRef.current.onPlayerDefeated();
            }, 450);
          }
        }

        // Update Hero Transform, Gait Bob, Squash-and-Stretch & Sword Swing Curve
        squashX = THREE.MathUtils.damp(squashX, 1, 12, dt);
        squashY = THREE.MathUtils.damp(squashY, 1, 12, dt);
        const gaitBob = Math.abs(Math.sin(walkDist * 2.2)) * 0.08;
        heroModel.root.position.set(playerX, 0, playerZ);
        heroModel.root.rotation.y = -playerFacing;
        heroModel.bodyGroup.position.y = gaitBob;
        heroModel.bodyGroup.scale.set(squashX, squashY, squashX);

        if (swingTimer > 0) {
          swingTimer = Math.max(0, swingTimer - dt);
          const progress = 1 - swingTimer / 0.24;
          heroModel.weaponPivot.rotation.y = Math.sin(progress * Math.PI) * 2.1 - 0.6;
          heroModel.weaponPivot.rotation.z = -1.2;
        } else {
          heroModel.weaponPivot.rotation.y = THREE.MathUtils.damp(
            heroModel.weaponPivot.rotation.y,
            0,
            10,
            dt,
          );
          heroModel.weaponPivot.rotation.z = THREE.MathUtils.damp(
            heroModel.weaponPivot.rotation.z,
            -0.55,
            10,
            dt,
          );
        }

        // Arcane Nova Expanding Ring Animation
        if (novaVisualTimer > 0) {
          novaVisualTimer = Math.max(0, novaVisualTimer - dt);
          const t = 1 - novaVisualTimer / 0.42;
          novaRingMesh.scale.setScalar(1 + t * 4.8);
          novaRingMat.opacity = (1 - t) * 0.85;
          if (novaVisualTimer <= 0) novaRingMesh.visible = false;
        }

        // Exponentially Damped Orbitable 3D Dungeon Camera + Trauma Shake
        cameraTrauma = Math.max(0, cameraTrauma - dt * 1.8);
        const shakeAmt = cameraTrauma * cameraTrauma * 0.35;
        const shakeX = (Math.random() * 2 - 1) * shakeAmt;
        const shakeZ = (Math.random() * 2 - 1) * shakeAmt;

        const orbitOffset = computeCameraOrbitOffset(
          cameraYawOffset,
          cameraPitch,
          cameraDistance,
        );
        const targetCamX = playerX + orbitOffset.offsetX + shakeX;
        const targetCamY = orbitOffset.offsetY;
        const targetCamZ = playerZ + orbitOffset.offsetZ + shakeZ;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamX, 9, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamY, 9, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 9, dt);
        camera.lookAt(
          playerX + Math.cos(playerFacing) * 0.85,
          0.9,
          playerZ + Math.sin(playerFacing) * 0.85,
        );

        heroTorch.position.set(playerX, 3.2, playerZ);
        keyLight.position.set(playerX + 12, 24, playerZ + 10);
        keyLight.target.position.set(playerX, 0, playerZ);
      }

      // Animate floating props & exit portal
      for (const prop of liveProps) {
        if (!prop.collected) {
          prop.mesh.rotation.y = elapsed * 0.9;
        }
      }
      if (exitPortalMesh) {
        exitPortalMesh.children.forEach((ch, idx) => {
          if (idx === 4) ch.rotation.z = elapsed * 1.8;
        });
      }

      // Update Pooled Particle InstancedMesh in-place (Zero-GC)
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        if (!p.active) {
          _vec3A.set(0, -100, 0);
          _quat.identity();
          _scale.set(0.001, 0.001, 0.001);
          _mat4.compose(_vec3A, _quat, _scale);
          particleInstanced.setMatrixAt(i, _mat4);
          continue;
        }
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= 9.8 * dt;
        p.z += p.vz * dt;
        const lifeRatio = 1 - p.life / p.maxLife;
        _vec3A.set(p.x, Math.max(0.05, p.y), p.z);
        _quat.identity();
        _scale.setScalar(p.scale * lifeRatio);
        _mat4.compose(_vec3A, _quat, _scale);
        particleInstanced.setMatrixAt(i, _color.getHex() ? _mat4 : _mat4);
        _color.setHex(p.colorHex);
        particleInstanced.setColorAt(i, _color);
      }
      particleInstanced.instanceMatrix.needsUpdate = true;
      if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;

      // Throttle HUD React telemetry updates to <= 10Hz
      if (elapsed - lastTelemetryTime >= 0.12) {
        lastTelemetryTime = elapsed;
        let nearbyPrompt: string | null = null;
        if (Math.hypot(exitWorldX - playerX, exitWorldZ - playerZ) <= 2.4) {
          nearbyPrompt = '[E] Tiefen-Portal betreten (Ebene abschließen)';
        } else {
          for (const prop of liveProps) {
            if (prop.collected) continue;
            if (Math.hypot(prop.x - playerX, prop.z - playerZ) <= 2.4) {
              if (prop.type === 'chest') nearbyPrompt = '[E] Schatztruhe öffnen';
              else if (prop.type === 'shrine') nearbyPrompt = '[E] Heilbrunnen aktivieren (+50 HP)';
              else if (prop.type === 'secret_altar')
                nearbyPrompt = '[E] Geheimen Runen-Altar entsiegeln!';
              break;
            }
          }
        }

        const ts = currentDungeon.tileSize;
        const normYawDeg =
          (((Math.round((cameraYawOffset * 180) / Math.PI) % 360) + 360) % 360);
        currentProps.onTelemetryUpdate({
          hp: Math.round(playerHp),
          maxHp: currentProps.playerStats.maxHp,
          floor: currentDungeon.floor,
          runGold,
          runKills,
          runChests,
          runSecrets,
          dashCooldown: Number(dashCooldown.toFixed(1)),
          novaCooldown: Number(novaCooldown.toFixed(1)),
          nearbyPrompt,
          playerGridX: Math.round(playerX / ts),
          playerGridZ: Math.round(playerZ / ts),
          dungeon: currentDungeon,
          activeEnemyCoords: liveEnemies
            .filter((e) => e.state !== 'ko')
            .map((e) => ({
              x: Math.round(e.x / ts),
              z: Math.round(e.z / ts),
              archetype: e.archetype,
            })),
          activePropCoords: liveProps
            .filter((p) => !p.collected)
            .map((p) => ({
              x: Math.round(p.x / ts),
              z: Math.round(p.z / ts),
              type: p.type,
            })),
          cameraYawDeg: normYawDeg,
          cameraDistance: Number(cameraDistance.toFixed(1)),
        });
      }

      keysJustPressed.clear();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearInputs);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('touchstart', handleCanvasTouchStart);
      renderer.domElement.removeEventListener('touchmove', handleCanvasTouchMove);
      renderer.domElement.removeEventListener('touchend', handleCanvasTouchEnd);
      renderer.domElement.removeEventListener('touchcancel', handleCanvasTouchEnd);
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="dungeon-canvas-container"
      className="fixed inset-0 w-full h-full overflow-hidden bg-[#0b0912] touch-none cursor-grab active:cursor-grabbing"
    />
  );
};
