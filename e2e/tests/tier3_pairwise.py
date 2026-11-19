"""Tier 3: Cross-Feature Pairwise Combination E2E Tests (16 tests: T3-01..T3-16)."""

from __future__ import annotations

import math
import time

from tests.helpers import (
    ADBLOCK_PATTERNS,
    TestCaseDef,
    TestContext,
    assert_drift_alive,
    assert_hidden_preserving_layout,
    assert_visibly_rendered,
    click_back_to_garage,
    click_mute_toggle,
    click_pause,
    click_resume,
    click_selector,
    click_visible_color_mode_button,
    click_visible_nav_link,
    complete_watch_ad_to_continue,
    ensure_garage,
    ensure_racing,
    get_snapshot,
    inspect_element,
    normalize_rect,
    open_drift,
    start_race,
    wait_for_drift_rush_timeout,
    wait_snapshot,
    wait_until,
)


def t3_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 1.2)
    saw_drift = False
    for c in ("KeyW", "KeyD", "Space"):
        s.key_down(c)
    try:
        for _ in range(15):
            time.sleep(0.1)
            snap = get_snapshot(s)
            if snap["isDrifting"]:
                saw_drift = True
    finally:
        for c in ("Space", "KeyD", "KeyW"):
            s.key_up(c)
    snap = get_snapshot(s)
    assert snap["trackId"] == "sunny_coast" and snap["carId"] == "tofu_86"
    assert saw_drift and snap["driftScore"] > 0 and snap["boostTier"] >= 1
    assert snap["adSlots"]["roof"]["visible"] is True


def t3_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="canyon_loop", car_id="bumble_buggy", mode_id="GRAND_PRIX", fresh_restart=True)
    rolls: list[float] = []
    bounces: list[float] = []
    s.key_down("KeyW")
    try:
        s.key_down("KeyA")
        for _ in range(10):
            time.sleep(0.15)
            js = get_snapshot(s)["jellySpring"]
            rolls.append(abs(float(js["rollDeg"])))
            bounces.append(abs(float(js["bounceY"])))
        s.key_up("KeyA")
        s.key_down("KeyD")
        for _ in range(10):
            time.sleep(0.15)
            js = get_snapshot(s)["jellySpring"]
            rolls.append(abs(float(js["rollDeg"])))
            bounces.append(abs(float(js["bounceY"])))
        s.key_up("KeyD")
    finally:
        s.key_up("KeyD")
        s.key_up("KeyA")
        s.key_up("KeyW")
    snap = get_snapshot(s)
    assert snap["trackId"] == "canyon_loop" and snap["carId"] == "bumble_buggy" and snap["aiCount"] == 4
    assert max(rolls) >= 1.5 and max(bounces) > 0.002


def t3_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="neon_circuit", car_id="cobalt_hyper", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 2.5)
    speed = get_snapshot(s)["speedKmh"]
    assert speed >= 70.0, f"cobalt_hyper expected >= 70 km/h, got {speed}"
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    assert snap["trackId"] == "neon_circuit" and snap["carId"] == "cobalt_hyper"
    assert snap["adSlots"]["console"]["visible"] is True
    assert snap["adSlots"]["roof"]["visible"] is False


def t3_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="canyon_loop", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 1.5)
    s.press_key("KeyV")
    snap_hood = wait_snapshot(s, lambda x: x["cameraMode"] == "HOOD", timeout=2.0, desc="HOOD")
    assert snap_hood["adSlots"]["roof"]["visible"] is False
    assert snap_hood["adSlots"]["console"]["visible"] is False
    s.hold_key("KeyW", 1.5)
    s.press_key("KeyC")
    snap_back = wait_snapshot(s, lambda x: x["cameraMode"] in ("CHASE", "DRIVER"), timeout=2.0, desc="leave HOOD")
    if snap_back["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        snap_back = wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    assert snap_back["adSlots"]["roof"]["visible"] is True


def t3_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 1.3)
    for c in ("KeyW", "KeyA", "Space"):
        s.key_down(c)
    try:
        wait_snapshot(s, lambda x: x["isDrifting"] is True, timeout=2.5, desc="active drift")
        score0 = float(get_snapshot(s)["driftScore"])
        assert get_snapshot(s)["adSlots"]["roof"]["visible"] is True

        s.press_key("KeyC")
        snap_drv = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=1.5, desc="DRIVER mid-drift")
        assert snap_drv["adSlots"]["roof"]["visible"] is False
        assert snap_drv["adSlots"]["console"]["visible"] is True
        time.sleep(0.8)
        assert float(get_snapshot(s)["speedKmh"]) > 30.0
        assert float(get_snapshot(s)["driftScore"]) > score0

        s.press_key("KeyC")
        snap_chs = wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=1.5, desc="CHASE mid-drift")
        assert snap_chs["adSlots"]["roof"]["visible"] is True
        assert snap_chs["adSlots"]["console"]["visible"] is False
    finally:
        for c in ("Space", "KeyA", "KeyW"):
            s.key_up(c)
    s.assert_no_fatal_errors("t3_05 mid-drift camera switch")


