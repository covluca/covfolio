"""Shared opaque-box test helpers, telemetry polling, PNG variance checks, and closed-loop driving."""

from __future__ import annotations

import json
import math
import statistics
import struct
import time
import urllib.request
import zlib
from dataclasses import dataclass
from typing import Any, Callable, Optional

from cdp import CDPSession, ChromeBrowser
from server import StaticSiteServer

PUBLISHER_ID_RAW = "pub-2255472474228401"
PUBLISHER_ID_CA = "ca-pub-2255472474228401"
TRACK_IDS = ("sunny_coast", "canyon_loop", "neon_circuit")
CAR_IDS = ("jelly_gt", "tofu_86", "bumble_buggy", "cobalt_hyper")
MODE_IDS = ("DRIFT_RUSH", "GRAND_PRIX")
ADBLOCK_PATTERNS = ["*pagead2.googlesyndication.com*", "*doubleclick.net*"]


@dataclass
class TestCaseDef:
    test_id: str
    tier: int
    feature: str
    name: str
    group: str
    fn: Callable[["TestContext"], None]


class TestContext:
    """Execution context passed to each test case."""

    def __init__(
        self,
        browser: ChromeBrowser,
        server: StaticSiteServer,
        session: CDPSession,
        base_url: str,
    ) -> None:
        self.browser = browser
        self.server = server
        self.session = session
        self.base_url = base_url
        self._extra_sessions: list[CDPSession] = []

    def open_extra_session(
        self,
        viewport: tuple[int, int] = (1280, 720),
        mobile: bool = False,
        has_touch: bool = False,
        device_scale_factor: float = 1.0,
    ) -> CDPSession:
        s = self.browser.new_session(
            viewport=viewport,
            mobile=mobile,
            has_touch=has_touch,
            device_scale_factor=device_scale_factor,
        )
        self._extra_sessions.append(s)
        return s

    def cleanup_extra_sessions(self) -> None:
        for s in self._extra_sessions:
            try:
                s.close()
            except Exception:
                pass
        self._extra_sessions.clear()


# ---------------------------------------------------------------------------
# Pure-Python PNG Decoder (for opaque-box WebGL pixel variance & frame diffs)
# ---------------------------------------------------------------------------


def _paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def decode_png_rgba(png_bytes: bytes) -> tuple[int, int, bytes]:
    """Decode an 8-bit RGB or RGBA PNG into (width, height, raw_rgba_bytes)."""
    if png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Invalid PNG signature")
    pos = 8
    width = height = 0
    color_type = 6
    idat_chunks: list[bytes] = []
    while pos + 8 <= len(png_bytes):
        length = struct.unpack(">I", png_bytes[pos : pos + 4])[0]
        ctype = png_bytes[pos + 4 : pos + 8]
        chunk = png_bytes[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack(">IIBBBBB", chunk)
            if bit_depth != 8 or comp != 0 or filt != 0 or interlace != 0:
                raise ValueError(f"Unsupported PNG format: bd={bit_depth}, ct={color_type}, int={interlace}")
        elif ctype == b"IDAT":
            idat_chunks.append(chunk)
        elif ctype == b"IEND":
            break

    bpp = 4 if color_type == 6 else (3 if color_type == 2 else 0)
    if bpp == 0:
        raise ValueError(f"Unsupported PNG color_type={color_type}")

    raw = zlib.decompress(b"".join(idat_chunks))
    stride = width * bpp
    out = bytearray(width * height * 4)
    prev_row = bytearray(stride)
    idx = 0
    for y in range(height):
        filt_type = raw[idx]
        idx += 1
        row = bytearray(raw[idx : idx + stride])
        idx += stride
        if filt_type == 1:  # Sub
            for i in range(bpp, stride):
                row[i] = (row[i] + row[i - bpp]) & 0xFF
        elif filt_type == 2:  # Up
            for i in range(stride):
                row[i] = (row[i] + prev_row[i]) & 0xFF
        elif filt_type == 3:  # Average
            for i in range(stride):
                a = row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + ((a + prev_row[i]) >> 1)) & 0xFF
        elif filt_type == 4:  # Paeth
            for i in range(stride):
                a = row[i - bpp] if i >= bpp else 0
                b = prev_row[i]
                c = prev_row[i - bpp] if i >= bpp else 0
                row[i] = (row[i] + _paeth_predictor(a, b, c)) & 0xFF
        elif filt_type != 0:
            raise ValueError(f"Unknown PNG filter type {filt_type}")

        prev_row = row
        dst = y * width * 4
        if bpp == 4:
            out[dst : dst + width * 4] = row
        else:
            for x in range(width):
                s = x * 3
                d = dst + x * 4
                out[d] = row[s]
                out[d + 1] = row[s + 1]
                out[d + 2] = row[s + 2]
                out[d + 3] = 255
    return width, height, bytes(out)


