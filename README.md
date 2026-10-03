# Rooftop Rush

A React + TypeScript 3D endless runner for desktop browsers and Android Chrome. Run forward automatically, jump between moving truck roofs, collect gems, and stay off the road. A fall onto the asphalt or a collision with a truck's side ends the run.

## Develop

Node.js 22.12+ (the prepared environment uses Node 24) and npm are required.

```sh
cd /workspace/X
npm ci
npm run dev -- --port 5173
```

Vite listens on all interfaces so a phone on a reachable network can test the game. Desktop controls: **A / D** or **left / right arrows** to steer, **Space / W / up arrow** to jump, **Escape** to pause, and **R** to restart after a crash. Touch controls: hold the left/right buttons and tap **Jump**. You can steer in midair. Jump near the front edge of a roof when the green cue appears.

Select Nova, Dash, or Pixel in the lobby. Settings offer optional sound, a slower Chill mode, automatic graphics quality, high quality, and a battery saver. Best distance, score, run count, gems, and preferences are stored locally on the current device. No account or backend is required.

## Verify and build

```sh
npm test
npm run build
npm run test:browser
```

The nine physics tests cover deterministic generation, jumping across gaps, double-jump prevention, midair steering, road and side impacts, gem collection, a minute of simulated continuous play, and freezing a completed run. Five Playwright checks cover lobby interactions and persistent preferences; a real browser jump across a gap, pause/resume and restart; Android-sized touch screens in both orientations; offline production play; and unavailable WebGL.

Browser tests use `/usr/bin/chromium` in the prepared cloud environment. Set `CHROMIUM_PATH` to another Chromium executable if needed. Build before running browser tests: they start the production preview alongside the development server to test offline behavior.

```sh
npm run preview -- --port 4173
```

The default build serves from the root of an HTTPS static website. For this repository's GitHub Pages project site, build with the correct prefix:

```sh
VITE_BASE_PATH=/X/ npm run build
VITE_BASE_PATH=/X/ npm run test:browser
```

The deployment workflow in `.github/workflows/deploy-pages.yml` runs unit tests, builds for `/X/`, uploads the site, and publishes to GitHub Pages whenever `main` changes. In **Repository Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. The expected site address is **https://o4mrai.github.io/X/**. If the first workflow ran before Pages was enabled, rerun **Deploy Rooftop Rush to GitHub Pages** from the Actions tab after enabling it.

`VITE_BASE_PATH` updates Vite's asset URLs and the offline cache together. The manifest uses relative URLs, and the service worker stays inside its site's path. Run a prefixed preview with the same environment variable. Keep `sw.js` revalidating on deployment rather than caching it indefinitely. Hashed JavaScript and CSS assets can use long cache lifetimes.

## Android and offline use

The production build includes a manifest, home-screen icons, and a service worker. On Android Chrome, open the hosted HTTPS site, allow the first load to finish, then choose **Add to home screen / Install app** in the browser menu. After the game has been cached, it also runs offline. This is an installable web app, not a signed Android APK or Play Store release. Localhost also supports service workers for development; plain HTTP on a remote host does not.

Tested in Chromium with desktop and Android-sized browser emulation, including touch and landscape. Actual Android hardware and other browser engines have not yet been tested. A browser with WebGL2 and hardware acceleration is needed; graphics failures show a reload/help message.

## Implementation

- `src/game/core.ts`: deterministic physics, collision detection, seeded route generation, scoring, and platform recycling, independent of rendering.
- `src/game/engine.ts`: Three.js scene, fixed 120 Hz simulation steps, interpolated follow camera, animated characters, pooled geometry and materials, instanced trucks / trees / buildings, bounded object counts, capped pixel density, and automatic quality reduction.
- `src/App.tsx`: React lobby, overlays, character selection, settings, scores, and touch controls. Rendering runs outside React; the HUD updates at about 10 Hz.
- `scripts/build-sw.mjs`: generates a versioned offline cache from the production assets.

The lobby renders at 30 FPS; pause and result screens reduce rendering further, and hidden pages stop rendering and pause the run. Touch devices disable shadows in Auto mode; High quality enables them. Quality and sound can be changed without restarting the app.

## Artwork

The original character sheet in `public/characters.webp` was generated with the available OpenAI image-generation tool. Higgsfield was requested but was not available in the session. Gameplay uses original lightweight 3D characters inspired by the sheet; it does not load the large source PNG. The original generated PNG remains in `/workspace/generated_images`.

Inter and Space Grotesk are bundled locally. Their font licenses are in `public/licenses/`.
