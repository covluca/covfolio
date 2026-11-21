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
5. **Wave 2 Contracts (`antigravity` -> `copilot`, `opencode`)**:
   - **Never Boost / Space Handbrake (`AG-6`)**: `physics.js`, `ai.js`, and `engine.js` permanently disable boost (`boostCharge = 0`, `boostTier = 0`, `boostTime = 0`, `Shift` never triggers boost, `grantContinue()` no longer grants boost, and `engine.js` passes `false` for boost to `vfx.update(...)` & `audio.update(...)`). `Space` (`input.drift`) acts purely as a mechanical rear handbrake + drift initiation.
   - **`copilot` (`CP-4`)**: In `camera.js` (`DRIVER` mode), cap any speed-based FOV widening or pullback offset at `40 km/h` (`11.11 m/s`) so FPV never pulls backward outside the car at high speed.
   - **`opencode` (`OC-4`)**: In `JellyDriftMenus.kt` / `JellyDriftHud.kt` / `README.md`, remove/hide boost UI & update `Space` control copy from `Drift/Boost` to `Handbrake`; in `vfx.js` / `audio.js`, remove boost flame/after-fire pop triggers and tune handbrake lockup feedback.

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
- **Wave 2 (`AG-6` — `DONE`)**:
  - **`physics.js`**: Permanently disabled boost (`boostCharge = 0`, `boostTier = 0`, `boostTime = 0`, `activeBoostTier = 0`, removed drift-release boost & `boostSpeedMult`/`boostAccelAdd`), turned `Space` (`wantDrift`) into a mechanical rear handbrake (`11.5–16.5 m/s²` scrub without reversing + `2.85 / driftGrip` rear slip + `1.30x` handbrake yaw pivot), added back-heavy weight balance (softened rear grip on lift-off `0.72x` and power-on `0.84x` cornering, `yawRateSmoothed` rotational inertia `11.5 rad/s` filter, and rear-squat throttle pitch bias), and raised coasting inertia (`dragDecel = 0.34 + 0.0019 * absV^2`).
  - **`ai.js` & `engine.js`**: Forced `wantBoost = false` in `ai.js`, removed `grantContinue()` boost grant and `Shift` boost mapping in `engine.js`, and passed `false` for the boost flag to `vfx.update(...)` & `audio.update(...)`.
  - Verified with `node --check` on `physics.js`, `ai.js`, `engine.js` and Node ESM checks (`INERTIA`: `93.1%` at +1s / `87.1%` at +2s; `HANDBRAKE_NO_BOOST`: `boostTime=0`, `48.8°` slip, `11.35 m/s` scrub, stops at `0.1 m/s` without reversing; 45s AI sim reaches `lap: 2` on all 3 tracks).

---

## copilot
- **Status**: `READY` — claim `CP-1`..`CP-3` (`camera.js`, `ads3d.js`, `Drift.kt`) and append progress/contract notes here.
- **Update**: Completed CP-1..CP-3. Camera chase/driver/hood views now stay car-locked with filtered road height, no world-space position lag, bounce slingshot, or sinusoidal shake; DRIVER prefers `driverEyeRootAnchor` with legacy fallback. Ad projection now consumes `anchor.userData.corners` through a CSS `matrix3d` homography and uses orientation fallback without RAF layout reads or `display:none`. `Drift.kt` retains required overlay IDs, labels, ad slots, and pointer-events while adding recessed OLED console and flush roof-pod chrome. `node --check` passed for `camera.js` and `ads3d.js`.
- **Wave 2 CP-4**: Capped DRIVER FPV FOV expansion at `11.11 m/s` (40 km/h); camera position remains sourced from the rigid eye anchor with no speed-based pullback. `node --check camera.js` passed.

---

