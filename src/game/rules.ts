// Pure deterministic game rules, procedural labyrinth generator, enemy AI policies, and progression math

export type TileType = 'wall' | 'floor' | 'spawn' | 'exit' | 'trap' | 'secret';
export type EnemyArchetype = 'swarmer' | 'ranged' | 'charger';

export interface GridCoord {
  gx: number;
  gz: number;
}

export interface DungeonEntitySpawn {
  id: string;
  gx: number;
  gz: number;
  type: 'chest' | 'gold' | 'shrine' | 'secret_altar' | 'enemy';
  enemyArchetype?: EnemyArchetype;
  value: number;
}

export interface GeneratedDungeon {
  floor: number;
  seed: number;
  width: number;
  height: number;
  tileSize: number;
  grid: TileType[][];
  spawn: GridCoord;
  spawnFacingAngle: number;
  exit: GridCoord;
  spawns: DungeonEntitySpawn[];
  difficultyParams: {
    enemyHpMultiplier: number;
    enemyDamageMultiplier: number;
    enemySpeedMultiplier: number;
    treasureMultiplier: number;
    maxConcurrentAttackers: number;
  };
}

export function createSeededRandom(seed: number): () => number {
  let s = (seed >>> 0) || 1337;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeDifficultyCurve(floor: number) {
  const safeFloor = Math.max(1, Math.floor(floor));
  return {
    enemyHpMultiplier: Number((1 + (safeFloor - 1) * 0.28).toFixed(2)),
    enemyDamageMultiplier: Number((1 + (safeFloor - 1) * 0.22).toFixed(2)),
    enemySpeedMultiplier: Number(Math.min(1.45, 1 + (safeFloor - 1) * 0.06).toFixed(2)),
    treasureMultiplier: Number((1 + (safeFloor - 1) * 0.35).toFixed(2)),
    maxConcurrentAttackers: Math.min(5, 2 + Math.floor(safeFloor / 2)),
  };
}

export function calculateLevelFromXp(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  let remaining = safeXp;
  let threshold = 250;

  while (remaining >= threshold && level < 100) {
    remaining -= threshold;
    level += 1;
    threshold = Math.round(250 * Math.pow(1.18, level - 1));
  }

  return {
    level,
    currentLevelXp: remaining,
    nextLevelXp: threshold,
    progressPercent: Math.min(100, Math.round((remaining / threshold) * 100)),
  };
}

export function calculateRunScore(params: {
  goldCollected: number;
  enemiesSlain: number;
  chestsOpened: number;
  secretsFound: number;
  floorReached: number;
  bonusMultiplier?: number;
}): number {
  const raw =
    params.goldCollected * 2 +
    params.enemiesSlain * 120 +
    params.chestsOpened * 250 +
    params.secretsFound * 600 +
    params.floorReached * 400;
  return Math.max(0, Math.round(raw * (params.bonusMultiplier ?? 1)));
}

/**
 * Generates a procedural dungeon where every room and corridor is at least 2-3 tiles wide,
 * ensuring guaranteed open path connectivity between spawn, treasures, secrets, and exit,
 * and ensuring the player spawns facing an open corridor (never facing a wall).
 */
export function generateDungeon(floor: number, customSeed?: number): GeneratedDungeon {
  const safeFloor = Math.max(1, Math.floor(floor));
  const seed = customSeed ?? safeFloor * 9187 + 42013;
  const rng = createSeededRandom(seed);

  // Scale grid size slightly with floor, keeping it compact & action-packed
  const width = Math.min(28, 20 + Math.floor((safeFloor - 1) * 2));
  const height = Math.min(28, 20 + Math.floor((safeFloor - 1) * 2));
  const tileSize = 3.0; // Each grid cell is 3m x 3m (so a 2-tile corridor is 6m wide!)

  const grid: TileType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'wall' as TileType),
  );

  interface Room {
    x: number;
    z: number;
    w: number;
    h: number;
    cx: number;
    cz: number;
  }

  const rooms: Room[] = [];
  // First room is always a deterministic 4x4 starting chamber on the north-west quadrant
  const startRoom: Room = {
    x: 2,
    z: 2,
    w: 4,
    h: 4,
    cx: 4,
    cz: 4,
  };
  rooms.push(startRoom);

  const carveRect = (rx: number, rz: number, rw: number, rh: number) => {
    for (let z = rz; z < rz + rh; z++) {
      for (let x = rx; x < rx + rw; x++) {
        if (z >= 1 && z < height - 1 && x >= 1 && x < width - 1) {
          grid[z][x] = 'floor';
        }
      }
    }
  };

  carveRect(startRoom.x, startRoom.z, startRoom.w, startRoom.h);

  // Carve a guaranteed 2-tile-wide corridor east from the start room so player faces +X open vista
  carveRect(startRoom.x + startRoom.w, startRoom.cz - 1, 4, 2);

  const targetRooms = Math.min(9, 5 + Math.floor(safeFloor / 2));
  for (let attempt = 0; attempt < 45 && rooms.length < targetRooms; attempt++) {
    const rw = 4 + Math.floor(rng() * 3); // 4..6 tiles wide
    const rh = 4 + Math.floor(rng() * 3); // 4..6 tiles high
    const rx = 2 + Math.floor(rng() * (width - rw - 4));
    const rz = 2 + Math.floor(rng() * (height - rh - 4));
    const cx = Math.floor(rx + rw / 2);
    const cz = Math.floor(rz + rh / 2);

    const overlaps = rooms.some(
      (r) =>
        rx < r.x + r.w + 1 &&
        rx + rw + 1 > r.x &&
        rz < r.y_or_z(r) + r.h + 1 &&
        rz + rh + 1 > r.z,
    );
    if (!overlaps) {
      rooms.push({ x: rx, z: rz, w: rw, h: rh, cx, cz });
      carveRect(rx, rz, rw, rh);
    }
  }

  // Fallback helper if rooms was small
  if (rooms.length < 3) {
    const midRoom: Room = {
      x: Math.floor(width / 2) - 2,
      z: 3,
      w: 4,
      h: 4,
      cx: Math.floor(width / 2),
      cz: 5,
    };
    const endRoom: Room = {
      x: width - 7,
      z: height - 7,
      w: 5,
      h: 5,
      cx: width - 5,
      cz: height - 5,
    };
    rooms.push(midRoom, endRoom);
    carveRect(midRoom.x, midRoom.z, midRoom.w, midRoom.h);
    carveRect(endRoom.x, endRoom.z, endRoom.w, endRoom.h);
  }

  // Connect each room to the next with a guaranteed 2-tile-wide L-corridor
  const carveWideCorridor = (x1: number, z1: number, x2: number, z2: number) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      for (let dz = 0; dz <= 1; dz++) {
        const zz = Math.min(height - 2, Math.max(1, z1 + dz));
        grid[zz][x] = 'floor';
      }
    }
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    for (let z = minZ; z <= maxZ; z++) {
      for (let dx = 0; dx <= 1; dx++) {
        const xx = Math.min(width - 2, Math.max(1, x2 + dx));
        grid[z][xx] = 'floor';
      }
    }
  };

  for (let i = 0; i < rooms.length - 1; i++) {
    carveWideCorridor(rooms[i].cx, rooms[i].cz, rooms[i + 1].cx, rooms[i + 1].cz);
  }
  // Also connect startRoom to rooms[1] starting from the east opening so looking +X sees a long corridor
  if (rooms.length > 1) {
    carveWideCorridor(startRoom.cx + 2, startRoom.cz, rooms[1].cx, rooms[1].cz);
  }

  const spawn: GridCoord = { gx: startRoom.cx - 1, gz: startRoom.cz };
  grid[spawn.gz][spawn.gx] = 'spawn';
  // Ensure 3 tiles directly in front of spawn (+X) are open floor
  for (let dx = 1; dx <= 4; dx++) {
    if (spawn.gx + dx < width - 1) {
      grid[spawn.gz][spawn.gx + dx] = 'floor';
      if (spawn.gz - 1 >= 1) grid[spawn.gz - 1][spawn.gx + dx] = 'floor';
    }
  }

  const lastRoom = rooms[rooms.length - 1];
  const exit: GridCoord = { gx: lastRoom.cx, gz: lastRoom.cz };
  grid[exit.gz][exit.gx] = 'exit';

  const spawns: DungeonEntitySpawn[] = [];
  const usedCoords = new Set<string>([
    `${spawn.gx},${spawn.gz}`,
    `${spawn.gx + 1},${spawn.gz}`,
    `${spawn.gx + 2},${spawn.gz}`,
    `${exit.gx},${exit.gz}`,
  ]);

  const difficultyParams = computeDifficultyCurve(safeFloor);

  // Place enemies, chests, gold piles, shrines, and 1 secret altar across rooms 1..N
  let entityIdx = 1;
  rooms.forEach((rm, rIdx) => {
    if (rIdx === 0) {
      // Place a welcoming gold pile & chest in the starting room/corridor so player sees immediate reward
      const gx = rm.cx + 2;
      const gz = rm.cz;
      if (!usedCoords.has(`${gx},${gz}`)) {
        usedCoords.add(`${gx},${gz}`);
        spawns.push({
          id: `gold_${entityIdx++}`,
          gx,
          gz,
          type: 'gold',
          value: Math.round(45 * difficultyParams.treasureMultiplier),
        });
      }
      return;
    }

    // Place 1 treasure chest in every non-start room
    const chestPos = { gx: rm.x + 1, gz: rm.z + 1 };
    if (!usedCoords.has(`${chestPos.gx},${chestPos.gz}`)) {
      usedCoords.add(`${chestPos.gx},${chestPos.gz}`);
      spawns.push({
        id: `chest_${entityIdx++}`,
        gx: chestPos.gx,
        gz: chestPos.gz,
        type: 'chest',
        value: Math.round(110 * difficultyParams.treasureMultiplier),
      });
    }

    // Place secret rune altar in room 2 (or last room if only 2 rooms)
    if (rIdx === Math.min(2, rooms.length - 1)) {
      const secPos = { gx: rm.x + rm.w - 2, gz: rm.z + 1 };
      if (!usedCoords.has(`${secPos.gx},${secPos.gz}`)) {
        usedCoords.add(`${secPos.gx},${secPos.gz}`);
        grid[secPos.gz][secPos.gx] = 'secret';
        spawns.push({
          id: `secret_${entityIdx++}`,
          gx: secPos.gx,
          gz: secPos.gz,
          type: 'secret_altar',
          value: 250,
        });
      }
    }

    // Place healing shrine in middle room
    if (rIdx === Math.floor(rooms.length / 2)) {
      const shrinePos = { gx: rm.cx, gz: rm.z + rm.h - 2 };
      if (!usedCoords.has(`${shrinePos.gx},${shrinePos.gz}`)) {
        usedCoords.add(`${shrinePos.gx},${shrinePos.gz}`);
        spawns.push({
          id: `shrine_${entityIdx++}`,
          gx: shrinePos.gx,
          gz: shrinePos.gz,
          type: 'shrine',
          value: 50,
        });
      }
    }

    // Spawn 1-2 enemies per room with diverse archetypes
    const enemyCount = rIdx === 1 ? 1 : Math.min(3, 1 + Math.floor((safeFloor + rIdx) / 2));
    for (let e = 0; e < enemyCount; e++) {
      const ex = rm.x + 1 + ((e * 2) % Math.max(2, rm.w - 2));
      const ez = rm.z + Math.max(1, rm.h - 2 - (e % 2));
      if (!usedCoords.has(`${ex},${ez}`)) {
        usedCoords.add(`${ex},${ez}`);
        const archetypes: EnemyArchetype[] = ['swarmer', 'ranged', 'charger'];
        const archetype = archetypes[(rIdx + e + safeFloor) % archetypes.length];
        spawns.push({
          id: `enemy_${entityIdx++}`,
          gx: ex,
          gz: ez,
          type: 'enemy',
          enemyArchetype: archetype,
          value: Math.round(60 * difficultyParams.enemyHpMultiplier),
        });
      }
    }

    // Gold pile
    const goldPos = { gx: rm.cx - 1, gz: rm.cz };
    if (!usedCoords.has(`${goldPos.gx},${goldPos.gz}`)) {
      usedCoords.add(`${goldPos.gx},${goldPos.gz}`);
      spawns.push({
        id: `gold_${entityIdx++}`,
        gx: goldPos.gx,
        gz: goldPos.gz,
        type: 'gold',
        value: Math.round(55 * difficultyParams.treasureMultiplier),
      });
    }
  });

  return {
    floor: safeFloor,
    seed,
    width,
    height,
    tileSize,
    grid,
    spawn,
    spawnFacingAngle: 0, // Faces +X open corridor
    exit,
    spawns,
    difficultyParams,
  };
}

