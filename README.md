# CONVOY LEAP

A playable first-person truck platformer built with React, TypeScript, Vite, Three.js, and Rapier 3D. It opens directly into a full-screen 3D game with a compact in-game play menu. Move freely, jump between dynamic semi-trucks, and physically enter a finish gate. The road, lethal obstacles, and fast truck strikes end the attempt.

This release contains **10 authored desert levels**, not the proposed 90-level campaign. Models, layouts, shaders, and synthesized sounds are original. No backend, accounts, external model URLs, or AI-controlled vehicles are needed.

## Run

Use Node 22.12+ (Node 24 in this environment).

```sh
npm ci --include=dev
npm run dev -- --port 5173 --strictPort
```

Open `http://localhost:5173/`. Click **Play level** to capture the mouse and activate audio. Desktop Chrome is the primary tested browser. On touch devices, use the left joystick, drag the right side to look, tap Jump, and hold Sprint; landscape is recommended. The mobile controls were checked with Android-sized Chromium emulation, not physical Android hardware. This is a browser/PWA game, not an APK.

| Input | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Space | Jump; press again for an equipped double jump |
| Shift | Sprint |
| E | Equipped dash or grapple |
| Q | Equipped slow motion |
| R | Instant retry while playing |
| Escape | Pause and release the mouse |

Lost mouse capture, tab visibility changes, and window blur pause the simulation. Resume requires a click. Failed runs have an immediate Retry button. Progress, best active-play times, settings, and unlocks persist locally; malformed or inaccessible storage falls back safely.

## Levels and equipment

| Level | Feature |
| --- | --- |
| 01 — The first leap | Tutorial transfer; the starter diverts before the finish |
| 02 — Open water | Wider convoy spacing |
| 03 — Passing lane | Different truck speeds |
| 04 — The long bend | A steering turn |
| 05 — Bottle neck | A narrow collision corridor |
| 06 — Cross traffic | Intersecting dynamic convoys; multiple transfers |
| 07 — Air freight | Ramp, airborne trucks, and a road gap |
| 08 — Red light | Timed lethal laser and moving barrier |
| 09 — Split decision | A tight shortcut and a wider detour |
| 10 — Convoy leap | Turns, cross traffic, ramp, gap, and barrier |

Basic movement is always selectable. Finishing 01 unlocks Double Jump, 02 unlocks Slow Motion, 04 unlocks Dash, and 06 unlocks Grapple. Equip them in the in-game Abilities panel. Grapple casts a 36m line-of-sight ray to a truck, draws a rope, and applies acceleration for a bounded duration. Dash adds a horizontal impulse with a cooldown. Neither teleports the player.

Sensitivity, FOV (default 65°), volume/mute, graphics quality, optional landing shake, sprint FOV, hints, and collider diagnostics are available in Settings. Debug mode shows actual Rapier colliders, velocity, support, normal, FPS, draw calls, body count, transfers, and time scale.

## Validation

```sh
npm test
npm run build
npm run test:browser
```

The **35 simulation/save checks** cover ten-second roof carry, turning support, exactly-once momentum inheritance, different-speed landings, diagonal normalization, coyote time, jump buffering, side contact, limited air jumps, physical ground/finish triggers, twenty world resets, fixed-step agreement at 30/60/144 rendering Hz, slow motion, dash, grapple and blocked line of sight, airborne/overturned vehicles, impulse response, corruption recovery, and unlocks. All ten levels have deterministic finish-reaching input sequences using basic movement and actual transfers, with no teleporting in those playthroughs. These establish reachable routes, not exhaustive collision or difficulty guarantees.

Playwright checks real keyboard tutorial completion and saved unlocks; pause/resume; twenty immediate retries and bounded GPU/body resources; settings and mouse capture; touch play in portrait/landscape; production offline play; pointer-lock rejection; and unavailable WebGL. Its development-only `window.__CONVOY__()` reads diagnostics and has no gameplay mutation methods. The production build omits that hook.

Browser tests use `/usr/bin/chromium`; override `CHROMIUM_PATH` if needed. They start/reuse Vite on 5173 and the production preview on 4173. Build before running them. Screenshots are written to `/tmp/convoy-*.png`.

