# Multi-Agent Task & Lock Board

> Read `AGENTS.md` before editing files. Always assign the **simplest, most self-contained, zero-overlap tasks** to the secondary agent (custom **Qwen 3.8 27B**).

---

## Locks & Active Ownership

- **`BUILD_OR_E2E_LOCK`**: `ACTIVE (Primary Agent — running final E2E Tiers 1–4 + build against site/.kobweb/site/)`
- **Files currently locked by Primary Agent (`IN_PROGRESS`)**:
  - `site/.kobweb/site/*`
  - `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/game/*`
  - `site/src/jsMain/resources/public/jellydrift/*`
  - `e2e/*`

---

## Available Now for Secondary Agent (Qwen 3.8 27B — Simplest & Zero-Overlap)

These tasks touch isolated files with **zero** conflict with the Primary Agent's active E2E verification:

| ID | Status | Owned File(s) | Description & Acceptance Notes |
|---|---|---|---|
| `TASK-S1` | `DONE (Qwen 3.8 27B)` | `README.md` | Added Jelly Drift 3D documentation section with controls, tracks, cars, modes, AdSense placements, and testing overrides. |
| `TASK-S2` | `DONE (Qwen 3.8 27B)` | `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/pages/Index.kt` | Added mount-time hash-scroll LaunchedEffect that reads window.location.hash and smoothly scrolls to the target section element on page load. |

---

## Queued for Secondary Agent (Claim Once `BUILD_OR_E2E_LOCK` is `FREE`)

| ID | Status | Owned File(s) | Description & Acceptance Notes |
|---|---|---|---|
| `TASK-S3` | `DONE (Qwen 3.8 27B)` | `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/game/JellyDriftMenus.kt` | Added compact car stat bars (Top Speed, Accel, Drift, Bounce) for all 4 cars and keyboard controls hint in GarageMenu. All data-testid attributes preserved; layout fits within 390x844 viewport. |
| `TASK-S4` | `DONE (Qwen 3.8 27B)` | `site/src/jsMain/resources/public/jellydrift/tracks.js`, `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/pages/Drift.kt` | Polished house-sponsor creative copy in SPONSOR_PRESETS (tracks.js) and all 4 fallback cards (console, roof, garage, podium in Drift.kt). All "SPONSORED" badges preserved; buildTrackMeshes/gantryAnchors/billboardMeshes APIs unchanged. |

---

## Primary Agent Tasks

| ID | Status | Scope | Notes |
|---|---|---|---|
| `TASK-P1` | `DONE` | Milestones 1–3 (`Drift.kt`, `GameLayout.kt`, `AdConfig.kt`, `JellyDriftBridge.kt`, `JellyDriftHud.kt`, `JellyDriftMenus.kt`, `jellydrift/*.js`) | Implemented 3D racing game, creative AdSense overlays, and Compose phase-commit sync. |
| `TASK-P2` | `IN_PROGRESS` | Milestone 4 (`e2e/run_e2e.py` Tiers 1–4 + `./gradlew.bat build`) | Running final E2E Tiers 1–4 + build against `site/.kobweb/site/`. Will flip `BUILD_OR_E2E_LOCK` to `FREE` upon completion. |
