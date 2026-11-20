"""Tier 1: Feature Coverage E2E Tests (52 tests across E1..E10)."""

from __future__ import annotations

import math
import re
import time

from tests.helpers import (
    ADBLOCK_PATTERNS,
    CAR_IDS,
    MODE_IDS,
    PUBLISHER_ID_CA,
    PUBLISHER_ID_RAW,
    TRACK_IDS,
    TestCaseDef,
    TestContext,
    assert_drift_alive,
    assert_hidden_preserving_layout,
    assert_visibly_rendered,
    capture_webgl_canvas_png,
    click_back_to_garage,
    click_mute_toggle,
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
    http_get,
    inspect_element,
    mean_pixel_diff,
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
# E1: Routes, GameLayout & Cross-Page Navigation (5 tests)
# ---------------------------------------------------------------------------


def t1_e1_01(ctx: TestContext) -> None:
    s = ctx.session
    snap = open_drift(s, ctx.base_url)
    assert snap["phase"] == "GARAGE"
    layout = s.eval_js(
        """(() => {
            const ids = ['#jellydrift-webgl-layer', '#jellydrift-ad3d-layer', '#jellydrift-hud-layer', '#jellydrift-modal-layer'];
            const z = ids.map(id => {
                const el = document.querySelector(id);
                if (!el) return null;
                return Number(getComputedStyle(el).zIndex || 0);
            });
            return {
                z,
                scrollW: document.documentElement.scrollWidth,
                scrollH: document.documentElement.scrollHeight,
                hasFooter: !!document.querySelector('footer'),
            };
        })()"""
    )
    assert all(v is not None for v in layout["z"]), f"Missing GameLayout layers: {layout['z']}"
    z_webgl, z_ad3d, z_hud, z_modal = layout["z"]
    assert z_webgl < z_ad3d < z_hud < z_modal, f"Layer z-index order invalid: {layout['z']}"
    assert layout["scrollW"] <= 1280 and layout["scrollH"] <= 720, f"Viewport overflow on /drift: {layout}"
    assert not layout["hasFooter"], "Portfolio Footer should not render inside GameLayout on /drift"


def t1_e1_02(ctx: TestContext) -> None:
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('a[href=\"/drift\"]')"), timeout=10.0, desc="NavHeader /drift link")
    assert_visibly_rendered(s, 'a[href="/drift"]')
    click_visible_nav_link(s, "/drift")
    snap = assert_drift_alive(s)
    assert snap["ready"] is True


def t1_e1_03(ctx: TestContext) -> None:
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")
    wait_until(lambda: s.eval_js("!!document.querySelector('#projects')"), timeout=10.0, desc="home loaded")
    cta = s.eval_js(
        """(() => {
            const candidates = Array.from(document.querySelectorAll('[data-testid*="play-drift"], [data-testid*="jelly-drift"], a[href="/drift"], button[data-route="/drift"]'));
            // Prefer non-header CTA inside main/projects/home
            const mainCta = candidates.find(el => {
                const r = el.getBoundingClientRect();
                const inNav = !!el.closest('header, nav');
                return !inNav && r.width > 0 && r.height > 0 && getComputedStyle(el).pointerEvents !== 'none';
            }) || candidates.find(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && getComputedStyle(el).pointerEvents !== 'none';
            });
            if (!mainCta) return null;
            mainCta.scrollIntoView({ block: 'center' });
            const r = mainCta.getBoundingClientRect();
            return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, inNav: !!mainCta.closest('header, nav') };
        })()"""
    )
    assert cta is not None, "Play Jelly Drift 3D CTA not found or non-clickable on /"
    assert not cta["inNav"], "Expected dedicated portfolio CTA card/button on /, not only NavHeader link"
    time.sleep(0.1)
    s.click_at(cta["cx"], cta["cy"])
    snap = assert_drift_alive(s)
    assert snap["phase"] == "GARAGE"


def t1_e1_04(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    back_info = s.eval_js(
        """(() => {
            const sels = ['[data-testid="back-portfolio-btn"]', 'a[href="/"]', 'a[href="/#home"]', 'a[href="/#projects"]'];
            for (const sel of sels) {
                for (const el of document.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    if (r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) <= 0.05) continue;
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const hit = document.elementFromPoint(cx, cy);
                    if (hit && (el === hit || el.contains(hit))) {
                        return { cx, cy };
                    }
                }
            }
            return null;
        })()"""
    )
    assert back_info is not None, "Back-to-portfolio link missing on /drift"
    s.click_at(back_info["cx"], back_info["cy"])
    wait_until(
        lambda: s.eval_js("window.location.pathname === '/' && !!document.querySelector('#projects')"),
        timeout=10.0,
        desc="return to portfolio /",
    )
    assert s.eval_js("window.__JELLY_DRIFT__ === undefined"), "Engine telemetry not cleaned up on route exit"
    time.sleep(1.0)
    s.assert_no_fatal_errors("t1_e1_04 after leaving /drift")


def t1_e1_05(ctx: TestContext) -> None:
    status, headers, body = http_get(f"{ctx.base_url}/ads.txt")
    assert status == 200, f"GET /ads.txt returned {status}"
    text = body.decode("utf-8", errors="replace")
    assert f"google.com, {PUBLISHER_ID_RAW}, DIRECT, f08c47fec0942fa0" in text, f"Unexpected /ads.txt content: {text!r}"
    ct = headers.get("content-type", "")
    assert "text/plain" in ct, f"Expected text/plain for /ads.txt, got {ct!r}"


# ---------------------------------------------------------------------------
# E2: Global AdSense Config & Publisher Setup (5 tests)
# ---------------------------------------------------------------------------


def t1_e2_01(ctx: TestContext) -> None:
    s = ctx.session
    for route in ("/", "/drift"):
        s.navigate(f"{ctx.base_url}{route}")
        wait_until(lambda: s.eval_js("document.readyState === 'complete'"), timeout=10.0, desc=f"{route} load")
        head_ok = s.eval_js(
            f"""(() => {{
                const meta = document.querySelector('meta[name="google-adsense-account"]');
                const script = Array.from(document.querySelectorAll('script[src]')).find(
                    el => /pagead2\\.googlesyndication\\.com\\/pagead\\/js\\/adsbygoogle\\.js/.test(el.src)
                );
                return {{
                    metaContent: meta ? meta.getAttribute('content') : null,
                    scriptSrc: script ? script.getAttribute('src') : null,
                    scriptAsync: script ? script.async : false,
                    hasAdBreak: typeof window.adBreak === 'function',
                    hasAdConfig: typeof window.adConfig === 'function',
                }};
            }})()"""
        )
        assert head_ok["metaContent"] == PUBLISHER_ID_CA, f"{route}: bad meta {head_ok}"
        assert head_ok["scriptSrc"] and PUBLISHER_ID_CA in head_ok["scriptSrc"], f"{route}: bad script {head_ok}"
        assert head_ok["scriptAsync"] is True, f"{route}: adsbygoogle script missing async"
        assert head_ok["hasAdBreak"] and head_ok["hasAdConfig"], f"{route}: adBreak/adConfig stubs missing"


def t1_e2_02(ctx: TestContext) -> None:
    s = ctx.session
    snap = open_drift(s, ctx.base_url)
    assert snap["adSlots"]["publisherId"] == PUBLISHER_ID_CA
    cfg = s.eval_js(
        """(() => ({
            cfg: window.COVFOLIO_AD_CONFIG || null,
            hasIsBlocked: typeof window.__COVFOLIO_ADS__?.isBlocked === 'function',
            hasPushOnce: typeof window.__COVFOLIO_ADS__?.pushSlotOnce === 'function',
            hasRewarded: typeof window.__COVFOLIO_ADS__?.requestRewardedContinue === 'function',
        }))()"""
    )
    assert cfg["cfg"] is not None, "window.COVFOLIO_AD_CONFIG missing"
    for k in ("consoleSlotId", "roofSlotId", "continueSlotId", "garageSlotId", "podiumSlotId"):
        assert str(cfg["cfg"].get(k, "")).strip(), f"Missing/empty {k} in COVFOLIO_AD_CONFIG: {cfg['cfg']}"
    assert cfg["hasIsBlocked"] and cfg["hasPushOnce"] and cfg["hasRewarded"], f"__COVFOLIO_ADS__ incomplete: {cfg}"


def t1_e2_03(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url, query="?adtest=on&adslot_roof=9876543210&adslot_console=1234567890")
    cfg = s.eval_js("window.COVFOLIO_AD_CONFIG")
    assert cfg["roofSlotId"] == "9876543210"
    assert cfg["consoleSlotId"] == "1234567890"
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    attrs = s.eval_js(
        """(() => {
            const roof = document.querySelector('#roof-ad-overlay ins.adsbygoogle');
            const con = document.querySelector('#console-ad-overlay ins.adsbygoogle');
            return {
                roofSlot: roof?.getAttribute('data-ad-slot'),
                roofClient: roof?.getAttribute('data-ad-client'),
                roofTest: roof?.getAttribute('data-adtest'),
                conSlot: con?.getAttribute('data-ad-slot'),
                conClient: con?.getAttribute('data-ad-client'),
            };
        })()"""
    )
    assert attrs["roofSlot"] == "9876543210"
    assert attrs["roofClient"] == PUBLISHER_ID_CA
    assert attrs["roofTest"] == "on"
    assert attrs["conSlot"] == "1234567890"
    assert attrs["conClient"] == PUBLISHER_ID_CA


def t1_e2_04(ctx: TestContext) -> None:
    s = ctx.session
    s.block_urls(ADBLOCK_PATTERNS)
    snap = open_drift(s, ctx.base_url)
    wait_until(
        lambda: s.eval_js("window.__COVFOLIO_ADS__?.isBlocked() === true"),
        timeout=5.0,
        desc="adsense blocked detection",
    )
    snap = get_snapshot(s)
    assert snap["adSlots"]["adsenseBlocked"] is True
    assert snap["ready"] is True and snap["phase"] == "GARAGE"
    s.assert_no_fatal_errors("t1_e2_04 adblock")


def t1_e2_05(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    assert inspect_element(s, "#garage-ad-overlay ins.adsbygoogle") is not None
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    time.sleep(0.3)
    res = s.eval_js(
        """(() => {
            const ins = document.querySelector('#roof-ad-overlay ins.adsbygoogle');
            if (!ins) return { ok: false, reason: 'missing ins' };
            window.__COVFOLIO_ADS__.pushSlotOnce(ins, 'roof');
            window.__COVFOLIO_ADS__.pushSlotOnce(ins, 'roof');
            return { ok: true, status: ins.getAttribute('data-adsbygoogle-status') };
        })()"""
    )
    assert res["ok"] is True, res
    s.assert_no_fatal_errors("t1_e2_05 pushSlotOnce idempotency")


# ---------------------------------------------------------------------------
# E3: Garage Selection (5 tests)
# ---------------------------------------------------------------------------


def t1_e3_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    for tid in TRACK_IDS:
        assert_visibly_rendered(s, f'[data-track-id="{tid}"]')
    for cid in CAR_IDS:
        assert_visibly_rendered(s, f'[data-car-id="{cid}"]')
    for mid in MODE_IDS:
        assert_visibly_rendered(s, f'[data-mode-id="{mid}"]')
    counts = s.eval_js(
        "(() => ({ tracks: document.querySelectorAll('[data-track-id]').length, "
        "cars: document.querySelectorAll('[data-car-id]').length, "
        "modes: document.querySelectorAll('[data-mode-id]').length }))()"
    )
    assert counts["tracks"] == 3 and counts["cars"] == 4 and counts["modes"] == 2, counts


def t1_e3_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    click_selector(s, '[data-track-id="canyon_loop"]')
    time.sleep(0.1)
    assert get_snapshot(s)["trackId"] == "canyon_loop"
    click_selector(s, '[data-track-id="neon_circuit"]')
    time.sleep(0.1)
    assert get_snapshot(s)["trackId"] == "neon_circuit"
    snap = start_race(s, track_id="neon_circuit", car_id="jelly_gt", mode_id="DRIFT_RUSH", wait_racing=False)
    assert snap["phase"] in ("COUNTDOWN", "RACING")
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=8.0, desc="RACING")
    assert snap["trackId"] == "neon_circuit"


def t1_e3_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    for cid in ("tofu_86", "bumble_buggy", "cobalt_hyper", "jelly_gt"):
        click_selector(s, f'[data-car-id="{cid}"]')
        time.sleep(0.08)
        assert get_snapshot(s)["carId"] == cid, f"carId did not update on clicking {cid}"
    snap = start_race(s, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="DRIFT_RUSH")
    assert snap["carId"] == "cobalt_hyper"
    assert_drift_alive(s)


def t1_e3_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    snap = start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX")
    assert snap["mode"] == "GRAND_PRIX"
    assert snap["totalLaps"] == 3
    assert snap["lap"] == 1
    assert snap["aiCount"] == 4


def t1_e3_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    snap = start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    assert snap["mode"] == "DRIFT_RUSH"
    t0 = float(snap["timeRemainingSec"])
    assert 30.0 <= t0 <= 40.0, f"Unexpected DRIFT_RUSH initial timeRemainingSec={t0}"
    time.sleep(1.2)
    t1 = float(get_snapshot(s)["timeRemainingSec"])
    assert t1 < t0 - 0.5, f"DRIFT_RUSH clock did not decrement: {t0} -> {t1}"


# ---------------------------------------------------------------------------
# E4: Arcade Driving, Drift Physics, 3-Tier Boost & Jelly Spring Dynamics (6 tests)
# ---------------------------------------------------------------------------


def t1_e4_01(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    p0 = snap0["playerWorldPos"]
    s.hold_key("KeyW", 2.0)
    snap1 = get_snapshot(s)
    p1 = snap1["playerWorldPos"]
    dist = math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"])
    assert snap1["speedKmh"] >= 60.0, f"Expected speedKmh >= 60, got {snap1['speedKmh']}"
    assert dist >= 15.0, f"Expected displacement >= 15m, got {dist:.2f}"
    assert snap1["fps"] > 0


def t1_e4_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    pitches: list[float] = []
    s.key_down("KeyW")
    for _ in range(10):
        time.sleep(0.15)
        pitches.append(float(get_snapshot(s)["jellySpring"]["pitchDeg"]))
    s.key_up("KeyW")
    speed_peak = float(get_snapshot(s)["speedKmh"])
    assert speed_peak >= 45.0, f"Failed to reach speed before braking: {speed_peak}"

    s.key_down("KeyS")
    for _ in range(8):
        time.sleep(0.15)
        pitches.append(float(get_snapshot(s)["jellySpring"]["pitchDeg"]))
    speed_braked = float(get_snapshot(s)["speedKmh"])
    time.sleep(1.2)
    s.key_up("KeyS")
    snap_end = get_snapshot(s)
    assert speed_braked - speed_peak < -25.0, f"Braking did not slow car enough: {speed_peak} -> {speed_braked}"
    assert max(abs(p) for p in pitches) >= 0.8, f"Expected jellySpring.pitchDeg >= 0.8, got {pitches}"
    assert math.isfinite(float(snap_end["speedKmh"]))


def t1_e4_03(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    score0 = float(snap0["driftScore"])
    s.hold_key("KeyW", 1.5)
    assert get_snapshot(s)["speedKmh"] >= 45.0

    drift_samples = 0
    max_angle = 0.0
    max_roll = 0.0
    for c in ("KeyW", "KeyD", "Space"):
        s.key_down(c)
    try:
        for _ in range(14):
            time.sleep(0.1)
            snap = get_snapshot(s)
            ang = abs(float(snap["driftAngleDeg"]))
            roll = abs(float(snap["jellySpring"]["rollDeg"]))
            max_angle = max(max_angle, ang)
            max_roll = max(max_roll, roll)
            if snap["isDrifting"] and ang >= 12.0:
                drift_samples += 1
    finally:
        for c in ("Space", "KeyD", "KeyW"):
            s.key_up(c)

    score1 = float(get_snapshot(s)["driftScore"])
    assert drift_samples >= 3, f"Expected >=3 active drift samples, got {drift_samples} (maxAngle={max_angle})"
    assert score1 > score0, f"Drift score did not increase: {score0} -> {score1}"
    assert max_roll >= 1.5, f"Expected rollDeg >= 1.5 during drift, got {max_roll}"


def t1_e4_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="tofu_86", mode_id="DRIFT_RUSH")
    s.hold_key("KeyW", 1.3)
    s.key_down("KeyW")
    s.key_down("KeyA")
    s.key_down("Space")
    charged_snap = None
    try:
        deadline = time.monotonic() + 3.0
        while time.monotonic() < deadline:
            cur = get_snapshot(s)
            if cur["boostTier"] >= 1 and cur["boostCharge"] > 0.25:
                charged_snap = cur
                break
            time.sleep(0.08)
        assert charged_snap is not None, f"Failed to charge boostTier>=1 while drifting: {get_snapshot(s)}"
        s.key_up("KeyA")
        s.key_up("Space")
        post_speeds = []
        post_pitches = []
        for _ in range(8):
            time.sleep(0.1)
            sn = get_snapshot(s)
            post_speeds.append(float(sn["speedKmh"]))
            post_pitches.append(float(sn["jellySpring"]["pitchDeg"]))
    finally:
        s.key_up("Space")
        s.key_up("KeyA")
        s.key_up("KeyW")

    end_snap = get_snapshot(s)
    assert max(post_speeds) > float(charged_snap["speedKmh"]) and end_snap["boostCharge"] < charged_snap["boostCharge"], (
        f"Boost release did not produce speed surge & discharge: before={charged_snap['speedKmh']} (charge={charged_snap['boostCharge']}), "
        f"after={end_snap['speedKmh']} (charge={end_snap['boostCharge']}), post_speeds={post_speeds}"
    )
    assert max(abs(p) for p in post_pitches) >= 0.3, f"No pitch reaction on boost launch: {post_pitches}"


def t1_e4_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="bumble_buggy", mode_id="DRIFT_RUSH")
    rolls: list[float] = []
    bounces: list[float] = []
    s.key_down("KeyW")
    try:
        s.key_down("KeyA")
        for _ in range(6):
            time.sleep(0.1)
            js = get_snapshot(s)["jellySpring"]
            rolls.append(float(js["rollDeg"]))
            bounces.append(max(abs(float(js["squash"])), abs(float(js["bounceY"]))))
        s.key_up("KeyA")
        s.key_down("KeyD")
        for _ in range(7):
            time.sleep(0.1)
            js = get_snapshot(s)["jellySpring"]
            rolls.append(float(js["rollDeg"]))
            bounces.append(max(abs(float(js["squash"])), abs(float(js["bounceY"]))))
        s.key_up("KeyD")
    finally:
        s.key_up("KeyD")
        s.key_up("KeyA")
        s.key_up("KeyW")

    assert min(rolls) < -1.0 and max(rolls) > 1.0, f"rollDeg did not reverse sign across S-turn: {rolls}"
    assert max(bounces) > 0.005, f"Expected non-zero squash/bounceY spring motion: {bounces}"
    snap = get_snapshot(s)
    assert all(math.isfinite(float(v)) for v in snap["jellySpring"].values()), snap["jellySpring"]


def t1_e4_06(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    click_mute_toggle(s)
    time.sleep(0.2)
    click_mute_toggle(s)
    time.sleep(0.2)
    s.assert_no_fatal_errors("t1_e4_06 mute toggle")


# ---------------------------------------------------------------------------
# E5: AI Opponents & Race Progression (5 tests)
# ---------------------------------------------------------------------------


def t1_e5_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX")
    s.hold_key("KeyW", 0.2)
    time.sleep(3.0)
    snap = get_snapshot(s)
    assert snap["aiCount"] == 4
    assert 1 <= int(snap["position"]) <= 5
    assert int(snap["position"]) >= 3, f"AI opponents did not pull ahead of nearly stationary player: pos={snap['position']}"


def t1_e5_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="DRIFT_RUSH")
    cp0 = int(get_snapshot(s)["checkpointIndex"])
    t_prev = float(get_snapshot(s)["timeRemainingSec"])
    max_jump = -999.0
    crossed = 0

    s.key_down("KeyW")
    try:
        deadline = time.monotonic() + 18.0
        while time.monotonic() < deadline and crossed < 2:
            snap = get_snapshot(s)
            t_cur = float(snap["timeRemainingSec"])
            max_jump = max(max_jump, t_cur - t_prev)
            t_prev = t_cur
            cp = int(snap["checkpointIndex"])
            if cp != cp0:
                crossed += 1
                cp0 = cp
            if float(snap["speedKmh"]) < 50.0 and time.monotonic() > deadline - 16.0:
                s.press_key("KeyA", hold_ms=120)
            time.sleep(0.08)
    finally:
        s.key_up("KeyW")

    if crossed < 2:
        # Use closed-loop steering fallback for remaining checkpoints and keep tracking time bonus jumps
        fb_stats: dict[str, float] = {}
        drive_laps_opaque_box(s, target_checkpoints=2 - crossed, timeout_s=25.0, stats=fb_stats)
        max_jump = max(max_jump, float(fb_stats.get("max_time_jump", -999.0)))
        assert int(get_snapshot(s)["checkpointIndex"]) >= 2 or max_jump > 4.0
    assert max_jump > 4.0, f"Expected +5.5s checkpoint time bonus (>4.0s jump), max_jump={max_jump:.2f}"


def t1_e5_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX")
    s.hold_key("KeyW", 2.0)
    snap = get_snapshot(s)
    hud_text = s.eval_js("document.querySelector('#jellydrift-hud-layer')?.innerText || ''")
    pos = str(snap["position"])
    assert re.search(rf"(?:^|\D){re.escape(pos)}(?:\D|$)", hud_text), f"HUD missing position {pos}: {hud_text!r}"
    assert "1/3" in hud_text or "LAP 1" in hud_text.upper() or "1 / 3" in hud_text, f"HUD missing lap 1/3: {hud_text!r}"
    speed_int = int(round(float(snap["speedKmh"])))
    has_kmh = bool(re.search(r"km\s*/\s*h", hud_text, re.I))
    has_speed_num = speed_int >= 10 and bool(re.search(rf"(?<![/\d]){speed_int}(?![/\d])", hud_text))
    assert has_kmh or has_speed_num, f"HUD missing speed ({speed_int} km/h): {hud_text!r}"


def t1_e5_04(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="GRAND_PRIX")
    snap = drive_laps_opaque_box(s, target_laps=1, timeout_s=65.0)
    assert int(snap["lap"]) >= 2, f"Expected lap >= 2 after completing 1 lap, got {snap}"
    assert snap["fps"] > 0


def t1_e5_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="GRAND_PRIX")
    s.hold_keys(["KeyW", "KeyA"], 0.6)
    s.hold_keys(["KeyW", "KeyD"], 1.4)
    snap = get_snapshot(s)
    assert snap["phase"] == "RACING" and snap["aiCount"] == 4
    assert all(math.isfinite(float(v)) for v in snap["playerWorldPos"].values())
    assert all(math.isfinite(float(v)) for v in snap["jellySpring"].values())
    s.assert_no_fatal_errors("t1_e5_05 AI shunt")


# ---------------------------------------------------------------------------
# E6: Switchable Camera Views (5 tests)
# ---------------------------------------------------------------------------


def t1_e6_01(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    png_chase = capture_webgl_canvas_png(s)
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=1.5, desc="DRIVER")
    time.sleep(0.15)
    png_driver = capture_webgl_canvas_png(s)
    diff = mean_pixel_diff(png_chase, png_driver)
    assert diff > 2.0, f"WebGL scene did not change meaningfully on CHASE->DRIVER (diff={diff:.2f})"


def t1_e6_02(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=1.5, desc="CHASE")


def t1_e6_03(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    assert_visibly_rendered(s, '[data-testid="camera-toggle-btn"]')
    click_selector(s, '[data-testid="camera-toggle-btn"]')
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=1.5, desc="DRIVER via button")
    click_selector(s, '[data-testid="camera-toggle-btn"]')
    wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=1.5, desc="CHASE via button")


