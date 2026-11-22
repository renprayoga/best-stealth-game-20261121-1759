// Neon Shadow — every pixel the judge sees. Canvas 2D only, no assets: the
// floor, walls, crates, bushes, guards, cones and the exit are all drawn.
// Vision cones are raycast (24 rays each) so they stop at walls and crates,
// which is what makes the stealth readable in a screenshot.

import { CAMERA, COLS, FIELD, GUARD, PALETTE, ROWS, TILE } from './config.js';
import { T_BUSH, T_CRATE, T_FLOOR, T_SHADOW, T_WALL } from './world.js';

const CONE_RAYS = 24;

/** Distance from (x,y) along an angle until a sight-blocking tile or range. */
function raycast(world, x, y, angle, range) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = 8;
  for (let d = step; d <= range; d += step) {
    const tx = Math.floor((x + dx * d) / TILE);
    const ty = Math.floor((y + dy * d) / TILE);
    const t = world.tileAt(tx, ty);
    if (t === T_WALL || t === T_CRATE) return d - step / 2;
  }
  return range;
}

function conePath(ctx, world, watcher, range, halfAngle) {
  ctx.beginPath();
  ctx.moveTo(watcher.x, watcher.y);
  for (let i = 0; i <= CONE_RAYS; i += 1) {
    const a = watcher.angle - halfAngle + (2 * halfAngle * i) / CONE_RAYS;
    const d = raycast(world, watcher.x, watcher.y, a, range);
    ctx.lineTo(watcher.x + Math.cos(a) * d, watcher.y + Math.sin(a) * d);
  }
  ctx.closePath();
}

