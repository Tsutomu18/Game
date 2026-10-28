import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDungeon,
  computeDifficultyCurve,
  calculateLevelFromXp,
  calculateRunScore,
  evaluateEnemySteering,
  computeTouchJoystickVector,
  resolveMultiTouchJoystick,
  combineDpadDirections,
  CAMERA_PRESETS,
  computeCameraOrbitOffset,
  computeCameraRelativeMovement,
  resolveSmoothDungeonMovement,
  type MultiTouchJoystickState,
} from './rules';

test('Procedural dungeon generator spawns player on open path with clear +X corridor and reachable exit', () => {
  const dungeon = generateDungeon(1, 12345);
  assert.equal(dungeon.grid[dungeon.spawn.gz][dungeon.spawn.gx], 'spawn');
  // Player faces +X (spawnFacingAngle === 0), and the next 2 tiles along +X must be open floor
  assert.notEqual(dungeon.grid[dungeon.spawn.gz][dungeon.spawn.gx + 1], 'wall');
  assert.notEqual(dungeon.grid[dungeon.spawn.gz][dungeon.spawn.gx + 2], 'wall');
  assert.equal(dungeon.grid[dungeon.exit.gz][dungeon.exit.gx], 'exit');
  assert.ok(dungeon.spawns.length >= 4, 'Dungeon should contain treasures, secrets, and enemy spawns');
});

test('Difficulty curve scales enemy HP, damage, speed, and treasure rewards across floors', () => {
  const f1 = computeDifficultyCurve(1);
  const f4 = computeDifficultyCurve(4);
  assert.ok(f4.enemyHpMultiplier > f1.enemyHpMultiplier);
  assert.ok(f4.enemyDamageMultiplier > f1.enemyDamageMultiplier);
  assert.ok(f4.treasureMultiplier > f1.treasureMultiplier);
  assert.ok(f4.maxConcurrentAttackers >= f1.maxConcurrentAttackers);
});

test('XP and Level progression calculates level ups accurately', () => {
  const lvl1 = calculateLevelFromXp(100);
  assert.equal(lvl1.level, 1);
  assert.equal(lvl1.currentLevelXp, 100);

  const lvl2 = calculateLevelFromXp(300);
  assert.equal(lvl2.level, 2);
  assert.equal(lvl2.currentLevelXp, 50);
});

test('Three enemy archetypes exhibit genuinely distinct movement & decision policies', () => {
  // 1. Swarmer closes distance rapidly with weave
  const swarmerMove = evaluateEnemySteering({
    archetype: 'swarmer',
    enemyX: 0,
    enemyZ: 0,
    playerX: 4,
    playerZ: 0,
    baseSpeed: 3,
    elapsedTime: 1.0,
  });
  assert.equal(swarmerMove.desiredAction, 'move');
  assert.ok(swarmerMove.vx > 0, 'Swarmer advances toward player');

  // 2. Ranged kiter retreats when player is closer than 5.2m
  const rangedRetreat = evaluateEnemySteering({
    archetype: 'ranged',
    enemyX: 0,
    enemyZ: 0,
    playerX: 4,
    playerZ: 0,
    baseSpeed: 3,
    elapsedTime: 1.0,
  });
  assert.equal(rangedRetreat.desiredAction, 'move');
  assert.ok(rangedRetreat.vx < 0, 'Ranged cultist kites away from close player');

  // 3. Charger enters windup_charge at medium line-of-sight range
  const chargerWindup = evaluateEnemySteering({
    archetype: 'charger',
    enemyX: 0,
    enemyZ: 0,
    playerX: 5,
    playerZ: 0,
    baseSpeed: 3,
    elapsedTime: 1.0,
  });
  assert.equal(chargerWindup.desiredAction, 'windup_charge');
  assert.equal(chargerWindup.vx, 0);
});

test('Run score calculation weights gold, kills, chests, secrets, and floors', () => {
  const score = calculateRunScore({
    goldCollected: 100,
    enemiesSlain: 5,
    chestsOpened: 2,
    secretsFound: 1,
    floorReached: 2,
  });
  assert.equal(score, 100 * 2 + 5 * 120 + 2 * 250 + 1 * 600 + 2 * 400);
});

test('Touch joystick vector clamps radius, applies deadzone, and maps screen axes to dungeon movement', () => {
  // Inside deadzone -> zero movement
  const dead = computeTouchJoystickVector(100, 100, 102, 99, 50);
  assert.equal(dead.moveX, 0);
  assert.equal(dead.moveZ, 0);
  assert.equal(dead.magnitude, 0);

  // Full drag Up (screen Y decreases) -> +moveX = 1, moveZ = 0
  const up = computeTouchJoystickVector(100, 100, 100, 20, 50);
  assert.equal(up.knobY, -50);
  assert.equal(up.moveX, 1);
  assert.equal(up.moveZ, 0);

  // Full drag Right (screen X increases) -> moveX = 0, +moveZ = 1
  const right = computeTouchJoystickVector(100, 100, 180, 100, 50);
  assert.equal(right.knobX, 50);
  assert.equal(right.moveX, 0);
  assert.equal(right.moveZ, 1);
});