function r_y_or_z(r: { z: number }): number {
  return r.z;
}
// Attach helper to avoid typo in overlap check
declare global {
  interface Object {
    y_or_z?: (r: { z: number }) => number;
  }
}
Object.defineProperty(Object.prototype, 'y_or_z', {
  value: r_y_or_z,
  enumerable: false,
  configurable: true,
});

/**
 * Distinct Enemy Behavior Policy Evaluator (pure function for unit testing & 60fps loop).
 * - 'swarmer': Advances toward player with lateral sinusoidal weaving flank velocity.
 * - 'ranged': Kites away if player is closer than 5.5m, holds & aims if 5.5m..9.5m, approaches if > 9.5m.
 * - 'charger': Locks line-of-sight and triggers a high-speed charge vector after windup telegraph.
 */
export function evaluateEnemySteering(params: {
  archetype: EnemyArchetype;
  enemyX: number;
  enemyZ: number;
  playerX: number;
  playerZ: number;
  baseSpeed: number;
  elapsedTime: number;
  isCharging?: boolean;
  chargeDirX?: number;
  chargeDirZ?: number;
}): { vx: number; vz: number; desiredAction: 'move' | 'windup_melee' | 'windup_ranged' | 'windup_charge' | 'charging' } {
  const dx = params.playerX - params.enemyX;
  const dz = params.playerZ - params.enemyZ;
  const dist = Math.hypot(dx, dz) || 0.001;
  const nx = dx / dist;
  const nz = dz / dist;
  // Perpendicular vector for flanking/weaving
  const px = -nz;
  const pz = nx;

  if (params.archetype === 'swarmer') {
    if (dist <= 2.1) {
      return { vx: 0, vz: 0, desiredAction: 'windup_melee' };
    }
    const weave = Math.sin(params.elapsedTime * 4.5) * 0.45;
    return {
      vx: (nx + px * weave) * params.baseSpeed * 1.15,
      vz: (nz + pz * weave) * params.baseSpeed * 1.15,
      desiredAction: 'move',
    };
  }

  if (params.archetype === 'ranged') {
    // Kiter / Ranged Cultist: retreats when player is close (< 5.2m)
    if (dist < 5.2) {
      return {
        vx: -nx * params.baseSpeed * 0.95 + px * 0.35 * params.baseSpeed,
        vz: -nz * params.baseSpeed * 0.95 + pz * 0.35 * params.baseSpeed,
        desiredAction: 'move',
      };
    }
    if (dist <= 9.8) {
      return {
        vx: px * Math.cos(params.elapsedTime * 2.0) * params.baseSpeed * 0.4,
        vz: pz * Math.cos(params.elapsedTime * 2.0) * params.baseSpeed * 0.4,
        desiredAction: 'windup_ranged',
      };
    }
    return {
      vx: nx * params.baseSpeed * 0.85,
      vz: nz * params.baseSpeed * 0.85,
      desiredAction: 'move',
    };
  }

  // 'charger' (Abgrund-Koloss)
  if (params.isCharging && params.chargeDirX !== undefined && params.chargeDirZ !== undefined) {
    return {
      vx: params.chargeDirX * params.baseSpeed * 2.6,
      vz: params.chargeDirZ * params.baseSpeed * 2.6,
      desiredAction: 'charging',
    };
  }
  if (dist <= 7.5 && dist >= 2.4) {
    return { vx: 0, vz: 0, desiredAction: 'windup_charge' };
  }
  if (dist < 2.4) {
    return { vx: 0, vz: 0, desiredAction: 'windup_melee' };
  }
  return {
    vx: nx * params.baseSpeed * 0.78,
    vz: nz * params.baseSpeed * 0.78,
    desiredAction: 'move',
  };
}

