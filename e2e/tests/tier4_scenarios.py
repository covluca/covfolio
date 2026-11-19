"""Tier 4: Real-World End-to-End Application Scenario Tests (6 tests: T4-S1..T4-S6)."""

from __future__ import annotations

import math
import time

from tests.helpers import (
    ADBLOCK_PATTERNS,
    PUBLISHER_ID_CA,
    TestCaseDef,
    TestContext,
    assert_drift_alive,
    assert_hidden_preserving_layout,
    assert_visibly_rendered,
    click_back_to_garage,
    click_pause,
    click_rematch_or_restart,
    click_selector,
    click_visible_nav_link,
    complete_watch_ad_to_continue,
    drive_laps_opaque_box,
    get_snapshot,
    inspect_element,
    open_drift,
    start_race,
    wait_for_drift_rush_timeout,
    wait_snapshot,
    wait_until,
)


def t4_s1(ctx: TestContext) -> None:
    """S1: Full Drift Rush Run -> Timeout -> Watch Ad to Continue -> Boost & Score -> Restart."""
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH")
    assert get_snapshot(s)["adSlots"]["roof"]["visible"] is True

    # Initial driving & drift
    s.hold_key("KeyW", 1.3)
    s.hold_keys(["KeyW", "KeyD", "Space"], 1.7)
    score1 = float(get_snapshot(s)["driftScore"])
    assert score1 > 0, f"Expected initial driftScore > 0, got {score1}"

    # Wait out DRIFT_RUSH clock -> CONTINUE_OFFER -> Watch Ad -> Continue
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    snap_cont = complete_watch_ad_to_continue(s, expected_min_continues=1, timeout_s=15.0)
    assert snap_cont["continuesUsed"] == 1 and snap_cont["timeRemainingSec"] >= 18.0

    # Post-continue drift & turbo boost release
    s.hold_keys(["KeyW", "KeyA", "Space"], 1.5)
    assert get_snapshot(s)["speedKmh"] > 30.0
    score2 = float(get_snapshot(s)["driftScore"])
    assert score2 > score1, f"Expected driftScore to grow post-continue: {score1} -> {score2}"

    # Pause -> Restart
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_selector(s, '[data-testid="restart-race-btn"]')
    snap_end = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING after restart")
    assert snap_end["continuesUsed"] == 0 and snap_end["driftScore"] == 0
    s.assert_no_fatal_errors("T4-S1")


def t4_s2(ctx: TestContext) -> None:
    """S2: Full 3-Lap Grand Prix Race vs 4 AI Opponents -> Podium Finish & Rematch."""
    s = ctx.session
    open_drift(s, ctx.base_url)
    snap0 = start_race(s, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="GRAND_PRIX")
    assert snap0["aiCount"] == 4 and snap0["totalLaps"] == 3

    snap_fin = drive_laps_opaque_box(s, target_laps=3, timeout_s=160.0)
    if snap_fin["phase"] != "FINISHED":
        snap_fin = wait_snapshot(s, lambda x: x["phase"] == "FINISHED", timeout=10.0, desc="FINISHED")

    assert snap_fin["aiCount"] == 4
    p_info = assert_visibly_rendered(s, "#podium-ad-overlay")
    assert p_info["rect"]["width"] >= 250 and p_info["rect"]["height"] >= 200, p_info["rect"]
    client = s.eval_js("document.querySelector('#podium-ad-overlay ins.adsbygoogle')?.getAttribute('data-ad-client')")
    assert client == PUBLISHER_ID_CA, f"Podium ad client mismatch: {client}"

    click_rematch_or_restart(s)
    snap_re = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING after rematch")
    assert snap_re["lap"] == 1 and snap_re["driftScore"] == 0
    s.assert_no_fatal_errors("T4-S2")


