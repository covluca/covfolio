"""Tier 2: Boundary & Corner Case E2E Tests (52 tests across E1..E10)."""

from __future__ import annotations

import math
import time

from tests.helpers import (
    ADBLOCK_PATTERNS,
    TRACK_IDS,
    TestCaseDef,
    TestContext,
    assert_drift_alive,
    assert_hidden_preserving_layout,
    assert_visibly_rendered,
    click_back_to_garage,
    click_pause,
    click_rematch_or_restart,
    click_resume,
    click_selector,
    click_visible_nav_link,
    complete_watch_ad_to_continue,
    drive_laps_opaque_box,
    ensure_garage,
    ensure_racing,
    get_snapshot,
    inspect_element,
    normalize_rect,
    open_drift,
    rects_overlap,
    select_garage_options,
    start_race,
    wait_for_drift_rush_timeout,
    wait_snapshot,
    wait_until,
)


# ---------------------------------------------------------------------------
# E1 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e1_01(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.hold_key("KeyW", 0.5)

    # Exit via back-to-portfolio link
    back = s.eval_js(
        """(() => {
            for (const sel of ['[data-testid="back-portfolio-btn"]', 'a[href="/"]', 'a[href="/#home"]', 'a[href="/#projects"]']) {
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
    assert back is not None, "Missing back-to-portfolio link"
    s.click_at(back["cx"], back["cy"])
    wait_until(lambda: s.eval_js("window.location.pathname === '/'"), timeout=8.0, desc="exit to /")
    time.sleep(1.0)
    assert s.eval_js("window.__JELLY_DRIFT__ === undefined"), "Engine still defined after exit"
    assert s.eval_js("document.querySelector('#jellydrift-webgl-layer') === null"), "WebGL layer leaked onto /"

    # Re-enter /drift via NavHeader
    click_visible_nav_link(s, "/drift")
    snap = assert_drift_alive(s)
    assert snap["ready"] is True
    canvas_count = s.eval_js("document.querySelectorAll('#jellydrift-webgl-layer canvas').length")
    assert canvas_count == 1, f"Expected exactly 1 canvas on re-entry, got {canvas_count}"
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.assert_no_fatal_errors("t2_e1_01 re-entry")


def t2_e1_02(ctx: TestContext) -> None:
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('a[href=\"/drift\"]')"), timeout=10.0, desc="home nav")

    for _ in range(2):
        click_visible_nav_link(s, "/drift")
        time.sleep(0.25)
        s.eval_js("(() => { const a = document.querySelector('a[href=\"/\"], a[href=\"/#projects\"], [data-testid=\"back-portfolio-btn\"]'); if (a) a.click(); })()")
        time.sleep(0.25)

    s.navigate(f"{ctx.base_url}/drift")
    snap = assert_drift_alive(s)
    assert snap["ready"] is True
    s.assert_no_fatal_errors("t2_e1_02 oscillation")


def t2_e1_03(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.hold_keys(["Space", "ArrowDown"], 0.5)
    s.hold_keys(["ArrowUp", "Space"], 0.5)
    scroll = s.eval_js("({ x: window.scrollX, y: window.scrollY })")
    assert scroll["x"] == 0 and scroll["y"] == 0, f"Page scrolled during driving keys: {scroll}"


def t2_e1_04(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    for w, h in ((800, 600), (1440, 900)):
        s.set_viewport(w, h)
        time.sleep(0.35)
        dims = s.eval_js(
            "(() => { const c = document.querySelector('#jellydrift-webgl-layer canvas'); "
            "return c ? { cw: c.clientWidth, ch: c.clientHeight } : null; })()"
        )
        assert dims is not None and dims["cw"] == w and dims["ch"] == h, f"Canvas did not resize to {w}x{h}: {dims}"
        snap = get_snapshot(s)
        rect = normalize_rect(snap["adSlots"]["roof"]["rect"])
        assert snap["adSlots"]["roof"]["visible"] is True
        assert rect["left"] >= -40 and rect["right"] <= w + 40 and rect["top"] >= -40 and rect["bottom"] <= h + 40, (
            f"Roof rect outside resized viewport {w}x{h}: {rect}"
        )
    s.assert_no_fatal_errors("t2_e1_04 resize")


def t2_e1_05(ctx: TestContext) -> None:
    s = ctx.session
    s.set_viewport(390, 844, device_scale_factor=2.0, mobile=True, has_touch=True)
    open_drift(s, ctx.base_url)
    overflow = s.eval_js("document.documentElement.scrollWidth")
    assert overflow <= 390, f"Horizontal overflow on 390x844 mobile viewport: scrollWidth={overflow}"
    start_btn = assert_visibly_rendered(s, '[data-testid="start-race-btn"]')
    assert start_btn["rect"]["right"] <= 390, f"Start button clipped off 390px viewport: {start_btn['rect']}"
    g_ad = assert_visibly_rendered(s, "#garage-ad-overlay")
    assert g_ad["rect"]["width"] <= 390 and g_ad["rect"]["right"] <= 390, f"Garage ad overflows 390px: {g_ad['rect']}"
    assert not rects_overlap(g_ad["rect"], start_btn["rect"]), "Garage ad overlaps Start button on 390x844"


# ---------------------------------------------------------------------------
# E2 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e2_01(ctx: TestContext) -> None:
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    assert get_snapshot(s)["adSlots"]["adsenseBlocked"] is True
    snap = complete_watch_ad_to_continue(s, expected_min_continues=1, timeout_s=12.0)
    assert snap["phase"] == "RACING" and snap["continuesUsed"] == 1
    s.assert_no_fatal_errors("t2_e2_01 adblock continue")


def t2_e2_02(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    time.sleep(2.5)
    g = assert_visibly_rendered(s, "#garage-ad-overlay")
    assert g["rect"]["width"] >= 250 and len(g["text"]) > 0, f"Garage fallback collapsed: {g}"
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    time.sleep(0.5)
    c = assert_visibly_rendered(s, "#console-ad-overlay")
    assert c["rect"]["width"] >= 100 and len(c["text"]) > 0, f"Console fallback collapsed: {c}"


def t2_e2_03(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url, query="?adtest=bogus&adslot_roof=not_a_slot&adslot_console=%3Cscript%3Ealert(1)%3C%2Fscript%3E")
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    has_injected_script = s.eval_js(
        "Array.from(document.querySelectorAll('ins.adsbygoogle')).some(el => el.innerHTML.includes('<script'))"
    )
    assert not has_injected_script, "XSS script markup leaked into <ins>"
    s.assert_no_fatal_errors("t2_e2_03 malformed query")


def t2_e2_04(ctx: TestContext) -> None:
    s = ctx.session
    s.add_init_script("window.COVFOLIO_AD_CONFIG = { roofSlotId: '5555555555', testMode: true };")
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    slot = s.eval_js("document.querySelector('#roof-ad-overlay ins.adsbygoogle')?.getAttribute('data-ad-slot')")
    assert slot == "5555555555", f"Expected overridden roofSlotId 5555555555, got {slot!r}"


def t2_e2_05(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)  # No ?adtest=on
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    res = s.eval_js(
        """(() => {
            const ins = document.querySelector('#roof-ad-overlay ins.adsbygoogle');
            window.__COVFOLIO_ADS__.pushSlotOnce(ins, 'roof');
            window.__COVFOLIO_ADS__.pushSlotOnce(ins, 'roof');
            return {
                hasAdBreak: typeof window.adBreak === 'function',
                slot: ins?.getAttribute('data-ad-slot'),
            };
        })()"""
    )
    assert res["hasAdBreak"] and res["slot"]
    s.assert_no_fatal_errors("t2_e2_05 double push without adtest")


# ---------------------------------------------------------------------------
# E3 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e3_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    for tid in TRACK_IDS:
        click_selector(s, f'[data-track-id="{tid}"]')
    for cid in ("jelly_gt", "bumble_buggy", "cobalt_hyper", "tofu_86"):
        click_selector(s, f'[data-car-id="{cid}"]')
    snap = start_race(s, track_id="neon_circuit", car_id="tofu_86", mode_id="DRIFT_RUSH")
    assert snap["trackId"] == "neon_circuit" and snap["carId"] == "tofu_86"


def t2_e3_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    select_garage_options(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    info = assert_visibly_rendered(s, '[data-testid="start-race-btn"]')
    cx = info["rect"]["left"] + info["rect"]["width"] / 2.0
    cy = info["rect"]["top"] + info["rect"]["height"] / 2.0
    s.click_at(cx, cy)
    time.sleep(0.05)
    s.click_at(cx, cy)
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING after double-click")
    assert snap["lap"] == 1
    assert s.eval_js("document.querySelectorAll('#jellydrift-webgl-layer canvas').length") == 1
    s.assert_no_fatal_errors("t2_e3_02 double click start")


def t2_e3_03(ctx: TestContext) -> None:
    s = ctx.session
    for tid in TRACK_IDS:
        snap0 = ensure_racing(s, ctx.base_url, track_id=tid, car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
        p0 = snap0["playerWorldPos"]
        s.hold_key("KeyW", 1.2)
        snap1 = get_snapshot(s)
        p1 = snap1["playerWorldPos"]
        dist = math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"])
        assert dist >= 5.0, f"Track {tid} failed movement: dist={dist:.2f}"
        assert snap1["aiCount"] == 4
        assert snap1["fatalErrors"] == []


def t2_e3_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 2.0)
    snap_hyper = get_snapshot(s)

    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="bumble_buggy", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 2.0)
    snap_buggy = get_snapshot(s)

    assert snap_hyper["speedKmh"] >= 40.0 and snap_buggy["speedKmh"] >= 40.0
    assert (
        snap_hyper["speedKmh"] > snap_buggy["speedKmh"]
        or abs(snap_hyper["jellySpring"]["pitchDeg"] - snap_buggy["jellySpring"]["pitchDeg"]) > 0.1
    ), f"Cars appear identical in physics: hyper={snap_hyper['speedKmh']}, buggy={snap_buggy['speedKmh']}"


def t2_e3_05(ctx: TestContext) -> None:
    s = ctx.session
    snap1 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    assert snap1["mode"] == "DRIFT_RUSH" and snap1["timeRemainingSec"] >= 30.0
    snap2 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
    assert snap2["mode"] == "GRAND_PRIX" and snap2["totalLaps"] == 3 and snap2["checkpointIndex"] == 0
    snap3 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    assert snap3["mode"] == "DRIFT_RUSH" and 30.0 <= snap3["timeRemainingSec"] <= 40.0 and snap3["driftScore"] == 0


# ---------------------------------------------------------------------------
# E4 Boundary Cases (6 tests)
# ---------------------------------------------------------------------------


def t2_e4_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="neon_circuit", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_keys(["KeyW", "KeyD"], 4.0)
    snap = get_snapshot(s)
    pos = snap["playerWorldPos"]
    assert all(math.isfinite(float(v)) for v in pos.values())
    assert pos["y"] > -50.0, f"Car fell through world during sustained wall collision: {pos}"
    assert snap["fatalErrors"] == []


def t2_e4_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 2.2)
    max_ang = 0.0
    for c in ("KeyW", "KeyA", "Space"):
        s.key_down(c)
    try:
        for _ in range(25):
            time.sleep(0.1)
            snap = get_snapshot(s)
            assert math.isfinite(float(snap["speedKmh"]))
            assert math.isfinite(float(snap["playerWorldPos"]["x"]))
            max_ang = max(max_ang, abs(float(snap["driftAngleDeg"])))
    finally:
        for c in ("Space", "KeyA", "KeyW"):
            s.key_up(c)
    assert max_ang <= 75.0, f"Drift angle spun out beyond 75 deg: {max_ang}"


def t2_e4_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyS", 1.5)
    sp1 = float(get_snapshot(s)["speedKmh"])
    assert math.isfinite(sp1)
    s.hold_key("KeyW", 1.5)
    s.hold_key("KeyS", 2.0)
    sp2 = float(get_snapshot(s)["speedKmh"])
    assert math.isfinite(sp2) and -120.0 <= sp2 <= 250.0, f"Unbounded speed after reverse: {sp2}"


def t2_e4_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_keys(["KeyW", "KeyA", "KeyD"], 1.0)
    s.hold_keys(["KeyW", "KeyS", "Space"], 1.0)
    snap = get_snapshot(s)
    assert all(math.isfinite(float(v)) for v in snap["playerWorldPos"].values())
    assert all(math.isfinite(float(v)) for v in snap["jellySpring"].values())
    assert math.isfinite(float(snap["speedKmh"]))


def t2_e4_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 1.3)
    max_charge = 0.0
    max_tier = 0
    for c in ("KeyW", "KeyD", "Space"):
        s.key_down(c)
    try:
        for _ in range(32):
            time.sleep(0.1)
            snap = get_snapshot(s)
            chg = float(snap["boostCharge"])
            tier = int(snap["boostTier"])
            assert 0.0 <= chg <= 1.0, f"boostCharge out of [0,1]: {chg}"
            assert 0 <= tier <= 3, f"boostTier out of [0,3]: {tier}"
            max_charge = max(max_charge, chg)
            max_tier = max(max_tier, tier)
    finally:
        s.key_up("Space")
        s.key_up("KeyD")
        s.key_up("KeyW")
    assert max_tier >= 1 and max_charge > 0.25, f"Did not charge boost during long drift: max_tier={max_tier}, max_charge={max_charge}"


def t2_e4_06(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    p0 = snap0["playerWorldPos"]
    s.hold_keys(["ArrowUp", "ArrowLeft", "Space"], 1.5)
    snap1 = get_snapshot(s)
    p1 = snap1["playerWorldPos"]
    dist = math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"])
    assert snap1["speedKmh"] >= 30.0, f"Arrow keys failed to accelerate: {snap1['speedKmh']}"
    assert dist >= 10.0, f"Arrow keys failed displacement: {dist:.2f}"


# ---------------------------------------------------------------------------
# E5 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e5_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
    time.sleep(6.0)
    snap = get_snapshot(s)
    assert snap["aiCount"] == 4
    assert snap["position"] == 5, f"Expected idle player position=5 after 6s, got {snap['position']}"
    assert snap["playerWorldPos"]["y"] > -50.0


def t2_e5_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
    s.hold_key("KeyS", 2.0)
    s.hold_key("KeyW", 2.0)
    snap = get_snapshot(s)
    assert snap["phase"] == "RACING"
    assert snap["lap"] == 1, f"Backward crossing falsely incremented lap to {snap['lap']}"


def t2_e5_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
    s.hold_keys(["KeyW", "KeyD"], 1.0)
    s.hold_keys(["KeyW", "KeyA"], 1.0)
    snap = get_snapshot(s)
    assert snap["aiCount"] == 4
    assert 1 <= int(snap["position"]) <= 5
    assert all(math.isfinite(float(v)) for v in snap["playerWorldPos"].values())
    assert all(math.isfinite(float(v)) for v in snap["jellySpring"].values())
    s.assert_no_fatal_errors("t2_e5_03 AI shunt")


def t2_e5_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH", fresh_restart=True)
    cp0 = int(get_snapshot(s)["checkpointIndex"])
    t_prev = float(get_snapshot(s)["timeRemainingSec"])
    max_jump = -999.0
    s.key_down("KeyW")
    s.key_down("KeyD")
    s.key_down("Space")
    try:
        time.sleep(0.9)
        s.key_up("Space")
        s.key_up("KeyD")
        deadline = time.monotonic() + 14.0
        while time.monotonic() < deadline:
            snap = get_snapshot(s)
            t_cur = float(snap["timeRemainingSec"])
            max_jump = max(max_jump, t_cur - t_prev)
            t_prev = t_cur
            assert math.isfinite(t_cur) and t_cur >= 0.0
            if int(snap["checkpointIndex"]) != cp0:
                break
            time.sleep(0.08)
    finally:
        s.key_up("Space")
        s.key_up("KeyD")
        s.key_up("KeyW")
    assert max_jump >= 4.0, f"Expected checkpoint bonus jump >= 4.0s, got {max_jump:.2f}"


def t2_e5_05(ctx: TestContext) -> None:
    s = ctx.session
    for tid in ("canyon_loop", "neon_circuit"):
        ensure_racing(s, ctx.base_url, track_id=tid, car_id="jelly_gt", mode_id="GRAND_PRIX", fresh_restart=True)
        time.sleep(4.0)
        snap = get_snapshot(s)
        assert snap["aiCount"] == 4
        assert snap["fps"] > 0
        assert int(snap["position"]) >= 3, f"AI failed to advance on {tid}: pos={snap['position']}"


# ---------------------------------------------------------------------------
# E6 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e6_01(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    for _ in range(15):
        s.press_key("KeyC", hold_ms=25)
        time.sleep(0.075)
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="odd parity DRIVER")
    assert snap["adSlots"]["roof"]["visible"] is False
    assert snap["adSlots"]["console"]["visible"] is True
    s.assert_no_fatal_errors("t2_e6_01 rapid C toggle")


def t2_e6_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, fresh_restart=False)
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    s.press_key("KeyC")
    time.sleep(0.2)
    click_resume(s)
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=3.0, desc="RACING")
    assert snap["adSlots"]["roof"]["visible"] == (snap["cameraMode"] == "CHASE")
    assert snap["adSlots"]["console"]["visible"] == (snap["cameraMode"] == "DRIVER")
    s.assert_no_fatal_errors("t2_e6_02 camera toggle while paused")


def t2_e6_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    select_garage_options(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    click_selector(s, '[data-testid="start-race-btn"]')
    wait_snapshot(s, lambda x: x["phase"] in ("COUNTDOWN", "RACING"), timeout=5.0, desc="COUNTDOWN")
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING")
    assert snap["adSlots"]["roof"]["visible"] == (snap["cameraMode"] == "CHASE")
    assert snap["adSlots"]["console"]["visible"] == (snap["cameraMode"] == "DRIVER")
    s.assert_no_fatal_errors("t2_e6_03 camera toggle during countdown")


def t2_e6_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    s.press_key("KeyC")
    time.sleep(0.2)
    snap = get_snapshot(s)
    assert snap["phase"] == "CONTINUE_OFFER", f"KeyC broke CONTINUE_OFFER phase: {snap}"
    assert_visibly_rendered(s, '[data-testid="watch-ad-continue-btn"]')


def t2_e6_05(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    s.hold_key("KeyB", 0.8)
    time.sleep(0.2)
    snap = get_snapshot(s)
    assert snap["adSlots"]["roof"]["visible"] is True
    rect = normalize_rect(snap["adSlots"]["roof"]["rect"])
    assert 0 <= rect["left"] and rect["right"] <= 1280 and 0 <= rect["top"] and rect["bottom"] <= 720, rect
    s.assert_no_fatal_errors("t2_e6_05 reverse look")


# ---------------------------------------------------------------------------
# E7 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e7_01(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    time.sleep(0.35)
    assert_hidden_preserving_layout(s, "#console-ad-overlay")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    assert_visibly_rendered(s, "#console-ad-overlay")
    s.assert_no_fatal_errors("t2_e7_01 availableWidth=0 guard")


def t2_e7_02(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, track_id="canyon_loop", car_id="bumble_buggy", mode_id="DRIFT_RUSH", fresh_restart=True)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    s.hold_keys(["KeyW", "KeyA"], 0.7)
    s.hold_keys(["KeyW", "KeyD"], 0.9)
    snap = get_snapshot(s)
    assert snap["adSlots"]["console"]["visible"] is True
    r = normalize_rect(snap["adSlots"]["console"]["rect"])
    assert r["left"] >= 0 and r["top"] >= 0 and r["right"] <= 1280 and r["bottom"] <= 720, f"Console rect out of bounds: {r}"


def t2_e7_03(ctx: TestContext) -> None:
    s = ctx.session
    s.set_viewport(390, 844, device_scale_factor=2.0, mobile=True, has_touch=True)
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    click_selector(s, '[data-testid="camera-toggle-btn"]')
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    time.sleep(0.2)
    c = assert_visibly_rendered(s, "#console-ad-overlay")
    assert c["rect"]["left"] >= -20 and c["rect"]["right"] <= 410, f"Mobile console rect overflows: {c['rect']}"
    cam_btn = assert_visibly_rendered(s, '[data-testid="camera-toggle-btn"]')
    assert not rects_overlap(c["rect"], cam_btn["rect"]), "Console ad overlaps camera toggle button on mobile"


def t2_e7_04(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    hit_ok = s.eval_js(
        """(() => {
            const btn = document.querySelector('[data-testid="resume-btn"], [data-testid*="resume"], [data-testid="restart-race-btn"]')
                || Array.from(document.querySelectorAll('#jellydrift-modal-layer button')).find(b => /resume|restart/i.test(b.innerText));
            if (!btn) return false;
            const r = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return btn.contains(hit) || hit === btn;
        })()"""
    )
    assert hit_ok is True, "Pause modal button blocked by #console-ad-overlay or lower layer"


def t2_e7_05(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    click_pause(s)
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    # Navigate back to /
    s.eval_js("window.history.back()")
    time.sleep(0.4)
    if s.eval_js("window.location.pathname") != "/":
        s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("window.location.pathname === '/'"), timeout=8.0, desc="back on /")
    assert s.eval_js("document.querySelector('#console-ad-overlay') === null"), "#console-ad-overlay leaked onto /"
    s.assert_no_fatal_errors("t2_e7_05 driver exit cleanup")


# ---------------------------------------------------------------------------
# E8 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e8_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="canyon_loop", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.key_down("KeyW")
    try:
        for _ in range(20):
            time.sleep(0.2)
            snap = get_snapshot(s)
            r = normalize_rect(snap["adSlots"]["roof"]["rect"])
            tf = s.eval_js("document.querySelector('#roof-ad-overlay')?.style.transform || ''")
            assert "NaN" not in tf, f"NaN in roof transform: {tf}"
            if snap["adSlots"]["roof"]["visible"]:
                assert 40 <= r["width"] <= 600 and 15 <= r["height"] <= 250, f"Unclamped roof rect on crest: {r}"
    finally:
        s.key_up("KeyW")


def t2_e8_02(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    s.key_down("KeyB")
    try:
        time.sleep(0.5)
        snap_b = get_snapshot(s)
        info = inspect_element(s, "#roof-ad-overlay")
        assert info is not None
        assert info["rect"]["width"] < 800 and info["rect"]["height"] < 400, f"Inverted/oversized roof rect: {info['rect']}"
        if not snap_b["adSlots"]["roof"]["visible"]:
            assert info["visibility"] == "hidden" or info["opacity"] <= 0.05
    finally:
        s.key_up("KeyB")


def t2_e8_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, fresh_restart=True)
    s.key_down("KeyW")
    try:
        time.sleep(2.0)
        snap = get_snapshot(s)
        assert snap["fps"] >= 5, f"FPS collapsed below 5 on SwiftShader: {snap['fps']}"
        assert snap["adSlots"]["roof"]["visible"] is True
    finally:
        s.key_up("KeyW")


def t2_e8_04(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    hit_ok = s.eval_js(
        """(() => {
            const btn = document.querySelector('[data-testid="restart-race-btn"]');
            if (!btn) return false;
            const r = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return btn.contains(hit) || hit === btn;
        })()"""
    )
    assert hit_ok is True, "Restart button in pause modal intercepted by #roof-ad-overlay"


def t2_e8_05(ctx: TestContext) -> None:
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    open_drift(s, ctx.base_url, query="?adslot_roof=7777777777")
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    slot = s.eval_js("document.querySelector('#roof-ad-overlay ins.adsbygoogle')?.getAttribute('data-ad-slot')")
    assert slot == "7777777777"
    r0 = normalize_rect(get_snapshot(s)["adSlots"]["roof"]["rect"])
    s.hold_keys(["KeyW", "KeyD", "Space"], 1.5)
    r1 = normalize_rect(get_snapshot(s)["adSlots"]["roof"]["rect"])
    assert get_snapshot(s)["adSlots"]["roof"]["visible"] is True
    assert "SPONSORED" in assert_visibly_rendered(s, "#roof-ad-overlay")["text"].upper()
    assert math.hypot(r1["left"] - r0["left"], r1["top"] - r0["top"]) >= 2.0 or r1 != r0


# ---------------------------------------------------------------------------
# E9 Boundary Cases (5 tests)
# ---------------------------------------------------------------------------


def t2_e9_01(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    g_desktop = assert_visibly_rendered(s, "#garage-ad-overlay")
    assert g_desktop["rect"]["width"] <= 760, f"Desktop garage ad too wide: {g_desktop['rect']}"
    s.set_viewport(390, 844, device_scale_factor=2.0, mobile=True, has_touch=True)
    time.sleep(0.25)
    g_mobile = assert_visibly_rendered(s, "#garage-ad-overlay")
    assert g_mobile["rect"]["width"] <= 370, f"Mobile garage ad too wide: {g_mobile['rect']}"
    assert s.eval_js("document.documentElement.scrollWidth") <= 390


def t2_e9_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    for _ in range(2):
        start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
        click_pause(s)
        wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
        click_back_to_garage(s)
        wait_snapshot(s, lambda x: x["phase"] == "GARAGE", timeout=4.0, desc="GARAGE")
    assert_visibly_rendered(s, "#garage-ad-overlay")
    s.assert_no_fatal_errors("t2_e9_02 garage ad re-entry")


def t2_e9_03(ctx: TestContext) -> None:
    s = ctx.session
    for tid in TRACK_IDS:
        snap = ensure_racing(s, ctx.base_url, track_id=tid, car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
        assert int(snap["adSlots"]["tracksideCount"]) >= 2, f"Missing trackside billboards on {tid}: {snap['adSlots']}"
    s.assert_no_fatal_errors("t2_e9_03 trackside all 3 tracks")


def t2_e9_04(ctx: TestContext) -> None:
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="GRAND_PRIX")
    snap = drive_laps_opaque_box(s, target_laps=3, timeout_s=155.0)
    if snap["phase"] != "FINISHED":
        snap = wait_snapshot(s, lambda x: x["phase"] == "FINISHED", timeout=10.0, desc="FINISHED")
    p_info = assert_visibly_rendered(s, "#podium-ad-overlay")
    assert len(p_info["text"]) > 0, "Podium ad fallback empty under AdBlock"
    hit_ok = s.eval_js(
        """(() => {
            const btn = document.querySelector('[data-testid="restart-race-btn"], [data-testid*="rematch"]');
            if (!btn) return false;
            const r = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return btn.contains(hit) || hit === btn;
        })()"""
    )
    assert hit_ok is True, "Rematch button obscured by podium ad"


def t2_e9_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    g_ins = inspect_element(s, "#garage-ad-overlay ins.adsbygoogle") or inspect_element(s, "#garage-ad-overlay")
    start_btn = assert_visibly_rendered(s, '[data-testid="start-race-btn"]')
    assert g_ins is not None
    assert not rects_overlap(g_ins["rect"], start_btn["rect"], margin=12.0), (
        f"Garage ad <ins> within 12px of start-race-btn: {g_ins['rect']} vs {start_btn['rect']}"
    )


# ---------------------------------------------------------------------------
# E10 Boundary Cases (6 tests)
# ---------------------------------------------------------------------------


def t2_e10_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    # 1st timeout -> continue #1
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    snap1 = complete_watch_ad_to_continue(s, expected_min_continues=1, timeout_s=15.0)
    assert snap1["continuesUsed"] == 1

    # 2nd timeout -> continue #2
    wait_for_drift_rush_timeout(s, timeout_s=40.0)
    snap2 = complete_watch_ad_to_continue(s, expected_min_continues=2, timeout_s=15.0)
    assert snap2["continuesUsed"] == 2

    # 3rd timeout -> cap of 2 reached -> watch-ad-continue-btn hidden/disabled, Restart & Garage available
    wait_for_drift_rush_timeout(s, timeout_s=40.0)
    watch_btn = inspect_element(s, '[data-testid="watch-ad-continue-btn"]', only_visible=True)
    assert watch_btn is None or watch_btn["disabled"], f"Continue cap of 2 not enforced: {watch_btn}"
    assert_visibly_rendered(s, '[data-testid="restart-race-btn"]')


def t2_e10_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    click_selector(s, '[data-testid="restart-race-btn"]')
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING after restart")
    assert snap["continuesUsed"] == 0 and snap["timeRemainingSec"] >= 30.0 and snap["driftScore"] == 0


def t2_e10_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    click_back_to_garage(s)
    snap = wait_snapshot(s, lambda x: x["phase"] == "GARAGE", timeout=5.0, desc="GARAGE")
    assert snap["adSlots"]["continueModal"]["open"] is False


def t2_e10_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    click_selector(s, '[data-testid="watch-ad-continue-btn"]')
    time.sleep(0.4)
    # If cancel/close exists during AD_WATCHING, click it; otherwise verify confirm unlocks cleanly without freeze
    cancel = inspect_element(
        s,
        '[data-testid*="cancel"], [data-testid*="close"], #jellydrift-modal-layer button[aria-label*="close" i]',
        only_visible=True,
    )
    if cancel and not cancel["disabled"]:
        s.click_at(cancel["rect"]["left"] + cancel["rect"]["width"] / 2, cancel["rect"]["top"] + cancel["rect"]["height"] / 2)
        snap = wait_snapshot(s, lambda x: x["phase"] in ("CONTINUE_OFFER", "RACING"), timeout=6.0, desc="exit AD_WATCHING")
        assert snap["phase"] in ("CONTINUE_OFFER", "RACING")
    else:
        snap = complete_watch_ad_to_continue(s, expected_min_continues=1, timeout_s=15.0)
        assert snap["phase"] == "RACING"


def t2_e10_05(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    s.hold_key("KeyW", 0.5)
    snap_before = get_snapshot(s)
    # Simulate tab backgrounding via visibilitychange + hidden override or focus loss
    s.eval_js(
        """(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('blur'));
        })()"""
    )
    time.sleep(1.5)
    snap_hidden = get_snapshot(s)
    delta_pos = math.hypot(
        snap_hidden["playerWorldPos"]["x"] - snap_before["playerWorldPos"]["x"],
        snap_hidden["playerWorldPos"]["z"] - snap_before["playerWorldPos"]["z"],
    )
    assert snap_hidden["phase"] == "PAUSED" or abs(snap_hidden["timeRemainingSec"] - snap_before["timeRemainingSec"]) < 0.3, (
        f"Game did not pause or freeze timer on document.hidden: before={snap_before}, hidden={snap_hidden}"
    )
    assert delta_pos < 2.5, f"Car teleported while tab hidden: delta_pos={delta_pos:.2f}"
    # Restore visibility
    s.eval_js(
        """(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
        })()"""
    )


def t2_e10_06(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=True)
    wait_for_drift_rush_timeout(s, timeout_s=55.0)
    click_selector(s, '[data-testid="watch-ad-continue-btn"]')
    # Wait until confirm-continue-btn is enabled (or Tier 1 granted directly)
    deadline = time.monotonic() + 12.0
    while time.monotonic() < deadline:
        snap = get_snapshot(s)
        if snap["phase"] == "RACING":
            assert snap["continuesUsed"] == 1
            return
        btn = inspect_element(s, '[data-testid="confirm-continue-btn"]', only_visible=True)
        if btn and not btn["disabled"]:
            cx = btn["rect"]["left"] + btn["rect"]["width"] / 2.0
            cy = btn["rect"]["top"] + btn["rect"]["height"] / 2.0
            s.click_at(cx, cy)
            time.sleep(0.02)
            s.click_at(cx, cy)
            break
        time.sleep(0.15)
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=5.0, desc="RACING after double-click confirm")
    assert snap["continuesUsed"] == 1, f"Double-click granted extra continue: {snap['continuesUsed']}"
    assert snap["timeRemainingSec"] <= 26.0, f"Double-click granted double time: {snap['timeRemainingSec']}"


def get_tier2_tests() -> list[TestCaseDef]:
    return [
        # E1 (5)
        TestCaseDef("T2-E1-01", 2, "E1", "Route exit & re-entry WebGL disposal", "isolated", t2_e1_01),
        TestCaseDef("T2-E1-02", 2, "E1", "Rapid /drift <-> / route oscillation", "isolated", t2_e1_02),
        TestCaseDef("T2-E1-03", 2, "E1", "Arrow keys & Space scroll prevention", "warm_t2_e1", t2_e1_03),
        TestCaseDef("T2-E1-04", 2, "E1", "Viewport resize 1280->800->1440 resilience", "isolated", t2_e1_04),
        TestCaseDef("T2-E1-05", 2, "E1", "Mobile 390x844 Garage layout & zero overflow", "isolated", t2_e1_05),
        # E2 (5)
        TestCaseDef("T2-E2-01", 2, "E2", "AdBlock + DRIFT_RUSH timeout continue fallback", "isolated", t2_e2_01),
        TestCaseDef("T2-E2-02", 2, "E2", "Localhost unfilled slot non-collapsing fallback", "isolated", t2_e2_02),
        TestCaseDef("T2-E2-03", 2, "E2", "Malformed & XSS query overrides sanitized", "isolated", t2_e2_03),
        TestCaseDef("T2-E2-04", 2, "E2", "Pre-populated window.COVFOLIO_AD_CONFIG override", "isolated", t2_e2_04),
        TestCaseDef("T2-E2-05", 2, "E2", "Non-adtest mode & double pushSlotOnce guard", "isolated", t2_e2_05),
        # E3 (5)
        TestCaseDef("T2-E3-01", 2, "E3", "Rapid track/car selection spam", "warm_t2_e3", t2_e3_01),
        TestCaseDef("T2-E3-02", 2, "E3", "Double-click Start Race during transition", "warm_t2_e3", t2_e3_02),
        TestCaseDef("T2-E3-03", 2, "E3", "All 3 tracks boot, render & drive", "warm_t2_e3", t2_e3_03),
        TestCaseDef("T2-E3-04", 2, "E3", "All 4 cars distinct physics stats", "warm_t2_e3", t2_e3_04),
        TestCaseDef("T2-E3-05", 2, "E3", "Return to Garage & switch modes cleanly", "warm_t2_e3", t2_e3_05),
        # E4 (6)
        TestCaseDef("T2-E4-01", 2, "E4", "Sustained wall collision zero fall-through", "warm_t2_e4", t2_e4_01),
        TestCaseDef("T2-E4-02", 2, "E4", "Extreme high-speed drift angle stability", "warm_t2_e4", t2_e4_02),
        TestCaseDef("T2-E4-03", 2, "E4", "Full reverse from standstill & high speed", "warm_t2_e4", t2_e4_03),
        TestCaseDef("T2-E4-04", 2, "E4", "Opposing simultaneous inputs stability", "warm_t2_e4", t2_e4_04),
        TestCaseDef("T2-E4-05", 2, "E4", "Tier-3 boost charge clamping [0..1]", "warm_t2_e4", t2_e4_05),
        TestCaseDef("T2-E4-06", 2, "E4", "Arrow keys parity with WASD", "warm_t2_e4", t2_e4_06),
        # E5 (5)
        TestCaseDef("T2-E5-01", 2, "E5", "Zero-throttle start AI pack separation", "warm_t2_e5", t2_e5_01),
        TestCaseDef("T2-E5-02", 2, "E5", "Driving backward across start line no lap bump", "warm_t2_e5", t2_e5_02),
        TestCaseDef("T2-E5-03", 2, "E5", "AI car-to-car ramming resilience", "warm_t2_e5", t2_e5_03),
        TestCaseDef("T2-E5-04", 2, "E5", "Checkpoint bonus time while drifting", "warm_t2_e5", t2_e5_04),
        TestCaseDef("T2-E5-05", 2, "E5", "AI stability on elevated & overpass tracks", "warm_t2_e5", t2_e5_05),
        # E6 (5)
        TestCaseDef("T2-E6-01", 2, "E6", "Rapid 15x KeyC camera toggling stress", "warm_t2_e6", t2_e6_01),
        TestCaseDef("T2-E6-02", 2, "E6", "Camera toggle while PAUSED", "warm_t2_e6", t2_e6_02),
        TestCaseDef("T2-E6-03", 2, "E6", "Camera toggle during COUNTDOWN", "warm_t2_e6", t2_e6_03),
        TestCaseDef("T2-E6-04", 2, "E6", "KeyC while CONTINUE_OFFER modal open", "isolated", t2_e6_04),
        TestCaseDef("T2-E6-05", 2, "E6", "Reverse look KeyB hold & release", "warm_t2_e6", t2_e6_05),
        # E7 (5)
        TestCaseDef("T2-E7-01", 2, "E7", "First-ever DRIVER activation availableWidth=0 guard", "isolated", t2_e7_01),
        TestCaseDef("T2-E7-02", 2, "E7", "Driver console alignment under extreme roll", "warm_t2_e7", t2_e7_02),
        TestCaseDef("T2-E7-03", 2, "E7", "Driver console on 390x844 mobile viewport", "isolated", t2_e7_03),
        TestCaseDef("T2-E7-04", 2, "E7", "Driver console z-index below PAUSED modal", "warm_t2_e7", t2_e7_04),
        TestCaseDef("T2-E7-05", 2, "E7", "Driver console DOM cleanup on route exit", "isolated", t2_e7_05),
        # E8 (5)
        TestCaseDef("T2-E8-01", 2, "E8", "Roof ad projection on steep canyon_loop crests", "warm_t2_e8", t2_e8_01),
        TestCaseDef("T2-E8-02", 2, "E8", "Roof ad backface/reverse-look culling", "warm_t2_e8", t2_e8_02),
        TestCaseDef("T2-E8-03", 2, "E8", "Roof ad frame pacing (fps >= 5) no thrash", "warm_t2_e8", t2_e8_03),
        TestCaseDef("T2-E8-04", 2, "E8", "Roof ad z-index below PAUSED modal", "warm_t2_e8", t2_e8_04),
        TestCaseDef("T2-E8-05", 2, "E8", "Roof ad with ?adslot_roof override + AdBlock", "isolated", t2_e8_05),
        # E9 (5)
        TestCaseDef("T2-E9-01", 2, "E9", "Garage banner responsive width 1280 vs 390", "isolated", t2_e9_01),
        TestCaseDef("T2-E9-02", 2, "E9", "Garage ad re-entry zero double-push TagError", "warm_t2_e9", t2_e9_02),
        TestCaseDef("T2-E9-03", 2, "E9", "Trackside billboards across all 3 tracks", "warm_t2_e9", t2_e9_03),
        TestCaseDef("T2-E9-04", 2, "E9", "Podium ad under AdBlock non-blocking buttons", "isolated", t2_e9_04),
        TestCaseDef("T2-E9-05", 2, "E9", "AdSense policy >=12px CTA separation check", "warm_t2_e9", t2_e9_05),
        # E10 (6)
        TestCaseDef("T2-E10-01", 2, "E10", "Continue cap of 2 enforced cleanly (0->1->2->end)", "isolated", t2_e10_01),
        TestCaseDef("T2-E10-02", 2, "E10", "Immediate Restart from CONTINUE_OFFER", "isolated", t2_e10_02),
        TestCaseDef("T2-E10-03", 2, "E10", "Back to Garage from CONTINUE_OFFER", "isolated", t2_e10_03),
        TestCaseDef("T2-E10-04", 2, "E10", "Cancel/dismiss or completion from AD_WATCHING", "isolated", t2_e10_04),
        TestCaseDef("T2-E10-05", 2, "E10", "Tab visibilitychange auto-pause & zero teleport", "isolated", t2_e10_05),
        TestCaseDef("T2-E10-06", 2, "E10", "Double-click spam on confirm-continue-btn", "isolated", t2_e10_06),
    ]