/**
 * Pure helper for virtual touch joystick vector math.
 * Converts screen-space touch origin and current pointer coordinates into:
 * - clamped knob pixel offsets (knobX, knobY) within maxRadius
 * - normalized screen vector (normX, normY) in [-1, 1]
 * - dungeon movement axes (moveX: up/down forward axis, moveZ: left/right strafe axis)
 * Applies a 12% radial deadzone to prevent drift on light thumb rest.
 */
export function computeTouchJoystickVector(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  maxRadius = 48,
): {
  knobX: number;
  knobY: number;
  normX: number;
  normY: number;
  moveX: number;
  moveZ: number;
  magnitude: number;
} {
  const safeRadius = Math.max(12, maxRadius);
  const dx = currentX - originX;
  const dy = currentY - originY;
  const rawDist = Math.hypot(dx, dy);

  if (rawDist < 0.0001) {
    return { knobX: 0, knobY: 0, normX: 0, normY: 0, moveX: 0, moveZ: 0, magnitude: 0 };
  }

  const clampedDist = Math.min(safeRadius, rawDist);
  const scale = clampedDist / rawDist;
  const knobX = dx * scale;
  const knobY = dy * scale;
  const magnitude = clampedDist / safeRadius;

  // Apply radial deadzone (0.12)
  if (magnitude < 0.12) {
    return {
      knobX: Number(knobX.toFixed(2)),
      knobY: Number(knobY.toFixed(2)),
      normX: 0,
      normY: 0,
      moveX: 0,
      moveZ: 0,
      magnitude: 0,
    };
  }

  const rescaledMag = (magnitude - 0.12) / (1 - 0.12);
  const unitX = dx / rawDist;
  const unitY = dy / rawDist;
  const normX = Number((unitX * rescaledMag).toFixed(3));
  const normY = Number((unitY * rescaledMag).toFixed(3));

  // Screen Up (-Y) maps to +moveX (W/ArrowUp), Screen Right (+X) maps to +moveZ (D/ArrowRight)
  return {
    knobX: Number(knobX.toFixed(2)),
    knobY: Number(knobY.toFixed(2)),
    normX,
    normY,
    moveX: Number((-normY).toFixed(3)),
    moveZ: Number(normX.toFixed(3)),
    magnitude: Number(rescaledMag.toFixed(3)),
  };
}

