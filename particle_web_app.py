from __future__ import annotations

import base64
import argparse
import json
import mimetypes
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import cv2
import numpy as np

from analyze_particles import circle_rect_visible_fraction, detect_particles, detect_scale_bar


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"


def decode_data_url(data_url: str) -> np.ndarray:
    match = re.match(r"^data:[^;]+;base64,(.+)$", data_url, flags=re.DOTALL)
    if not match:
        raise ValueError("Expected an image data URL.")

    raw = base64.b64decode(match.group(1))
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image data.")
    return image


def circle_to_payload(
    circle: Any, idx: int, microns_per_px: float, image_shape: tuple[int, int]
) -> dict[str, float | int | str | bool]:
    visible_fraction = circle_rect_visible_fraction(circle, image_shape)
    return {
        "id": idx,
        "x": circle.x,
        "y": circle.y,
        "r": circle.r,
        "diameterPx": circle.diameter_px,
        "diameterUm": circle.diameter_px * microns_per_px,
        "visibleFraction": visible_fraction,
        "includedInDistribution": visible_fraction >= 0.5,
        "edgeScore": circle.score,
        "source": "auto",
    }


def analyze_payload(payload: dict[str, Any]) -> dict[str, Any]:
    image = decode_data_url(str(payload.get("imageData", "")))
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    scale_um = float(payload.get("scaleUm", 50.0))
    scale_threshold = int(payload.get("scaleThreshold", 120))
    scale_px = payload.get("scalePx")
    scale_bar_bbox: tuple[int, int, int, int] | None

    if scale_px:
        microns_per_px = scale_um / float(scale_px)
        scale_bar_bbox = None
    else:
        microns_per_px, scale_bar_bbox = detect_scale_bar(gray, scale_um, scale_threshold)

    circles = detect_particles(
        gray=gray,
        microns_per_px=microns_per_px,
        scale_bar_bbox=scale_bar_bbox,
        min_diameter_um=float(payload.get("minDiameterUm", 2.0)),
        max_diameter_um=float(payload.get("maxDiameterUm", 95.0)),
        sensitivity=float(payload.get("sensitivity", 0.88)),
        contrast=str(payload.get("contrast", "clahe")),
    )

    circles = sorted(circles, key=lambda c: (c.y, c.x))
    return {
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
        "micronsPerPx": microns_per_px,
        "scaleBar": scale_bar_bbox,
        "particles": [
            circle_to_payload(circle, idx, microns_per_px, gray.shape)
            for idx, circle in enumerate(circles, start=1)
        ],
    }


def local_image_payload(path_text: str) -> dict[str, str]:
    path = Path(unquote(path_text)).expanduser()
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Image file not found: {path}")

    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return {
        "name": path.name,
        "imageData": f"data:{mime_type};base64,{data}",
    }


class ParticleHandler(BaseHTTPRequestHandler):
    server_version = "ParticleWeb/0.1"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/local-image":
            try:
                path = parse_qs(parsed.query).get("path", [""])[0]
                if not path:
                    raise ValueError("Missing image path.")
                self.send_json(local_image_payload(path))
            except Exception as exc:
                self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path in ("", "/"):
            self.send_static_file(STATIC_DIR / "index.html")
            return

        safe_path = parsed.path.lstrip("/").replace("\\", "/")
        target = (STATIC_DIR / safe_path).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())):
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        self.send_static_file(target)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/analyze":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            response = analyze_payload(payload)
        except Exception as exc:  # Keep local app errors visible to the UI.
            self.send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_json(response)

    def send_static_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
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
