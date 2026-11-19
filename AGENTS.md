# Kotfolio — Agent Instructions

Kotlin multi-platform portfolio site built with [Kobweb](https://github.com/varabyte/kobweb) (Compose HTML). Frontend-only, no server component.

## Commands

```bash
cd site && kobweb run          # Dev server at http://localhost:8080
./gradlew build                # Build from repo root
```

Press `Q` in the terminal to stop the dev server.

## Structure

- **`:site`** — Single subproject containing all application code
- **Entry point**: `site/src/jsMain/kotlin/com/binayshaw7777/kotfolio/AppEntry.kt` (Kobweb convention)
- **Pages**: `pages/` directory
- **Components**: `components/widgets/`, `components/sections/`, `components/layouts/`
- **Styles**: `components/styles/` and `AppStyles.kt`
- **Utilities**: `utils/`

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