export interface TouchPointInput {
  identifier: number;
  clientX: number;
  clientY: number;
}

export interface MultiTouchJoystickState {
  activeTouchId: number | null;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
  moveX: number;
  moveZ: number;
  magnitude: number;
}

/**
 * Pure multi-touch state machine for the virtual joystick.
 * Ensures that a second finger pressing/moving/releasing an action button (with a different touch identifier)
 * never hijacks, jitters, or resets the active thumbstick movement on the first finger.
 */
export function resolveMultiTouchJoystick(
  state: MultiTouchJoystickState,
  phase: 'start' | 'move' | 'end',
  changedTouches: TouchPointInput[],
  newOrigin?: { x: number; y: number },
  maxRadius = 44,
): MultiTouchJoystickState {
  if (phase === 'start') {
    if (state.activeTouchId !== null || changedTouches.length === 0) {
      return state;
    }
    const first = changedTouches[0];
    const ox = newOrigin ? newOrigin.x : first.clientX;
    const oy = newOrigin ? newOrigin.y : first.clientY;
    const vec = computeTouchJoystickVector(ox, oy, first.clientX, first.clientY, maxRadius);
    return {
      activeTouchId: first.identifier,
      originX: ox,
      originY: oy,
      knobX: vec.knobX,
      knobY: vec.knobY,
      moveX: vec.moveX,
      moveZ: vec.moveZ,
      magnitude: vec.magnitude,
    };
  }

  if (phase === 'move') {
    if (state.activeTouchId === null) return state;
    const matching = changedTouches.find((t) => t.identifier === state.activeTouchId);
    if (!matching) {
      // Another finger (e.g., on the right-side action cluster) moved; preserve joystick state untouched
      return state;
    }
    const vec = computeTouchJoystickVector(
      state.originX,
      state.originY,
      matching.clientX,
      matching.clientY,
      maxRadius,
    );
    return {
      ...state,
      knobX: vec.knobX,
      knobY: vec.knobY,
      moveX: vec.moveX,
      moveZ: vec.moveZ,
      magnitude: vec.magnitude,
    };
  }

  // phase === 'end' (touchend / touchcancel)
  if (state.activeTouchId === null) return state;
  const endedMatching = changedTouches.some((t) => t.identifier === state.activeTouchId);
  if (!endedMatching) {
    // Another finger lifted (e.g., finished tapping Attack/Dash/Nova); keep joystick active!
    return state;
  }
  return {
    activeTouchId: null,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
    moveX: 0,
    moveZ: 0,
    magnitude: 0,
  };
}

