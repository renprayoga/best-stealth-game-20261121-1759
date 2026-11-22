// Neon Shadow — deterministic setups for the four screenshots. Each one
// freezes the game in a composed moment: the menu over a live level, a
// mid-heist frame with cones, cover and the exit, a guard gone suspicious,
// and the level-complete screen. Seeded and repeatable: the same query
// always renders the same frame.

import { STEP, TILE } from './config.js';

function tileXY(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function idle(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) world.step({}, STEP);
}

/** Apply a shot setup; returns the screen the game should show. */
export function applyShot(world, name) {
  if (name === 'play') {
    world.loadLevel(0);
    idle(world, 5);
    // The thief crouched by the bushes mid-map, a patrol cone sweeping
    // just past the crates, the exit glowing bottom-right, one intel got.
    const p = tileXY(17, 13);
    world.player.x = p.x;
    world.player.y = p.y;
    world.player.angle = -Math.PI / 2;
    world.intel[0].taken = true;
    world.state.intelGot = 1;
    world.state.score = 100;
    return 'playing';
  }
  if (name === 'alert') {
    world.loadLevel(1);
    idle(world, 3);
    // Caught half out of cover on the Vault Floor: the nearest guard is
    // suspicious, orange cone on the thief, meter at 72%.
    const p = tileXY(16, 6);
    world.player.x = p.x;
    world.player.y = p.y;
    const g = world.guards[1];
    const gp = tileXY(16, 4);
    g.x = gp.x;
    g.y = gp.y;
    g.angle = Math.PI / 2;
    g.state = 'suspicious';
    g.detection = 0.72;
    g.lastSeen.x = p.x;
    g.lastSeen.y = p.y;
    world.state.detection = 0.72;
    world.state.everSuspicious = true;
    return 'playing';
  }
  if (name === 'complete') {
    world.loadLevel(0);
    idle(world, 1);
    const e = world.state.exit;
    world.player.x = e.x - 10;
    world.player.y = e.y;
    for (const item of world.intel) item.taken = true;
    world.state.intelGot = world.state.intelTotal;
    world.state.elapsed = 58;
    world.state.score = 875;
    world.state.over = 'win';
    return 'levelComplete';
  }
  // 'start' (and anything unknown): the title over a live Gallery.
  world.loadLevel(0);
  idle(world, 4);
  return 'menu';
}
