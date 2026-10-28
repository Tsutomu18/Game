import * as THREE from 'three';
import type { EnemyArchetype } from './rules';

export interface ProceduralTextures {
  floorColor: THREE.CanvasTexture;
  floorBump: THREE.CanvasTexture;
  wallColor: THREE.CanvasTexture;
  wallBump: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  // 1. Cobblestone Floor Albedo + Bump
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 256;
  floorCanvas.height = 256;
  const fCtx = floorCanvas.getContext('2d')!;
  fCtx.fillStyle = '#1d1b24';
  fCtx.fillRect(0, 0, 256, 256);

  const floorBumpCanvas = document.createElement('canvas');
  floorBumpCanvas.width = 256;
  floorBumpCanvas.height = 256;
  const fbCtx = floorBumpCanvas.getContext('2d')!;
  fbCtx.fillStyle = '#404040';
  fbCtx.fillRect(0, 0, 256, 256);

  const rows = 4;
  const cols = 4;
  const cellW = 256 / cols;
  const cellH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = (r % 2) * (cellW * 0.5);
      const x = ((c * cellW + offset) % 256);
      const y = r * cellH;
      const shade = 34 + ((r * 7 + c * 13) % 18);
      fCtx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade + 6})`;
      fCtx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);
      fCtx.strokeStyle = '#100e14';
      fCtx.lineWidth = 3;
      fCtx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

      fbCtx.fillStyle = '#d0d0d0';
      fbCtx.fillRect(x + 4, y + 4, cellW - 8, cellH - 8);
    }
  }

  const floorColor = new THREE.CanvasTexture(floorCanvas);
  floorColor.colorSpace = THREE.SRGBColorSpace;
  floorColor.wrapS = THREE.RepeatWrapping;
  floorColor.wrapT = THREE.RepeatWrapping;
  floorColor.anisotropy = maxAnisotropy;

  const floorBump = new THREE.CanvasTexture(floorBumpCanvas);
  floorBump.wrapS = THREE.RepeatWrapping;
  floorBump.wrapT = THREE.RepeatWrapping;
  floorBump.anisotropy = maxAnisotropy;

  // 2. Masonry Wall Albedo + Bump
  const wallCanvas = document.createElement('canvas');
  wallCanvas.width = 256;
  wallCanvas.height = 256;
  const wCtx = wallCanvas.getContext('2d')!;
  wCtx.fillStyle = '#25222e';
  wCtx.fillRect(0, 0, 256, 256);

  const wallBumpCanvas = document.createElement('canvas');
  wallBumpCanvas.width = 256;
  wallBumpCanvas.height = 256;
  const wbCtx = wallBumpCanvas.getContext('2d')!;
  wbCtx.fillStyle = '#303030';
  wbCtx.fillRect(0, 0, 256, 256);

  for (let r = 0; r < 6; r++) {
    const bh = 256 / 6;
    const bw = 256 / 3;
    const shift = (r % 2) * (bw * 0.5);
    for (let c = -1; c < 4; c++) {
      const bx = c * bw + shift;
      const by = r * bh;
      const tone = 44 + ((r * 11 + c * 19) % 22);
      wCtx.fillStyle = `rgb(${tone}, ${tone - 3}, ${tone + 5})`;
      wCtx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);

      wbCtx.fillStyle = '#c8c8c8';
      wbCtx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
    }
  }

  const wallColor = new THREE.CanvasTexture(wallCanvas);
  wallColor.colorSpace = THREE.SRGBColorSpace;
  wallColor.wrapS = THREE.RepeatWrapping;
  wallColor.wrapT = THREE.RepeatWrapping;
  wallColor.anisotropy = maxAnisotropy;

  const wallBump = new THREE.CanvasTexture(wallBumpCanvas);
  wallBump.wrapS = THREE.RepeatWrapping;
  wallBump.wrapT = THREE.RepeatWrapping;
  wallBump.anisotropy = maxAnisotropy;

  // 3. Radial Contact Shadow Disc Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  return { floorColor, floorBump, wallColor, wallBump, contactShadow };
}

function addContactShadow(group: THREE.Group, shadowTex: THREE.CanvasTexture, radius = 0.85): void {
  const geo = new THREE.CircleGeometry(radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(geo, mat);
  disc.position.y = 0.018;
  group.add(disc);
}

/**
 * 8-Part Articulated Player Hero Model (Bottom-center pivot at y=0)
 */
export function createPlayerHeroMesh(
  armorColorHex: string,
  shadowTex: THREE.CanvasTexture,
): {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  weaponPivot: THREE.Group;
  trimMaterials: THREE.MeshStandardMaterial[];
} {
  const root = new THREE.Group();
  addContactShadow(root, shadowTex, 0.95);

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xb8c2cc,
    roughness: 0.25,
    metalness: 0.85,
  });
  const darkLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x262129,
    roughness: 0.78,
    metalness: 0.15,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(armorColorHex || '#f59e0b'),
    roughness: 0.32,
    metalness: 0.68,
    emissive: new THREE.Color(armorColorHex || '#f59e0b'),
    emissiveIntensity: 0.18,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.15,
    metalness: 0.92,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.25,
  });

  // 1 & 2. Armored Greaves (Left & Right Legs)
  const legGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.65, 10);
  const leftLeg = new THREE.Mesh(legGeo, darkLeatherMat);
  leftLeg.position.set(0, 0.325, -0.18);
  const rightLeg = new THREE.Mesh(legGeo, darkLeatherMat);
  rightLeg.position.set(0, 0.325, 0.18);
  bodyGroup.add(leftLeg, rightLeg);

  // 3. Cuirass Torso (Primary Silhouette)
  const torsoGeo = new THREE.CylinderGeometry(0.36, 0.28, 0.82, 12);
  const torso = new THREE.Mesh(torsoGeo, steelMat);
  torso.position.set(0, 0.98, 0);
  torso.castShadow = true;
  bodyGroup.add(torso);

  // 4. Heraldic Chest Tabard & Belt (Secondary Read)
  const tabardGeo = new THREE.BoxGeometry(0.56, 0.62, 0.42);
  const tabard = new THREE.Mesh(tabardGeo, trimMat);
  tabard.position.set(0.06, 0.96, 0);
  bodyGroup.add(tabard);

  // 5 & 6. Pauldrons (Left & Right Shoulders)
  const pauldronGeo = new THREE.SphereGeometry(0.24, 12, 10);
  const leftPauldron = new THREE.Mesh(pauldronGeo, trimMat);
  leftPauldron.position.set(0, 1.32, -0.42);
  leftPauldron.scale.set(1.1, 0.8, 1.0);
  const rightPauldron = new THREE.Mesh(pauldronGeo, trimMat);
  rightPauldron.position.set(0, 1.32, 0.42);
  rightPauldron.scale.set(1.1, 0.8, 1.0);
  bodyGroup.add(leftPauldron, rightPauldron);

  // 7. Visored Knight Helm + Glowing Visor Slit + Plume Crest
  const helmGeo = new THREE.CylinderGeometry(0.24, 0.26, 0.42, 12);
  const helm = new THREE.Mesh(helmGeo, steelMat);
  helm.position.set(0, 1.62, 0);
  bodyGroup.add(helm);

  const visorGeo = new THREE.BoxGeometry(0.28, 0.08, 0.38);
  const visorMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0.16, 1.62, 0);
  bodyGroup.add(visor);

  const crestGeo = new THREE.BoxGeometry(0.42, 0.22, 0.08);
  const crest = new THREE.Mesh(crestGeo, trimMat);
  crest.position.set(-0.06, 1.9, 0);
  bodyGroup.add(crest);

  // 8. Left Arm Heraldic Shield
  const shieldGeo = new THREE.BoxGeometry(0.12, 0.68, 0.52);
  const shield = new THREE.Mesh(shieldGeo, steelMat);
  shield.position.set(0.22, 1.02, -0.48);
  shield.rotation.y = 0.35;
  bodyGroup.add(shield);

  // 9. Right Arm Articulated Weapon Pivot (Runic Longsword with Crossguard & Pommel)
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.25, 1.08, 0.46);
  bodyGroup.add(weaponPivot);

  const hiltGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.32, 8);
  const hilt = new THREE.Mesh(hiltGeo, darkLeatherMat);
  weaponPivot.add(hilt);

  const guardGeo = new THREE.BoxGeometry(0.14, 0.07, 0.44);
  const guard = new THREE.Mesh(guardGeo, trimMat);
  guard.position.set(0, 0.16, 0);
  weaponPivot.add(guard);

  const bladeGeo = new THREE.BoxGeometry(0.08, 1.25, 0.16);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0.82, 0);
  weaponPivot.add(blade);

  // Tilt sword forward into ready stance
  weaponPivot.rotation.z = -0.55;

  return {
    root,
    bodyGroup,
    weaponPivot,
    trimMaterials: [trimMat],
  };
}

/**
 * Creates a composite 5-8 part enemy mesh based on EnemyArchetype, plus telegraph visuals.
 */
export function createEnemyMesh(
  archetype: EnemyArchetype,
  shadowTex: THREE.CanvasTexture,
): {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  telegraphMesh: THREE.Object3D;
  hitFlashMaterials: THREE.MeshStandardMaterial[];
} {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  const hitFlashMaterials: THREE.MeshStandardMaterial[] = [];

  if (archetype === 'swarmer') {
    // Gruft-Skelett (Swarmer): Bone white + emerald necrotic glow, dual curved blades
    addContactShadow(root, shadowTex, 0.75);
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3c9,
      roughness: 0.65,
      metalness: 0.15,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.35,
      metalness: 0.6,
      emissive: 0x059669,
      emissiveIntensity: 0.3,
    });
    hitFlashMaterials.push(boneMat, armorMat);

    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.55, 8), boneMat);
    pelvis.position.y = 0.35;
    const ribcage = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.58, 8), boneMat);
    ribcage.position.y = 0.88;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), boneMat);
    skull.position.y = 1.38;
    const eyes = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.08, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x34d399 }),
    );
    eyes.position.set(0.14, 1.4, 0);

    const bladeGeo = new THREE.BoxGeometry(0.75, 0.08, 0.14);
    const leftBlade = new THREE.Mesh(bladeGeo, armorMat);
    leftBlade.position.set(0.35, 0.95, -0.36);
    const rightBlade = new THREE.Mesh(bladeGeo, armorMat);
    rightBlade.position.set(0.35, 0.95, 0.36);

    bodyGroup.add(pelvis, ribcage, skull, eyes, leftBlade, rightBlade);

    // Telegraph ring for melee strike
    const ringGeo = new THREE.RingGeometry(0.6, 1.15, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    });
    const telegraphMesh = new THREE.Mesh(ringGeo, ringMat);
    telegraphMesh.position.y = 0.04;
    telegraphMesh.visible = false;
    root.add(telegraphMesh);

    return { root, bodyGroup, telegraphMesh, hitFlashMaterials };
  }

  if (archetype === 'ranged') {
    // Runen-Kultist (Kiter/Ranged): Violet & gold robe, floating arcane crystal staff, aim sight-line telegraph
    addContactShadow(root, shadowTex, 0.82);
    const robeMat = new THREE.MeshStandardMaterial({
      color: 0x4c1d95,
      roughness: 0.72,
      metalness: 0.2,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.85,
      emissive: 0xd97706,
      emissiveIntensity: 0.25,
    });
    hitFlashMaterials.push(robeMat, goldMat);

    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.25, 12), robeMat);
    skirt.position.y = 0.625;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.28, 0.26, 10), goldMat);
    collar.position.y = 1.25;
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.52, 10), robeMat);
    hood.position.y = 1.56;
    const mask = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.18, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xe879f9 }),
    );
    mask.position.set(0.14, 1.48, 0);

    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.65, 8), goldMat);
    staff.position.set(0.32, 0.9, 0.38);
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({ color: 0xf0abfc }),
    );
    orb.position.set(0.32, 1.82, 0.38);

    bodyGroup.add(skirt, collar, hood, mask, staff, orb);

    // Telegraph laser sight beam along +X local direction
    const beamGeo = new THREE.PlaneGeometry(7.5, 0.16);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(3.75, 0, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xe879f9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const telegraphMesh = new THREE.Mesh(beamGeo, beamMat);
    telegraphMesh.position.y = 0.65;
    telegraphMesh.visible = false;
    root.add(telegraphMesh);

    return { root, bodyGroup, telegraphMesh, hitFlashMaterials };
  }

  // 'charger': Abgrund-Koloss (Heavy Line-of-Sight Charger): Hulking crimson/obsidian armor + warhammer + charge path telegraph
  addContactShadow(root, shadowTex, 1.15);
  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x1f1924,
    roughness: 0.35,
    metalness: 0.78,
  });
  const magmaMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.55,
    metalness: 0.3,
    emissive: 0xdc2626,
    emissiveIntensity: 0.42,
  });
  hitFlashMaterials.push(obsidianMat, magmaMat);

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.72), obsidianMat);
  legs.position.y = 0.325;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.88, 0.98), obsidianMat);
  chest.position.y = 1.05;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.42, 0.48), magmaMat);
  core.position.y = 1.08;
  const leftShoulder = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 8), magmaMat);
  leftShoulder.position.set(0, 1.55, -0.58);
  const rightShoulder = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 8), magmaMat);
  rightShoulder.position.set(0, 1.55, 0.58);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), obsidianMat);
  helm.position.y = 1.68;
  const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.38, 0.72), magmaMat);
  hammerHead.position.set(0.58, 1.15, 0.52);

  bodyGroup.add(legs, chest, core, leftShoulder, rightShoulder, helm, hammerHead);

  // Charge lane ground telegraph
  const laneGeo = new THREE.PlaneGeometry(6.5, 1.4);
  laneGeo.rotateX(-Math.PI / 2);
  laneGeo.translate(3.25, 0, 0);
  const laneMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65,
  });
  const telegraphMesh = new THREE.Mesh(laneGeo, laneMat);
  telegraphMesh.position.y = 0.04;
  telegraphMesh.visible = false;
  root.add(telegraphMesh);

  return { root, bodyGroup, telegraphMesh, hitFlashMaterials };
}

/**
 * Creates a composite 3D prop for chests, gold piles, shrines, secret altars, and the exit portal.
 */
export function createDungeonPropMesh(
  type: 'chest' | 'gold' | 'shrine' | 'secret_altar' | 'exit' | 'brazier',
  shadowTex: THREE.CanvasTexture,
): THREE.Group {
  const group = new THREE.Group();
  addContactShadow(group, shadowTex, type === 'exit' ? 1.45 : 0.9);

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.2,
    metalness: 0.9,
    emissive: 0xd97706,
    emissiveIntensity: 0.25,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x5c3a21,
    roughness: 0.8,
    metalness: 0.1,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x3b3648,
    roughness: 0.75,
    metalness: 0.2,
  });

  if (type === 'brazier') {
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.85, 8), stoneMat);
    pedestal.position.y = 0.425;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.28, 10), goldMat);
    bowl.position.y = 0.92;
    const flameOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.65, 8),
      new THREE.MeshBasicMaterial({ color: 0xf97316 }),
    );
    flameOuter.position.y = 1.32;
    const flameCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: 0xfef08a }),
    );
    flameCore.position.y = 1.25;
    group.add(pedestal, bowl, flameOuter, flameCore);
    return group;
  }

  if (type === 'chest') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.68), woodMat);
    base.position.y = 0.275;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 10), woodMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.55;
    const bandLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.66, 0.72), goldMat);
    bandLeft.position.set(-0.32, 0.35, 0);
    const bandRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.66, 0.72), goldMat);
    bandRight.position.set(0.32, 0.35, 0);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.76), goldMat);
    lock.position.set(0, 0.42, 0);
    group.add(base, lid, bandLeft, bandRight, lock);
    return group;
  }

  if (type === 'gold') {
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const ingot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 8), goldMat);
      ingot.position.set(Math.cos(angle) * 0.25, 0.09 + (i % 2) * 0.1, Math.sin(angle) * 0.25);
      group.add(ingot);
    }
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24, 0),
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.1,
        metalness: 0.85,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.5,
      }),
    );
    gem.position.y = 0.36;
    group.add(gem);
    return group;
  }

  if (type === 'shrine') {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.45, 10), stoneMat);
    plinth.position.y = 0.225;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.1, 10), stoneMat);
    pillar.position.y = 0.95;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        roughness: 0.15,
        metalness: 0.5,
        emissive: 0x10b981,
        emissiveIntensity: 0.65,
      }),
    );
    crystal.position.y = 1.85;
    group.add(plinth, pillar, crystal);
    return group;
  }

  if (type === 'secret_altar') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 1.1), stoneMat);
    base.position.y = 0.175;
    const obelisk = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.75, 4), stoneMat);
    obelisk.position.y = 1.15;
    const runeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xc084fc }),
    );
    runeRing.rotation.x = Math.PI / 2;
    runeRing.position.y = 1.25;
    const crownRelic = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), goldMat);
    crownRelic.position.y = 2.25;
    group.add(base, obelisk, runeRing, crownRelic);
    return group;
  }

  // 'exit' portal archway
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 0.28, 16), stoneMat);
  base.position.y = 0.14;
  const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.3, 0.38), stoneMat);
  leftPillar.position.set(0, 1.25, -0.95);
  const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.3, 0.38), stoneMat);
  rightPillar.position.set(0, 1.25, 0.95);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 2.4), goldMat);
  lintel.position.set(0, 2.45, 0);
  const vortex = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 24),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    }),
  );
  vortex.rotation.y = Math.PI / 2;
  vortex.position.set(0, 1.32, 0);
  group.add(base, leftPillar, rightPillar, lintel, vortex);
  return group;
}
