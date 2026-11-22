# Neon Shadow — The Umbra Heist

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/renprayoga/best-stealth-game-20261121-1759/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/renprayoga/best-stealth-game-20261121-1759/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

**Neon Shadow — The Umbra Heist** is an original top-down stealth game
that runs offline in a desktop browser from static files — no network
requests, no libraries, no build step. Slip past the patrols, grab the
intel, and reach the glowing EXIT without ever being seen.

Three hand-built floors, all art drawn procedurally on canvas and all
sound synthesized with WebAudio (nothing copied from any commercial
game): **The Gallery** (3 guards), **The Vault Floor** (4 guards +
1 sweeping camera), and **The Neon Rooftop** (5 guards + 2 cameras).
Guards patrol with raycast vision cones that stop at walls and crates;
a detection meter fills when you are seen, guards get suspicious and
investigate, and a full meter raises the alarm and sends every guard
chasing. Crates block sight, bushes and shadow patches hide you (a
guard only spots you up close there), and sprinting is loud — nearby
guards turn toward the noise.

Score comes from intel shards, a time bonus against each floor's par,
and a Ghost bonus for clearing a floor never spotted; each floor rates
you 1–3 stars.

## Controls

- **WASD / arrows** — move · **Shift** — sprint (loud!) · **Click** — walk there
- **P** pause · **M** mute · **R** restart level · **Enter** start / next level

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static file server. The hand-in
program is `main.ts` (Node 22): it copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json`.

## Screenshots

Deterministic renders of the game's own code — replay any of them with
`?shot=<name>&seed=1`:

- `1-play.jpg` — mid-heist: guards, vision cones, cover, the EXIT
- `2-start.jpg` — title screen over a live floor
- `3-alert.jpg` — spotted: a suspicious guard, orange cone, meter at 72%
- `4-complete.jpg` — floor clear, 3 stars

## Structure

- `game/index.html` + `game/style.css` — page, HUD, menus
- `game/src/config.js` — tuning, palette, the three level maps
- `game/src/world.js` — simulation: movement, collision, line of sight,
  guard AI (patrol / suspicious / chase / return), cameras, detection
- `game/src/render.js` — canvas drawing, raycast vision cones
- `game/src/input.js` — keyboard + click-to-move
- `game/src/audio.js` — synthesized WebAudio effects
- `game/src/shots.js` — deterministic screenshot setups
- `game/src/main.js` — fixed-step loop, screens, HUD
- `main.ts` — hand-in program (copies game + screenshots, writes dossier)
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged

## Verification

- Level reachability (BFS over walkable tiles: exit, every intel shard,
  every guard waypoint) checked for all three floors.
- 15/15 headless-Chrome play-tests pass: boot, movement, wall collision,
  click-to-move, detection → suspicion → chase → caught, retry, intel
  pickup, reaching the exit, next level, pause/resume, hiding in a bush.
- A scripted bot won level 1 by real movement in 9.5 s with no errors.
- `makefun check`: 0 failed (only `transcripts_present` waits for the
  coordinator's bundle).