def t4_s3(ctx: TestContext) -> None:
    """S3: Multi-Track & Multi-Car Showcase Switching Camera Views."""
    s = ctx.session
    open_drift(s, ctx.base_url)

    # 1. sunny_coast + jelly_gt: CHASE -> DRIVER -> HOOD -> CHASE
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.key_down("KeyW")
    try:
        time.sleep(0.8)
        assert get_snapshot(s)["adSlots"]["roof"]["visible"] is True
        assert get_snapshot(s)["adSlots"]["console"]["visible"] is False

        s.press_key("KeyC")
        snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
        assert snap["adSlots"]["console"]["visible"] is True and snap["adSlots"]["roof"]["visible"] is False

        s.press_key("KeyV")
        snap = wait_snapshot(s, lambda x: x["cameraMode"] == "HOOD", timeout=2.0, desc="HOOD")
        assert snap["adSlots"]["console"]["visible"] is False and snap["adSlots"]["roof"]["visible"] is False

        s.press_key("KeyC")
        snap = wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
        assert snap["adSlots"]["roof"]["visible"] is True and snap["adSlots"]["console"]["visible"] is False
    finally:
        s.key_up("KeyW")

    # 2. canyon_loop + bumble_buggy
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_back_to_garage(s)
    wait_snapshot(s, lambda x: x["phase"] == "GARAGE", timeout=4.0, desc="GARAGE")
    start_race(s, track_id="canyon_loop", car_id="bumble_buggy", mode_id="GRAND_PRIX")
    s.hold_key("KeyW", 1.5)
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    assert snap["fps"] > 0 and snap["adSlots"]["console"]["visible"] is True

    # 3. neon_circuit + tofu_86
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_back_to_garage(s)
    wait_snapshot(s, lambda x: x["phase"] == "GARAGE", timeout=4.0, desc="GARAGE")
    start_race(s, track_id="neon_circuit", car_id="tofu_86", mode_id="DRIFT_RUSH")
    s.hold_keys(["KeyW", "KeyD", "Space"], 1.5)
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    assert snap["adSlots"]["console"]["visible"] is True and snap["adSlots"]["roof"]["visible"] is False
    s.assert_no_fatal_errors("T4-S3")


def t4_s4(ctx: TestContext) -> None:
    """S4: Ad-Blocked Public Visitor Full Gameplay + Continue Journey."""
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('#projects')"), timeout=10.0, desc="home")

    cta = s.eval_js(
        """(() => {
            const cands = Array.from(document.querySelectorAll('[data-testid*="play-drift"], [data-testid*="jelly-drift"], a[href="/drift"]'));
            const el = cands.find(e => !e.closest('header, nav') && e.getBoundingClientRect().width > 0)
                || cands.find(e => e.getBoundingClientRect().width > 0);
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        })()"""
    )
    assert cta is not None, "Play Jelly Drift CTA not found on /"
    time.sleep(0.1)
    s.click_at(cta["cx"], cta["cy"])
    assert_drift_alive(s)

    wait_until(lambda: s.eval_js("window.__COVFOLIO_ADS__?.isBlocked() === true"), timeout=5.0, desc="adblock detected")
    assert len(assert_visibly_rendered(s, "#garage-ad-overlay")["text"]) > 0

    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    assert len(assert_visibly_rendered(s, "#roof-ad-overlay")["text"]) > 0
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    assert len(assert_visibly_rendered(s, "#console-ad-overlay")["text"]) > 0
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")

    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    snap_cont = complete_watch_ad_to_continue(s, expected_min_continues=1, timeout_s=15.0)
    assert snap_cont["continuesUsed"] == 1
    s.hold_key("KeyW", 1.5)
    assert get_snapshot(s)["speedKmh"] > 30.0
    s.assert_no_fatal_errors("T4-S4")


def t4_s5(ctx: TestContext) -> None:
    """S5: Fresh Portfolio Visitor Landing on '/' -> Play CTA -> '/drift' -> Returning via NavHeader."""
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('#home') && !!document.querySelector('#projects')"), timeout=10.0, desc="home")

    cta = s.eval_js(
        """(() => {
            const cands = Array.from(document.querySelectorAll('[data-testid*="play-drift"], [data-testid*="jelly-drift"], a[href="/drift"]'));
            const el = cands.find(e => !e.closest('header, nav') && e.getBoundingClientRect().width > 0)
                || cands.find(e => e.getBoundingClientRect().width > 0);
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        })()"""
    )
    assert cta is not None
    time.sleep(0.1)
    s.click_at(cta["cx"], cta["cy"])
    assert_drift_alive(s)

    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.hold_key("KeyW", 1.5)
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")

    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    back = s.eval_js(
        """(() => {
            for (const sel of ['a[href="/#projects"]', '[data-testid="back-portfolio-btn"]', 'a[href="/"]']) {
                for (const el of document.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none') {
                        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
                    }
                }
            }
            return null;
        })()"""
    )
    assert back is not None, "No back-to-portfolio link found"
    s.click_at(back["cx"], back["cy"])
    wait_until(lambda: s.eval_js("window.location.pathname === '/' && !!document.querySelector('#about')"), timeout=10.0, desc="back on /")
    assert s.eval_js("window.__JELLY_DRIFT__ === undefined")
    click_visible_nav_link(s, "/#about")
    time.sleep(0.5)
    s.assert_no_fatal_errors("T4-S5")


