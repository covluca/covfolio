"""CLI runner for Covfolio Jelly Drift 3D headless Chrome CDP E2E test suite."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import sys
import threading
import time
import traceback
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

E2E_DIR = Path(__file__).resolve().parent
REPO_ROOT = E2E_DIR.parent
DEFAULT_SITE_DIR = REPO_ROOT / "site" / ".kobweb" / "site"
DEFAULT_ARTIFACTS_DIR = E2E_DIR / "artifacts"
DEFAULT_JAVA_HOME = r"C:\Program Files\Android\Android Studio\jbr"

if str(E2E_DIR) not in sys.path:
    sys.path.insert(0, str(E2E_DIR))

from cdp import ChromeBrowser, CDPSession  # noqa: E402
from server import StaticSiteServer  # noqa: E402
from tests.helpers import TestCaseDef, TestContext  # noqa: E402
from tests.smoke import get_smoke_tests  # noqa: E402
from tests.tier1_features import get_tier1_tests  # noqa: E402
from tests.tier2_boundaries import get_tier2_tests  # noqa: E402
from tests.tier3_pairwise import get_tier3_tests  # noqa: E402
from tests.tier4_scenarios import get_tier4_tests  # noqa: E402


@dataclass
class TestResult:
    test_id: str
    tier: int
    feature: str
    name: str
    status: str  # "PASS" | "FAIL"
    duration_s: float
    error: Optional[str] = None
    screenshot: Optional[str] = None


def collect_tier_tests() -> list[TestCaseDef]:
    return [
        *get_tier1_tests(),
        *get_tier2_tests(),
        *get_tier3_tests(),
        *get_tier4_tests(),
    ]


def _token_matches(tid: str, tok: str) -> bool:
    if tok.endswith("*"):
        return tid.startswith(tok[:-1])
    if tok.endswith("-"):
        return tid.startswith(tok)
    return tid == tok or tid.startswith(tok + "-")


def filter_tests(tests: list[TestCaseDef], test_filter: Optional[str]) -> list[TestCaseDef]:
    if not test_filter:
        return tests
    tokens = [t.strip().upper() for t in test_filter.split(",") if t.strip()]
    matched: list[TestCaseDef] = []
    for tc in tests:
        tid = tc.test_id.upper()
        if any(_token_matches(tid, tok) for tok in tokens):
            matched.append(tc)
    return matched


def run_kobweb_export(repo_root: Path) -> None:
    gradlew = repo_root / "gradlew.bat"
    if not gradlew.is_file():
        raise FileNotFoundError(f"gradlew.bat not found at {gradlew}")
    env = os.environ.copy()
    if Path(DEFAULT_JAVA_HOME).is_dir():
        env["JAVA_HOME"] = DEFAULT_JAVA_HOME
        env["PATH"] = f"{DEFAULT_JAVA_HOME}\\bin;{env.get('PATH', '')}"
    cmd = [str(gradlew), ":site:kobwebExport", "--no-daemon", "--console=plain"]
    print(f"[export] Running: {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=str(repo_root), env=env, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f":site:kobwebExport failed with exit code {proc.returncode}")


def _capture_screenshot_safe(session: Optional[CDPSession], out_path: Path) -> Optional[str]:
    if session is None:
        return None
    try:
        saved = session.screenshot(out_path)
        return str(saved)
    except Exception:
        return None


def _execute_work_unit(
    unit: list[TestCaseDef],
    browser: ChromeBrowser,
    server: StaticSiteServer,
    screenshots_mode: str,
    artifacts_dir: Path,
    print_lock: threading.Lock,
) -> list[TestResult]:
    results: list[TestResult] = []
    is_warm_group = len(unit) > 0 and unit[0].group != "isolated"
    warm_session: Optional[CDPSession] = None

    try:
        for tc in unit:
            t0 = time.monotonic()
            session: Optional[CDPSession] = None
            ctx: Optional[TestContext] = None
            passed = False
            err_msg: Optional[str] = None
            shot_path: Optional[str] = None

            try:
                if is_warm_group:
                    if warm_session is None:
                        warm_session = browser.new_session()
                    else:
                        warm_session.clear_errors()
                        warm_session.clear_blocked_urls()
                    session = warm_session
                else:
                    session = browser.new_session()

                ctx = TestContext(
                    browser=browser,
                    server=server,
                    session=session,
                    base_url=server.base_url,
                )
                tc.fn(ctx)
                session.assert_no_fatal_errors(tc.test_id)
                passed = True
                if screenshots_mode == "all":
                    shot_path = _capture_screenshot_safe(session, artifacts_dir / f"{tc.test_id}.png")
            except Exception as exc:
                err_msg = f"{type(exc).__name__}: {exc}"
                if screenshots_mode in ("on-fail", "all"):
                    shot_path = _capture_screenshot_safe(session, artifacts_dir / f"{tc.test_id}_FAIL.png")
                if os.environ.get("E2E_VERBOSE"):
                    traceback.print_exc()
                # Never reuse a dirty warm session after a failure
                if is_warm_group and warm_session is not None:
                    try:
                        warm_session.close()
                    except Exception:
                        pass
                    warm_session = None
            finally:
                if ctx is not None:
                    ctx.cleanup_extra_sessions()
                if not is_warm_group and session is not None:
                    try:
                        session.close()
                    except Exception:
                        pass

            dt = time.monotonic() - t0
            res = TestResult(
                test_id=tc.test_id,
                tier=tc.tier,
                feature=tc.feature,
                name=tc.name,
                status="PASS" if passed else "FAIL",
                duration_s=round(dt, 3),
                error=err_msg,
                screenshot=shot_path,
            )
            results.append(res)
            with print_lock:
                badge = "PASS" if passed else "FAIL"
                line = f"[{badge}] {tc.test_id:<10} ({dt:5.2f}s) {tc.name}"
                if err_msg:
                    line += f"\n       -> {err_msg}"
                if shot_path:
                    line += f"\n       -> screenshot: {shot_path}"
                print(line, flush=True)
    finally:
        if warm_session is not None:
            try:
                warm_session.close()
            except Exception:
                pass

    return results


def _build_work_units(tests: list[TestCaseDef]) -> list[list[TestCaseDef]]:
    units: list[list[TestCaseDef]] = []
    warm_buckets: dict[str, list[TestCaseDef]] = {}
    for tc in tests:
        if tc.group == "isolated":
            units.append([tc])
        else:
            if tc.group not in warm_buckets:
                bucket: list[TestCaseDef] = []
                warm_buckets[tc.group] = bucket
                units.append(bucket)
            warm_buckets[tc.group].append(tc)
    return units


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Covfolio Jelly Drift 3D Headless Chrome CDP E2E Runner")
    p.add_argument("--smoke", action="store_true", help="Run baseline '/' portfolio smoke tests")
    p.add_argument("--tier", choices=["1", "2", "3", "4", "all"], default=None, help="Run Tier 1/2/3/4 or all")
    p.add_argument("--test", default=None, help="Comma-separated test IDs or prefixes (e.g. T1-E1,T1-E6-01)")
    p.add_argument("--list", action="store_true", help="List all registered tests and tier counts without running")
    p.add_argument("--export", action="store_true", help="Run :site:kobwebExport before executing tests")
    p.add_argument("--site-dir", default=str(DEFAULT_SITE_DIR), help="Path to exported Kobweb static site dir")
    p.add_argument("--workers", type=int, choices=[1, 2], default=1, help="Concurrent CDP worker contexts (1 or 2)")
    p.add_argument("--json", dest="json_path", default=None, help="Write JSON summary report to path")
    p.add_argument("--screenshots", choices=["none", "on-fail", "all"], default="on-fail", help="Screenshot policy")
    p.add_argument("--artifacts-dir", default=str(DEFAULT_ARTIFACTS_DIR), help="Directory for screenshots/reports")
    return p.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    all_tier_tests = collect_tier_tests()

    if args.list:
        listed = list(all_tier_tests)
        if args.tier is not None and args.tier != "all":
            t_num = int(args.tier)
            listed = [tc for tc in listed if tc.tier == t_num]
        listed = filter_tests(listed, args.test)
        by_tier = {1: 0, 2: 0, 3: 0, 4: 0}
        for tc in listed:
            by_tier[tc.tier] = by_tier.get(tc.tier, 0) + 1
            print(f"Tier {tc.tier} | {tc.test_id:<10} | {tc.feature:<8} | {tc.group:<16} | {tc.name}")
        print("\n--- Tier Counts ---")
        for t in (1, 2, 3, 4):
            print(f"Tier {t}: {by_tier[t]}")
        print(f"Total: {sum(by_tier.values())}")
        return 0

    selected: list[TestCaseDef] = []
    if args.smoke:
        selected.extend(get_smoke_tests())

    if args.tier is not None:
        if args.tier == "all":
            selected.extend(all_tier_tests)
        else:
            t_num = int(args.tier)
            selected.extend([tc for tc in all_tier_tests if tc.tier == t_num])
    elif not args.smoke:
        # Default if neither --smoke nor --tier passed: if --test passed, filter across all tier tests; else run all
        selected.extend(all_tier_tests)

    selected = filter_tests(selected, args.test)
    if not selected:
        print("No tests matched selection criteria.", file=sys.stderr)
        return 2

    if args.export:
        run_kobweb_export(REPO_ROOT)

    site_dir = Path(args.site_dir).resolve()
    artifacts_dir = Path(args.artifacts_dir).resolve()
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    print(f"[e2e] Serving {site_dir}")
    print(f"[e2e] Running {len(selected)} test(s) with workers={args.workers}...")
    t_suite_start = time.monotonic()

    all_results: list[TestResult] = []
    print_lock = threading.Lock()
    units = _build_work_units(selected)

    with StaticSiteServer(site_dir) as server:
        with ChromeBrowser() as browser:
            if args.workers == 1 or len(units) <= 1:
                for unit in units:
                    all_results.extend(
                        _execute_work_unit(unit, browser, server, args.screenshots, artifacts_dir, print_lock)
                    )
            else:
                with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
                    futures = [
                        pool.submit(
                            _execute_work_unit,
                            unit,
                            browser,
                            server,
                            args.screenshots,
                            artifacts_dir,
                            print_lock,
                        )
                        for unit in units
                    ]
                    for fut in concurrent.futures.as_completed(futures):
                        all_results.extend(fut.result())

    # Preserve original test order in final report
    order_index = {tc.test_id: i for i, tc in enumerate(selected)}
    all_results.sort(key=lambda r: order_index.get(r.test_id, 999999))

    suite_dt = round(time.monotonic() - t_suite_start, 3)
    passed_cnt = sum(1 for r in all_results if r.status == "PASS")
    failed_cnt = len(all_results) - passed_cnt

    print("\n================ E2E SUMMARY ================")
    print(f"Total: {len(all_results)} | Passed: {passed_cnt} | Failed: {failed_cnt} | Time: {suite_dt:.2f}s")
    if failed_cnt:
        print("Failed tests:")
        for r in all_results:
            if r.status == "FAIL":
                print(f"  - {r.test_id}: {r.error}")

    if args.json_path:
        out_json = Path(args.json_path)
        out_json.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "total": len(all_results),
            "passed": passed_cnt,
            "failed": failed_cnt,
            "duration_s": suite_dt,
            "results": [asdict(r) for r in all_results],
        }
        out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"JSON report written to {out_json}")

    return 0 if failed_cnt == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
