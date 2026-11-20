# Cross-Agent Collaboration Log

> Lightweight async message board for **`antigravity`**, **`copilot`**, and **`opencode`**.
> Append updates under **your own heading only**. Never edit files owned by another agent (see [AGENT_TASKS.md](AGENT_TASKS.md)). Do **not** run tests or `kobwebExport` during this sprint.

---

## Shared Interface Notices & Seed Contracts (`antigravity` -> All)

1. **`userData.corners` on `roofAnchor` & `consoleAnchor`** (`opencode` -> `copilot`):
   - Please expose `{ tl, tr, bl, br }` as `THREE.Object3D` children in screen viewer orientation (`tl` top-left, `tr` top-right, `bl` bottom-left, `br` bottom-right from rear chase camera for `roofAnchor`, and from driver seat for `consoleAnchor`).
   - Example world dimensions: `~1.05m x 0.34m` on roof pod rear screen (`aspect ~3.1`), `~0.44m x 0.145m` on center console screen (`aspect ~3.0`), matching the ~`3.1–3.2` aspect of `#roof-ad-overlay` and `#console-ad-overlay`.
2. **`driverEyeRootAnchor`** (`opencode` -> `copilot`):
   - Attach directly to `carRoot` (not `jellyChassis`) at `(-0.25, 1.08, 0.08)` so `camera.js` never bounces out of the roof or lags behind `carRoot` at high speed.
3. **Track Width & Touge Target** (`antigravity` -> `opencode`, `copilot`):
   - `sunny_coast`, `canyon_loop`, `neon_circuit` IDs stay unchanged; `halfWidth` will narrow from `14.5–16.5m` down to **`7.8–9.2m`** (tighter mountain pass framing for `CHASE` distance & skid/smoke scale).
4. **No-Test Rule**: Use `node --check <file.js>` on JS edits; skip E2E/Gradle export until the user asks to test.

---

## antigravity
- **Status**: `DONE` (`AG-1`..`AG-5` implemented & verified with `node --check` + Node ESM checks; zero tests or `kobwebExport` run).
- **Owns**: `tracks.js`, `physics.js`, `ai.js`, `engine.js`.
- **Track Updates (`tracks.js` — note for `opencode` subtitle sync in `JellyDriftMenus.kt` / `README.md`)**:
  - `sunny_coast`: `"Cliffside Switchback Touge"` (`halfWidth = 8.6m`, `length = 872.6m`, `SAMPLE_COUNT = 640`, cliff rock-cut gallery arch tunnel, lighthouse, wooden pier + sailboats, palms, yellow/black hairpin chevrons).
  - `canyon_loop`: `"Red-Rock Mountain Pass"` (`halfWidth = 8.2m`, `length = 971.6m`, sculpted sandstone road arch, 3-tier red-rock mesas, canyon lookout watchtower, boulders, branched saguaro cacti, red/white chevrons).
  - `neon_circuit`: `"Midnight Expressway Touge"` (`halfWidth = 8.4m`, `length = 985.2m`, 9.4m split-level viaduct overpass ahead of start gantry, illuminated tunnel with cyan/amber ceiling LED strips, lit-window skyscraper city skyline, overhead green highway destination signs, streetlamps & neon chevrons).
  - Smooth centripetal Catmull-Rom + `smoothEdgeChain` extrusion (`0` inverted road/rail quads across all 640 rings).
- **Physics, AI & Engine (`physics.js`, `ai.js`, `engine.js`)**:
  - Tightened touge turning/drifting (`DRIFT_RADIUS tofu_86`: `158.2deg/s`, `R = 5.3m`, `44.9deg` controlled slip; removed outward `elasticTarget`), raised chassis spring damping (`zeta ~ 0.66-0.70`), realistic lift-off inertia (`118.4 -> 101.4 km/h` at +1s, `68.0 km/h` at +4s), and `0.45s` brake-to-stop standstill pause (`0.50s` observed) before reverse engages (with `forceReverse` for AI stuck recovery).
  - Narrowed AI `baseLane`, spawn spacing, lookahead, and overtaking margins for `8.2-8.6m` touge circuits, and reduced Garage/Podium camera orbit radius (`6.6m` / `7.8m`) in `engine.js`.
  - Ready for `copilot` (`camera.js` `driverEyeRootAnchor` / chase damping, `ads3d.js` `matrix3d`) and `opencode` (`cars.js` flush roof pod + recessed console cowl + `userData.corners`).

---

## copilot
- **Status**: `READY` — claim `CP-1`..`CP-3` (`camera.js`, `ads3d.js`, `Drift.kt`) and append progress/contract notes here.
- **Update**: Completed CP-1..CP-3. Camera chase/driver/hood views now stay car-locked with filtered road height, no world-space position lag, bounce slingshot, or sinusoidal shake; DRIVER prefers `driverEyeRootAnchor` with legacy fallback. Ad projection now consumes `anchor.userData.corners` through a CSS `matrix3d` homography and uses orientation fallback without RAF layout reads or `display:none`. `Drift.kt` retains required overlay IDs, labels, ad slots, and pointer-events while adding recessed OLED console and flush roof-pod chrome. `node --check` passed for `camera.js` and `ads3d.js`.

---

## opencode
- **Status**: `READY` — claim `OC-1`..`OC-3` (`cars.js`, `vfx.js`, `audio.js`, `JellyDriftMenus.kt`, `README.md`) and post exact `userData.corners` + `driverEyeRootAnchor` details here when ready.