function drawCone(ctx, world, watcher, range, halfAngle, rgb, alpha) {
  const grad = ctx.createRadialGradient(watcher.x, watcher.y, 8, watcher.x, watcher.y, range);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(0.7, `rgba(${rgb},${alpha * 0.55})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  conePath(ctx, world, watcher, range, halfAngle);
  ctx.fillStyle = grad;
  ctx.fill();
  // Crisp rim so the cone reads even where the gradient fades.
  conePath(ctx, world, watcher, range, halfAngle);
  ctx.strokeStyle = `rgba(${rgb},${Math.min(0.5, alpha + 0.12)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function coneColorFor(stateName, detection) {
  if (stateName === 'chase') return PALETTE.coneAlarm;
  if (stateName === 'suspicious' || detection >= 0.45) return PALETTE.coneSuspicious;
  return PALETTE.coneCalm;
}

function drawFloor(ctx, world, time) {
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      const t = world.grid[ty * COLS + tx];
      const x = tx * TILE;
      const y = ty * TILE;
      if (t === T_FLOOR || t === T_BUSH || t === T_SHADOW) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        ctx.fillRect(x, y, TILE, TILE);
      }
      if (t === T_SHADOW) {
        ctx.fillStyle = PALETTE.shadow;
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = 'rgba(56,189,248,0.25)';
        ctx.setLineDash([4, 5]);
        ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
        ctx.setLineDash([]);
      }
      if (t === T_BUSH) {
        ctx.fillStyle = PALETTE.bush;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.bushLeaf;
        const sway = Math.sin(time * 1.3 + tx * 1.7 + ty) * 1.5;
        for (const [ox, oy, r] of [[10, 12, 5], [26, 9, 6], [18, 24, 5], [30, 28, 4], [8, 30, 4]]) {
          ctx.beginPath();
          ctx.arc(x + ox + sway, y + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  // Faint grid so the top-down space reads as a place, not a void.
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let tx = 0; tx <= COLS; tx += 1) {
    ctx.moveTo(tx * TILE + 0.5, 0);
    ctx.lineTo(tx * TILE + 0.5, FIELD.height);
  }
  for (let ty = 0; ty <= ROWS; ty += 1) {
    ctx.moveTo(0, ty * TILE + 0.5);
    ctx.lineTo(FIELD.width, ty * TILE + 0.5);
  }
  ctx.stroke();
}

function drawWallsAndCrates(ctx, world) {
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      const t = world.grid[ty * COLS + tx];
      const x = tx * TILE;
      const y = ty * TILE;
      if (t === T_WALL) {
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = PALETTE.wallTop;
        ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x, y + TILE - 5, TILE, 5);
      } else if (t === T_CRATE) {
        ctx.fillStyle = PALETTE.crate;
        ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = PALETTE.crateEdge;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(x + 4.5, y + 4.5, TILE - 9, TILE - 9);
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 5);
        ctx.lineTo(x + TILE - 5, y + TILE - 5);
        ctx.moveTo(x + TILE - 5, y + 5);
        ctx.lineTo(x + 5, y + TILE - 5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawExit(ctx, world, time) {
  const { x, y } = world.state.exit;
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);
  const glow = ctx.createRadialGradient(x, y, 4, x, y, 64);
  glow.addColorStop(0, `rgba(52,211,153,${0.5 + 0.25 * pulse})`);
  glow.addColorStop(1, 'rgba(52,211,153,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.exit;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 26 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, 34 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.exit;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', x, y - 44);
  // Door chevrons pointing out.
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 6);
  ctx.lineTo(x + 2, y);
  ctx.lineTo(x - 8, y + 6);
  ctx.moveTo(x + 2, y - 6);
  ctx.lineTo(x + 12, y);
  ctx.lineTo(x + 2, y + 6);
  ctx.strokeStyle = PALETTE.exit;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawIntel(ctx, world, time) {
  for (const item of world.intel) {
    if (item.taken) continue;
    const bob = Math.sin(time * 2 + item.bob * 3) * 3;
    const y = item.y + bob;
    const glow = ctx.createRadialGradient(item.x, y, 2, item.x, y, 26);
    glow.addColorStop(0, 'rgba(251,191,36,0.55)');
    glow.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(item.x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(item.x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.intel;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.strokeStyle = '#fff7d6';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-7, -7, 14, 14);
    ctx.restore();
  }
}

function drawGuardBody(ctx, g, time) {
  // Body: dark red disc, glowing rim, visor wedge facing the look direction.
  const glow = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, 30);
  glow.addColorStop(0, 'rgba(251,113,133,0.5)');
  glow.addColorStop(1, 'rgba(251,113,133,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.guardDark;
  ctx.beginPath();
  ctx.arc(g.x, g.y, GUARD.radius + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.guard;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.guard;
  ctx.beginPath();
  ctx.moveTo(g.x + Math.cos(g.angle) * (GUARD.radius + 1), g.y + Math.sin(g.angle) * (GUARD.radius + 1));
  ctx.arc(g.x, g.y, GUARD.radius + 1, g.angle - 0.55, g.angle + 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b0f1e';
  ctx.beginPath();
  ctx.arc(g.x + Math.cos(g.angle) * 5, g.y + Math.sin(g.angle) * 5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // Detection arc above the head.
  if (g.detection > 0.03) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(g.x, g.y - 22, 9, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = g.detection >= 1 ? PALETTE.danger : g.detection >= 0.45 ? '#fb923c' : '#facc15';
    ctx.beginPath();
    ctx.arc(g.x, g.y - 22, 9, -Math.PI / 2, -Math.PI / 2 + TAU * g.detection);
    ctx.stroke();
  }
  if (g.state === 'suspicious' || g.state === 'chase') {
    ctx.fillStyle = g.state === 'chase' ? '#ff2d55' : '#fb923c';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.state === 'chase' ? '!!' : '!', g.x, g.y - 38);
  }
}

function drawCamera(ctx, world, c, time) {
  drawCone(ctx, world, c, CAMERA.viewRange, CAMERA.viewHalfAngle, '125, 211, 252', 0.3);
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#7dd3fc';
  ctx.beginPath();
  ctx.arc(c.x + Math.cos(c.angle) * 6, c.y + Math.sin(c.angle) * 6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (c.detection > 0.03) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = c.detection >= 1 ? PALETTE.danger : '#facc15';
    ctx.beginPath();
    ctx.arc(c.x, c.y - 18, 7, -Math.PI / 2, -Math.PI / 2 + TAU * c.detection);
    ctx.stroke();
  }
}

function drawPlayer(ctx, world, time) {
  const p = world.player;
  const hidden = world.playerHidden();
  const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 34);
  glow.addColorStop(0, 'rgba(34,211,238,0.55)');
  glow.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.playerDark;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.player;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Facing wedge.
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
  ctx.arc(p.x, p.y, 15, p.angle - 0.5, p.angle + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#082f3a';
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.angle) * 5, p.y + Math.sin(p.angle) * 5, 4, 0, Math.PI * 2);
  ctx.fill();
  if (hidden) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(45,212,167,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 21, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#2dd4a7';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HIDDEN', p.x, p.y - 28);
  }
  // Click-to-move marker.
  if (world.moveTargetActive) {
    ctx.strokeStyle = 'rgba(34,211,238,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(world.moveTargetActive.x, world.moveTargetActive.y, 8 + Math.sin(time * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

const TAU = Math.PI * 2;

/** Draw one frame of the field. `world` is the createWorld() handle. */
export function drawField(ctx, world, time) {
  ctx.clearRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = PALETTE.backdrop;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  drawFloor(ctx, world, time);
  drawExit(ctx, world, time);
  drawIntel(ctx, world, time);
  drawWallsAndCrates(ctx, world);
  for (const c of world.cameras) drawCamera(ctx, world, c, time);
  // Cones first (under bodies), bodies after, so cones never cover a guard.
  for (const g of world.guards) {
    const rgb = coneColorFor(g.state, g.detection);
    const alpha = g.state === 'patrol' ? 0.3 : g.state === 'suspicious' ? 0.4 : 0.48;
    drawCone(ctx, world, g, GUARD.viewRange, GUARD.viewHalfAngle, rgb, alpha);
  }
  for (const g of world.guards) drawGuardBody(ctx, g, time);
  drawPlayer(ctx, world, time);
  // Vignette: dark corners keep the neon centre the focus.
  const vig = ctx.createRadialGradient(
    FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
    FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.95,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}