def t4_s6(ctx: TestContext) -> None:
    """S6: Narrow/Mobile Viewport (390x844) Public Visitor Session with Touch Controls."""
    s = ctx.session
    s.set_viewport(390, 844, device_scale_factor=2.0, mobile=True, has_touch=True)
    open_drift(s, ctx.base_url)
    assert s.eval_js("document.documentElement.scrollWidth <= 390"), "Horizontal overflow in Garage"

    snap0 = start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    p0 = snap0["playerWorldPos"]

    throttle = s.eval_js(
        """(() => {
            const sels = ['[data-testid="touch-throttle"]', '[data-testid*="throttle"]', '[data-testid*="gas"]'];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (el) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
                }
            }
            const btns = Array.from(document.querySelectorAll('#jellydrift-hud-layer button'));
            const match = btns.find(b => /gas|throttle|accel|go|▲|↑/i.test((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '')));
            if (!match) return null;
            const r = match.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        })()"""
    )
    assert throttle is not None, "Touch throttle missing on mobile"
    s.touch_hold((throttle["cx"], throttle["cy"]), 2.0)
    snap1 = get_snapshot(s)
    p1 = snap1["playerWorldPos"]
    assert snap1["speedKmh"] >= 20.0 and math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"]) >= 5.0

    # Check roof ad inside 390x844
    r_info = assert_visibly_rendered(s, "#roof-ad-overlay")
    assert r_info["rect"]["right"] <= 410

    # Tap camera toggle -> DRIVER -> check console ad -> back to CHASE
    cam_btn = assert_visibly_rendered(s, '[data-testid="camera-toggle-btn"]')
    s.touch_tap(cam_btn["rect"]["left"] + cam_btn["rect"]["width"] / 2, cam_btn["rect"]["top"] + cam_btn["rect"]["height"] / 2)
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    c_info = assert_visibly_rendered(s, "#console-ad-overlay")
    assert c_info["rect"]["right"] <= 410
    s.touch_tap(cam_btn["rect"]["left"] + cam_btn["rect"]["width"] / 2, cam_btn["rect"]["top"] + cam_btn["rect"]["height"] / 2)
    wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")

    # Tap Pause -> Restart
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    rst = assert_visibly_rendered(s, '[data-testid="restart-race-btn"]')
    s.touch_tap(rst["rect"]["left"] + rst["rect"]["width"] / 2, rst["rect"]["top"] + rst["rect"]["height"] / 2)
    wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING after mobile restart")
    s.assert_no_fatal_errors("T4-S6")


def get_tier4_tests() -> list[TestCaseDef]:
    return [
        TestCaseDef("T4-S1", 4, "SCENARIO", "S1: Drift Rush -> Timeout -> Watch Ad Continue -> Boost -> Restart", "isolated", t4_s1),
        TestCaseDef("T4-S2", 4, "SCENARIO", "S2: Full 3-Lap Grand Prix vs 4 AI -> Podium & Rematch", "isolated", t4_s2),
        TestCaseDef("T4-S3", 4, "SCENARIO", "S3: Multi-Track & Multi-Car Showcase with Camera Switching", "isolated", t4_s3),
        TestCaseDef("T4-S4", 4, "SCENARIO", "S4: Ad-Blocked Visitor Full Gameplay + Continue Journey", "isolated", t4_s4),
        TestCaseDef("T4-S5", 4, "SCENARIO", "S5: Fresh Visitor / -> Play CTA -> /drift -> NavHeader Return", "isolated", t4_s5),
        TestCaseDef("T4-S6", 4, "SCENARIO", "S6: Mobile 390x844 Touch Controls & Ad Layout Journey", "isolated", t4_s6),
    ]