def sample_region_variance(
    png_bytes: bytes,
    rect: Optional[dict[str, float]] = None,
    step: int = 16,
) -> tuple[int, float]:
    """Return (distinct_rgb_count, channel_stdev) inside rect."""
    w, h, rgba = decode_png_rgba(png_bytes)
    if rect:
        x0 = max(0, int(rect["left"]))
        y0 = max(0, int(rect["top"]))
        x1 = min(w, int(rect["right"]))
        y1 = min(h, int(rect["bottom"]))
    else:
        x0, y0, x1, y1 = 0, 0, w, h
    colors: set[tuple[int, int, int]] = set()
    lumas: list[float] = []
    for y in range(y0 + 4, max(y0 + 5, y1 - 4), max(4, step)):
        row_off = y * w * 4
        for x in range(x0 + 4, max(x0 + 5, x1 - 4), max(4, step)):
            p = row_off + x * 4
            r, g, b = rgba[p], rgba[p + 1], rgba[p + 2]
            colors.add((r >> 2, g >> 2, b >> 2))
            lumas.append(0.299 * r + 0.587 * g + 0.114 * b)
    if len(lumas) < 2:
        return len(colors), 0.0
    return len(colors), statistics.pstdev(lumas)


def mean_pixel_diff(png_a: bytes, png_b: bytes, rect: Optional[dict[str, float]] = None, step: int = 12) -> float:
    """Compute mean absolute RGB channel difference between two screenshots inside rect."""
    wa, ha, ra = decode_png_rgba(png_a)
    wb, hb, rb = decode_png_rgba(png_b)
    if (wa, ha) != (wb, hb):
        return 255.0
    if rect:
        x0 = max(0, int(rect["left"]))
        y0 = max(0, int(rect["top"]))
        x1 = min(wa, int(rect["right"]))
        y1 = min(ha, int(rect["bottom"]))
    else:
        x0, y0, x1, y1 = 0, 0, wa, ha
    total = 0
    count = 0
    for y in range(y0, y1, max(4, step)):
        row_off = y * wa * 4
        for x in range(x0, x1, max(4, step)):
            p = row_off + x * 4
            total += abs(ra[p] - rb[p]) + abs(ra[p + 1] - rb[p + 1]) + abs(ra[p + 2] - rb[p + 2])
            count += 3
    return (total / count) if count > 0 else 0.0


# ---------------------------------------------------------------------------
# HTTP Fetch Helper
# ---------------------------------------------------------------------------


def http_get(url: str, timeout: float = 10.0) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}
            return int(resp.status), headers, resp.read()
    except urllib.error.HTTPError as err:
        headers = {k.lower(): v for k, v in err.headers.items()} if err.headers else {}
        return int(err.code), headers, err.read()


# ---------------------------------------------------------------------------
# Geometry, DOM Visibility & Telemetry Helpers
# ---------------------------------------------------------------------------


def normalize_rect(r: Optional[dict[str, Any]]) -> dict[str, float]:
    if not r or not isinstance(r, dict):
        return {"left": 0.0, "top": 0.0, "right": 0.0, "bottom": 0.0, "width": 0.0, "height": 0.0}
    left = float(r["left"] if "left" in r else r.get("x", 0.0))
    top = float(r["top"] if "top" in r else r.get("y", 0.0))
    width = float(r.get("width", 0.0))
    height = float(r.get("height", 0.0))
    right = float(r.get("right", left + width))
    bottom = float(r.get("bottom", top + height))
    return {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "width": width,
        "height": height,
    }


def rects_overlap(a: dict[str, float], b: dict[str, float], margin: float = 0.0) -> bool:
    return not (
        a["right"] + margin <= b["left"]
        or b["right"] + margin <= a["left"]
        or a["bottom"] + margin <= b["top"]
        or b["bottom"] + margin <= a["top"]
    )


def get_snapshot(session: CDPSession) -> dict[str, Any]:
    snap = session.eval_js(
        "(() => window.__JELLY_DRIFT__ && typeof window.__JELLY_DRIFT__.getSnapshot === 'function' "
        "? window.__JELLY_DRIFT__.getSnapshot() : null)()"
    )
    if not isinstance(snap, dict):
        path = session.eval_js("window.location.pathname")
        title = session.eval_js("document.title")
        raise AssertionError(
            f"window.__JELLY_DRIFT__.getSnapshot() unavailable (pathname={path!r}, title={title!r})"
        )
    return snap


def wait_until(
    fn: Callable[[], Any],
    timeout: float = 10.0,
    poll: float = 0.1,
    desc: str = "condition",
) -> Any:
    deadline = time.monotonic() + timeout
    last_val = None
    last_err: Optional[Exception] = None
    while time.monotonic() < deadline:
        try:
            last_val = fn()
            if last_val:
                return last_val
            last_err = None
        except Exception as exc:
            last_err = exc
        time.sleep(poll)
    extra = f" (last error: {last_err})" if last_err else f" (last value: {last_val!r})"
    raise AssertionError(f"Timed out after {timeout:.1f}s waiting for {desc}{extra}")


