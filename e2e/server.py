"""Local static HTTP + Kobweb SSE server for E2E testing of site/.kobweb/site/."""

from __future__ import annotations

import functools
import http.server
import os
import posixpath
import socket
import socketserver
import threading
import urllib.parse
from pathlib import Path
from typing import Optional

# Asset extensions that must return 404 (never fall back to index.html)
ASSET_EXTENSIONS = {
    ".js",
    ".mjs",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".txt",
    ".json",
    ".wasm",
    ".map",
    ".woff",
    ".woff2",
    ".ttf",
    ".mp3",
    ".wav",
    ".ogg",
}

FORCED_MIME_TYPES = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".txt": "text/plain",
    ".css": "text/css",
    ".html": "text/html",
    ".htm": "text/html",
    ".ico": "image/x-icon",
    ".png": "image/png",
}


class KobwebSpaHandler(http.server.SimpleHTTPRequestHandler):
    """Static handler supporting Kobweb <route>.html export, SPA fallback, and /api/kobweb-status SSE."""

    protocol_version = "HTTP/1.1"
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **FORCED_MIME_TYPES,
    }

    def __init__(
        self,
        *args,
        directory: str,
        stop_event: threading.Event,
        quiet: bool = True,
        **kwargs,
    ) -> None:
        self._site_dir = Path(directory).resolve()
        self._stop_event = stop_event
        self._quiet = quiet
        super().__init__(*args, directory=str(self._site_dir), **kwargs)

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        if not self._quiet:
            super().log_message(format, *args)

    def guess_type(self, path: str) -> str:
        _, ext = posixpath.splitext(path.lower())
        if ext in FORCED_MIME_TYPES:
            return FORCED_MIME_TYPES[ext]
        return super().guess_type(path)

    def _resolve_static_path(self, raw_path: str) -> Optional[Path]:
        parsed = urllib.parse.urlsplit(raw_path)
        clean_path = urllib.parse.unquote(parsed.path)
        # Normalize posix path and guard against traversal
        norm = posixpath.normpath(clean_path)
        if not norm.startswith("/"):
            norm = "/" + norm
        rel = norm.lstrip("/")

        if rel == "":
            candidate = self._site_dir / "index.html"
            return candidate if candidate.is_file() else None

        parts = [p for p in rel.split("/") if p not in ("", ".")]
        if any(p == ".." for p in parts):
            return None

        target = self._site_dir.joinpath(*parts)
        try:
            resolved = target.resolve()
            resolved.relative_to(self._site_dir)
        except ValueError:
            return None

        # 1. Exact file
        if resolved.is_file():
            return resolved

        # 2. Directory index.html
        if resolved.is_dir():
            idx = resolved / "index.html"
            if idx.is_file():
                return idx

        # 3. Extensionless /<route> -> <route>.html
        _, ext = posixpath.splitext(parts[-1])
        if not ext:
            html_candidate = self._site_dir.joinpath(*parts[:-1], parts[-1] + ".html")
            if html_candidate.is_file():
                return html_candidate

            # 4. SPA fallback for extensionless paths
            fallback = self._site_dir / "index.html"
            if fallback.is_file():
                return fallback
            return None

        # 5. Missing asset extensions must return 404
        if ext.lower() in ASSET_EXTENSIONS:
            return None

        return None

    def _handle_kobweb_status(self) -> None:
        payload = b"retry: 86400000\nevent: version\ndata: 1\n\n"
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(payload)
            self.wfile.flush()
            while not self._stop_event.is_set():
                self._stop_event.wait(0.25)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/api/kobweb-status":
            self._handle_kobweb_status()
            return

        file_path = self._resolve_static_path(self.path)
        if file_path is None:
            body = b"404 Not Found"
            self.send_response(404)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self._serve_file(file_path, head_only=False)

    def do_HEAD(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/api/kobweb-status":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            return

        file_path = self._resolve_static_path(self.path)
        if file_path is None:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        self._serve_file(file_path, head_only=True)

    def _serve_file(self, file_path: Path, head_only: bool) -> None:
        try:
            data = file_path.read_bytes()
        except OSError:
            self.send_error(404, "File not found")
            return

        ctype = self.guess_type(str(file_path))
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if not head_only:
            try:
                self.wfile.write(data)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class DualStackThreadingHTTPServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self) -> None:
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class StaticSiteServer:
    """Lifecycle wrapper around ThreadingHTTPServer serving Kobweb static export."""

    def __init__(
        self,
        site_dir: str | Path,
        host: str = "127.0.0.1",
        port: int = 0,
        dual_stack: bool = False,
        quiet: bool = True,
    ) -> None:
        self.site_dir = Path(site_dir).resolve()
        if not self.site_dir.is_dir():
            raise FileNotFoundError(f"Static site directory not found: {self.site_dir}")
        self.host = host
        self.requested_port = port
        self.dual_stack = dual_stack
        self.quiet = quiet
        self.stop_event = threading.Event()
        self._httpd: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self.port: int = 0

    @property
    def base_url(self) -> str:
        display_host = "127.0.0.1" if self.host in ("0.0.0.0", "::", "") else self.host
        return f"http://{display_host}:{self.port}"

    def start(self) -> "StaticSiteServer":
        handler_cls = functools.partial(
            KobwebSpaHandler,
            directory=str(self.site_dir),
            stop_event=self.stop_event,
            quiet=self.quiet,
        )
        if self.dual_stack:
            try:
                self._httpd = DualStackThreadingHTTPServer(("::", self.requested_port), handler_cls)
                self.host = "::"
            except OSError:
                self._httpd = ThreadingHTTPServer((self.host, self.requested_port), handler_cls)
        else:
            self._httpd = ThreadingHTTPServer((self.host, self.requested_port), handler_cls)

        self.port = int(self._httpd.server_address[1])
        self._thread = threading.Thread(
            target=self._httpd.serve_forever,
            kwargs={"poll_interval": 0.25},
            name="e2e-static-server",
            daemon=True,
        )
        self._thread.start()
        return self

    def stop(self) -> None:
        self.stop_event.set()
        if self._httpd is not None:
            try:
                self._httpd.shutdown()
            except Exception:
                pass
            try:
                self._httpd.server_close()
            except Exception:
                pass
            self._httpd = None
        if self._thread is not None:
            self._thread.join(timeout=3.0)
            self._thread = None

    def __enter__(self) -> "StaticSiteServer":
        return self.start()

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()