def t1_e6_04(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    s.press_key("KeyV")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "HOOD", timeout=1.5, desc="HOOD via KeyV")
    assert snap["adSlots"]["roof"]["visible"] is False
    assert snap["adSlots"]["console"]["visible"] is False
    assert_hidden_preserving_layout(s, "#roof-ad-overlay")
    assert_hidden_preserving_layout(s, "#console-ad-overlay")
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] in ("CHASE", "DRIVER"), timeout=1.5, desc="exit HOOD via KeyC")


def t1_e6_05(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, fresh_restart=True)
    if snap0["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        snap0 = wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    p0 = snap0["playerWorldPos"]
    s.hold_keys(["KeyW", "KeyA"], 0.8)
    s.hold_keys(["KeyW", "KeyD"], 0.8)
    snap1 = get_snapshot(s)
    p1 = snap1["playerWorldPos"]
    assert snap1["cameraMode"] == "DRIVER"
    assert snap1["adSlots"]["console"]["visible"] is True
    assert math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"]) >= 10.0
    layer_pe = s.eval_js("getComputedStyle(document.querySelector('#jellydrift-ad3d-layer')).pointerEvents")
    assert layer_pe == "none", f"Expected #jellydrift-ad3d-layer pointer-events:none, got {layer_pe}"


# ---------------------------------------------------------------------------
# E7: Driver-View Center Console Ad (5 tests)
# ---------------------------------------------------------------------------


def t1_e7_01(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    time.sleep(0.25)
    snap = get_snapshot(s)
    assert snap["adSlots"]["console"]["mounted"] is True
    assert snap["adSlots"]["console"]["visible"] is True
    info = assert_visibly_rendered(s, "#console-ad-overlay")
    assert info["opacity"] > 0.5
    has_ins = s.eval_js("!!document.querySelector('#console-ad-overlay ins.adsbygoogle[data-ad-placement=\"driver-console\"]')")
    assert has_ins, "Missing #console-ad-overlay ins.adsbygoogle[data-ad-placement='driver-console']"


def t1_e7_02(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    time.sleep(0.2)
    snap = get_snapshot(s)
    srect = normalize_rect(snap["adSlots"]["console"]["rect"])
    dinfo = assert_visibly_rendered(s, "#console-ad-overlay")
    drect = dinfo["rect"]
    assert drect["width"] >= 100 and drect["height"] >= 35, f"Console ad collapsed: {drect}"
    assert drect["top"] >= 250 and drect["right"] <= 1280 and drect["bottom"] <= 720, f"Console rect out of lower cockpit region: {drect}"
    assert abs(srect["width"] - drect["width"]) < 5.0, f"Snapshot vs DOM rect mismatch: {srect} vs {drect}"
    ins_info = inspect_element(s, "#console-ad-overlay ins.adsbygoogle", only_visible=False)
    assert ins_info is not None, "Missing #console-ad-overlay ins.adsbygoogle"
    ins_rect = ins_info["rect"]
    assert ins_rect["width"] >= 100 and ins_rect["height"] >= 35, f"<ins> collapsed: {ins_rect}"


def t1_e7_03(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    s.press_key("KeyC")
    snap = wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    time.sleep(0.15)
    assert get_snapshot(s)["adSlots"]["console"]["visible"] is False
    assert_hidden_preserving_layout(s, "#console-ad-overlay")


def t1_e7_04(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    time.sleep(0.2)
    fb = s.eval_js(
        """(() => {
            const el = document.querySelector('#console-ad-overlay');
            const text = (el?.innerText || '').trim();
            return { text, len: text.length };
        })()"""
    )
    assert fb["len"] > 0, "Console overlay fallback text empty"
    assert "SPONSORED" in fb["text"].upper(), f"Expected SPONSORED badge in console fallback, got {fb['text']!r}"
    s.assert_no_fatal_errors("t1_e7_04 console fallback")


def t1_e7_05(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, fresh_restart=True)
    if snap0["cameraMode"] != "DRIVER":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    info = assert_visibly_rendered(s, "#console-ad-overlay")
    assert info["pointerEvents"] == "none", f"Console overlay must be pointer-events:none, got {info['pointerEvents']}"
    r = info["rect"]
    s.click_at(r["left"] + r["width"] / 2.0, r["top"] + r["height"] / 2.0)
    assert s.eval_js("window.location.pathname") == "/drift"
    s.hold_key("KeyW", 0.6)
    assert get_snapshot(s)["speedKmh"] > 15.0, "Clicking over console ad broke driving focus"


# ---------------------------------------------------------------------------
# E8: Third-Person Moving Roof Ad (5 tests)
# ---------------------------------------------------------------------------


def t1_e8_01(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        snap = wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    time.sleep(0.2)
    snap = get_snapshot(s)
    assert snap["adSlots"]["roof"]["mounted"] is True
    assert snap["adSlots"]["roof"]["visible"] is True
    info = assert_visibly_rendered(s, "#roof-ad-overlay")
    assert info["opacity"] > 0.5
    has_ins = s.eval_js("!!document.querySelector('#roof-ad-overlay ins.adsbygoogle[data-ad-placement=\"third-person-roof\"]')")
    assert has_ins, "Missing #roof-ad-overlay ins.adsbygoogle[data-ad-placement='third-person-roof']"
    assert "matrix" in info["transform"] or "translate" in info["transform"], f"Roof overlay missing CSS transform: {info['transform']}"


def t1_e8_02(ctx: TestContext) -> None:
    s = ctx.session
    snap0 = ensure_racing(s, ctx.base_url, fresh_restart=True)
    if snap0["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        snap0 = wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    p0 = snap0["playerWorldPos"]
    r0 = normalize_rect(snap0["adSlots"]["roof"]["rect"])

    rects = [r0]
    for c in ("KeyW", "KeyD", "Space"):
        s.key_down(c)
    try:
        for _ in range(10):
            time.sleep(0.15)
            rects.append(normalize_rect(get_snapshot(s)["adSlots"]["roof"]["rect"]))
    finally:
        for c in ("Space", "KeyD", "KeyW"):
            s.key_up(c)

    p1 = get_snapshot(s)["playerWorldPos"]
    world_dist = math.hypot(p1["x"] - p0["x"], p1["z"] - p0["z"])
    assert all(r["width"] > 40 and r["height"] > 15 for r in rects), f"Invalid roof rects: {rects}"
    dx = max(abs(r["left"] - r0["left"]) for r in rects)
    dy = max(abs(r["top"] - r0["top"]) for r in rects)
    assert max(dx, dy) >= 5.0 and world_dist >= 3.0, (
        f"Roof ad did not move dynamically with car (dx={dx:.1f}, dy={dy:.1f}, world_dist={world_dist:.2f}m)"
    )


def t1_e8_03(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    s.press_key("KeyC")
    wait_snapshot(s, lambda x: x["cameraMode"] == "DRIVER", timeout=2.0, desc="DRIVER")
    time.sleep(0.15)
    assert get_snapshot(s)["adSlots"]["roof"]["visible"] is False
    assert_hidden_preserving_layout(s, "#roof-ad-overlay")


def t1_e8_04(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, fresh_restart=False)
    if snap["cameraMode"] != "CHASE":
        s.press_key("KeyC")
        wait_snapshot(s, lambda x: x["cameraMode"] == "CHASE", timeout=2.0, desc="CHASE")
    info = assert_visibly_rendered(s, "#roof-ad-overlay")
    assert info["pointerEvents"] == "none"
    assert "SPONSORED" in info["text"].upper(), f"Roof fallback missing SPONSORED: {info['text']!r}"
    s.assert_no_fatal_errors("t1_e8_04 roof fallback")


def t1_e8_05(ctx: TestContext) -> None:
    s = ctx.session
    for cid in ("jelly_gt", "bumble_buggy"):
        ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id=cid, mode_id="DRIFT_RUSH", fresh_restart=True)
        s.hold_key("KeyW", 1.0)
        snap = get_snapshot(s)
        rect = normalize_rect(snap["adSlots"]["roof"]["rect"])
        assert snap["adSlots"]["roof"]["visible"] is True
        assert rect["width"] > 40 and rect["height"] > 15, f"Roof rect invalid on {cid}: {rect}"


# ---------------------------------------------------------------------------
# E9: Additional Creative Ad Placements (5 tests)
# ---------------------------------------------------------------------------


def t1_e9_01(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_garage(s, ctx.base_url)
    assert snap["adSlots"]["garage"]["mounted"] is True
    g_info = assert_visibly_rendered(s, "#garage-ad-overlay")
    assert g_info["rect"]["width"] >= 300 and g_info["rect"]["height"] >= 50, g_info["rect"]
    assert s.eval_js("!!document.querySelector('#garage-ad-overlay ins.adsbygoogle')")
    btn_info = assert_visibly_rendered(s, '[data-testid="start-race-btn"]')
    assert not rects_overlap(g_info["rect"], btn_info["rect"]), (
        f"Garage ad overlaps start-race-btn: {g_info['rect']} vs {btn_info['rect']}"
    )


def t1_e9_02(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    snap = get_snapshot(s)
    assert snap["adSlots"]["garage"]["visible"] is False or snap["adSlots"]["garage"]["mounted"] is False
    g_info = inspect_element(s, "#garage-ad-overlay", only_visible=True)
    assert g_info is None, f"Garage ad still visibly blocking racing view: {g_info}"
    s.assert_no_fatal_errors("t1_e9_02")


def t1_e9_03(ctx: TestContext) -> None:
    s = ctx.session
    snap = ensure_racing(s, ctx.base_url, track_id="neon_circuit", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    assert int(snap["adSlots"]["tracksideCount"]) >= 2, f"Expected >=2 trackside billboards, got {snap['adSlots']}"
    s.hold_key("KeyW", 2.0)
    s.assert_no_fatal_errors("t1_e9_03 trackside billboards")


def t1_e9_04(ctx: TestContext) -> None:
    s = ctx.session
    open_drift(s, ctx.base_url)
    start_race(s, track_id="sunny_coast", car_id="cobalt_hyper", mode_id="GRAND_PRIX")
    snap = drive_laps_opaque_box(s, target_laps=3, timeout_s=155.0)
    if snap["phase"] != "FINISHED":
        snap = wait_snapshot(s, lambda x: x["phase"] == "FINISHED", timeout=10.0, desc="FINISHED")
    assert snap["adSlots"]["podium"]["mounted"] is True
    p_info = assert_visibly_rendered(s, "#podium-ad-overlay")
    assert p_info["rect"]["width"] >= 250 and p_info["rect"]["height"] >= 200, p_info["rect"]
    assert s.eval_js("!!document.querySelector('#podium-ad-overlay ins.adsbygoogle')")
    rematch = inspect_element(s, '[data-testid="restart-race-btn"], [data-testid*="rematch"]', only_visible=True)
    if rematch:
        assert not rects_overlap(p_info["rect"], rematch["rect"]), "Podium ad overlaps rematch button"


def t1_e9_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_garage(s, ctx.base_url)
    ad_ins_selector = (
        "#jellydrift-ad3d-layer ins.adsbygoogle:not(.adsbygoogle-noablate), "
        "#jellydrift-modal-layer ins.adsbygoogle:not(.adsbygoogle-noablate), "
        "ins.adsbygoogle[data-ad-placement]"
    )
    ins_garage = s.eval_js(
        f"Array.from(document.querySelectorAll({ad_ins_selector!r})).map(el => ({{ "
        "id: el.parentElement?.id || el.id, client: el.getAttribute('data-ad-client'), slot: el.getAttribute('data-ad-slot') }))"
    )
    assert len(ins_garage) >= 1, f"Expected >=1 app-owned <ins.adsbygoogle> in GARAGE, got {ins_garage}"
    for item in ins_garage:
        assert item["client"] == PUBLISHER_ID_CA, f"Bad data-ad-client: {item}"
        assert item["slot"] and len(item["slot"].strip()) > 0, f"Empty data-ad-slot: {item}"

    start_race(s, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    ins_race = s.eval_js(
        f"Array.from(document.querySelectorAll({ad_ins_selector!r})).map(el => ({{ "
        "placement: el.getAttribute('data-ad-placement'), client: el.getAttribute('data-ad-client'), slot: el.getAttribute('data-ad-slot') }))"
    )
    assert len(ins_race) >= 2, f"Expected >=2 app-owned <ins.adsbygoogle> in RACING, got {ins_race}"
    for item in ins_race:
        assert item["client"] == PUBLISHER_ID_CA, f"Bad data-ad-client in race: {item}"
        assert item["slot"] and len(item["slot"].strip()) > 0, f"Empty data-ad-slot in race: {item}"


# ---------------------------------------------------------------------------
# E10: Watch-an-Ad-to-Continue Flow & Pause/Restart Lifecycle (6 tests)
# ---------------------------------------------------------------------------


def t1_e10_01(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    snap = wait_for_drift_rush_timeout(s, timeout_s=75.0)
    assert snap["phase"] == "CONTINUE_OFFER"
    assert snap["adSlots"]["continueModal"]["open"] is True
    assert_visibly_rendered(s, '[data-testid="watch-ad-continue-btn"]')
    assert_visibly_rendered(s, '[data-testid="restart-race-btn"]')


def t1_e10_02(ctx: TestContext) -> None:
    s = ctx.session
    path = s.eval_js("window.location.pathname")
    if path != "/drift" or not s.eval_js("!!window.__JELLY_DRIFT__") or get_snapshot(s).get("phase") != "CONTINUE_OFFER":
        ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
        wait_for_drift_rush_timeout(s, timeout_s=75.0)

    assert_visibly_rendered(s, '[data-testid="watch-ad-continue-btn"]')
    click_selector(s, '[data-testid="watch-ad-continue-btn"]')

    saw_watching = False
    deadline = time.monotonic() + 15.0
    while time.monotonic() < deadline:
        snap = get_snapshot(s)
        if snap["phase"] == "AD_WATCHING":
            saw_watching = True
            assert inspect_element(s, '#continue-ad-overlay ins[data-ad-placement="watch-continue"]') is not None
            btn = inspect_element(s, '[data-testid="confirm-continue-btn"]', only_visible=True)
            if btn and not btn["disabled"]:
                click_selector(s, '[data-testid="confirm-continue-btn"]')
                break
        elif snap["phase"] == "RACING" and snap["continuesUsed"] >= 1:
            break
        time.sleep(0.2)

    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING" and x["continuesUsed"] >= 1, timeout=6.0, desc="RACING after continue")
    assert snap["continuesUsed"] == 1
    assert snap["timeRemainingSec"] >= 18.0
    assert snap["boostCharge"] > 0.5
    s.hold_key("KeyW", 1.2)
    assert get_snapshot(s)["speedKmh"] > 25.0


def t1_e10_03(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH")
    s.hold_key("KeyW", 0.8)
    s.press_key("Escape")
    snap0 = wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    time.sleep(1.0)
    snap1 = get_snapshot(s)
    assert snap1["phase"] == "PAUSED"
    assert abs(snap1["timeRemainingSec"] - snap0["timeRemainingSec"]) < 0.05
    assert math.hypot(
        snap1["playerWorldPos"]["x"] - snap0["playerWorldPos"]["x"],
        snap1["playerWorldPos"]["z"] - snap0["playerWorldPos"]["z"],
    ) < 0.05


def t1_e10_04(ctx: TestContext) -> None:
    s = ctx.session
    if s.eval_js("window.location.pathname") != "/drift" or not s.eval_js("!!window.__JELLY_DRIFT__"):
        ensure_racing(s, ctx.base_url)
    if get_snapshot(s)["phase"] != "PAUSED":
        ensure_racing(s, ctx.base_url)
        s.press_key("Escape")
        wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_resume(s)
    wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=3.0, desc="RACING after Resume")
    s.hold_key("KeyW", 1.0)
    assert get_snapshot(s)["speedKmh"] > 20.0


def t1_e10_05(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=False)
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_selector(s, '[data-testid="restart-race-btn"]')
    snap = wait_snapshot(s, lambda x: x["phase"] == "RACING", timeout=10.0, desc="RACING after restart")
    assert snap["lap"] == 1
    assert snap["checkpointIndex"] == 0
    assert snap["driftScore"] == 0
    assert snap["continuesUsed"] == 0
    assert snap["timeRemainingSec"] >= 30.0


def t1_e10_06(ctx: TestContext) -> None:
    s = ctx.session
    ensure_racing(s, ctx.base_url, track_id="sunny_coast", car_id="jelly_gt", mode_id="DRIFT_RUSH", fresh_restart=False)
    s.press_key("Escape")
    wait_snapshot(s, lambda x: x["phase"] == "PAUSED", timeout=3.0, desc="PAUSED")
    click_back_to_garage(s)
    snap = wait_snapshot(s, lambda x: x["phase"] == "GARAGE", timeout=5.0, desc="GARAGE")
    assert snap["continuesUsed"] == 0
    assert_visibly_rendered(s, '[data-testid="start-race-btn"]')


def get_tier1_tests() -> list[TestCaseDef]:
    return [
        # E1 (5)
        TestCaseDef("T1-E1-01", 1, "E1", "/drift GameLayout & z-index layers", "isolated", t1_e1_01),
        TestCaseDef("T1-E1-02", 1, "E1", "NavHeader /drift link navigation", "isolated", t1_e1_02),
        TestCaseDef("T1-E1-03", 1, "E1", "Portfolio Play Jelly Drift 3D CTA", "isolated", t1_e1_03),
        TestCaseDef("T1-E1-04", 1, "E1", "Back-to-portfolio clean WebGL disposal", "isolated", t1_e1_04),
        TestCaseDef("T1-E1-05", 1, "E1", "/ads.txt publisher record", "isolated", t1_e1_05),
        # E2 (5)
        TestCaseDef("T1-E2-01", 1, "E2", "Global AdSense head tags & adBreak stub", "isolated", t1_e2_01),
        TestCaseDef("T1-E2-02", 1, "E2", "COVFOLIO_AD_CONFIG & __COVFOLIO_ADS__ contract", "isolated", t1_e2_02),
        TestCaseDef("T1-E2-03", 1, "E2", "Query param adslot & adtest overrides", "isolated", t1_e2_03),
        TestCaseDef("T1-E2-04", 1, "E2", "AdBlock detection & non-blocking boot", "isolated", t1_e2_04),
        TestCaseDef("T1-E2-05", 1, "E2", "pushSlotOnce single-push idempotency", "isolated", t1_e2_05),
        # E3 (5)
        TestCaseDef("T1-E3-01", 1, "E3", "3 tracks, 4 cars, 2 modes visibly rendered", "warm_t1_e3", t1_e3_01),
        TestCaseDef("T1-E3-02", 1, "E3", "Track selection updates snapshot & race", "warm_t1_e3", t1_e3_02),
        TestCaseDef("T1-E3-03", 1, "E3", "Car selection updates snapshot & race", "warm_t1_e3", t1_e3_03),
        TestCaseDef("T1-E3-04", 1, "E3", "GRAND_PRIX mode 3 laps & 4 AI", "warm_t1_e3", t1_e3_04),
        TestCaseDef("T1-E3-05", 1, "E3", "DRIFT_RUSH ~35s monotonic clock", "warm_t1_e3", t1_e3_05),
        # E4 (6)
        TestCaseDef("T1-E4-01", 1, "E4", "Throttle acceleration & displacement", "warm_t1_e4", t1_e4_01),
        TestCaseDef("T1-E4-02", 1, "E4", "Braking deceleration & spring pitch", "warm_t1_e4", t1_e4_02),
        TestCaseDef("T1-E4-03", 1, "E4", "Drift initiation, angle, score & roll", "warm_t1_e4", t1_e4_03),
        TestCaseDef("T1-E4-04", 1, "E4", "Drift boost charge & turbo launch", "warm_t1_e4", t1_e4_04),
        TestCaseDef("T1-E4-05", 1, "E4", "Jelly spring roll reversal & bounce", "warm_t1_e4", t1_e4_05),
        TestCaseDef("T1-E4-06", 1, "E4", "Audio mute toggle without WebAudio errors", "warm_t1_e4", t1_e4_06),
        # E5 (5)
        TestCaseDef("T1-E5-01", 1, "E5", "4 AI opponents active & position updates", "warm_t1_e5", t1_e5_01),
        TestCaseDef("T1-E5-02", 1, "E5", "Checkpoint progression & DRIFT_RUSH time bonus", "warm_t1_e5", t1_e5_02),
        TestCaseDef("T1-E5-03", 1, "E5", "HUD displays position, lap & speed", "warm_t1_e5", t1_e5_03),
        TestCaseDef("T1-E5-04", 1, "E5", "Complete 1 full lap in GRAND_PRIX", "warm_t1_e5", t1_e5_04),
        TestCaseDef("T1-E5-05", 1, "E5", "Car-to-car launch pack collision safety", "warm_t1_e5", t1_e5_05),
        # E6 (5)
        TestCaseDef("T1-E6-01", 1, "E6", "KeyC toggles CHASE -> DRIVER with frame change", "warm_t1_e6", t1_e6_01),
        TestCaseDef("T1-E6-02", 1, "E6", "KeyC toggles DRIVER -> CHASE", "warm_t1_e6", t1_e6_02),
        TestCaseDef("T1-E6-03", 1, "E6", "HUD camera-toggle-btn switches views", "warm_t1_e6", t1_e6_03),
        TestCaseDef("T1-E6-04", 1, "E6", "KeyV HOOD view hides both car ads", "warm_t1_e6", t1_e6_04),
        TestCaseDef("T1-E6-05", 1, "E6", "Active steering & input responsiveness in DRIVER", "warm_t1_e6", t1_e6_05),
        # E7 (5)
        TestCaseDef("T1-E7-01", 1, "E7", "Console ad mounts & renders visible in DRIVER", "warm_t1_e7", t1_e7_01),
        TestCaseDef("T1-E7-02", 1, "E7", "Console ad rect inside lower cockpit & non-collapsed", "warm_t1_e7", t1_e7_02),
        TestCaseDef("T1-E7-03", 1, "E7", "Console ad visibility:hidden & display!=none in CHASE", "warm_t1_e7", t1_e7_03),
        TestCaseDef("T1-E7-04", 1, "E7", "Console ad themed SPONSORED fallback", "warm_t1_e7", t1_e7_04),
        TestCaseDef("T1-E7-05", 1, "E7", "Console ad pointer-events:none during driving", "warm_t1_e7", t1_e7_05),
        # E8 (5)
        TestCaseDef("T1-E8-01", 1, "E8", "Roof ad mounts & renders with 3D transform in CHASE", "warm_t1_e8", t1_e8_01),
        TestCaseDef("T1-E8-02", 1, "E8", "Roof ad rect & transform move dynamically with car", "warm_t1_e8", t1_e8_02),
        TestCaseDef("T1-E8-03", 1, "E8", "Roof ad visibility:hidden & display!=none in DRIVER", "warm_t1_e8", t1_e8_03),
        TestCaseDef("T1-E8-04", 1, "E8", "Roof ad SPONSORED fallback & pointer-events:none", "warm_t1_e8", t1_e8_04),
        TestCaseDef("T1-E8-05", 1, "E8", "Roof ad mounts across distinct car geometries", "warm_t1_e8", t1_e8_05),
        # E9 (5)
        TestCaseDef("T1-E9-01", 1, "E9", "Garage ad overlay non-overlapping start button", "warm_t1_e9", t1_e9_01),
        TestCaseDef("T1-E9-02", 1, "E9", "Garage ad hides cleanly upon race start", "warm_t1_e9", t1_e9_02),
        TestCaseDef("T1-E9-03", 1, "E9", "Trackside WebGL gantry billboards present", "warm_t1_e9", t1_e9_03),
        TestCaseDef("T1-E9-04", 1, "E9", "Podium ad renders in FINISHED without button overlap", "isolated", t1_e9_04),
        TestCaseDef("T1-E9-05", 1, "E9", "All <ins> placements carry ca-pub-2255472474228401", "warm_t1_e9", t1_e9_05),
        # E10 (6)
        TestCaseDef("T1-E10-01", 1, "E10", "DRIFT_RUSH timeout enters CONTINUE_OFFER", "warm_t1_e10_timer", t1_e10_01),
        TestCaseDef("T1-E10-02", 1, "E10", "Watch Ad -> AD_WATCHING -> Continue resumes RACING", "warm_t1_e10_timer", t1_e10_02),
        TestCaseDef("T1-E10-03", 1, "E10", "Escape pauses game & freezes physics/clock", "warm_t1_e10_pause", t1_e10_03),
        TestCaseDef("T1-E10-04", 1, "E10", "Resume returns to RACING & throttle works", "warm_t1_e10_pause", t1_e10_04),
        TestCaseDef("T1-E10-05", 1, "E10", "Restart resets lap, score, continues & timer", "warm_t1_e10_pause", t1_e10_05),
        TestCaseDef("T1-E10-06", 1, "E10", "Back to Garage returns to GARAGE cleanly", "warm_t1_e10_pause", t1_e10_06),
    ]