def wait_snapshot(
    session: CDPSession,
    predicate: Callable[[dict[str, Any]], bool],
    timeout: float = 10.0,
    poll: float = 0.1,
    desc: str = "snapshot predicate",
) -> dict[str, Any]:
    last_snap: Optional[dict[str, Any]] = None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            snap = get_snapshot(session)
            last_snap = snap
            if predicate(snap):
                return snap
        except AssertionError:
            pass
        time.sleep(poll)
    raise AssertionError(f"Timed out after {timeout:.1f}s waiting for {desc}; last snapshot={last_snap!r}")


def inspect_element(session: CDPSession, selector: str, only_visible: bool = False) -> Optional[dict[str, Any]]:
    js = f"""(() => {{
        const nodes = Array.from(document.querySelectorAll({selector!r}));
        if (!nodes.length) return null;
        const inspect = (el) => {{
            const rect = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            let ancestorHidden = false;
            let cur = el;
            while (cur && cur !== document.documentElement) {{
                const acs = getComputedStyle(cur);
                if (acs.display === 'none' || parseFloat(acs.opacity) <= 0.05) {{
                    ancestorHidden = true;
                    break;
                }}
                cur = cur.parentElement;
            }}
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const intersects = rect.right > 0 && rect.bottom > 0 && rect.left < vw && rect.top < vh;
            const visible = !ancestorHidden && cs.visibility === 'visible' && rect.width > 0 && rect.height > 0 && intersects;
            return {{
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                text: (el.innerText || el.textContent || '').trim(),
                disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
                display: cs.display,
                visibility: cs.visibility,
                opacity: parseFloat(cs.opacity),
                pointerEvents: cs.pointerEvents,
                zIndex: cs.zIndex,
                transform: cs.transform,
                rect: {{ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }},
                intersectsViewport: intersects,
                ancestorHidden: ancestorHidden,
                visible: visible,
                viewport: {{ width: vw, height: vh }}
            }};
        }};
        const infos = nodes.map(inspect);
        if ({'true' if only_visible else 'false'}) {{
            return infos.find(i => i.visible) || null;
        }}
        return infos[0];
    }})()"""
    return session.eval_js(js)


def assert_visibly_rendered(session: CDPSession, selector: str, check_viewport: bool = True) -> dict[str, Any]:
    info = inspect_element(session, selector, only_visible=False)
    if not info:
        raise AssertionError(f"Element not found in DOM: {selector}")
    if info["ancestorHidden"]:
        raise AssertionError(f"Element or ancestor hidden (display:none or opacity<=0.05) for {selector}: {info}")
    if info["visibility"] != "visible":
        raise AssertionError(f"Element visibility != 'visible' for {selector}: {info['visibility']}")
    if info["rect"]["width"] <= 0 or info["rect"]["height"] <= 0:
        raise AssertionError(f"Element has non-positive bounding box for {selector}: {info['rect']}")
    if check_viewport and not info["intersectsViewport"]:
        raise AssertionError(f"Element does not intersect viewport for {selector}: {info['rect']} vs {info['viewport']}")
    return info


def assert_hidden_preserving_layout(session: CDPSession, selector: str, require_ins: bool = True) -> dict[str, Any]:
    info = inspect_element(session, selector, only_visible=False)
    if not info:
        raise AssertionError(f"Expected hidden element missing from DOM: {selector}")
    dom_check = session.eval_js(
        f"""(() => {{
            const el = document.querySelector({selector!r});
            if (!el) return {{ found: false }};
            let ancestorDisplayNone = false;
            let cur = el.parentElement;
            while (cur && cur !== document.documentElement) {{
                if (getComputedStyle(cur).display === 'none') {{
                    ancestorDisplayNone = true;
                    break;
                }}
                cur = cur.parentElement;
            }}
            const ins = el.querySelector('ins.adsbygoogle');
            const insDisplay = ins ? getComputedStyle(ins).display : null;
            return {{
                found: true,
                ancestorDisplayNone,
                hasIns: !!ins,
                insDisplay,
            }};
        }})()"""
    )
    if require_ins and (not dom_check or not dom_check["hasIns"]):
        raise AssertionError(f"Hidden ad overlay {selector} missing child <ins class='adsbygoogle'>")
    if info["display"] == "none" or (dom_check and (dom_check["ancestorDisplayNone"] or dom_check["insDisplay"] == "none")):
        raise AssertionError(
            f"AdSense violation: {selector} (or ancestor/<ins>) uses display:none instead of visibility:hidden/opacity:0 ({dom_check})"
        )
    if info["visibility"] != "hidden" and info["opacity"] > 0.05:
        raise AssertionError(
            f"Expected {selector} to be hidden, but visibility={info['visibility']}, opacity={info['opacity']}"
        )
    if info["pointerEvents"] != "none":
        raise AssertionError(f"Hidden overlay {selector} must have pointer-events:none, got {info['pointerEvents']}")
    return info


def click_selector(session: CDPSession, selector: str, only_visible: bool = True, scroll: bool = True) -> dict[str, Any]:
    if scroll:
        session.eval_js(
            f"""(() => {{
                const nodes = Array.from(document.querySelectorAll({selector!r}));
                const target = {'nodes.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none"; })' if only_visible else 'nodes[0]'};
                if (target) target.scrollIntoView({{ block: 'center', inline: 'center' }});
            }})()"""
        )
        time.sleep(0.08)
    info = inspect_element(session, selector, only_visible=only_visible)
    if not info:
        raise AssertionError(f"Clickable element not found or not visible: {selector}")
    r = info["rect"]
    cx = r["left"] + r["width"] / 2.0
    cy = r["top"] + r["height"] / 2.0
    session.click_at(cx, cy)
    return info