def t3_06(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
    wobbles = []
    s.key_down("KeyW")
    s.key_down("KeyD")
    try:
        for _ in range(16):
            time.sleep(0.12)
            snap = get_snapshot(s)
            r = normalize_rect(snap["adSlots"]["roof"]["rect"])
            assert 0 <= r["left"] and r["right"] <= 1280 and 0 <= r["top"] and r["bottom"] <= 720, r
            assert all(math.isfinite(float(v)) for v in snap["jellySpring"].values())
            wobbles.append(max(abs(float(snap["jellySpring"]["squash"])), abs(float(snap["jellySpring"]["rollDeg"]))))
    finally:
        s.key_up("KeyD")
        s.key_up("KeyW")
    assert snap["aiCount"] == 4 and max(wobbles) > 0.1


def t3_07(ctx: TestContext) -> None:
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH")
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    assert get_snapshot(s)["adSlots"]["adsenseBlocked"] is True
    snap = complete_watch_ad_to_continue(s, expected_min_continues=1, timeout_s=15.0)
    assert snap["continuesUsed"] == 1
    s.hold_keys(["KeyW", "KeyD", "Space"], 1.4)
    assert get_snapshot(s)["speedKmh"] > 30.0
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_selector(s, '[data-testid="restart-race-btn"]')
    snap_re = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING restart")
    assert snap_re["continuesUsed"] == 0 and snap_re["driftScore"] == 0


def t3_08(ctx: TestContext) -> None:
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('a[href=\"/drift\"]')"), timeout=10.0, desc="home nav")
    click_visible_nav_link(s, "/drift")
    assert_drift_alive(s)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")

    # Exit via back link or nav link to /#projects or /
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
    assert back is not None
    s.click_at(back["cx"], back["cy"])
    wait_until(lambda: s.eval_js("window.location.pathname === '/' && !!document.querySelector('#projects')"), timeout=10.0, desc="return to /")
    assert s.eval_js("window.__JELLY_DRIFT__ === undefined")

    click_visible_nav_link(s, "/drift")
    snap2 = assert_drift_alive(s)
    assert snap2["cameraMode"] == "CHASE"
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")


def t3_09(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    click_mute_toggle(s)
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=3.0, desc="RACING")
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    assert snap["adSlots"]["console"]["visible"] is True
    s.assert_no_fatal_errors("t3_09 mute+pause+camera")


def t3_10(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(
        s,
        ctx.base_url,
        query="?adtest=on&adslot_garage=1111111111&adslot_roof=2222222222&adslot_console=3333333333&adslot_continue=4444444444",
    )
    g_slot = s.eval_js("document.querySelector('#garage-ad-overlay ins.adsbygoogle')?.getAttribute('data-ad-slot')")
    assert g_slot == "1111111111", g_slot
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    slots = s.eval_js(
        """(() => ({
            roof: document.querySelector('#roof-ad-overlay ins.adsbygoogle')?.getAttribute('data-ad-slot'),
            roofTest: document.querySelector('#roof-ad-overlay ins.adsbygoogle')?.getAttribute('data-adtest'),
            con: document.querySelector('#console-ad-overlay ins.adsbygoogle')?.getAttribute('data-ad-slot'),
            conTest: document.querySelector('#console-ad-overlay ins.adsbygoogle')?.getAttribute('data-adtest'),
            cfgContinue: window.COVFOLIO_AD_CONFIG?.continueSlotId,
        }))()"""
    )
    assert slots["roof"] == "2222222222" and slots["roofTest"] == "on"
    assert slots["con"] == "3333333333" and slots["conTest"] == "on"
    assert slots["cfgContinue"] == "4444444444"


def t3_11(ctx: TestContext) -> None:
    s = ctx.session
    s.set_viewport(390, 844, device_scale_factor=2.0, mobile=True, has_touch=True)
    open_drift(s, ctx.base_url)
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
    assert throttle is not None, "Mobile touch throttle control not found in #jellydrift-hud-layer"
    s.touch_hold((throttle["cx"], throttle["cy"]), 1.6)
    snap1 = get_snapshot(s)
    p1 = snap1["playerWorldPos"]
    dist = math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"])
    assert snap1["speedKmh"] >= 20.0 and dist >= 5.0, f"Touch throttle failed: speed={snap1['speedKmh']}, dist={dist:.2f}"

    cam_btn = assert_visibly_rendered(s, '[data-testid="camera-toggle-btn"]')
    s.touch_tap(cam_btn["rect"]["left"] + cam_btn["rect"]["width"] / 2, cam_btn["rect"]["top"] + cam_btn["rect"]["height"] / 2)
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER via touch")
    c_info = assert_visibly_rendered(s, "#console-ad-overlay")
    assert c_info["rect"]["right"] <= 410


def t3_12(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="neon_circuit", car_id="tofu_86", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_keys(["KeyW", "KeyD", "Space"], 2.0)
    snap = get_snapshot(s)
    assert snap["playerWorldPos"]["y"] > -50.0
    assert snap["driftScore"] > 0
    r = normalize_rect(snap["adSlots"]["roof"]["rect"])
    assert 0 <= r["left"] and r["right"] <= 1280 and 0 <= r["top"] and r["bottom"] <= 720


def t3_13(ctx: TestContext) -> None:
    s = ctx.session
    snap1 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
    assert snap1["mode"] == "GRAND_PRIX" and snap1["totalLaps"] == 3
    s.hold_key("KeyW", 2.0)
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_back_to_garage(s)
    wait_snapshot(s, lambda x: x["phase"] == "GARAGE", timeout=4.0, desc="GARAGE")
    snap2 = start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    assert snap2["mode"] == "DRIFT_RUSH" and snap2["checkpointIndex"] == 0 and 30.0 <= snap2["timeRemainingSec"] <= 40.0


def t3_14(ctx: TestContext) -> None:
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('#projects')"), timeout=10.0, desc="home")
    click_visible_color_mode_button(s)
    time.sleep(0.2)
    click_visible_nav_link(s, "/drift")
    snap = assert_drift_alive(s)
    assert snap["phase"] == "GARAGE"
    assert s.eval_js("document.documentElement.scrollWidth <= 1280")


def t3_15(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    s.set_viewport(1024, 640)
    time.sleep(0.3)
    c_info = assert_visibly_rendered(s, "#console-ad-overlay")
    assert c_info["rect"]["right"] <= 1024 and c_info["rect"]["bottom"] <= 640, c_info["rect"]
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    time.sleep(0.2)
    r_info = assert_visibly_rendered(s, "#roof-ad-overlay")
    assert r_info["rect"]["right"] <= 1044 and r_info["rect"]["bottom"] <= 660, r_info["rect"]
    s.assert_no_fatal_errors("t3_15 resize driver->chase")


def t3_16(ctx: TestContext) -> None:
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    open_drift(s, ctx.base_url)
    g = assert_visibly_rendered(s, "#garage-ad-overlay")
    assert len(g["text"]) > 0
    snap = start_race(s, track_id="neon_circuit", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    assert snap["adSlots"]["tracksideCount"] >= 2
    s.hold_key("KeyW", 2.0)
    s.assert_no_fatal_errors("t3_16 adblock + trackside")


def get_tier3_tests() -> list[TestCaseDef]:
    return [
        TestCaseDef("T3-01", 3, "PAIRWISE", "sunny_coast x tofu_86 x DRIFT_RUSH drift+boost", "warm_t3_a", t3_01),
        TestCaseDef("T3-02", 3, "PAIRWISE", "canyon_loop x bumble_buggy x GRAND_PRIX spring", "warm_t3_a", t3_02),
        TestCaseDef("T3-03", 3, "PAIRWISE", "neon_circuit x cobalt_hyper x DRIVER console", "warm_t3_a", t3_03),
        TestCaseDef("T3-04", 3, "PAIRWISE", "canyon_loop x jelly_gt x HOOD camera", "warm_t3_a", t3_04),
        TestCaseDef("T3-05", 3, "PAIRWISE", "Mid-drift camera switch CHASE<->DRIVER", "warm_t3_b", t3_05),
        TestCaseDef("T3-06", 3, "PAIRWISE", "AI collision + jelly bounce + roof projection", "warm_t3_b", t3_06),
        TestCaseDef("T3-07", 3, "PAIRWISE", "AdBlock + timeout -> Continue -> Boost -> Restart", "isolated", t3_07),
        TestCaseDef("T3-08", 3, "PAIRWISE", "Cross-route cycle / -> /drift -> /#projects -> /drift", "isolated", t3_08),
        TestCaseDef("T3-09", 3, "PAIRWISE", "Audio mute + Pause/Resume + Camera switch", "warm_t3_b", t3_09),
        TestCaseDef("T3-10", 3, "PAIRWISE", "Query slot overrides across all 4 DOM placements", "isolated", t3_10),
        TestCaseDef("T3-11", 3, "PAIRWISE", "Mobile 390x844 touch controls + camera toggle", "isolated", t3_11),
        TestCaseDef("T3-12", 3, "PAIRWISE", "High-speed wall ride + drift score + boost", "warm_t3_b", t3_12),
        TestCaseDef("T3-13", 3, "PAIRWISE", "GRAND_PRIX -> Pause -> Garage -> DRIFT_RUSH", "warm_t3_b", t3_13),
        TestCaseDef("T3-14", 3, "PAIRWISE", "Theme toggle on / + navigate to /drift", "isolated", t3_14),
        TestCaseDef("T3-15", 3, "PAIRWISE", "Viewport resize in DRIVER -> switch to CHASE", "isolated", t3_15),
        TestCaseDef("T3-16", 3, "PAIRWISE", "AdBlock + Garage ad + Trackside billboards", "isolated", t3_16),
    ]
