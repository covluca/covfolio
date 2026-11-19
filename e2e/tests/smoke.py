"""Baseline --smoke tests verifying the existing '/' portfolio route and WebGL2 capability."""

from __future__ import annotations

import time

from tests.helpers import (
    TestCaseDef,
    TestContext,
    assert_visibly_rendered,
    click_visible_color_mode_button,
    click_visible_nav_link,
    http_get,
    inspect_element,
    wait_until,
)


def _smoke_http_and_assets(ctx: TestContext) -> None:
    for path, expected_ct in [
        ("/", "text/html"),
        ("/index.html", "text/html"),
        ("/kotfolio.js", "application/javascript"),
    ]:
        status, headers, body = http_get(f"{ctx.base_url}{path}")
        assert status == 200, f"GET {path} returned {status}"
        assert len(body) > 100, f"GET {path} body unexpectedly empty"
        ct = headers.get("content-type", "")
        assert expected_ct in ct, f"GET {path} expected Content-Type containing {expected_ct!r}, got {ct!r}"

    status_404, _, _ = http_get(f"{ctx.base_url}/nonexistent-asset-check.js")
    assert status_404 == 404, f"Missing .js asset should return 404, got {status_404}"


def _smoke_home_baseline(ctx: TestContext) -> None:
    s = ctx.session
    s.navigate(f"{ctx.base_url}/")

    wait_until(
        lambda: s.eval_js("document.title === 'Barbu Luca - Home' && !!document.querySelector('#projects')"),
        timeout=12.0,
        desc="home page hydration",
    )

    assert s.eval_js("document.title") == "Barbu Luca - Home"

    # Default color mode DARK on fresh context
    has_dark = s.eval_js("document.querySelector('#root')?.classList.contains('silk-colors_dark')")
    assert has_dark is True, "Expected #root to carry silk-colors_dark on fresh context"

    # Toggle color mode Dark -> Light -> Dark via visible NavHeader ColorModeButton
    click_visible_color_mode_button(s)
    wait_until(
        lambda: s.eval_js("document.querySelector('#root')?.classList.contains('silk-colors_light')"),
        timeout=4.0,
        desc="toggle to silk-colors_light",
    )
    assert s.eval_js("localStorage.getItem('kotfolio:colorMode')") == "LIGHT"

    click_visible_color_mode_button(s)
    wait_until(
        lambda: s.eval_js("document.querySelector('#root')?.classList.contains('silk-colors_dark')"),
        timeout=4.0,
        desc="toggle back to silk-colors_dark",
    )

    # Portfolio sections & key copy
    for sec in ("#home", "#about", "#experience", "#skills_and_tools", "#photography", "#projects"):
        info = inspect_element(s, sec, only_visible=False)
        assert info is not None and info["rect"]["height"] > 0, f"Section {sec} missing or zero height: {info}"

    body_text = s.eval_js("document.body.innerText || ''")
    for snippet in ("Luca Barbu.", "About me.", "Work Experience.", "My Side Projects."):
        assert snippet in body_text, f"Home copy missing {snippet!r}"

    # Existing desktop nav links visible (without hardcoding exact link count since /drift is added by M1)
    for href in ("/#home", "/#about", "/#experience", "/#projects", "/organizer", "/ascii"):
        link = inspect_element(s, f'a[href="{href}"]', only_visible=True)
        assert link is not None, f"Visible nav link missing for {href}"

    # Click #projects nav anchor & verify scroll completes cleanly
    click_visible_nav_link(s, "/#projects")
    wait_until(
        lambda: s.eval_js("document.querySelector('#projects').getBoundingClientRect().top < window.innerHeight"),
        timeout=4.0,
        desc="#projects scrolled into view",
    )

    # Verify SwiftShader WebGL2 capability cleanly
    webgl = s.eval_js(
        """(() => {
            const c = document.createElement('canvas');
            c.width = 64; c.height = 64;
            const gl = c.getContext('webgl2') || c.getContext('webgl');
            return { ok: !!gl, lost: gl ? gl.isContextLost() : true };
        })()"""
    )
    assert webgl["ok"] and not webgl["lost"], f"Headless WebGL2 check failed: {webgl}"

    s.assert_no_fatal_errors("smoke_home_baseline")


def get_smoke_tests() -> list[TestCaseDef]:
    return [
        TestCaseDef(
            test_id="SMOKE-01",
            tier=0,
            feature="SMOKE",
            name="Static Server HTTP & MIME Contract",
            group="isolated",
            fn=_smoke_http_and_assets,
        ),
        TestCaseDef(
            test_id="SMOKE-02",
            tier=0,
            feature="SMOKE",
            name="Portfolio '/' Baseline, Theme Toggle, Nav Scroll & WebGL2",
            group="isolated",
            fn=_smoke_home_baseline,
        ),
    ]