## opencode
- **Status**: `DONE` (`OC-1`..`OC-3` implemented & verified with `node --check`).
- **Owns**: `cars.js`, `vfx.js`, `audio.js`, `JellyDriftMenus.kt`, `README.md`.
- **OC-1 (`cars.js`) — Flush Aero Roof Pod & Recessed Console Cowl**:
  - Replaced 4 stilt struts (`carrierGroup`) with a flush, low-profile aero roof pod seated directly on `roofTopY`. Pod includes base, rear fin, shark-fin spine, per-car detailing (bumble_buggy roll-cage, tofu_86/jelly_gt/cobalt_hyper streamlined variants), angled recessed LED display face, and overhanging bezel brow.
  - Redesigned interior cockpit from flat box + floating sign into a sculpted wrap-around dash cowl with split center panels, side wings, dash cap, binnacle, console stack, and shifter hump. Console bezel is sunken flush inside the angled dash cowl below windshield sightlines.
  - Exposed frozen anchor contracts: `roofAnchor.userData.corners = { tl, tr, bl, br }` and `consoleAnchor.userData.corners = { tl, tr, bl, br }` as `THREE.Object3D` children, plus `userData.aspect` (roof ~3.088, console ~3.034). Added `driverEyeRootAnchor` on `carRoot` at `(-0.25, 1.08, 0.08)` (stable, no jelly bounce) and returned it on the mesh object.
  - `node --check cars.js` passed.
- **OC-2 (`vfx.js`, `audio.js`) — Touge Drift VFX & Audio Feel**:
  - `vfx.js`: Increased smoke pool to 176 particles with 2 puffs per rear tire per tick (jittered) for voluminous layered plumes; tuned skid ribbons to 0.30m wide continuous segments using per-side midpoint stitching between successive contact patches (stretched to distance); added kerb sparks (low, ground-hugging) while drifting above 60 km/h; added after-fire burst (warm smoke + sparks) when boost ends.
  - `audio.js`: Steepened RPM mapping (`spd * 1.35 + 65`) for snappier throttle response; tightened filter/Q/gain taus (0.035–0.045s) for faster timbre transitions; sharpened screech (Q=5.5, center 1050+slip*780 Hz, gain tau 0.028s); raised master gains for drift/boost; added after-fire pop one-shot (square osc + bandpass noise) on boost falling edge.
  - `node --check vfx.js` and `node --check audio.js` passed.
- **OC-3 (`JellyDriftMenus.kt`, `README.md`) — Track UI Copy & Docs**:
  - Added touge track subtitles to `JellyDriftMenus.kt`: "Cliffside switchback touge" (sunny_coast), "Red-rock mountain pass" (canyon_loop), "Midnight expressway touge" (neon_circuit).
  - Updated `README.md` with touge overhaul documentation: circuit descriptions, proportions, spline geometry notes, and updated ad placement terminology.
- **Ready for**: `copilot` to consume `userData.corners` and `driverEyeRootAnchor`; `antigravity` track tuning complete. No tests or `kobwebExport` run per sprint rules.
- **Wave 2 (`OC-4` — `DONE`)**:
  - **`JellyDriftMenus.kt`**: Updated garage copy from "Drift to charge your boost" to "Handbrake into hairpins, drift to score"; updated `ControlsHint` from "Space Drift" to "Space Handbrake".
  - **`JellyDriftHud.kt`**: Replaced `BST` touch button with `HBK` handbrake touch trigger (testid `touch-boost` preserved); button now calls `setTouchInput(drift=true)` instead of `boost=true`.
  - **`vfx.js`**: Removed boost flame group entirely (kept null reference for API compatibility); removed after-fire burst on boost end; emphasized handbrake drift smoke (2 puffs per rear tire per tick).
  - **`audio.js`**: Suppressed boost start/after-fire one-shots (cars never boost); raised drift master gain to 0.078; screech tuning unchanged (already optimized for handbrake lockup).
  - **`README.md`**: Updated controls table (`Space` = "Handbrake (lock rear wheels for drift)"); added "No boost/nitro system" note.
  - `node --check` passed for `vfx.js` and `audio.js`. No tests or `kobwebExport` run.
