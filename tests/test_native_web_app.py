from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import cv2
import numpy as np
import pytest

from particle_web_app import ParticleHandler

PROJECT_ROOT = Path(__file__).resolve().parents[1]


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
    traversal_paths = (
        "../pyproject.toml",
        "%2e%2e/pyproject.toml",
        "..%5cpyproject.toml",
    )
    for path in traversal_paths:
        request = urllib.request.Request(f"{server_url}/{path}")
        with pytest.raises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        assert error.value.code == 404


def test_local_image_endpoint_cannot_read_arbitrary_files(server_url: str) -> None:
    sensitive_path = urllib.parse.quote(str(PROJECT_ROOT / "pyproject.toml"))
    request = urllib.request.Request(f"{server_url}/api/local-image?path={sensitive_path}")
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(request)
    assert error.value.code == 404


def test_static_assets_have_fixed_content_types(server_url: str) -> None:
    with urllib.request.urlopen(f"{server_url}/styles.css") as response:
        assert response.headers["Content-Type"] == "text/css; charset=utf-8"
        assert response.read().startswith(b":root")


def test_initial_document_has_critical_styles_before_external_css() -> None:
    index_html = (PROJECT_ROOT / "static" / "index.html").read_text(encoding="utf-8")
    full_css = (PROJECT_ROOT / "static" / "styles.css").read_text(encoding="utf-8")

    critical_style = index_html.index("<style>")
    external_style = index_html.index('<link rel="stylesheet" href="./styles.css" />')
    assert critical_style < external_style
    assert ".app-shell {\n        visibility: hidden;" in index_html
    assert ".app-shell {" in full_css
    assert "visibility: visible;" in full_css


def test_service_worker_fetches_navigation_before_offline_fallback() -> None:
    service_worker = (PROJECT_ROOT / "static" / "service-worker.js").read_text(
        encoding="utf-8",
    )
    navigation_branch = service_worker.index('event.request.mode === "navigate"')
    cache_first_branch = service_worker.rindex("const cached = await cache.match(event.request)")
    assert navigation_branch < cache_first_branch
    assert 'const SHELL_CACHE = "particlelens-shell-v0.2.2"' in service_worker
    assert 'url.pathname.endsWith("/runtime-config.json")' in service_worker