def click_visible_nav_link(session: CDPSession, href: str) -> None:
    click_selector(session, f'a[href="{href}"]', only_visible=True)


def click_visible_color_mode_button(session: CDPSession) -> None:
    coords = session.eval_js(
        """(() => {
            const buttons = Array.from(document.querySelectorAll('header button, nav button, .silk-display-if-at-least-md button, button'));
            for (const b of buttons) {
                const r = b.getBoundingClientRect();
                const cs = getComputedStyle(b);
                if (r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility === 'hidden') continue;
                let p = b; let vis = true;
                while (p && p !== document.documentElement) {
                    if (getComputedStyle(p).display === 'none') { vis = false; break; }
                    p = p.parentElement;
                }
                if (!vis) continue;
                // ColorModeButton in NavHeader sits near top right and contains an icon/svg
                if (r.top < 140 && (b.querySelector('svg') || /theme|color|mode|dark|light/i.test(b.getAttribute('aria-label') || b.innerText || ''))) {
                    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
                }
            }
            return null;
        })()"""
    )
    if not coords:
        raise AssertionError("Visible ColorModeButton not found in NavHeader")
    session.click_at(coords["cx"], coords["cy"])


def find_and_click_secondary_button(
    session: CDPSession,
    primary_selectors: list[str],
    text_patterns: list[str],
    container_selector: str = "#jellydrift-modal-layer, #jellydrift-hud-layer",
    action_desc: str = "button",
) -> None:
    """Click a secondary UI button using strict data-testid first, then semantic label match."""
    for sel in primary_selectors:
        info = inspect_element(session, sel, only_visible=True)
        if info and not info["disabled"]:
            r = info["rect"]
            session.click_at(r["left"] + r["width"] / 2.0, r["top"] + r["height"] / 2.0)
            return

    found = session.eval_js(
        f"""(() => {{
            const roots = Array.from(document.querySelectorAll({container_selector!r}));
            const scope = roots.length ? roots : [document.body];
            const patterns = {text_patterns!r}.map(p => new RegExp(p, 'i'));
            for (const root of scope) {{
                const btns = Array.from(root.querySelectorAll('button, a, [role="button"]'));
                for (const b of btns) {{
                    const r = b.getBoundingClientRect();
                    const cs = getComputedStyle(b);
                    if (r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.05) continue;
                    if (b.disabled || b.getAttribute('aria-disabled') === 'true') continue;
                    const label = ((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).trim();
                    if (patterns.some(rx => rx.test(label))) {{
                        return {{ cx: r.left + r.width / 2, cy: r.top + r.height / 2, label }};
                    }}
                }}
            }}
            return null;
        }})()"""
    )
    if not found:
        raise AssertionError(f"Could not find visible {action_desc} button via {primary_selectors} or {text_patterns}")
    session.click_at(found["cx"], found["cy"])


def click_pause(session: CDPSession) -> None:
    try:
        find_and_click_secondary_button(
            session,
            ['[data-testid="pause-btn"]', '[data-testid*="pause"]'],
            [r"\bpause\b"],
            container_selector="#jellydrift-hud-layer",
            action_desc="Pause",
        )
    except AssertionError:
        session.press_key("Escape")


def click_resume(session: CDPSession) -> None:
    find_and_click_secondary_button(
        session,
        ['[data-testid="resume-btn"]', '[data-testid*="resume"]'],
        [r"\bresume\b", r"continue playing"],
        container_selector="#jellydrift-modal-layer",
        action_desc="Resume",
    )


def click_back_to_garage(session: CDPSession) -> None:
    find_and_click_secondary_button(
        session,
        ['[data-testid="back-garage-btn"]', '[data-testid*="garage"]'],
        [r"garage", r"change car", r"main menu"],
        container_selector="#jellydrift-modal-layer, #jellydrift-hud-layer",
        action_desc="Back to Garage",
    )


def click_rematch_or_restart(session: CDPSession) -> None:
    find_and_click_secondary_button(
        session,
        ['[data-testid="restart-race-btn"]', '[data-testid*="rematch"]', '[data-testid*="restart"]'],
        [r"rematch", r"restart", r"race again", r"play again"],
        container_selector="#jellydrift-modal-layer, #jellydrift-hud-layer",
        action_desc="Restart/Rematch",
    )


def click_mute_toggle(session: CDPSession) -> None:
    try:
        find_and_click_secondary_button(
            session,
            ['[data-testid="mute-btn"]', '[data-testid*="mute"]', '[data-testid*="audio"]', '[data-testid*="sound"]'],
            [r"mute", r"unmute", r"sound", r"audio"],
            container_selector="#jellydrift-hud-layer, #jellydrift-modal-layer",
            action_desc="Mute",
        )
    except AssertionError:
        session.press_key("KeyM")


