# 3-Agent Sprint Board — Jelly Drift 3D Touge Overhaul

> **Non-Blocking Parallel Mode**: **NO locks.** `antigravity`, `copilot`, and `opencode` all start immediately (`READY`) on 100% disjoint files.
> **No Tests For Now**: Do **not** run `e2e/run_e2e.py` or `:site:kobwebExport` during this sprint; use `node --check <file>` for quick local JS syntax validation only.

---

## Agent Status & Exclusive File Ownership

| Agent | Status | Owned Files (Edit ONLY These) | Primary Focus |
|---|---|---|---|
| **`antigravity`** | `READY` | `site/src/jsMain/resources/public/jellydrift/tracks.js`<br>`site/src/jsMain/resources/public/jellydrift/physics.js`<br>`site/src/jsMain/resources/public/jellydrift/ai.js`<br>`site/src/jsMain/resources/public/jellydrift/engine.js` | Touge maps + distinct world landmarks, hairpin geometry continuity, tight drift physics + inertia + brake-before-reverse, AI/engine sync |
| **`copilot`** | `READY` | `site/src/jsMain/resources/public/jellydrift/camera.js`<br>`site/src/jsMain/resources/public/jellydrift/ads3d.js`<br>`site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/pages/Drift.kt` | Rigid car-locked cameras (`CHASE` / `DRIVER` / `HOOD`) without speed pull-out or crazy bobbing, perspective `matrix3d` ad mapping, integrated OLED console & flush roof pod styling |
| **`opencode`** | `READY` | `site/src/jsMain/resources/public/jellydrift/cars.js`<br>`site/src/jsMain/resources/public/jellydrift/vfx.js`<br>`site/src/jsMain/resources/public/jellydrift/audio.js`<br>`site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/game/JellyDriftMenus.kt`<br>`site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/game/JellyDriftHud.kt`<br>`README.md` | Replace "post sign" roof & dash geometry in `cars.js` with flush aero roof pod + recessed console cowl & corner anchors, touge drift VFX & audio feel, remove Boost UI/prompts in menus/HUD (`Space` = Handbrake), updated track descriptions |

> **Protected (Do NOT touch)**: `site/src/jsMain/resources/public/jellydrift/vendor/*`, `e2e/tests/*.py`.

---

## Problem Allocation & Root-Cause Specs

### 1. `antigravity` — Tracks, Continuity & Touge Physics (`tracks.js`, `physics.js`, `ai.js`, `engine.js`)

- **`AG-1` (`tracks.js`) — Touge Drift Circuits Instead of Long NFS Straights**:
  - Current `halfWidth` (`14.5–16.5m`) and control-point loops (`1150–1450m`) feel like wide open highways with long straightaways.
  - Tighten to technical mountain-pass **touge** proportions (`halfWidth` around `7.8–9.2m`, tighter ~`700–920m` circuits) packed with continuous linked S-bends, hairpins, downhill/uphill switchbacks, chicanes, and almost zero long dead straights.
- **`AG-2` (`tracks.js`) — Distinct Per-Map Content & Gameplay Landmarks (Not Just Recolors)**:
  - Each of the 3 tracks must feel like a distinct place with bespoke geometry & spatial props:
    - `sunny_coast`: Coastal mountain switchback — cliffside rock-cut arch/half-tunnel, coastal lighthouse with beacon, wooden pier with boats/buoys, cliff retaining walls, and hairpin chevron markers.
    - `canyon_loop`: Red-rock gorge touge — dramatic elevation climb & corkscrew descent, layered sandstone rock mesas/arches over the road, timber guardrail posts, canyon boulders, and canyon-edge drops.
    - `neon_circuit`: Midnight expressway touge — split-elevation deck overpass, illuminated tunnel section, multi-height city skyline buildings with lit window textures, overhead highway destination signage, and warm/neon streetlamps.
- **`AG-3` (`tracks.js`) — Eliminate Hairpin Wall/Curb Discontinuity Errors**:
  - Sharp corners currently allow inner curb/wall ribbons (`offset = halfWidth + 1.15 .. +2.1`) to exceed local spline radius of curvature, folding walls inside-out / self-intersecting at hairpins.
  - Enforce minimum bend radius safety (`R_min > 1.55 * (halfWidth + wallOffset)`) via corner control-point shaping + **safe inner-miter / non-inversion clamping** in ribbon extrusion, raise `SAMPLE_COUNT` (e.g. `640`) for smooth hairpin normals/tangents, and verify clean closure at `s = 0`.
