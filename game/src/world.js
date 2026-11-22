// Neon Shadow — the rules and state, with no drawing and no browser in it.
// A level is a tile grid; walls and crates block movement and sight, bushes
// and shadow patches hide the player. Guards patrol, get suspicious, chase;
// cameras sweep fixed cones. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react (sound, screens) without the
// world knowing about them. Nothing here allocates after createWorld returns.

import { CAMERA, COLS, DETECTION, FIELD, GUARD, LEVELS, PLAYER, ROWS, SCORE, TILE } from './config.js';

export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_CRATE = 2;
export const T_BUSH = 3;
export const T_SHADOW = 4;

export const EVENT_PICKUP = 1;
export const EVENT_SUSPICIOUS = 2;
export const EVENT_ALARM = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_WIN = 16;
export const EVENT_CALM = 32;

const TAU = Math.PI * 2;

function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createWorld() {
  const grid = new Uint8Array(COLS * ROWS);
  const guards = [];
  const cameras = [];
  const intel = [];
  const state = {
    levelIndex: 0,
    levelName: '',
    par: 60,
    score: 0,
    intelGot: 0,
    intelTotal: 0,
    elapsed: 0,
    detection: 0, // worst detection across all watchers, 0..1
    alarm: false,
    alarmTimer: 0,
    over: null, // 'win' | 'caught'
    everSuspicious: false,
    everAlarmed: false,
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
  };
  const player = { x: 0, y: 0, angle: 0, moving: false, sprinting: false };
  // Click-to-move target, in pixels; null when the player steers with keys.
  const moveTarget = { x: 0, y: 0, active: false };

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return T_WALL;
    return grid[ty * COLS + tx];
  }

  function solidAt(tx, ty) {
    const t = tileAt(tx, ty);
    return t === T_WALL || t === T_CRATE;
  }

  function blocksSight(tx, ty) {
    return solidAt(tx, ty);
  }

  /** Sample the segment every 8px; true when no wall/crate stands between. */
  function hasLineOfSight(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (blocksSight(Math.floor((ax + dx * t) / TILE), Math.floor((ay + dy * t) / TILE))) return false;
    }
    return true;
  }

  function playerHidden() {
    const t = tileAt(Math.floor(player.x / TILE), Math.floor(player.y / TILE));
    return t === T_BUSH || t === T_SHADOW;
  }

  /** Can this watcher (guard/camera) see the player right now? */
  function canSee(watcher, range, halfAngle) {
    const dx = player.x - watcher.x;
    const dy = player.y - watcher.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return 0;
    const hidden = playerHidden();
    if (hidden && dist > GUARD.hiddenSpotRange) return 0;
    const ang = Math.atan2(dy, dx);
    if (Math.abs(angleDiff(ang, watcher.angle)) > halfAngle) return 0;
    if (!hasLineOfSight(watcher.x, watcher.y, player.x, player.y)) return 0;
    return 1 - (dist / range) * 0.55;
  }

  /** Move a circle with axis-separated collision against solid tiles. */
  function moveCircle(body, radius, dx, dy) {
    let nx = body.x + dx;
    const top = Math.floor((body.y - radius) / TILE);
    const bottom = Math.floor((body.y + radius) / TILE);
    const left = Math.floor((nx - radius) / TILE);
    const right = Math.floor((nx + radius) / TILE);
    let blocked = false;
    for (let ty = top; ty <= bottom && !blocked; ty += 1) {
      for (let tx = left; tx <= right; tx += 1) {
        if (solidAt(tx, ty)) { blocked = true; break; }
      }
    }
    if (!blocked) body.x = nx;
    let ny = body.y + dy;
    const top2 = Math.floor((ny - radius) / TILE);
    const bottom2 = Math.floor((ny + radius) / TILE);
    const left2 = Math.floor((body.x - radius) / TILE);
    const right2 = Math.floor((body.x + radius) / TILE);
    blocked = false;
    for (let ty = top2; ty <= bottom2 && !blocked; ty += 1) {
      for (let tx = left2; tx <= right2; tx += 1) {
        if (solidAt(tx, ty)) { blocked = true; break; }
      }
    }
    if (!blocked) body.y = ny;
  }

  function loadLevel(index) {
    const def = LEVELS[index];
    grid.fill(T_FLOOR);
    for (let tx = 0; tx < COLS; tx += 1) {
      grid[tx] = T_WALL;
      grid[(ROWS - 1) * COLS + tx] = T_WALL;
    }
    for (let ty = 0; ty < ROWS; ty += 1) {
      grid[ty * COLS] = T_WALL;
      grid[ty * COLS + COLS - 1] = T_WALL;
    }
    for (const [tx, ty] of def.walls) grid[ty * COLS + tx] = T_WALL;
    for (const [tx, ty] of def.crates) grid[ty * COLS + tx] = T_CRATE;
    for (const [tx, ty] of def.bushes) grid[ty * COLS + tx] = T_BUSH;
    for (const [tx, ty] of def.shadows) grid[ty * COLS + tx] = T_SHADOW;

    guards.length = 0;
    for (const g of def.guards) {
      const pts = g.path.map(([tx, ty]) => tileCenter(tx, ty));
      const start = pts[0];
      const next = pts[1] ?? pts[0];
      guards.push({
        x: start.x, y: start.y,
        angle: Math.atan2(next.y - start.y, next.x - start.x),
        path: pts, wpIndex: 1, pause: 0,
        state: 'patrol', detection: 0,
        lastSeen: { x: start.x, y: start.y },
        loseTimer: 0, scanDir: 1, lookTimer: 0, lookAngle: 0,
      });
    }
    cameras.length = 0;
    for (const c of def.cameras) {
      const p = tileCenter(c.x, c.y);
      cameras.push({
        x: p.x, y: p.y, angle: (c.from + c.to) / 2,
        from: c.from, to: c.to, dir: 1, detection: 0,
      });
    }
    intel.length = 0;
    for (const [tx, ty] of def.intel) {
      const p = tileCenter(tx, ty);
      intel.push({ x: p.x, y: p.y, taken: false, bob: 0 });
    }
    const s = tileCenter(def.start[0], def.start[1]);
    const e = tileCenter(def.exit[0], def.exit[1]);
    player.x = s.x;
    player.y = s.y;
    player.angle = 0;
    moveTarget.active = false;
    state.levelIndex = index;
    state.levelName = def.name;
    state.par = def.par;
    state.intelTotal = intel.length;
    state.intelGot = 0;
    state.elapsed = 0;
    state.detection = 0;
    state.alarm = false;
    state.alarmTimer = 0;
    state.over = null;
    state.everSuspicious = false;
    state.everAlarmed = false;
    state.start = s;
    state.exit = e;
  }

  function updateGuard(g, dt) {
    // --- vision: fill or decay this guard's detection meter
    const seen = canSee(g, GUARD.viewRange, GUARD.viewHalfAngle);
    if (seen > 0) {
      const before = g.detection;
      g.detection = clamp(g.detection + GUARD.detectRate * seen * dt, 0, 1);
      g.lastSeen.x = player.x;
      g.lastSeen.y = player.y;
      g.loseTimer = 0;
      if (before < GUARD.suspiciousAt && g.detection >= GUARD.suspiciousAt) {
        g.state = 'suspicious';
        state.everSuspicious = true;
      }
      if (g.detection >= 1 && !state.alarm) {
        state.alarm = true;
        state.alarmTimer = DETECTION.alarmCooldown;
        state.everAlarmed = true;
        for (const other of guards) other.state = 'chase';
      }
    } else {
      g.detection = clamp(g.detection - GUARD.decayRate * dt, 0, 1);
      if (g.state === 'suspicious' && g.detection <= 0.05) g.state = 'return';
    }

    // --- movement by state
    if (g.state === 'patrol') {
      if (g.pause > 0) {
        g.pause -= dt;
        // Scan the surroundings while waiting at a waypoint.
        g.angle += g.scanDir * 0.9 * dt;
        if (g.angle > Math.PI * 0.75) g.scanDir = -1;
        if (g.angle < -Math.PI * 0.75) g.scanDir = 1;
      } else {
        const target = g.path[g.wpIndex];
        const dx = target.x - g.x;
        const dy = target.y - g.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4) {
          g.wpIndex = (g.wpIndex + 1) % g.path.length;
          g.pause = GUARD.waypointPause;
        } else {
          const step = (GUARD.patrolSpeed * dt) / dist;
          const ox = g.x;
          const oy = g.y;
          moveCircle(g, GUARD.radius, dx * step, dy * step);
          g.angle = Math.atan2(g.y - oy, g.x - ox);
          if (g.x === ox && g.y === oy) {
            // Stuck against a wall: skip to the next waypoint.
            g.wpIndex = (g.wpIndex + 1) % g.path.length;
          }
        }
      }
    } else if (g.state === 'suspicious') {
      const dx = g.lastSeen.x - g.x;
      const dy = g.lastSeen.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        const step = (GUARD.suspiciousSpeed * dt) / dist;
        const ox = g.x;
        const oy = g.y;
        moveCircle(g, GUARD.radius, dx * step, dy * step);
        if (g.x !== ox || g.y !== oy) g.angle = Math.atan2(g.y - oy, g.x - ox);
      } else {
        // Arrived: look around, then give up and head back to patrol.
        g.lookTimer += dt;
        g.angle += 1.4 * dt;
        if (g.lookTimer > 2.2) {
          g.lookTimer = 0;
          g.state = 'return';
        }
      }
    } else if (g.state === 'chase') {
      if (seen > 0) {
        g.loseTimer = 0;
      } else {
        g.loseTimer += dt;
        if (g.loseTimer > GUARD.loseSightAfter) {
          g.state = 'suspicious';
          g.lookTimer = 0;
        }
      }
      const dx = g.lastSeen.x - g.x;
      const dy = g.lastSeen.y - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 6) {
        const step = (GUARD.chaseSpeed * dt) / dist;
        const ox = g.x;
        const oy = g.y;
        moveCircle(g, GUARD.radius, dx * step, dy * step);
        if (g.x !== ox || g.y !== oy) g.angle = Math.atan2(g.y - oy, g.x - ox);
      }
    } else if (g.state === 'return') {
      // Walk back to the nearest patrol waypoint, then resume the route.
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < g.path.length; i += 1) {
        const d = Math.hypot(g.path[i].x - g.x, g.path[i].y - g.y);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      const target = g.path[best];
      const dx = target.x - g.x;
      const dy = target.y - g.y;
      if (bestDist < 6) {
        g.wpIndex = (best + 1) % g.path.length;
        g.state = 'patrol';
        g.pause = 0.4;
      } else {
        const step = (GUARD.patrolSpeed * dt) / bestDist;
        const ox = g.x;
        const oy = g.y;
        moveCircle(g, GUARD.radius, dx * step, dy * step);
        if (g.x !== ox || g.y !== oy) g.angle = Math.atan2(g.y - oy, g.x - ox);
      }
    }
  }

  function updateCamera(c, dt) {
    c.angle += CAMERA.sweepSpeed * c.dir * dt;
    if (c.angle >= c.to) { c.angle = c.to; c.dir = -1; }
    if (c.angle <= c.from) { c.angle = c.from; c.dir = 1; }
    const seen = canSee(c, CAMERA.viewRange, CAMERA.viewHalfAngle);
    if (seen > 0) {
      const before = c.detection;
      c.detection = clamp(c.detection + CAMERA.detectRate * seen * dt, 0, 1);
      if (before < GUARD.suspiciousAt && c.detection >= GUARD.suspiciousAt) {
        state.everSuspicious = true;
      }
      if (c.detection >= 1 && !state.alarm) {
        state.alarm = true;
        state.alarmTimer = DETECTION.alarmCooldown;
        state.everAlarmed = true;
        for (const g of guards) {
          g.state = 'chase';
          g.lastSeen.x = player.x;
          g.lastSeen.y = player.y;
        }
      }
    } else {
      c.detection = clamp(c.detection - GUARD.decayRate * dt, 0, 1);
    }
  }

  function step(input, dt) {
    if (state.over) return 0;
    let events = 0;
    state.elapsed += dt;

    // --- player movement: keys steer, a click sets a destination
    let mx = 0;
    let my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (mx !== 0 || my !== 0) {
      moveTarget.active = false;
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    } else if (moveTarget.active) {
      const dx = moveTarget.x - player.x;
      const dy = moveTarget.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) {
        moveTarget.active = false;
      } else {
        mx = dx / dist;
        my = dy / dist;
      }
    }
    player.moving = mx !== 0 || my !== 0;
    player.sprinting = player.moving && !!input.sprint;
    if (player.moving) {
      const speed = player.sprinting ? PLAYER.sprint : PLAYER.walk;
      const ox = player.x;
      const oy = player.y;
      moveCircle(player, PLAYER.radius, mx * speed * dt, my * speed * dt);
      player.angle = Math.atan2(player.y - oy, player.x - ox);
      // Sprinting is loud: nearby guards turn toward the noise.
      if (player.sprinting) {
        for (const g of guards) {
          if (g.state === 'patrol' && Math.hypot(g.x - player.x, g.y - player.y) < PLAYER.noiseRadius) {
            g.angle += angleDiff(Math.atan2(player.y - g.y, player.x - g.x), g.angle) * Math.min(1, 6 * dt);
          }
        }
      }
    }

    // --- watchers
    for (const g of guards) updateGuard(g, dt);
    for (const c of cameras) updateCamera(c, dt);
    let worst = 0;
    for (const g of guards) worst = Math.max(worst, g.detection);
    for (const c of cameras) worst = Math.max(worst, c.detection);
    const wasAlarmed = state.alarm;
    if (state.alarm) {
      state.alarmTimer -= dt;
      const anyChase = guards.some((g) => g.state === 'chase');
      if (state.alarmTimer <= 0 && !anyChase) state.alarm = false;
    }
    if (!wasAlarmed && state.alarm) events |= EVENT_ALARM;
    if (wasAlarmed && !state.alarm) events |= EVENT_CALM;
    state.detection = worst;

    // --- intel pickups
    for (const item of intel) {
      item.bob += dt;
      if (!item.taken && Math.hypot(item.x - player.x, item.y - player.y) < 26) {
        item.taken = true;
        state.intelGot += 1;
        state.score += SCORE.intel;
        events |= EVENT_PICKUP;
      }
    }

    // --- caught?
    for (const g of guards) {
      if (g.state === 'chase' && Math.hypot(g.x - player.x, g.y - player.y) < GUARD.radius + PLAYER.radius + 2) {
        state.over = 'caught';
        events |= EVENT_CAUGHT;
        return events;
      }
    }

    // --- reached the exit?
    if (Math.hypot(state.exit.x - player.x, state.exit.y - player.y) < 30) {
      state.over = 'win';
      if (!state.everSuspicious) state.score += SCORE.ghostBonus;
      const timeBonus = Math.max(0, Math.round((state.par - state.elapsed) * SCORE.timeBonusPerSecond));
      state.score += timeBonus;
      events |= EVENT_WIN;
    }
    return events;
  }

  function setMoveTarget(x, y) {
    moveTarget.x = clamp(x, TILE, FIELD.width - TILE);
    moveTarget.y = clamp(y, TILE, FIELD.height - TILE);
    moveTarget.active = true;
  }

  function stars() {
    if (state.over !== 'win') return 0;
    let s = 1;
    if (state.intelGot === state.intelTotal) s += 1;
    if (!state.everSuspicious && state.elapsed <= state.par) s += 1;
    return s;
  }

  loadLevel(0);

  return {
    state, player, guards, cameras, intel, grid,
    step, loadLevel, setMoveTarget, stars,
    tileAt, hasLineOfSight, playerHidden,
    cols: COLS, rows: ROWS,
  };
}

