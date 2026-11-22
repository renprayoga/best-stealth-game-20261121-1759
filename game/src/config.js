// Neon Shadow — The Umbra Heist: every tuning number, colour and level in one place.
// Top-down stealth on a fixed 1280x800 logical field (32x20 tiles of 40px); the renderer
// scales it to the window, so no rule depends on screen size.

export const TILE = 40;
export const COLS = 32;
export const ROWS = 20;
export const FIELD = { width: COLS * TILE, height: ROWS * TILE };

/** Fixed simulation step: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walk: 155,
  sprint: 235,
  /** Sprinting is loud: guards this close turn toward the noise. */
  noiseRadius: 150,
};

export const GUARD = {
  radius: 13,
  patrolSpeed: 72,
  suspiciousSpeed: 100,
  chaseSpeed: 138,
  /** Vision cone: how far and how wide a guard sees. */
  viewRange: 230,
  viewHalfAngle: 0.61, // ~35 degrees each side
  /** Detection fills 0..1; rate scales with closeness. */
  detectRate: 1.35,
  decayRate: 0.45,
  suspiciousAt: 0.45,
  /** Seconds of no sight before a chasing guard gives up. */
  loseSightAfter: 3,
  /** Pause at each patrol waypoint, in seconds. */
  waypointPause: 0.9,
  /** A hidden player (bush/shadow) is only spotted this close. */
  hiddenSpotRange: 62,
};

export const CAMERA = {
  viewRange: 205,
  viewHalfAngle: 0.5,
  detectRate: 1.1,
  sweepSpeed: 0.55, // radians per second
};

export const DETECTION = {
  /** While any guard/camera is alarmed the whole floor is on alert. */
  alarmCooldown: 4,
};

export const SCORE = {
  intel: 100,
  ghostBonus: 250, // finish a level never detected
  timeBonusPerSecond: 5, // under the par time
};

export const PALETTE = {
  backdrop: '#070a14',
  floorA: '#0d1224',
  floorB: '#0b0f1e',
  grid: '#141a30',
  wall: '#232c47',
  wallTop: '#3b4a73',
  crate: '#1a2340',
  crateEdge: '#38bdf8',
  bush: '#0f2e2b',
  bushLeaf: '#2dd4a7',
  shadow: '#05070f',
  player: '#22d3ee',
  playerDark: '#0e7490',
  guard: '#fb7185',
  guardDark: '#9f1239',
  coneCalm: '250, 204, 21',
  coneSuspicious: '251, 146, 60',
  coneAlarm: '244, 63, 94',
  exit: '#34d399',
  intel: '#fbbf24',
  text: '#eef2ff',
  muted: '#8b93b8',
  panel: '#111731',
  danger: '#f43f5e',
  gold: '#fbbf24',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'neon-shadow.best';

// ---------------------------------------------------------------------------
// Levels. Coordinates are tiles. Walls/crates block movement AND sight;
// bushes and shadow patches hide the player (guards only spot a hidden
// player up close). Guard patrols are closed loops of floor tiles.
// ---------------------------------------------------------------------------

export const LEVELS = [
  {
    name: 'The Gallery',
    par: 75,
    start: [1, 1],
    exit: [30, 18],
    walls: [
      [10, 4], [10, 5], [10, 6], [10, 14], [10, 15], [10, 16],
      [21, 4], [21, 5], [21, 6], [21, 14], [21, 15], [21, 16],
      [15, 9], [16, 9], [17, 9],
    ],
    crates: [
      [4, 4], [5, 4], [14, 2], [15, 2], [25, 8], [25, 9],
      [7, 12], [8, 12], [18, 15], [27, 14], [27, 15], [12, 17], [13, 17],
    ],
    bushes: [[3, 8], [4, 8], [28, 4], [29, 4], [16, 12], [17, 12], [8, 16], [24, 16]],
    shadows: [[12, 7], [13, 7], [20, 11], [21, 11]],
    intel: [[6, 2], [26, 6], [15, 17]],
    guards: [
      { path: [[8, 3], [8, 10], [14, 10], [14, 3]] },
      { path: [[18, 4], [24, 4], [24, 12], [18, 12]] },
      { path: [[26, 14], [26, 18], [28, 18], [28, 14]] },
    ],
    cameras: [],
  },
  {
    name: 'The Vault Floor',
    par: 90,
    start: [1, 1],
    exit: [30, 18],
    walls: [
      [8, 2], [8, 3], [8, 4], [8, 15], [8, 16], [8, 17],
      [16, 8], [16, 9], [16, 10], [16, 11],
      [24, 4], [24, 5], [24, 14], [24, 15],
    ],
    crates: [
      [3, 5], [4, 5], [12, 3], [13, 12], [19, 15], [20, 15],
      [28, 9], [28, 10], [6, 15], [26, 17],
    ],
    bushes: [[5, 9], [6, 9], [22, 7], [23, 7], [14, 16], [15, 16], [28, 3]],
    shadows: [[11, 6], [12, 6], [20, 12], [21, 12], [27, 13]],
    intel: [[2, 18], [15, 2], [29, 6], [20, 17]],
    guards: [
      { path: [[5, 2], [5, 7], [11, 7], [11, 2]] },
      { path: [[13, 4], [19, 4], [19, 9], [13, 9]] },
      { path: [[22, 10], [28, 11], [28, 16], [22, 16]] },
      { path: [[4, 13], [4, 18], [10, 18], [10, 13]] },
    ],
    cameras: [{ x: 16, y: 1, from: 0.7, to: 2.44 }],
  },
  {
    name: 'The Neon Rooftop',
    par: 110,
    start: [1, 1],
    exit: [30, 18],
    walls: [
      [6, 5], [6, 6], [6, 7], [12, 12], [12, 13], [12, 14],
      [18, 4], [18, 5], [18, 6], [24, 11], [24, 12], [24, 13],
      [9, 16], [10, 16], [11, 16],
    ],
    crates: [
      [3, 3], [3, 9], [15, 8], [16, 8], [21, 16], [22, 16],
      [28, 5], [7, 13], [26, 10],
    ],
    bushes: [[4, 14], [5, 14], [17, 11], [18, 11], [25, 7], [26, 7], [11, 4], [12, 4]],
    shadows: [[9, 9], [10, 9], [20, 14], [21, 14], [14, 16]],
    intel: [[2, 17], [8, 2], [16, 17], [28, 16], [24, 3]],
    guards: [
      { path: [[4, 2], [9, 2], [9, 6], [4, 6]] },
      { path: [[14, 3], [20, 3], [20, 7], [14, 7]] },
      { path: [[22, 4], [28, 4], [28, 9], [22, 9]] },
      { path: [[3, 11], [8, 11], [8, 17], [3, 17]] },
      { path: [[16, 13], [22, 13], [22, 18], [16, 18]] },
    ],
    cameras: [
      { x: 16, y: 1, from: 0.7, to: 2.44 },
      { x: 30, y: 10, from: 2.2, to: 4.1 },
    ],
  },
];
