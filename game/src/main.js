// Neon Shadow — The Umbra Heist: game loop, screens, HUD and shot mode.
// The simulation lives in world.js, the pixels in render.js; this file only
// wires them to the page: fixed-step loop, menus, pause, level flow, sounds,
// and the ?shot= setups the screenshots are taken from.

import { BEST_KEY, FIELD, LEVELS, PALETTE, STEP } from './config.js';
import { createWorld, EVENT_ALARM, EVENT_CALM, EVENT_CAUGHT, EVENT_PICKUP, EVENT_SUSPICIOUS, EVENT_WIN } from './world.js';
import { drawField } from './render.js';
import { createInput } from './input.js';
import { ensureAudio, isMuted, sfx, toggleMute } from './audio.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = FIELD.width;
canvas.height = FIELD.height;

const world = createWorld();
const input = createInput();
input.attach(canvas);

const $ = (id) => document.getElementById(id);
const hud = {
  level: $('hud-level'),
  objective: $('hud-objective'),
  intel: $('hud-intel'),
  time: $('hud-time'),
  score: $('hud-score'),
  detectFill: $('detect-fill'),
  detectLabel: $('detect-label'),
  alarm: $('alarm-banner'),
  mute: $('btn-mute'),
};

let screen = 'menu'; // menu | playing | paused | levelComplete | gameOver | victory
let totalScore = 0;
let time = 0;
let accumulator = 0;
let lastTimestamp = 0;
let stepSoundTimer = 0;
let best = 0;
try {
  best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
} catch {
  best = 0;
}
$('menu-best').textContent = best > 0 ? `Best score: ${best}` : '';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotMode = shotName !== null;

function fmtTime(seconds) {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}

function setScreen(next) {
  screen = next;
  if (next === 'menu') {
    showOverlay('overlay-menu');
  } else if (next === 'paused') {
    showOverlay('overlay-pause');
  } else if (next === 'levelComplete') {
    showOverlay('overlay-complete');
  } else if (next === 'gameOver') {
    showOverlay('overlay-over');
  } else if (next === 'victory') {
    showOverlay('overlay-victory');
  } else {
    showOverlay(null);
  }
  document.body.dataset.screen = next;
}

function updateHud() {
  const s = world.state;
  hud.level.textContent = `Level ${s.levelIndex + 1} — ${s.levelName}`;
  hud.objective.textContent = s.over === 'win'
    ? 'Level clear — reach the next floor'
    : 'Reach the EXIT unseen';
  hud.intel.textContent = `◆ ${s.intelGot}/${s.intelTotal}`;
  hud.time.textContent = fmtTime(s.elapsed);
  hud.score.textContent = `Score ${totalScore + s.score}`;
  const pct = Math.round(s.detection * 100);
  hud.detectFill.style.width = `${pct}%`;
  hud.detectFill.style.background = s.detection >= 1 || s.alarm
    ? PALETTE.danger
    : s.detection >= 0.45 ? '#fb923c' : '#facc15';
  hud.detectLabel.textContent = s.alarm ? 'ALARM!' : s.detection >= 0.45 ? 'SPOTTED?' : 'UNSEEN';
  hud.detectLabel.style.color = s.alarm ? PALETTE.danger : s.detection >= 0.45 ? '#fb923c' : '#2dd4a7';
  hud.alarm.classList.toggle('hidden', !s.alarm);
  hud.mute.textContent = isMuted() ? '🔇 Muted' : '🔊 Sound';
}

function startLevel(index) {
  world.loadLevel(index);
  setScreen('playing');
  updateHud();
}

function startGame() {
  ensureAudio();
  sfx.click();
  totalScore = 0;
  startLevel(0);
}

function nextLevel() {
  ensureAudio();
  sfx.click();
  totalScore += world.state.score;
  const next = world.state.levelIndex + 1;
  if (next >= LEVELS.length) {
    setScreen('victory');
    $('victory-score').textContent = `Total score: ${totalScore}`;
    saveBest();
  } else {
    startLevel(next);
  }
}

function saveBest() {
  if (totalScore > best) {
    best = totalScore;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Best score is a nicety; the game plays on without it.
    }
  }
}