- **`AG-4` (`physics.js`) — Fix 4 Core Handling & Inertia Bugs**:
  1. **Turning radius way too wide**: Remove/rework the outward-pushing `elasticTarget = vForward * clamp(steer, -1, 1, 0) * 0.85` & `latDamping = 0.35` triggered whenever `|vRight| > 1.2` (`physics.js` lines 442, 461–468) — currently `+steer` pushes `vRight` outward along `+car-left`, sliding the nose wide instead of pivoting cleanly into hairpins. Tune crisp front bite + controlled rear drift slip (`~22°–48°`) + fast tight-hairpin yaw authority so cars pivot tightly into touge switchbacks.
  2. **Grip-less wobble**: Restore strong lateral tire grip outside deliberate drifts (`latDamping`) and raise 2nd-order chassis spring damping (`zeta ~ 0.65–0.80`, moderate `pitchTarget` / `rollTarget` clamps) so the car feels planted and responsive instead of wobbling uncontrollably.
  3. **Stops in <1s on throttle lift**: Replace heavy `Math.exp(-1.15 * h)` (`physics.js` line 423) with realistic low rolling drag + mild aerodynamic drag so lifting off throttle carries natural momentum/coasting for several seconds instead of hitting an invisible brick wall.
  4. **Instant reverse on braking**: Fix `physics.js` lines 413–420 (`if (vForward > 0.6) ... else reverse`) so braking while moving forward brings the car smoothly to `0` and **stays stopped** until either brake is released and pressed again OR brake is held cleanly at standstill (`>= 0.40s` hold threshold) before reverse gear engages.
- **`AG-5` (`ai.js`, `engine.js`) — Touge AI & Engine Plumbing**:
  - Tune AI lookahead, corner speed braking/drift lines, and `safeSpawnLane` offsets for `7.8–9.2m` touge road widths; adjust `engine.js` garage orbit framing if needed for tighter roads.
- **`AG-6` (`physics.js`, `ai.js`, `engine.js`) — Wave 2: Back-Heavy Balance, Higher Inertia, Zero Boost & Spacebar Handbrake**:
  - **Never Boost**: Disable all boost triggers/multipliers in `physics.js` (drift release, manual boost, `grantContinue` refill -> `boostTime = 0`, `boostSpeedMult = 1.0`, `boostAccelAdd = 0`), set `ai.js` `wantBoost = false`, and pass `false` for boost VFX/audio in `engine.js`.
  - **Spacebar (`input.drift`) = True Handbrake**: Holding `Space` locks/drags rear wheels when moving forward (`vForward > 1.5`), applying handbrake deceleration while dropping rear lateral grip so the tail swings cleanly into hairpins; releasing `Space` hooks rear grip back up with zero boost launch.
  - **Back-Heavy Weight Bias**: Shift dynamic balance rearward — easier lift-off/power oversteer, rear pendulum carry around front axle, rear-squat pitch bias, and looser rear lateral grip during aggressive steering/throttle compared to front turn-in bite.
  - **Higher Inertia**: Lower coasting drag (`dragDecel ~ 0.38 + 0.0022 * v^2`) so lifting throttle carries momentum much longer, plus smoother rotational yaw inertia and heavier lateral momentum carry through S-bend transitions.

---

### 2. `copilot` — Car-Locked Camera & Integrated Ad Surfaces (`camera.js`, `ads3d.js`, `Drift.kt`)

