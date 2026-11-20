# Kotfolio — Agent Instructions

Kotlin multi-platform portfolio site built with [Kobweb](https://github.com/varabyte/kobweb) (Compose HTML). Frontend-only, no server component.

## Commands

```bash
cd site && kobweb run          # Dev server at http://localhost:8080
./gradlew build                # Build from repo root
./gradlew :site:kobwebExport   # Static export to site/.kobweb/site/
python e2e/run_e2e.py --tier all --workers 2   # Headless Chrome CDP E2E suite
```

Press `Q` in the terminal to stop the dev server.

## Structure

- **`:site`** — Single subproject containing all application code
- **Entry point**: `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/AppEntry.kt` (Kobweb convention)
- **Pages**: `pages/` directory (`Drift.kt` serves `/drift` Jelly Drift 3D)
- **Game UI & Bridge**: `game/` (`AdConfig.kt`, `JellyDriftBridge.kt`, `JellyDriftHud.kt`, `JellyDriftMenus.kt`)
- **3D WebGL Engine**: `site/src/jsMain/resources/public/jellydrift/` (`engine.js`, `physics.js`, `tracks.js`, `cars.js`, `ai.js`, `camera.js`, `ads3d.js`, `adsense.js`, `vfx.js`, `audio.js`)
- **Components**: `components/widgets/`, `components/sections/`, `components/layouts/` (`GameLayout.kt` for `/drift`)
- **Styles**: `components/styles/` and `AppStyles.kt`
- **Utilities**: `utils/`
- **Coordination Board**: `AGENT_TASKS.md` (read before starting parallel work)

## Parallel Multi-Agent Workflow

Multiple agents may work on this repository concurrently. Always let the secondary agent (running a custom **Qwen 3.8 27B** model) handle the **simplest, most self-contained, zero-overlap tasks**, while the primary agent handles complex core systems and export/E2E verification.

### Role Split
- **Primary Agent**: Owns core 3D simulation & architecture (`physics.js`, `ai.js`, `camera.js`, `ads3d.js`, `engine.js`), AdSense integration (`adsense.js`, `AdConfig.kt`, `site/build.gradle.kts`), Kobweb game lifecycle (`Drift.kt`, `JellyDriftBridge.kt`), and static export / E2E test runs.
- **Secondary Agent (Qwen 3.8 27B)**: Always assigned the simplest, cleanly isolated tasks with zero shared-file overlap:
  - Documentation updates (`README.md`, `AGENTS.md`)
  - Self-contained portfolio-side helpers (e.g., smooth hash-scrolling on `Index.kt`)
  - Focused UI copy, car stat bars, house-sponsor creative polish, and isolated styling tweaks (only after any active locks in `AGENT_TASKS.md` are `FREE`).

### Coordination Rules (`AGENT_TASKS.md`)
1. **Check `AGENT_TASKS.md` first**: Read `AGENT_TASKS.md` before reading/editing code.
2. **Claim before editing**: Mark your chosen task `IN_PROGRESS (<agent-name>)` in `AGENT_TASKS.md` and list the exact files you own. **Never** edit files listed under another agent's `IN_PROGRESS` task or locked section.
3. **Respect `BUILD_OR_E2E_LOCK`**: Never run `.\gradlew.bat :site:kobwebExport` or `:site:kobwebCleanSite` while `BUILD_OR_E2E_LOCK` is `ACTIVE` (export cleans `site/.kobweb/site/` and will cause 404s in running E2E browser sessions).
4. **Protected files**: Never edit `e2e/tests/*.py` test assertions or `site/src/jsMain/resources/public/jellydrift/vendor/`.
5. **Keep E2E contracts intact**: Keep all `data-testid`, `data-track-id`, `data-car-id`, `data-mode-id`, overlay IDs (`#garage-ad-overlay`, `#podium-ad-overlay`, `#continue-ad-overlay`, `#console-ad-overlay`, `#roof-ad-overlay`), and `"SPONSORED"` fallback labels intact.
6. **Release cleanly**: Update your task row in `AGENT_TASKS.md` to `DONE` when finished.

## Tech Stack

| Tool | Version |
|------|---------|
| Kotlin | 1.9.21 |
| Kobweb | 0.15.3 |
| Jetpack Compose HTML | 1.5.11 |
| Silk UI | bundled with Kobweb |

Dependencies managed via Gradle version catalog in `gradle/libs.versions.toml`.

## Key Conventions

- All source is under `site/src/jsMain/kotlin/` (JS target only)
- Uses Kobweb's built-in routing and page conventions
- Markdown support via `kobwebx-markdown` plugin
- Google Fonts loaded in `build.gradle.kts` index config
- No tests currently configured

## Gotchas

- Run `kobweb run` from the `site/` subdirectory, not repo root
- The project is frontend-only; server code (`jvmMain`) is commented out in build config
- Kobweb generates `.kobweb/` artifacts — only `conf.yaml` and `site/` are tracked by git
