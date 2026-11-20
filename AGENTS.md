# Kotfolio — Agent Collaboration & Repository Guide

Kotlin multi-platform portfolio site built with [Kobweb](https://github.com/varabyte/kobweb) (Compose HTML). Frontend-only, no server component.

## Agents & Zero-Lock Parallel Workflow

Three coding agents collaborate on this repository concurrently:
- **`antigravity`** — Touge track generation, geometry continuity, drift/inertia/braking physics, AI & engine loop (`tracks.js`, `physics.js`, `ai.js`, `engine.js`)
- **`copilot`** — Car-locked camera rig, perspective-mapped 3D/DOM ad projection, and embedded screen/pod UI styling (`camera.js`, `ads3d.js`, `Drift.kt`)
- **`opencode`** — 3D car cockpit/roof hardware integration & corner anchors, touge VFX, audio tuning, and docs (`cars.js`, `vfx.js`, `audio.js`, `README.md`, `JellyDriftMenus.kt` copy/subtitles)

### Collaboration Rules (Non-Blocking)
1. **Start immediately — NO blocking locks**: There is no global build lock or waiting queue. Every agent owns strictly disjoint files in [AGENT_TASKS.md](AGENT_TASKS.md) and starts in parallel right away.
2. **Never edit another agent's owned files**: Only modify files assigned to your agent name in `AGENT_TASKS.md`. If you need a helper, anchor, or value in another agent's file, code against the **Shared Interface Contracts** in `AGENT_TASKS.md` (with graceful fallbacks) and leave a short note in [COLLAB_LOG.md](COLLAB_LOG.md).
3. **No tests or full exports during this sprint**: Do **not** run `e2e/run_e2e.py` or `./gradlew :site:kobwebExport` unless explicitly requested later. Use fast syntax/sanity checks (e.g., `node --check <your-file.js>`) only on files you own.
4. **Preserve external contracts & protected files**:
   - Never edit `site/src/jsMain/resources/public/jellydrift/vendor/*` or `e2e/tests/*.py`.
   - Keep existing exported function names across `jellydrift/*.js`, track IDs (`sunny_coast`, `canyon_loop`, `neon_circuit`), car IDs (`jelly_gt`, `tofu_86`, `bumble_buggy`, `cobalt_hyper`), `data-testid` attributes, and overlay IDs (`#garage-ad-overlay`, `#podium-ad-overlay`, `#continue-ad-overlay`, `#console-ad-overlay`, `#roof-ad-overlay`) intact.
5. **Communicate asynchronously via `COLLAB_LOG.md`**: Append brief progress updates, anchor coordinates, or cross-agent requests under your agent heading in [COLLAB_LOG.md](COLLAB_LOG.md) (do not overwrite another agent's log section).

## Commands

```bash
cd site && kobweb run          # Dev server at http://localhost:8080 (drift at /drift)
node --check <path/to/file.js> # Fast JS syntax check
```

Press `Q` in the terminal to stop the Kobweb dev server.

## Structure

- **`:site`** — Single subproject containing all application code
- **Entry point**: `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/AppEntry.kt` (Kobweb convention)
- **Pages**: `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/pages/` (`Drift.kt` serves `/drift` Jelly Drift 3D)
- **Game UI & Bridge**: `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/game/` (`AdConfig.kt`, `JellyDriftBridge.kt`, `JellyDriftHud.kt`, `JellyDriftMenus.kt`)
- **3D WebGL Engine**: `site/src/jsMain/resources/public/jellydrift/` (`engine.js`, `physics.js`, `tracks.js`, `cars.js`, `ai.js`, `camera.js`, `ads3d.js`, `adsense.js`, `vfx.js`, `audio.js`)
- **Components & Styles**: `components/widgets/`, `components/sections/`, `components/layouts/` (`GameLayout.kt`), `components/styles/`
- **Sprint Board & Async Log**: `AGENT_TASKS.md` and `COLLAB_LOG.md`

## Tech Stack

| Tool | Version |
|---|---|
| Kotlin | 1.9.21 |
| Kobweb | 0.15.3 |
| Jetpack Compose HTML | 1.5.11 |
| Silk UI | bundled with Kobweb |
| Three.js | r169 (`vendor/three.module.min.js`) |

## Gotchas

- Run `kobweb run` from the `site/` subdirectory, not repo root.
- In Compose HTML (`Drift.kt`, `JellyDriftMenus.kt`), `Div(...)` requires `Modifier....toAttrs()` — never pass raw `Modifier` directly to `Div(...)`.
- In Kotlin/JS, `js("...")` requires a compile-time string constant (use `kotlinx.browser` / `asDynamic()` for dynamic values).
- The project is frontend-only (`jvmMain` is disabled).