# ---------------------------------------------------------------------------
# Mandatory Zero-False-Pass /drift Health Check
# ---------------------------------------------------------------------------


def capture_webgl_canvas_png(session: CDPSession) -> bytes:
    """
    Capture a screenshot of the underlying WebGL canvas with DOM overlay layers
    temporarily hidden via visibility:hidden (never display:none), restoring
    original inline style.visibility immediately in a finally block.
    """
    saved_vis: dict[str, str] = {}
    try:
        saved_vis = session.eval_js(
            """(async () => {
                const ids = ['#jellydrift-modal-layer', '#jellydrift-hud-layer', '#jellydrift-ad3d-layer'];
                const saved = {};
                for (const id of ids) {
                    const el = document.querySelector(id);
                    if (el) {
                        saved[id] = el.style.visibility;
                        el.style.visibility = 'hidden';
                    }
                }
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                return saved;
            })()"""
        ) or {}
        return session.screenshot_bytes()
    finally:
        if saved_vis:
            session.eval_js(
                f"""(() => {{
                    const saved = {json.dumps(saved_vis)};
                    for (const [id, vis] of Object.entries(saved)) {{
                        const el = document.querySelector(id);
                        if (el) el.style.visibility = vis;
                    }}
                }})()"""
            )


def assert_drift_alive(session: CDPSession, expected_path: str = "/drift", timeout: float = 12.0) -> dict[str, Any]:
    """Mandatory pre-check for all /drift tests: verifies real route, live WebGL canvas, non-blank render, telemetry."""
    def _ready() -> Optional[dict[str, Any]]:
        res = session.eval_js(
            """(() => {
                const path = window.location.pathname;
                const canvas = document.querySelector('#jellydrift-webgl-layer canvas');
                const snap = window.__JELLY_DRIFT__ && typeof window.__JELLY_DRIFT__.getSnapshot === 'function'
                    ? window.__JELLY_DRIFT__.getSnapshot()
                    : null;
                if (!canvas || !snap || snap.ready !== true) return null;
                const r = canvas.getBoundingClientRect();
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                return {
                    path,
                    title: document.title,
                    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                    hasGl: !!gl,
                    contextLost: gl ? gl.isContextLost() : true,
                    drawingBufferWidth: gl ? gl.drawingBufferWidth : 0,
                    drawingBufferHeight: gl ? gl.drawingBufferHeight : 0,
                    snap,
                };
            })()"""
        )
        if not res:
            return None
        if res["path"] != expected_path:
            return None
        return res

    deadline = time.monotonic() + timeout
    info = None
    while time.monotonic() < deadline:
        info = _ready()
        if info is not None:
            break
        time.sleep(0.15)

    if info is None:
        diag = session.eval_js(
            "(() => ({ path: window.location.pathname, title: document.title, "
            "hasLayer: !!document.querySelector('#jellydrift-webgl-layer'), "
            "hasCanvas: !!document.querySelector('#jellydrift-webgl-layer canvas'), "
            "hasApi: !!window.__JELLY_DRIFT__ }))()"
        )
        raise AssertionError(
            f"assert_drift_alive failed: /drift did not initialize within {timeout:.1f}s (diag={diag!r})"
        )

    assert info["path"] == expected_path, f"Expected pathname {expected_path}, got {info['path']}"
    rect = normalize_rect(info["rect"])
    assert rect["width"] >= 300 and rect["height"] >= 200, f"WebGL canvas too small: {rect}"
    assert info["hasGl"] and not info["contextLost"], f"WebGL context invalid or lost: {info}"
    assert info["drawingBufferWidth"] >= 300 and info["drawingBufferHeight"] >= 200, (
        f"WebGL drawingBuffer too small: {info['drawingBufferWidth']}x{info['drawingBufferHeight']}"
    )

    snap = info["snap"]
    assert snap.get("ready") is True, f"Snapshot not ready: {snap}"
    assert snap.get("fatalErrors", []) == [], f"Snapshot fatalErrors non-empty: {snap.get('fatalErrors')}"
    session.assert_no_fatal_errors("assert_drift_alive")

    # Verify non-blank rendered WebGL frame directly on the canvas (UI/ad overlay layers hidden via visibility:hidden)
    png = capture_webgl_canvas_png(session)
    colors, stdev = sample_region_variance(png, rect=rect, step=20)
    assert colors >= 2 and stdev > 0.5, (
        f"WebGL canvas appears blank/uniform (distinct_colors={colors}, luma_stdev={stdev:.2f})"
    )
    return snap


# ---------------------------------------------------------------------------
# Navigation & Lifecycle Helpers
# ---------------------------------------------------------------------------


def open_drift(session: CDPSession, base_url: str, query: str = "") -> dict[str, Any]:
    url = f"{base_url}/drift{query}"
    session.navigate(url)
    return assert_drift_alive(session)