function fillCompleteScreen() {
  const s = world.state;
  const stars = world.stars();
  $('complete-title').textContent = `${s.levelName} — Clear!`;
  $('complete-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('complete-stats').textContent =
    `Time ${fmtTime(s.elapsed)} (par ${fmtTime(s.par)}) · Intel ${s.intelGot}/${s.intelTotal} · ` +
    `${s.everSuspicious ? 'Spotted' : 'Ghost — never seen'} · Score ${s.score}`;
  $('btn-next').textContent = s.levelIndex + 1 >= LEVELS.length ? 'See results' : 'Next level →';
}

function fillGameOverScreen() {
  $('over-stats').textContent =
    `${world.state.levelName} · Intel ${world.state.intelGot}/${world.state.intelTotal} · ` +
    `Survived ${fmtTime(world.state.elapsed)}`;
}

function handleEvents(events) {
  if (events & EVENT_PICKUP) sfx.pickup();
  if (events & EVENT_SUSPICIOUS) sfx.suspicious();
  if (events & EVENT_ALARM) sfx.alarm();
  if (events & EVENT_CALM) sfx.calm();
  if (events & EVENT_CAUGHT) {
    sfx.caught();
    fillGameOverScreen();
    setScreen('gameOver');
  }
  if (events & EVENT_WIN) {
    sfx.win();
    fillCompleteScreen();
    if (world.state.levelIndex + 1 >= LEVELS.length) {
      totalScore += world.state.score;
      $('victory-score').textContent = `Total score: ${totalScore}`;
      saveBest();
      setScreen('victory');
    } else {
      setScreen('levelComplete');
    }
  }
}

function stepGame(dt) {
  const events = world.step(input.state, dt);
  if (world.player.moving && world.player.sprinting) {
    stepSoundTimer -= dt;
    if (stepSoundTimer <= 0) {
      sfx.step();
      stepSoundTimer = 0.28;
    }
  }
  handleEvents(events);
  updateHud();
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  if (!lastTimestamp) lastTimestamp = timestamp;
  let dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  if (dt > 0.25) dt = 0.25;
  time += dt;
  if (screen === 'playing') {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepGame(STEP);
      accumulator -= STEP;
      if (screen !== 'playing') {
        accumulator = 0;
        break;
      }
    }
  } else if (screen === 'menu') {
    // Attract mode: the guards patrol behind the title.
    accumulator += dt;
    while (accumulator >= STEP) {
      world.step({}, STEP);
      accumulator -= STEP;
      if (world.state.over) world.loadLevel(world.state.levelIndex);
    }
  }
  drawField(ctx, world, time);
}

// --- buttons and keys
$('btn-start').addEventListener('click', startGame);
$('btn-next').addEventListener('click', nextLevel);
$('btn-retry').addEventListener('click', () => {
  ensureAudio();
  sfx.click();
  startLevel(world.state.levelIndex);
});
$('btn-resume').addEventListener('click', () => {
  ensureAudio();
  sfx.click();
  setScreen('playing');
});
$('btn-restart').addEventListener('click', () => {
  ensureAudio();
  sfx.click();
  startLevel(world.state.levelIndex);
});
$('btn-menu').addEventListener('click', () => {
  ensureAudio();
  sfx.click();
  world.loadLevel(0);
  setScreen('menu');
});
$('btn-again').addEventListener('click', startGame);
$('btn-victory-menu').addEventListener('click', () => {
  ensureAudio();
  sfx.click();
  world.loadLevel(0);
  setScreen('menu');
});
hud.mute.addEventListener('click', () => {
  ensureAudio();
  toggleMute();
  updateHud();
});
document.querySelectorAll('[data-level]').forEach((btn) => {
  btn.addEventListener('click', () => {
    ensureAudio();
    sfx.click();
    totalScore = 0;
    startLevel(Number(btn.dataset.level));
  });
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyP' || event.code === 'Escape') {
    if (screen === 'playing') setScreen('paused');
    else if (screen === 'paused') setScreen('playing');
  } else if (event.code === 'KeyM') {
    toggleMute();
    updateHud();
  } else if (event.code === 'KeyR' && (screen === 'playing' || screen === 'gameOver')) {
    startLevel(world.state.levelIndex);
  } else if (event.code === 'Enter' && screen === 'menu') {
    startGame();
  } else if (event.code === 'Enter' && screen === 'levelComplete') {
    nextLevel();
  }
});

input.onClick((event) => {
  if (screen !== 'playing') return;
  ensureAudio();
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * FIELD.width;
  const y = ((event.clientY - rect.top) / rect.height) * FIELD.height;
  world.setMoveTarget(x, y);
});

// Test hook: the headless play-test drives the game through this.
window.__game = {
  world,
  get screen() { return screen; },
  startGame,
  startLevel,
  setScreen,
};

// --- boot
if (shotMode) {
  document.body.classList.add('shot');
  const next = applyShot(world, shotName);
  if (next === 'levelComplete') fillCompleteScreen();
  setScreen(next);
  updateHud();
  drawField(ctx, world, 1.6);
} else {
  setScreen('menu');
  updateHud();
  requestAnimationFrame(frame);
}
