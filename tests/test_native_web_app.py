from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import cv2
import numpy as np
import pytest

from particle_web_app import ParticleHandler


@pytest.fixture
def server_url() -> str:
    server = ThreadingHTTPServer(("127.0.0.1", 0), ParticleHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def image_bytes() -> bytes:
    image = np.full((240, 320, 3), 232, dtype=np.uint8)
    cv2.circle(image, (120, 120), 30, (100, 100, 100), -1, lineType=cv2.LINE_AA)
    ok, encoded = cv2.imencode(".png", image)
    assert ok
    return encoded.tobytes()


def test_health_and_runtime_config(server_url: str) -> None:
    with urllib.request.urlopen(f"{server_url}/api/health") as response:
        assert json.load(response) == {
            "status": "ok",
            "version": "0.2.0",
            "detector": "native",
        }
    with urllib.request.urlopen(f"{server_url}/runtime-config.json") as response:
        assert json.load(response) == {"detector": "native"}


def test_analyze_accepts_raw_image_bytes(server_url: str) -> None:
    query = (
        "scaleUm=50&scalePx=100&minDiameterUm=10&maxDiameterUm=60"
        "&sensitivity=0.7&contrast=none"
    )
    request = urllib.request.Request(
        f"{server_url}/api/analyze?{query}",
        data=image_bytes(),
        headers={"Content-Type": "image/png"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        payload = json.load(response)
    assert payload["width"] == 320
    assert payload["height"] == 240
    assert len(payload["particles"]) == 1


def test_analyze_rejects_empty_body(server_url: str) -> None:
    request = urllib.request.Request(
        f"{server_url}/api/analyze",
        data=b"",
        method="POST",
    )
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(request)
    assert error.value.code == 400


def test_static_server_rejects_path_traversal(server_url: str) -> None:
    request = urllib.request.Request(f"{server_url}/../pyproject.toml")
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(request)
    assert error.value.code in {403, 404}