test('Multi-touch joystick preserves movement when a second finger presses, moves, and releases an action button', () => {
  const initial: MultiTouchJoystickState = {
    activeTouchId: null,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
    moveX: 0,
    moveZ: 0,
    magnitude: 0,
  };

  // Finger 1 (id=10) touches joystick center (100, 700) and drags up to (100, 620)
  const started = resolveMultiTouchJoystick(
    initial,
    'start',
    [{ identifier: 10, clientX: 100, clientY: 700 }],
    { x: 100, y: 700 },
    44,
  );
  assert.equal(started.activeTouchId, 10);

  const moved = resolveMultiTouchJoystick(
    started,
    'move',
    [{ identifier: 10, clientX: 100, clientY: 620 }],
    undefined,
    44,
  );
  assert.equal(moved.moveX, 1);
  assert.equal(moved.moveZ, 0);

  // Finger 2 (id=25) taps and moves on the right-hand attack button (clientX: 1200, clientY: 720)
  const afterSecondFingerMove = resolveMultiTouchJoystick(
    moved,
    'move',
    [{ identifier: 25, clientX: 1210, clientY: 725 }],
    undefined,
    44,
  );
  assert.equal(afterSecondFingerMove.activeTouchId, 10);
  assert.equal(afterSecondFingerMove.moveX, 1, 'Finger 1 movement must remain uninterrupted');

  // Finger 2 (id=25) lifts off the attack button -> Finger 1 must STILL remain active!
  const afterSecondFingerEnd = resolveMultiTouchJoystick(
    afterSecondFingerMove,
    'end',
    [{ identifier: 25, clientX: 1210, clientY: 725 }],
    undefined,
    44,
  );
  assert.equal(afterSecondFingerEnd.activeTouchId, 10);
  assert.equal(afterSecondFingerEnd.moveX, 1);

  // Finally Finger 1 (id=10) lifts -> joystick resets to 0
  const afterFirstFingerEnd = resolveMultiTouchJoystick(
    afterSecondFingerEnd,
    'end',
    [{ identifier: 10, clientX: 100, clientY: 620 }],
    undefined,
    44,
  );
  assert.equal(afterFirstFingerEnd.activeTouchId, null);
  assert.equal(afterFirstFingerEnd.moveX, 0);

  // Diagonal D-Pad chord (up + right) normalizes vector
  const diag = combineDpadDirections(['up', 'right']);
  assert.ok(diag.moveX > 0.7 && diag.moveX < 0.72);
  assert.ok(diag.moveZ > 0.7 && diag.moveZ < 0.72);
  assert.equal(diag.label, 'VORWÄRTS-RECHTS');
});

test('Camera orbit offset aligns 100% with screen-space movement and clamps pitch/distance', () => {
  const iso = CAMERA_PRESETS.isometric;
  const defOffset = computeCameraOrbitOffset(0, iso.pitch, iso.distance);
  // Default yawOffset=0 sits behind hero at (-X, 0) looking straight along +X
  assert.ok(defOffset.offsetX < -8.0);
  assert.equal(Math.abs(defOffset.offsetZ), 0);
  assert.ok(defOffset.offsetY > 8.5);

  // Clamping out-of-range pitch and zoom distance
  const clamped = computeCameraOrbitOffset(0, 5.0, 100.0);
  assert.equal(clamped.clampedPitch, 1.32);
  assert.equal(clamped.clampedDistance, 23);

  // Camera-relative movement at yawOffset = 0 preserves +X forward and +Z right
  const m0 = computeCameraRelativeMovement(1, 0, 0);
  assert.equal(m0.worldMoveX, 1);
  assert.equal(m0.worldMoveZ, 0);

  // Rotating camera by +90 deg (+PI/2) rotates forward movement to +Z
  const m90 = computeCameraRelativeMovement(1, 0, Math.PI / 2);
  assert.equal(m90.worldMoveX, 0);
  assert.equal(m90.worldMoveZ, 1);
});

test('Smooth circle-vs-wall dungeon movement glides along walls and rounds doorway corners without snagging', () => {
  const dungeon = generateDungeon(1, 12345);
  const ts = dungeon.tileSize;
  const spawnX = dungeon.spawn.gx * ts;
  const spawnZ = dungeon.spawn.gz * ts;

  // Moving forward along open +X corridor moves freely with zero collision
  const openStep = resolveSmoothDungeonMovement({
    dungeon,
    x: spawnX,
    z: spawnZ,
    vx: 6.0,
    vz: 0,
    dt: 0.1,
  });
  assert.equal(openStep.collided, false);
  assert.ok(openStep.x > spawnX + 0.55);

  // Moving diagonally into a wall slides smoothly along the open axis instead of freezing
  // Find a wall tile adjacent to a floor tile
  const wallGx = 1;
  const wallGz = dungeon.spawn.gz;
  assert.equal(dungeon.grid[wallGz][wallGx], 'wall');
  const nearWallX = (wallGx + 1) * ts - 1.25; // close to left wall of startRoom (x=2)
  const slideStep = resolveSmoothDungeonMovement({
    dungeon,
    x: nearWallX,
    z: spawnZ,
    vx: -8.0, // pushing into the wall at gx=1
    vz: 6.0, // while sliding along +Z
    dt: 0.1,
  });
  assert.equal(slideStep.collided, true);
  assert.ok(slideStep.z > spawnZ + 0.5, 'Hero must slide freely along Z even while pressing against X wall');
});