def select_garage_options(
    session: CDPSession,
    track_id: Optional[str] = None,
    car_id: Optional[str] = None,
    mode_id: Optional[str] = None,
) -> None:
    if track_id is not None:
        click_selector(session, f'[data-track-id="{track_id}"]', only_visible=True)
        time.sleep(0.08)
    if car_id is not None:
        click_selector(session, f'[data-car-id="{car_id}"]', only_visible=True)
        time.sleep(0.08)
    if mode_id is not None:
        click_selector(session, f'[data-mode-id="{mode_id}"]', only_visible=True)
        time.sleep(0.08)


def start_race(
    session: CDPSession,
    track_id: Optional[str] = "sunny_coast",
    car_id: Optional[str] = "jelly_gt",
    mode_id: Optional[str] = "DRIFT_RUSH",
    wait_racing: bool = True,
) -> dict[str, Any]:
    select_garage_options(session, track_id=track_id, car_id=car_id, mode_id=mode_id)
    click_selector(session, '[data-testid="start-race-btn"]', only_visible=True)
    if wait_racing:
        snap = wait_snapshot(
            session,
            lambda s: s.get("phase") == "RACING",
            timeout=10.0,
            poll=0.1,
            desc="phase == RACING",
        )
    else:
        snap = wait_snapshot(
            session,
            lambda s: s.get("phase") in ("COUNTDOWN", "RACING"),
            timeout=6.0,
            poll=0.05,
            desc="phase in (COUNTDOWN, RACING)",
        )
    if track_id is not None:
        assert snap.get("trackId") == track_id, f"Expected trackId={track_id}, got {snap.get('trackId')}"
    if car_id is not None:
        assert snap.get("carId") == car_id, f"Expected carId={car_id}, got {snap.get('carId')}"
    if mode_id is not None:
        assert snap.get("mode") == mode_id, f"Expected mode={mode_id}, got {snap.get('mode')}"
    return snap


def ensure_garage(session: CDPSession, base_url: str) -> dict[str, Any]:
    path = session.eval_js("window.location.pathname")
    has_api = session.eval_js("!!(window.__JELLY_DRIFT__ && window.__JELLY_DRIFT__.getSnapshot)")
    if path != "/drift" or not has_api:
        return open_drift(session, base_url)
    snap = get_snapshot(session)
    phase = snap.get("phase")
    if phase == "GARAGE":
        return snap
    if phase in ("RACING", "COUNTDOWN"):
        click_pause(session)
        wait_snapshot(session, lambda s: s.get("phase") == "PAUSED", timeout=4.0, desc="phase == PAUSED")
    click_back_to_garage(session)
    return wait_snapshot(session, lambda s: s.get("phase") == "GARAGE", timeout=6.0, desc="phase == GARAGE")


def ensure_racing(
    session: CDPSession,
    base_url: str,
    track_id: str = "sunny_coast",
    car_id: str = "jelly_gt",
    mode_id: str = "DRIFT_RUSH",
    fresh_restart: bool = True,
) -> dict[str, Any]:
    path = session.eval_js("window.location.pathname")
    has_api = session.eval_js("!!(window.__JELLY_DRIFT__ && window.__JELLY_DRIFT__.getSnapshot)")
    if path != "/drift" or not has_api:
        open_drift(session, base_url)
        return start_race(session, track_id=track_id, car_id=car_id, mode_id=mode_id, wait_racing=True)

    snap = get_snapshot(session)
    phase = snap.get("phase")
    matches = (
        snap.get("trackId") == track_id
        and snap.get("carId") == car_id
        and snap.get("mode") == mode_id
    )
    if phase == "RACING" and matches and not fresh_restart:
        if snap.get("cameraMode") != "CHASE":
            session.press_key("KeyC")
            wait_snapshot(session, lambda s: s.get("cameraMode") == "CHASE", timeout=3.0, desc="camera CHASE")
        return get_snapshot(session)

    if matches and phase in ("RACING", "PAUSED", "CONTINUE_OFFER", "FINISHED"):
        if phase == "RACING":
            click_pause(session)
            wait_snapshot(session, lambda s: s.get("phase") == "PAUSED", timeout=4.0, desc="phase == PAUSED")
        try:
            click_rematch_or_restart(session)
            return wait_snapshot(session, lambda s: s.get("phase") == "RACING", timeout=10.0, desc="restart RACING")
        except AssertionError:
            pass

    ensure_garage(session, base_url)
    return start_race(session, track_id=track_id, car_id=car_id, mode_id=mode_id, wait_racing=True)


def wait_for_drift_rush_timeout(session: CDPSession, timeout_s: float = 75.0) -> dict[str, Any]:
    """Wait naturally for DRIFT_RUSH clock to reach 0 and enter CONTINUE_OFFER; fail fast if stalled."""
    start = time.monotonic()
    snap = get_snapshot(session)
    last_t = float(snap.get("timeRemainingSec", 999.0))
    last_progress_at = start
    while time.monotonic() - start < timeout_s:
        snap = get_snapshot(session)
        phase = snap.get("phase")
        if phase == "CONTINUE_OFFER":
            return snap
        cur_t = float(snap.get("timeRemainingSec", 0.0))
        if cur_t < last_t - 0.05:
            last_t = cur_t
            last_progress_at = time.monotonic()
        elif time.monotonic() - last_progress_at > 5.0 and phase == "RACING":
            raise AssertionError(f"DRIFT_RUSH timer stalled at timeRemainingSec={cur_t:.2f} in phase={phase}")
        time.sleep(0.2)
    raise AssertionError(f"Timed out waiting for DRIFT_RUSH CONTINUE_OFFER; last snap={get_snapshot(session)!r}")