The cloud tests use **Chromium's SwiftShader software GPU**, not a desktop or Android GPU. The final automated tutorial showed approximately **21 FPS near the finish** at a 1440×1000 viewport with Auto software graphics rendering at 720×500. This is the smoothed HUD readout, not a sustained benchmark; the 60 FPS target was not achieved on this machine. Tutorial browser completion took about 26 active seconds, and the deterministic campaign routes take about 21–28 simulation seconds. Hardware acceleration is recommended. Physical-device profiling and additional browser engines remain to be done.

## Physics and performance

- Simulation runs at 60 Hz with interpolation and a six-step catch-up limit after stalls. Active-play time drives ability durations/cooldowns and records; simulation time drives vehicle motion and obstacles. Paused/menu time advances neither. Slow motion scales all simulation bodies together.
- An upright swept capsule moves independently of the trucks. Support stores a contact point in the truck's local coordinates, carries its translation/rotation, and inherits `linear velocity + angular velocity × contact offset` once on takeoff. The camera is independent of truck roll/pitch. Landing requires an upward surface normal; sides do not grant jumps.
- Trucks are dynamic, CCD-enabled Rapier bodies with trailer/cab/wheel colliders. Steering uses forces and torques, with propulsion and mild stability assistance restricted to upright trucks close to the ground. Collisions can deflect, topple, and pile them up. The support vehicle is never recycled away.
- Truck parts, rocks, and road markings use instancing; geometry/materials are shared within a scene. Counts are finite (25–33 trucks). Retry preserves the canvas, mouse capture, and WebGL context while freeing old worlds, event queues, controllers, instance buffers, textures, and sounds.
- Auto graphics uses lighter diffuse lighting, disables shadows and lowers resolution for software rendering and touch devices, and reduces quality after sustained low frame rates on hardware. High uses standard materials; changing modes applies immediately. High/Low are explicit overrides. Frozen scenes render at 10 Hz; the HUD updates at about 10 Hz. The initial physics chunk is approximately 830 KB gzip because Rapier compatibility includes its WebAssembly payload.

## Project map

`src/game/config.ts` contains movement and ability constants. `physics.ts` owns worlds, truck dynamics, obstacles, and outcomes; `player.ts` owns support and swept movement. `clock.ts`, `input.ts`, `renderer.ts`, `audio.ts`, and `save.ts` handle their respective systems. `engine.ts` coordinates explicit game states. `src/App.tsx` provides in-game overlays; `TouchControls.tsx` provides mobile input.

To author another level, add a `Level` in `src/game/levels.ts`, with a distinct seed, routes extending beyond the finish, obstacle dimensions, and matching gaps. Add a normal-input completion sequence to the campaign test and inspect it interactively. Currently progression and menu counts cap at ten; extend those together when actually adding more levels. The remaining worlds and 90-level campaign are future work, not unlocked placeholders.

Run `npm run format` to format source/tests. Fonts are bundled; their licenses are under `public/licenses/`. The previous generated character sheet remains in `public/characters.webp` as an unused retained asset. The first-person build uses programmatic truck/environment models.

## Build and deploy

```sh
npm run build
npm run preview -- --port 4173
```

For the GitHub Pages project path:

```sh
VITE_BASE_PATH=/X/ npm run build
VITE_BASE_PATH=/X/ npm run test:browser
```

The Actions workflow builds/tests and publishes every push to `main`. Pages is already enabled with GitHub Actions as its publishing source. The account's existing custom-domain configuration redirects `https://o4mrai.github.io/X/` to `http://majarr.me/X/`; it is preserved. This environment's network policy can block direct inspection of the custom domain, independently of successful publishing.

The generated service worker caches the production build within its path, and a new deployment clears the previous game's cache. Offline/PWA installation requires **HTTPS or localhost**. GitHub currently reports HTTPS enforcement disabled on the inherited domain; remote plain HTTP does not support offline installation. Android Chrome can install the HTTPS-hosted game from its menu after the first cache completes. No Play Store package is included.
