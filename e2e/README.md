# Covfolio Jelly Drift 3D — Headless Chrome CDP E2E Suite

Opaque-box 4-Tier E2E test harness driving real headless Google Chrome (`--headless=new` + SwiftShader WebGL2) over Chrome DevTools Protocol (`websocket-client`) against a local Kobweb static export server (`site/.kobweb/site/`).

## Prerequisites

- **Python**: `C:\Python314\python.exe` (`3.14.2`) with `websocket-client` (`1.9.2`)
- **Browser**: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- **Kobweb Export** (when testing updated `site/`):
  - `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`
  - `.\gradlew.bat :site:kobwebExport --no-daemon --console=plain` (or pass `--export`)

## Quick Commands

```powershell
# List all 126 registered tests & tier counts (no browser launched)
C:\Python314\python.exe e2e\run_e2e.py --list

# Run baseline '/' portfolio smoke check
C:\Python314\python.exe e2e\run_e2e.py --smoke --json e2e\artifacts\smoke.json

# Run full 126-test 4-Tier suite with 2 concurrent CDP worker contexts
C:\Python314\python.exe e2e\run_e2e.py --tier all --workers 2 --json e2e\artifacts\report.json

# Export Kobweb site first, then run Tier 1 & filter specific tests
C:\Python314\python.exe e2e\run_e2e.py --export --tier 1 --test T1-E1,T1-E6-01
```

## Architecture

- `e2e/server.py` — Multi-threaded static HTTP server (`127.0.0.1:0`) with forced MIME types (`.js`/`.mjs` -> `application/javascript`, `.wasm`, `.txt`, `.svg`, `.json`), Kobweb extensionless `<route>.html` + SPA fallback, `404` on missing assets, and `200 text/event-stream` for `/api/kobweb-status`.
- `e2e/cdp.py` — Ephemeral Chrome launcher (`DevToolsActivePort`), single browser-level WebSocket multiplexed via `Target.createBrowserContext` + `flatten=True` sessions, network blocking (`Network.setBlockedURLs`), runtime/console/log error capture, real mouse/keyboard/touch input dispatch, viewport emulation, screenshots, and guaranteed `Browser.close` + `taskkill` tree cleanup.
- `e2e/tests/smoke.py` — Baseline `/` portfolio & WebGL2 smoke tests (`SMOKE-01`, `SMOKE-02`).
- `e2e/tests/tier1_features.py` — **52** Feature Coverage tests (`E1`–`E10`).
- `e2e/tests/tier2_boundaries.py` — **52** Boundary & Corner Case tests (`E1`–`E10`).
- `e2e/tests/tier3_pairwise.py` — **16** Cross-Feature Pairwise tests (`T3-01`..`T3-16`).
- `e2e/tests/tier4_scenarios.py` — **6** Real-World End-to-End Scenarios (`T4-S1`..`T4-S6`), including opaque-box Lap-1 checkpoint-learning 3-lap Grand Prix driving (`T4-S2`).
- `e2e/artifacts/` — Gitignored runtime screenshots & JSON reports.