def complete_watch_ad_to_continue(
    session: CDPSession,
    expected_min_continues: int = 1,
    timeout_s: float = 15.0,
) -> dict[str, Any]:
    """Execute Watch-an-Ad-to-Continue UI flow from CONTINUE_OFFER back into RACING."""
    assert_visibly_rendered(session, '[data-testid="watch-ad-continue-btn"]')
    click_selector(session, '[data-testid="watch-ad-continue-btn"]', only_visible=True)

    # Tier 1 adBreak might auto-grant quickly or transition to AD_WATCHING Tier 2 modal
    deadline = time.monotonic() + timeout_s
    saw_watching = False
    while time.monotonic() < deadline:
        snap = get_snapshot(session)
        phase = snap.get("phase")
        if phase == "RACING" and snap.get("continuesUsed", 0) >= expected_min_continues:
            return snap
        if phase == "AD_WATCHING":
            saw_watching = True
            info = inspect_element(session, '[data-testid="confirm-continue-btn"]', only_visible=True)
            if info and not info["disabled"]:
                click_selector(session, '[data-testid="confirm-continue-btn"]', only_visible=True)
                return wait_snapshot(
                    session,
                    lambda s: s.get("phase") == "RACING" and s.get("continuesUsed", 0) >= expected_min_continues,
                    timeout=6.0,
                    desc="RACING after confirm-continue-btn",
                )
        time.sleep(0.2)

    raise AssertionError(
        f"Continue flow did not resume RACING (saw_watching={saw_watching}, snap={get_snapshot(session)!r})"
    )


# ---------------------------------------------------------------------------
# Opaque-Box Closed-Loop Waypoint & Checkpoint Steering Driver
# ---------------------------------------------------------------------------


def _wrap_angle_rad(a: float) -> float:
    while a > math.pi:
        a -= 2.0 * math.pi
    while a < -math.pi:
        a += 2.0 * math.pi
    return a