- **`CP-1` (`camera.js`) — Fix Speed Camera Pull-Out & Crazy Bob/Wobble**:
  - **Root cause (`DRIVER` mode)**: `driverPosition.lerp(desired, 1 - Math.exp(-dt * 16))` (`camera.js:166-168`) interpolates world-space `camera.position` behind a car moving up to `33–45 m/s`, lagging `2–3m` backward out through the rear window at speed, compounded by `bounceY * 0.18` (`line 143`) and sinusoidal shake (`lines 153–160`).
    - **Fix**: Never world-lerp eye position in `DRIVER` (or `HOOD`) mode! Anchor camera **rigidly inside the car frame** using `playerMesh.driverEyeRootAnchor` if available (else directly from `player.pos` + `player.yaw` car-local eye offset without spring bounceY), zero sinusoidal shake, and only subtle rotational look-ahead into drift angle + gentle road-slope pitch smoothing.
  - **Root cause (`CHASE` mode)**: `camera.position.lerp(desired, 1 - Math.exp(-dt * 7.8))` (`camera.js:106-107`) lags ~`4–6m` behind the car at speed and stretches vertically with `bounceY * 1.2` (`line 97`) + sinusoidal shake (`lines 110–117`), wobbling over large distances.
    - **Fix**: Anchor `CHASE` position directly around `(px, smoothPy, pz)` using a smoothly filtered `followYaw`, clamped/smooth `camDist` (tiny speed pullback ~`0.6–0.9m`, never flying far away), and heavily damped vertical tracking `smoothPy` (zero `bounceY * 1.2` vertical slingshot and zero sinusoidal shake).
- **`CP-2` (`ads3d.js`) — True 3D Perspective Mapping Onto Car Geometry**:
  - Current `ads3d.js` only sets `translate3d(left, top, 0)` on a flat screen-aligned rectangle with crude `rollShift`/`pitchShift` offsets (`lines 92-95, 111-114`), making both roof and FPV ads look like floating highway post signs.
  - Compute projected screen `(x, y)` coordinates from `anchor.userData.corners` (`{ tl, tr, bl, br }`) when supplied by `cars.js`, derive an exact CSS **`matrix3d(...)` projective homography** mapping `(0,0)-(w,h)` cleanly onto the car's tilted 3D surface quad (with automatic orientation-based `perspective(...) rotate3d/rotateX/Y/Z` fallback if `corners` is not yet present), keep `last.console.rect` / `last.roof.rect` updated for snapshot inspection, **never** call `getBoundingClientRect()` inside RAF, and **never** use `display: none`.
- **`CP-3` (`Drift.kt`) — Integrated Display Chrome**:
  - Replace generic card styling on `#console-ad-overlay` and `#roof-ad-overlay` with sleek automotive embedded hardware frames:
    - `#console-ad-overlay`: recessed cockpit infotainment display (dark matte bezel, subtle inner glass sheen, tight dashboard fit).
    - `#roof-ad-overlay`: flush aero roof pod LED strip panel (sleek low-profile edge bevel matching car roof).
  - Keep `#console-ad-overlay`, `#roof-ad-overlay`, `ins.adsbygoogle`, `"SPONSORED"` fallback labels, and `pointerEvents(PointerEvents.None)` intact.
- **`CP-4` (`camera.js`) — Wave 2: Cap FPV Speed Pullback/FOV at 40 km/h**:
  - In `DRIVER` (FPV) mode, cap any speed-based FOV expansion or camera offset (`fpvSpeedFactor = clamp(speed / 11.11, 0, 1)`, i.e. **`40 km/h` ceiling**; `11.11 m/s = 40 km/h`). Ensure `camera.position` stays strictly locked inside the cabin ahead of the seatback at all speeds (60–120+ km/h must not pull the camera back further than it sits at `40 km/h`).

---

### 3. `opencode` — Car Hardware Integration, VFX & Audio (`cars.js`, `vfx.js`, `audio.js`, `JellyDriftMenus.kt`, `README.md`)

- **`OC-1` (`cars.js`) — Replace "Post Sign" Roof Struts & Stick-Up Console With Integrated Car Surfaces**:
  - **Roof**: Remove the 4 tall stilt struts (`carrierGroup`, `cars.js:596-623`) that lift a sign above the car. Build a **flush, sleek aerodynamic roof pod / shark-fin rear diffuser housing** seated directly onto `roofTopY` per car silhouette (`bumble_buggy` roll-cage integrated pod, `tofu_86`/`jelly_gt`/`cobalt_hyper` flush streamlined roof pod), with a rear-angled recessed LED display face.
  - **FPV Console**: Redesign interior cockpit (`cars.js:499-594`) from a flat box + floating square sign into a proper sculpted wrap-around **dashboard binnacle & center console stack** where `consoleBezel` is **sunken flush inside the angled dash cowl** below windshield sightlines (never sticking up like a tabletop sign).
  - **Expose Frozen Anchor Contracts**:
    - Attach 4 `THREE.Object3D` corner children to `roofAnchor` (`roofAnchor.userData.corners = { tl, tr, bl, br }` oriented from rear `CHASE` view) and 4 to `consoleAnchor` (`consoleAnchor.userData.corners = { tl, tr, bl, br }` oriented from driver eye), plus `userData.aspect` (`w / h`).
    - Add `driverEyeRootAnchor` parented directly to `carRoot` (not bouncing `jellyChassis`) and return it on the mesh object alongside `driverEyeAnchor` so `camera.js` stays inside the cabin with zero jelly-spring heave.
    - Keep `CARS` stats/physics fields untouched (`physics.js` / `antigravity` handles tuning).