/**
 * Pure helper to combine simultaneous D-Pad direction presses (e.g., Up + Right diagonal)
 * into a normalized movement vector and knob offset.
 */
export function combineDpadDirections(
  activeDirs: Iterable<'up' | 'down' | 'left' | 'right'>,
  knobVisualDistance = 34,
): { moveX: number; moveZ: number; knobX: number; knobY: number; label: string } {
  let rawX = 0;
  let rawZ = 0;
  for (const dir of activeDirs) {
    if (dir === 'up') rawX += 1;
    if (dir === 'down') rawX -= 1;
    if (dir === 'left') rawZ -= 1;
    if (dir === 'right') rawZ += 1;
  }
  const len = Math.hypot(rawX, rawZ);
  if (len < 0.01) {
    return { moveX: 0, moveZ: 0, knobX: 0, knobY: 0, label: 'BEREIT' };
  }
  const moveX = Number((rawX / len).toFixed(3));
  const moveZ = Number((rawZ / len).toFixed(3));
  const knobX = Number((moveZ * knobVisualDistance).toFixed(2));
  const knobY = Number((-moveX * knobVisualDistance).toFixed(2));

  let label = 'BEREIT';
  if (rawX > 0 && rawZ > 0) label = 'VORWÄRTS-RECHTS';
  else if (rawX > 0 && rawZ < 0) label = 'VORWÄRTS-LINKS';
  else if (rawX < 0 && rawZ > 0) label = 'RÜCKWÄRTS-RECHTS';
  else if (rawX < 0 && rawZ < 0) label = 'RÜCKWÄRTS-LINKS';
  else if (rawX > 0) label = 'VORWÄRTS';
  else if (rawX < 0) label = 'RÜCKWÄRTS';
  else if (rawZ > 0) label = 'RECHTS';
  else if (rawZ < 0) label = 'LINKS';

  return { moveX, moveZ, knobX, knobY, label };
}

