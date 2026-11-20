"""Thread-safe multiplexed Chrome DevTools Protocol (CDP) driver for headless Chrome."""

from __future__ import annotations

import base64
import fnmatch
import json
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import websocket

CHROME_EXE = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

KEY_CODES = {
    "KeyW": ("w", 87),
    "KeyA": ("a", 65),
    "KeyS": ("s", 83),
    "KeyD": ("d", 68),
    "KeyC": ("c", 67),
    "KeyV": ("v", 86),
    "KeyB": ("b", 66),
    "KeyM": ("m", 77),
    "KeyR": ("r", 82),
    "KeyP": ("p", 80),
    "Space": (" ", 32),
    "ShiftLeft": ("Shift", 16),
    "ShiftRight": ("Shift", 16),
    "Escape": ("Escape", 27),
    "Enter": ("Enter", 13),
    "Tab": ("Tab", 9),
    "ArrowUp": ("ArrowUp", 38),
    "ArrowDown": ("ArrowDown", 40),
    "ArrowLeft": ("ArrowLeft", 37),
    "ArrowRight": ("ArrowRight", 39),
}


class CDPError(RuntimeError):
    """Raised when a CDP call fails or returns an error payload."""


def _is_local_url(url: str) -> bool:
    if not url:
        return False
    host = (urlparse(url).hostname or "").lower()
    return host in ("127.0.0.1", "localhost", "::1")


def _is_known_external_ad_url(url: str) -> bool:
    if not url or _is_local_url(url):
        return False
    host = (urlparse(url).hostname or "").lower()
    return (
        host == "googlesyndication.com"
        or host.endswith(".googlesyndication.com")
        or host == "doubleclick.net"
        or host.endswith(".doubleclick.net")
        or host == "googleadservices.com"
        or host.endswith(".googleadservices.com")
        or host == "adtrafficquality.google"
        or host.endswith(".adtrafficquality.google")
    )


def _matches_any_pattern(url: str, patterns: list[str]) -> bool:
    if not url or not patterns:
        return False
    for pat in patterns:
        if fnmatch.fnmatch(url, pat):
            return True
        stripped = pat.strip("*")
        if stripped and stripped in url:
            return True
    return False