- **`OC-2` (`vfx.js`, `audio.js`) — Touge Drift Smoke, Sparks & Tire Audio Feel**:
  - Enhance drift tire smoke plumes, sharper dual skid ribbons, subtle exhaust flame / kerb spark feedback, and responsive tire-screech + engine RPM curve tuned for rapid touge transitions.
- **`OC-3` (`JellyDriftMenus.kt`, `README.md`) — Track UI Copy & Docs**:
  - Once `antigravity` logs any updated track subtitles/names in `COLLAB_LOG.md`, optionally sync track subtitles/tips in `JellyDriftMenus.kt` and document the touge overhaul & 3-agent architecture in `README.md`.
- **`OC-4` (`JellyDriftHud.kt`, `JellyDriftMenus.kt`, `vfx.js`, `audio.js`, `README.md`) — Wave 2: Remove Boost & Rebind UI/VFX/Audio for Space = Handbrake**:
  - **`JellyDriftMenus.kt` / `JellyDriftHud.kt` / `README.md`**: Update Garage copy (`"Drift to charge your boost"` -> handbrake/drift copy, `Space Handbrake` in `ControlsHint`), hide/remove active Boost trigger behavior on HUD (`BST` button or boost meter — keep `data-testid` attributes intact if present or replace `BST` label with `HBK` / handbrake touch trigger calling `setTouchInput(drift=true)` while keeping `touch-boost-btn` harmless if needed).
  - **`vfx.js` & `audio.js`**: Remove/suppress turbo boost flame/after-fire cues since cars never boost; emphasize rear handbrake lockup smoke & tire-screech onset when Spacebar handbrake is engaged.

---

## Frozen Shared Interface Contracts

Every agent programs against these contracts so all work compiles & integrates cleanly on the first merge:

1. **World/Car Axes**: `+Z` = car forward, `+X` = car left, `+Y` = up, `+yaw` turns left (`fx = Math.sin(yaw), fz = Math.cos(yaw)`).
2. **`anchor.userData.corners` (produced by `opencode` in `cars.js`, consumed by `copilot` in `ads3d.js`)**:
   - `roofAnchor.userData.corners = { tl, tr, bl, br }` — 4 `THREE.Object3D` children of `roofAnchor`, positioned at top-left, top-right, bottom-left, bottom-right of the recessed rear roof-pod display plane **as seen from the rear chase camera**.
   - `consoleAnchor.userData.corners = { tl, tr, bl, br }` — 4 `THREE.Object3D` children of `consoleAnchor`, positioned at top-left, top-right, bottom-left, bottom-right of the recessed dash screen **as seen from the driver's seat**.
   - Fallback: `ads3d.js` checks `if (anchor?.userData?.corners)` and falls back gracefully to `anchor.matrixWorld` perspective projection when `corners` is absent.
3. **`playerMesh.driverEyeRootAnchor` (produced by `opencode` in `cars.js`, consumed by `copilot` in `camera.js`)**:
   - `THREE.Object3D` attached to `carRoot` (stable chassis frame, unaffected by `jellyChassis` squash/bounce) at driver eye local coordinates; `camera.js` prefers `driverEyeRootAnchor`, falling back cleanly to `carRoot` + local eye offset.
4. **Brake/Reverse Timing Contract (`antigravity` in `physics.js`)**:
   - Forward deceleration clamps cleanly to `0` without snapping into negative speed; reverse engages only after brake is released/re-pressed OR held at standstill `>= 0.40s`.
5. **Touge Track Envelope (`antigravity` in `tracks.js`, for `opencode` / `copilot`)**:
   - Track IDs remain `sunny_coast`, `canyon_loop`, `neon_circuit`; `halfWidth` targets `7.8m–9.2m`; all `gates`, `billboards`, `gantryAnchors`, `projectToTrack`, and `at(s)` APIs keep identical signatures.