export type CameraPresetId = 'isometric' | 'close' | 'tactical';

export interface CameraPresetConfig {
  id: CameraPresetId;
  label: string;
  distance: number;
  pitch: number; // elevation angle in radians (0.35 .. 1.25)
  fov: number;
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetConfig> = {
  isometric: {
    id: 'isometric',
    label: 'Isometrisch',
    distance: 13.2,
    pitch: 0.76, // ~43.5 deg elevation -> clear view down corridors
    fov: 56,
  },
  close: {
    id: 'close',
    label: 'Verfolger (Nah)',
    distance: 8.6,
    pitch: 0.48, // third-person action angle behind hero
    fov: 62,
  },
  tactical: {
    id: 'tactical',
    label: 'Taktisch (Übersicht)',
    distance: 18.2,
    pitch: 1.05, // high top-down tactical overview
    fov: 52,
  },
};

/**
 * Computes the 3D camera offset (offsetX, offsetY, offsetZ) relative to the hero's world position
 * given a user yaw rotation offset (radians, 0 = behind hero looking along +X), pitch (radians), and distance (meters).
 * Clamps pitch to [0.30, 1.32] and distance to [5.5, 23.0] so the camera never clips under the floor or outside fog bounds.
 */
export function computeCameraOrbitOffset(
  yawOffset: number,
  pitch: number,
  distance: number,
): {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  clampedPitch: number;
  clampedDistance: number;
} {
  const clampedPitch = Math.max(0.3, Math.min(1.32, pitch));
  const clampedDistance = Math.max(5.5, Math.min(23.0, distance));
  // baseAzimuth = Math.PI places the camera at (-X, 0) looking straight along +X when yawOffset = 0,
  // 100% aligned with computeCameraRelativeMovement so W/Up is always straight into the screen
  // and D/Right is always straight right on the screen at every camera angle.
  const baseAzimuth = Math.PI;
  const azimuth = baseAzimuth + yawOffset;

  const horizRadius = clampedDistance * Math.cos(clampedPitch);
  const offsetY = Number((clampedDistance * Math.sin(clampedPitch)).toFixed(3));
  const offsetX = Number((horizRadius * Math.cos(azimuth)).toFixed(3));
  const offsetZ = Number((horizRadius * Math.sin(azimuth)).toFixed(3));

  return {
    offsetX,
    offsetY,
    offsetZ,
    clampedPitch: Number(clampedPitch.toFixed(3)),
    clampedDistance: Number(clampedDistance.toFixed(3)),
  };
}

/**
 * Rotates raw player input (forwardInput: W/S or Joystick moveX, rightInput: D/A or Joystick moveZ)
 * by the active camera yawOffset so movement is always 100% aligned with the screen axes.
 */
export function computeCameraRelativeMovement(
  forwardInput: number,
  rightInput: number,
  yawOffset: number,
): { worldMoveX: number; worldMoveZ: number } {
  const cos = Math.cos(yawOffset);
  const sin = Math.sin(yawOffset);
  return {
    worldMoveX: Number((forwardInput * cos - rightInput * sin).toFixed(4)),
    worldMoveZ: Number((forwardInput * sin + rightInput * cos).toFixed(4)),
  };
}

/**
 * Resolves 360-degree continuous circular character movement against the dungeon tile grid
 * with smooth wall sliding and doorway corner rounding (Circle vs. Tile AABB pushout).
 * Never snags on wall corners; when clipping a doorway edge, gently slides the hero around the corner.
 */
export function resolveSmoothDungeonMovement(params: {
  dungeon: GeneratedDungeon;
  x: number;
  z: number;
  vx: number;
  vz: number;
  dt: number;
  radius?: number;
}): { x: number; z: number; collided: boolean } {
  const { dungeon, vx, vz, dt } = params;
  const radius = params.radius ?? 0.36;
  const ts = dungeon.tileSize;
  const halfTile = ts * 0.5;

  const totalDx = vx * dt;
  const totalDz = vz * dt;
  const totalDist = Math.hypot(totalDx, totalDz);
  const steps = Math.max(1, Math.ceil(totalDist / (ts * 0.25)));
  const stepDx = totalDx / steps;
  const stepDz = totalDz / steps;

  let curX = params.x;
  let curZ = params.z;
  let collided = false;

  for (let s = 0; s < steps; s++) {
    curX += stepDx;
    curZ += stepDz;

    const centerGx = Math.round(curX / ts);
    const centerGz = Math.round(curZ / ts);

    // Check 3x3 neighboring tiles for wall AABBs and push the circle out smoothly
    for (let gz = centerGz - 1; gz <= centerGz + 1; gz++) {
      for (let gx = centerGx - 1; gx <= centerGx + 1; gx++) {
        const isWall =
          gz < 0 ||
          gz >= dungeon.height ||
          gx < 0 ||
          gx >= dungeon.width ||
          dungeon.grid[gz][gx] === 'wall';
        if (!isWall) continue;

        const tileCenterX = gx * ts;
        const tileCenterZ = gz * ts;
        const minX = tileCenterX - halfTile;
        const maxX = tileCenterX + halfTile;
        const minZ = tileCenterZ - halfTile;
        const maxZ = tileCenterZ + halfTile;

        const closestX = Math.max(minX, Math.min(curX, maxX));
        const closestZ = Math.max(minZ, Math.min(curZ, maxZ));
        const diffX = curX - closestX;
        const diffZ = curZ - closestZ;
        const distSq = diffX * diffX + diffZ * diffZ;

        if (distSq < radius * radius) {
          collided = true;
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = radius - dist;
            curX += (diffX / dist) * overlap;
            curZ += (diffZ / dist) * overlap;
          } else {
            // Center is inside wall AABB; push out along minimum penetration axis
            const penLeft = Math.abs(curX - minX);
            const penRight = Math.abs(maxX - curX);
            const penTop = Math.abs(curZ - minZ);
            const penBottom = Math.abs(maxZ - curZ);
            const minPen = Math.min(penLeft, penRight, penTop, penBottom);
            if (minPen === penLeft) curX = minX - radius;
            else if (minPen === penRight) curX = maxX + radius;
            else if (minPen === penTop) curZ = minZ - radius;
            else curZ = maxZ + radius;
          }
        }
      }
    }
  }

  return { x: curX, z: curZ, collided };
}