class CDPSession:
    """Isolated target/browser-context CDP session attached via flatten=True."""

    def __init__(
        self,
        browser: "ChromeBrowser",
        browser_context_id: str,
        target_id: str,
        session_id: str,
    ) -> None:
        self.browser = browser
        self.browser_context_id = browser_context_id
        self.target_id = target_id
        self.session_id = session_id

        self._lock = threading.Lock()
        self._event_queues: dict[str, queue.Queue] = {}
        self._blocked_patterns: list[str] = []
        self._requests_by_id: dict[str, str] = {}

        self.exceptions: list[dict[str, Any]] = []
        self.console_errors: list[dict[str, Any]] = []
        self.log_errors: list[dict[str, Any]] = []
        self.failed_requests: list[dict[str, Any]] = []
        self.blocked_ad_requests: list[dict[str, Any]] = []
        self.external_ad_warnings: list[dict[str, Any]] = []
        self.bad_http_responses: list[dict[str, Any]] = []
        self._closed = False

    def call(self, method: str, params: Optional[dict[str, Any]] = None, timeout: float = 15.0) -> dict[str, Any]:
        return self.browser.call(method, params=params, session_id=self.session_id, timeout=timeout)

    def _subscribe(self, event_name: str) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        with self._lock:
            self._event_queues[event_name] = q
        return q

    def _unsubscribe(self, event_name: str) -> None:
        with self._lock:
            self._event_queues.pop(event_name, None)

    def _handle_event(self, method: str, params: dict[str, Any]) -> None:
        with self._lock:
            if method == "Network.requestWillBeSent":
                req_id = params.get("requestId", "")
                url = params.get("request", {}).get("url", "")
                if req_id:
                    self._requests_by_id[req_id] = url
            elif method == "Network.responseReceived":
                resp = params.get("response", {})
                status = int(resp.get("status", 200))
                url = resp.get("url", "")
                if status >= 400 and _is_local_url(url):
                    self.bad_http_responses.append({"url": url, "status": status})
            elif method == "Network.loadingFailed":
                req_id = params.get("requestId", "")
                url = self._requests_by_id.get(req_id, "")
                blocked_reason = params.get("blockedReason", "")
                is_local = _is_local_url(url)
                is_known_ad = _is_known_external_ad_url(url)
                is_expected_block = (
                    blocked_reason == "inspector"
                    and _matches_any_pattern(url, self._blocked_patterns)
                    and not is_local
                )
                entry = {
                    "url": url,
                    "type": params.get("type"),
                    "errorText": params.get("errorText"),
                    "blockedReason": blocked_reason,
                }
                if is_expected_block:
                    self.blocked_ad_requests.append(entry)
                elif is_known_ad:
                    # Offline/firewalled host compatibility (ORIGINAL_REQUEST R3):
                    # third-party AdSense/DoubleClick network failures are non-fatal warnings.
                    self.external_ad_warnings.append(entry)
                elif is_local or not _matches_any_pattern(url, self._blocked_patterns):
                    # Ignore cancelled requests caused by rapid SPA navigation/aborts only if errorText == net::ERR_ABORTED on non-local URLs
                    if params.get("errorText") == "net::ERR_ABORTED" and not is_local:
                        pass
                    else:
                        self.failed_requests.append(entry)
            elif method == "Runtime.exceptionThrown":
                details = params.get("exceptionDetails", {})
                exc_obj = details.get("exception", {})
                msg = exc_obj.get("description") or details.get("text") or str(details)
                self.exceptions.append({"message": msg, "details": details})
            elif method == "Runtime.consoleAPICalled":
                if params.get("type") == "error":
                    args = params.get("args", [])
                    rendered = " ".join(
                        str(a.get("value") or a.get("description") or "") for a in args
                    ).strip()
                    self.console_errors.append({"text": rendered, "args": args})
            elif method == "Log.entryAdded":
                entry = params.get("entry", {})
                if entry.get("level") == "error":
                    url = entry.get("url", "")
                    source = entry.get("source", "")
                    text = entry.get("text", "")
                    is_local = _is_local_url(url)
                    is_expected_block = (
                        source == "network"
                        and not is_local
                        and (_matches_any_pattern(url, self._blocked_patterns) or _is_known_external_ad_url(url))
                    )
                    is_external_ad_intervention = (
                        source == "intervention"
                        and any(
                            dom in text
                            for dom in (
                                "adtrafficquality.google",
                                "googlesyndication.com",
                                "doubleclick.net",
                                "googleadservices.com",
                            )
                        )
                    )
                    if not is_expected_block and not is_external_ad_intervention:
                        self.log_errors.append(entry)

            q = self._event_queues.get(method)
            if q is not None:
                q.put(params)

    def enable_domains(self) -> None:
        self.call("Page.enable")
        self.call("Runtime.enable")
        self.call("Log.enable")
        self.call("Network.enable")

    def clear_errors(self) -> None:
        with self._lock:
            self.exceptions.clear()
            self.console_errors.clear()
            self.log_errors.clear()
            self.failed_requests.clear()
            self.external_ad_warnings.clear()
            self.bad_http_responses.clear()

    def get_fatal_errors(self) -> list[str]:
        with self._lock:
            errs: list[str] = []
            for e in self.exceptions:
                errs.append(f"Runtime.exceptionThrown: {e['message']}")
            for e in self.console_errors:
                errs.append(f"console.error: {e['text']}")
            for e in self.log_errors:
                errs.append(f"Log.error({e.get('source')}): {e.get('text')} [{e.get('url')}]")
            for e in self.failed_requests:
                errs.append(f"Network.loadingFailed: {e.get('url')} ({e.get('errorText')} / {e.get('blockedReason')})")
            for e in self.bad_http_responses:
                errs.append(f"HTTP {e['status']}: {e['url']}")
            return errs

    def assert_no_fatal_errors(self, context: str = "") -> None:
        errs = self.get_fatal_errors()
        if errs:
            prefix = f"[{context}] " if context else ""
            raise AssertionError(f"{prefix}Browser fatal errors detected:\n  - " + "\n  - ".join(errs))

    def add_init_script(self, js: str) -> str:
        res = self.call("Page.addScriptToEvaluateOnNewDocument", {"source": js})
        return str(res.get("identifier", ""))

    def block_urls(self, urls: list[str]) -> None:
        with self._lock:
            self._blocked_patterns = list(urls)
        self.call("Network.setBlockedURLs", {"urls": list(urls)})

    def clear_blocked_urls(self) -> None:
        with self._lock:
            self._blocked_patterns = []
        self.call("Network.setBlockedURLs", {"urls": []})

    def navigate(self, url: str, wait_load: bool = True, timeout: float = 20.0) -> None:
        q = self._subscribe("Page.loadEventFired") if wait_load else None
        try:
            res = self.call("Page.navigate", {"url": url}, timeout=timeout)
            if res.get("errorText"):
                raise CDPError(f"Page.navigate failed for {url}: {res['errorText']}")
            if q is not None:
                try:
                    q.get(timeout=timeout)
                except queue.Empty as exc:
                    raise TimeoutError(f"Timed out waiting for Page.loadEventFired on {url}") from exc
        finally:
            if q is not None:
                self._unsubscribe("Page.loadEventFired")

    def eval_js(self, expr: str, await_promise: bool = True, timeout: float = 15.0) -> Any:
        res = self.call(
            "Runtime.evaluate",
            {
                "expression": expr,
                "returnByValue": True,
                "awaitPromise": await_promise,
            },
            timeout=timeout,
        )
        if "exceptionDetails" in res:
            details = res["exceptionDetails"]
            exc_obj = details.get("exception", {})
            msg = exc_obj.get("description") or details.get("text") or str(details)
            raise CDPError(f"JS evaluation threw exception: {msg}")
        result = res.get("result", {})
        if result.get("subtype") == "error":
            raise CDPError(f"JS evaluation error: {result.get('description') or result}")
        return result.get("value")

    def set_viewport(
        self,
        width: int,
        height: int,
        device_scale_factor: float = 1.0,
        mobile: bool = False,
        has_touch: bool = False,
    ) -> None:
        self.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": int(width),
                "height": int(height),
                "deviceScaleFactor": float(device_scale_factor),
                "mobile": bool(mobile),
            },
        )
        self.call(
            "Emulation.setTouchEmulationEnabled",
            {"enabled": bool(has_touch), "maxTouchPoints": 5 if has_touch else 1},
        )

    def set_focus_emulation(self, enabled: bool) -> None:
        self.call("Emulation.setFocusEmulationEnabled", {"enabled": bool(enabled)})

    def key_down(self, code: str) -> None:
        key, vk = KEY_CODES.get(code, (code, 0))
        payload: dict[str, Any] = {
            "type": "keyDown",
            "key": key,
            "code": code,
            "windowsVirtualKeyCode": vk,
            "nativeVirtualKeyCode": vk,
        }
        if len(key) == 1:
            payload["text"] = key
            payload["unmodifiedText"] = key
        self.call("Input.dispatchKeyEvent", payload)

    def key_up(self, code: str) -> None:
        key, vk = KEY_CODES.get(code, (code, 0))
        self.call(
            "Input.dispatchKeyEvent",
            {
                "type": "keyUp",
                "key": key,
                "code": code,
                "windowsVirtualKeyCode": vk,
                "nativeVirtualKeyCode": vk,
            },
        )

    def press_key(self, code: str, hold_ms: int = 40) -> None:
        self.key_down(code)
        if hold_ms > 0:
            time.sleep(hold_ms / 1000.0)
        self.key_up(code)

    def hold_key(self, code: str, duration_s: float) -> None:
        self.key_down(code)
        try:
            time.sleep(max(0.0, duration_s))
        finally:
            self.key_up(code)

    def hold_keys(self, codes: list[str], duration_s: float) -> None:
        for c in codes:
            self.key_down(c)
        try:
            time.sleep(max(0.0, duration_s))
        finally:
            for c in reversed(codes):
                self.key_up(c)

    def mouse_move(self, x: float, y: float) -> None:
        self.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": float(x), "y": float(y)})

    def click_at(self, x: float, y: float, button: str = "left", hold_ms: int = 30) -> None:
        fx, fy = float(x), float(y)
        self.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": fx, "y": fy})
        self.call(
            "Input.dispatchMouseEvent",
            {"type": "mousePressed", "x": fx, "y": fy, "button": button, "clickCount": 1},
        )
        if hold_ms > 0:
            time.sleep(hold_ms / 1000.0)
        self.call(
            "Input.dispatchMouseEvent",
            {"type": "mouseReleased", "x": fx, "y": fy, "button": button, "clickCount": 1},
        )

    def touch_start(self, points: list[tuple[float, float, int]] | tuple[float, float]) -> None:
        pts = [(*points, 0)] if isinstance(points, tuple) else points
        self.call(
            "Input.dispatchTouchEvent",
            {
                "type": "touchStart",
                "touchPoints": [{"x": float(x), "y": float(y), "id": int(tid)} for x, y, tid in pts],
            },
        )

    def touch_end(self) -> None:
        self.call("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

    def touch_tap(self, x: float, y: float, hold_ms: int = 50) -> None:
        self.touch_start((x, y))
        if hold_ms > 0:
            time.sleep(hold_ms / 1000.0)
        self.touch_end()

    def touch_hold(self, points: list[tuple[float, float, int]] | tuple[float, float], duration_s: float) -> None:
        self.touch_start(points)
        try:
            time.sleep(max(0.0, duration_s))
        finally:
            self.touch_end()

    def screenshot_bytes(self) -> bytes:
        res = self.call("Page.captureScreenshot", {"format": "png"}, timeout=15.0)
        return base64.b64decode(res["data"])

    def screenshot(self, path: str | Path) -> Path:
        out = Path(path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(self.screenshot_bytes())
        return out

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self.browser.call("Target.closeTarget", {"targetId": self.target_id}, timeout=5.0)
        except Exception:
            pass
        try:
            self.browser.call("Target.disposeBrowserContext", {"browserContextId": self.browser_context_id}, timeout=5.0)
        except Exception:
            pass
        self.browser._unregister_session(self.session_id)


class ChromeBrowser:
    """Manages a single headless Chrome process and multiplexed CDP WebSocket."""

    def __init__(self, chrome_exe: str = CHROME_EXE, window_size: tuple[int, int] = (1280, 720)) -> None:
        self.chrome_exe = chrome_exe
        self.window_size = window_size
        self.user_data_dir = tempfile.mkdtemp(prefix="covfolio_cdp_")
        self.proc: Optional[subprocess.Popen] = None
        self.ws: Optional[websocket.WebSocket] = None
        self._send_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._next_id = 0
        self._pending: dict[int, tuple[threading.Event, dict[str, Any]]] = {}
        self._sessions: dict[str, CDPSession] = {}
        self._reader_thread: Optional[threading.Thread] = None
        self._closing = False

    def start(self) -> "ChromeBrowser":
        w, h = self.window_size
        args = [
            self.chrome_exe,
            "--headless=new",
            "--enable-webgl",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--remote-debugging-port=0",
            f"--user-data-dir={self.user_data_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-extensions",
            "--disable-sync",
            "--metrics-recording-only",
            "--mute-audio",
            f"--window-size={w},{h}",
            "about:blank",
        ]
        self.proc = subprocess.Popen(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        port_file = Path(self.user_data_dir) / "DevToolsActivePort"
        deadline = time.monotonic() + 15.0
        ws_url: Optional[str] = None
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"Chrome exited unexpectedly with code {self.proc.returncode}")
            if port_file.is_file():
                lines = [ln.strip() for ln in port_file.read_text(encoding="utf-8", errors="ignore").splitlines() if ln.strip()]
                if len(lines) >= 2 and lines[0].isdigit():
                    ws_url = f"ws://127.0.0.1:{lines[0]}{lines[1]}"
                    break
            time.sleep(0.05)

        if ws_url is None:
            self.close()
            raise TimeoutError("Timed out waiting for Chrome DevToolsActivePort")

        self.ws = websocket.create_connection(ws_url, timeout=15.0)
        # Clear read timeout inside background reader loop so idle periods don't time out
        self.ws.settimeout(None)
        self._reader_thread = threading.Thread(
            target=self._read_loop,
            name="cdp-ws-reader",
            daemon=True,
        )
        self._reader_thread.start()
        return self

    def _read_loop(self) -> None:
        assert self.ws is not None
        while not self._closing:
            try:
                raw = self.ws.recv()
            except Exception:
                break
            if not raw:
                break
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if "id" in msg:
                msg_id = int(msg["id"])
                with self._state_lock:
                    entry = self._pending.get(msg_id)
                if entry is not None:
                    ev, box = entry
                    box["msg"] = msg
                    ev.set()
            else:
                sid = msg.get("sessionId")
                if sid:
                    with self._state_lock:
                        sess = self._sessions.get(sid)
                    if sess is not None:
                        sess._handle_event(msg.get("method", ""), msg.get("params", {}))

        # Wake any waiting callers on socket termination
        with self._state_lock:
            for ev, box in self._pending.values():
                box.setdefault("error", "WebSocket closed")
                ev.set()

    def call(
        self,
        method: str,
        params: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
        timeout: float = 15.0,
    ) -> dict[str, Any]:
        if self.ws is None:
            raise CDPError("Chrome WebSocket is not connected")
        ev = threading.Event()
        box: dict[str, Any] = {}
        with self._state_lock:
            self._next_id += 1
            msg_id = self._next_id
            self._pending[msg_id] = (ev, box)

        payload: dict[str, Any] = {"id": msg_id, "method": method, "params": params or {}}
        if session_id is not None:
            payload["sessionId"] = session_id

        encoded = json.dumps(payload)
        try:
            with self._send_lock:
                self.ws.send(encoded)
            if not ev.wait(timeout=timeout):
                raise TimeoutError(f"CDP call timed out after {timeout}s: {method}")
            if "error" in box:
                raise CDPError(f"CDP transport error on {method}: {box['error']}")
            msg = box.get("msg", {})
            if "error" in msg:
                raise CDPError(f"CDP error on {method}: {msg['error']}")
            return msg.get("result", {})
        finally:
            with self._state_lock:
                self._pending.pop(msg_id, None)

    def new_session(
        self,
        viewport: tuple[int, int] = (1280, 720),
        mobile: bool = False,
        has_touch: bool = False,
        device_scale_factor: float = 1.0,
    ) -> CDPSession:
        ctx = self.call("Target.createBrowserContext", {"disposeOnDetach": False})
        ctx_id = ctx["browserContextId"]
        target = self.call(
            "Target.createTarget",
            {"url": "about:blank", "browserContextId": ctx_id},
        )
        target_id = target["targetId"]
        attached = self.call(
            "Target.attachToTarget",
            {"targetId": target_id, "flatten": True},
        )
        session_id = attached["sessionId"]
        sess = CDPSession(self, ctx_id, target_id, session_id)
        with self._state_lock:
            self._sessions[session_id] = sess
        try:
            sess.enable_domains()
            sess.set_viewport(
                viewport[0],
                viewport[1],
                device_scale_factor=device_scale_factor,
                mobile=mobile,
                has_touch=has_touch,
            )
        except Exception:
            sess.close()
            raise
        return sess

    def _unregister_session(self, session_id: str) -> None:
        with self._state_lock:
            self._sessions.pop(session_id, None)

    def close(self) -> None:
        self._closing = True
        if self.ws is not None:
            try:
                self.call("Browser.close", timeout=5.0)
            except Exception:
                pass
            try:
                self.ws.close()
            except Exception:
                pass
            self.ws = None

        if self.proc is not None:
            try:
                self.proc.wait(timeout=5.0)
            except subprocess.TimeoutExpired:
                pass
            if self.proc.poll() is None:
                try:
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(self.proc.pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                    )
                except Exception:
                    pass
                try:
                    self.proc.kill()
                except Exception:
                    pass
                try:
                    self.proc.wait(timeout=3.0)
                except Exception:
                    pass
            self.proc = None

        for attempt in range(4):
            shutil.rmtree(self.user_data_dir, ignore_errors=True)
            if not Path(self.user_data_dir).exists():
                break
            time.sleep(0.1)

    def __enter__(self) -> "ChromeBrowser":
        return self.start()

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()