def drive_laps_opaque_box(
    session: CDPSession,
    target_laps: Optional[int] = None,
    target_checkpoints: Optional[int] = None,
    timeout_s: float = 150.0,
    use_drift_on_sharp: bool = True,
    stats: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Drive forward using ONLY getSnapshot() telemetry (playerWorldPos, yawDeg,
    nextCheckpointPos, nextCheckpointDirDeg, checkpointIndex, lap, speedKmh,
    timeRemainingSec, jellySpring) and real KeyW/KeyA/KeyD/Space inputs.
    No internal track spline reads or state overrides.
    """
    start = time.monotonic()
    waypoints: dict[int, tuple[float, float]] = {}
    snap = get_snapshot(session)
    last_cp = int(snap.get("checkpointIndex", 0))
    t_prev = float(snap.get("timeRemainingSec", 0.0))
    max_time_jump = -999.0
    checkpoints_crossed = 0

    def _record_stats(cur_snap: dict[str, Any]) -> None:
        nonlocal t_prev, max_time_jump
        t_cur = float(cur_snap.get("timeRemainingSec", 0.0))
        max_time_jump = max(max_time_jump, t_cur - t_prev)
        t_prev = t_cur
        if stats is not None:
            stats["max_time_jump"] = max_time_jump
            stats["checkpoints_crossed"] = checkpoints_crossed

    # Calibrate steering sign (+1 or -1) from an initial tiny KeyA probe on real yawDeg
    yaw0 = float(snap["playerWorldPos"]["yawDeg"])
    session.key_down("KeyW")
    time.sleep(0.25)
    session.key_down("KeyA")
    time.sleep(0.22)
    session.key_up("KeyA")
    snap_probe = get_snapshot(session)
    _record_stats(snap_probe)
    yaw1 = float(snap_probe["playerWorldPos"]["yawDeg"])
    dyaw = (yaw1 - yaw0 + 180.0) % 360.0 - 180.0
    # Record whether KeyA increases (+1) or decreases (-1) yawDeg
    left_yaw_sign = 1.0 if dyaw >= 0 else -1.0

    # Also detect forward axis convention (Three.js -Z vs +Z) via displacement
    p0 = snap["playerWorldPos"]
    p1 = snap_probe["playerWorldPos"]
    dx, dz = float(p1["x"]) - float(p0["x"]), float(p1["z"]) - float(p0["z"])
    if math.hypot(dx, dz) > 0.2:
        yaw_rad_1 = math.radians(yaw1)
        # Check if forward vector aligns with (sin(yaw), cos(yaw)) or (-sin(yaw), -cos(yaw))
        dot_pos = math.sin(yaw_rad_1) * dx + math.cos(yaw_rad_1) * dz
        fwd_sign = 1.0 if dot_pos >= 0 else -1.0
    else:
        fwd_sign = -1.0

    steer_dir = "KeyA"
    held_steer: Optional[str] = None
    held_space = False
    last_pos = (float(p1["x"]), float(p1["z"]))
    last_move_time = time.monotonic()
    last_turn_switch = time.monotonic()

    try:
        while time.monotonic() - start < timeout_s:
            snap = get_snapshot(session)
            _record_stats(snap)
            phase = snap.get("phase")
            if phase == "FINISHED":
                return snap
            lap = int(snap.get("lap", 1))
            if target_laps is not None and lap > target_laps:
                return snap

            cp = int(snap.get("checkpointIndex", 0))
            pos = snap["playerWorldPos"]
            x, z = float(pos["x"]), float(pos["z"])
            yaw_deg = float(pos["yawDeg"])
            speed = float(snap.get("speedKmh", 0.0))

            if cp != last_cp:
                waypoints[last_cp] = (x, z)
                checkpoints_crossed += 1
                last_cp = cp
                _record_stats(snap)
                if target_checkpoints is not None and checkpoints_crossed >= target_checkpoints:
                    return snap

            if math.hypot(x - last_pos[0], z - last_pos[1]) > 0.8:
                last_pos = (x, z)
                last_move_time = time.monotonic()

            # Compute desired steer
            desired_steer: Optional[str] = None
            want_drift = False

            # Reverse-unwedge recovery if car becomes stalled against a barrier
            if time.monotonic() - last_move_time > 1.8:
                if held_space:
                    session.key_up("Space")
                    held_space = False
                if held_steer is not None:
                    session.key_up(held_steer)
                    held_steer = None
                session.key_up("KeyW")
                steer_dir = "KeyD" if steer_dir == "KeyA" else "KeyA"
                session.hold_keys(["KeyS", steer_dir], 0.45)
                session.key_down("KeyW")
                last_move_time = time.monotonic()
                time.sleep(0.08)
                continue

            next_cp = snap.get("nextCheckpointPos")
            target_xy: Optional[tuple[float, float]] = None
            if (
                isinstance(next_cp, dict)
                and next_cp.get("x") is not None
                and next_cp.get("z") is not None
                and math.isfinite(float(next_cp["x"]))
                and math.isfinite(float(next_cp["z"]))
            ):
                target_xy = (float(next_cp["x"]), float(next_cp["z"]))
            elif lap >= 2 and cp in waypoints:
                target_xy = waypoints[cp]

            if target_xy is not None:
                tx, tz = target_xy
                dist_to_target = math.hypot(tx - x, tz - z)
                yaw_rad = math.radians(yaw_deg)
                cur_fx = fwd_sign * math.sin(yaw_rad)
                cur_fz = fwd_sign * math.cos(yaw_rad)
                cur_heading = math.atan2(cur_fx, cur_fz)

                if dist_to_target > 1.5:
                    target_heading = math.atan2(tx - x, tz - z)
                elif snap.get("nextCheckpointDirDeg") is not None and math.isfinite(float(snap["nextCheckpointDirDeg"])):
                    dir_rad = math.radians(float(snap["nextCheckpointDirDeg"]))
                    target_heading = math.atan2(fwd_sign * math.sin(dir_rad), fwd_sign * math.cos(dir_rad))
                else:
                    target_heading = cur_heading

                err = _wrap_angle_rad(target_heading - cur_heading)
                test_yaw = yaw_rad + math.radians(5.0 * left_yaw_sign)
                test_heading = math.atan2(fwd_sign * math.sin(test_yaw), fwd_sign * math.cos(test_yaw))
                left_delta = _wrap_angle_rad(test_heading - cur_heading)
                left_helps = (err * left_delta) > 0
                if abs(err) > 0.12:
                    desired_steer = "KeyA" if left_helps else "KeyD"
                if use_drift_on_sharp and abs(err) > 0.55 and speed > 60:
                    want_drift = True
            else:
                # Fallback when nextCheckpointPos is unavailable on Lap 1: wall-scrape & stall steering
                squash = abs(float(snap.get("jellySpring", {}).get("squash", 0.0)))
                stalled = (time.monotonic() - last_move_time > 0.6) or (speed < 42.0 and time.monotonic() - start > 1.2)
                if stalled or squash > 0.08:
                    if time.monotonic() - last_turn_switch > 0.9:
                        steer_dir = "KeyD" if steer_dir == "KeyA" else "KeyA"
                        last_turn_switch = time.monotonic()
                    desired_steer = steer_dir
                elif speed < 85.0 and time.monotonic() - start > 2.0:
                    desired_steer = steer_dir

            if desired_steer != held_steer:
                if held_steer is not None:
                    session.key_up(held_steer)
                if desired_steer is not None:
                    session.key_down(desired_steer)
                held_steer = desired_steer

            if want_drift != held_space:
                if want_drift:
                    session.key_down("Space")
                else:
                    session.key_up("Space")
                held_space = want_drift

            time.sleep(0.08)
    finally:
        if held_space:
            session.key_up("Space")
        if held_steer is not None:
            session.key_up(held_steer)
        session.key_up("KeyW")

    snap_final = get_snapshot(session)
    _record_stats(snap_final)
    return snap_final
