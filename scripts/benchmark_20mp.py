from __future__ import annotations

import sys
import time
import tracemalloc
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from particle_detection_core import analyze_image_bytes


def main() -> None:
    width, height = 5000, 4000
    image = np.full((height, width, 3), 232, dtype=np.uint8)
    for y in range(400, height - 300, 600):
        for x in range(400, width - 300, 700):
            cv2.circle(image, (x, y), 90, (100, 100, 100), -1, lineType=cv2.LINE_AA)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise RuntimeError("Could not encode the benchmark image.")

    tracemalloc.start()
    started = time.perf_counter()
    result = analyze_image_bytes(
        encoded.tobytes(),
        {
            "scaleUm": 50,
            "scalePx": 200,
            "minDiameterUm": 20,
            "maxDiameterUm": 80,
            "sensitivity": 0.7,
            "contrast": "none",
        },
    )
    elapsed = time.perf_counter() - started
    _, peak = tracemalloc.get_traced_memory()
    print(
        f"20 MP benchmark: {len(result['particles'])} particles, "
        f"{elapsed:.2f}s, Python peak {peak / 1024 / 1024:.1f} MiB"
    )


if __name__ == "__main__":
    main()
