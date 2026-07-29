from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from particle_detection_core import analyze_image_bytes, render_image_bytes

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
STATIC_DIR = ROOT / "static"
MAX_IMAGE_BYTES = 100 * 1024 * 1024

STATIC_CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
}


@dataclass(frozen=True)
class StaticAsset:
    content_type: str
    data: bytes


def load_static_assets(directory: Path) -> dict[str, StaticAsset]:
    """Load trusted application assets before handling any user-controlled paths."""
    assets: dict[str, StaticAsset] = {}
    root = directory.resolve()
    if not root.is_dir():
        return assets

    for candidate in root.rglob("*"):
        path = candidate.resolve()
        if not path.is_file() or not path.is_relative_to(root):
            continue
        route = f"/{path.relative_to(root).as_posix()}"
        content_type = STATIC_CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")
        assets[route] = StaticAsset(content_type=content_type, data=path.read_bytes())
    return assets


STATIC_ASSETS = load_static_assets(STATIC_DIR)


def parse_analysis_options(query: str) -> dict[str, Any]:
    params = parse_qs(query)

    def value(name: str, default: str) -> str:
        return params.get(name, [default])[0]

    scale_px_text = value("scalePx", "")
    return {
        "scaleUm": float(value("scaleUm", "50")),
        "scaleThreshold": int(value("scaleThreshold", "120")),
        "scalePx": float(scale_px_text) if scale_px_text else None,
        "minDiameterUm": float(value("minDiameterUm", "2")),
        "maxDiameterUm": float(value("maxDiameterUm", "95")),
        "sensitivity": float(value("sensitivity", "0.88")),
        "contrast": value("contrast", "clahe"),
        "brightness": float(value("brightness", "0")),
        "contrastAdjustment": float(value("contrastAdjustment", "0")),
        "gamma": float(value("gamma", "1")),
        "colorMode": value("colorMode", "color"),
    }


class ParticleHandler(BaseHTTPRequestHandler):
    server_version = "ParticleLens/0.2.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"status": "ok", "version": "0.2.1", "detector": "native"})
            return

        if parsed.path == "/runtime-config.json":
            self.send_json({"detector": "native"})
            return

        route = "/index.html" if parsed.path in ("", "/") else parsed.path
        asset = STATIC_ASSETS.get(route)
        if asset is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_static_asset(asset)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in {"/api/analyze", "/api/render"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                raise ValueError("Image body is empty.")
            if length > MAX_IMAGE_BYTES:
                raise ValueError("Image exceeds the 100 MB local-app limit.")
            image_bytes = self.rfile.read(length)
            options = parse_analysis_options(parsed.query)
            if parsed.path == "/api/render":
                response = render_image_bytes(image_bytes, options)
            else:
                response = analyze_image_bytes(image_bytes, options)
        except Exception as exc:  # Keep local app errors visible to the UI.
            self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/render":
            self.send_bytes(response, "image/png")
        else:
            self.send_json(response)

    def send_static_asset(self, asset: StaticAsset) -> None:
        self.send_bytes(asset.data, asset.content_type)

    def send_bytes(self, data: bytes, content_type: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the local particle annotation web app.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    host = args.host
    port = args.port
    server = ThreadingHTTPServer((host, port), ParticleHandler)
    print(f"Particle annotation app: http://{host}:{port}", flush=True)
    print("The terminal stays busy while the local server is running. Press Ctrl+C to stop.", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