/** BFS over walkable tiles: is the exit (and every intel, guard waypoint) reachable? */
export function checkLevelReachable(def) {
  const grid = new Uint8Array(COLS * ROWS);
  for (let tx = 0; tx < COLS; tx += 1) { grid[tx] = 1; grid[(ROWS - 1) * COLS + tx] = 1; }
  for (let ty = 0; ty < ROWS; ty += 1) { grid[ty * COLS] = 1; grid[ty * COLS + COLS - 1] = 1; }
  for (const [tx, ty] of def.walls) grid[ty * COLS + tx] = 1;
  for (const [tx, ty] of def.crates) grid[ty * COLS + tx] = 1;
  const seen = new Uint8Array(COLS * ROWS);
  const queue = [[def.start[0], def.start[1]]];
  seen[def.start[1] * COLS + def.start[0]] = 1;
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (seen[ny * COLS + nx] || grid[ny * COLS + nx] === 1) continue;
      seen[ny * COLS + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  const at = ([x, y]) => !!seen[y * COLS + x];
  return {
    exit: at(def.exit),
    intel: def.intel.map(at),
    guardWaypoints: def.guards.map((g) => g.path.map(at)),
    cameraTiles: def.cameras.map((c) => !grid[c.y * COLS + c.x]),
  };
}
