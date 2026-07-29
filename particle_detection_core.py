from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np


@dataclass(frozen=True)
class Circle:
    x: float
    y: float
    r: float
    score: float

    @property
    def diameter_px(self) -> float:
        return 2.0 * self.r


def decode_image_bytes(image_bytes: bytes | bytearray | memoryview) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image data.")
    return image


def circle_rect_visible_fraction(
    circle: Circle, image_shape: tuple[int, int], samples: int = 240
) -> float:
    h, w = image_shape
    if circle.r <= 0:
        return 0.0

    full_area = math.pi * circle.r * circle.r
    x_min = max(0.0, circle.x - circle.r)
    x_max = min(float(w), circle.x + circle.r)
    if x_min >= x_max or circle.y + circle.r <= 0 or circle.y - circle.r >= h:
        return 0.0

    if (
        circle.x - circle.r >= 0
        and circle.x + circle.r <= w
        and circle.y - circle.r >= 0
        and circle.y + circle.r <= h
    ):
        return 1.0

    dx = (x_max - x_min) / samples
    visible_area = 0.0
    for idx in range(samples):
        x = x_min + (idx + 0.5) * dx
        half_height = math.sqrt(max(0.0, circle.r * circle.r - (x - circle.x) ** 2))
        y_min = max(0.0, circle.y - half_height)
        y_max = min(float(h), circle.y + half_height)
        visible_area += max(0.0, y_max - y_min) * dx

    return min(1.0, max(0.0, visible_area / full_area))


def detect_scale_bar(
    gray: np.ndarray,
    scale_um: float,
    dark_threshold: int,
    roi_x_fraction: float = 0.50,
    roi_y_fraction: float = 0.72,
) -> tuple[float, tuple[int, int, int, int]]:
    """Return microns per pixel and the lower-right scale-bar bounding box."""

    h, w = gray.shape
    x0 = int(w * roi_x_fraction)
    y0 = int(h * roi_y_fraction)
    crop = gray[y0 : h - 24, x0:w]
    dark = cv2.inRange(crop, 0, dark_threshold)
    x, y, bw, bh = detect_scale_bar_by_runs(dark, x0, y0, gray.shape)
    return scale_um / float(bw), (x, y, bw, bh)


def detect_scale_bar_by_runs(
    dark_crop: np.ndarray, x0: int, y0: int, image_shape: tuple[int, int]
) -> tuple[int, int, int, int]:
    h, w = image_shape
    best: tuple[int, int, int] | None = None
    min_width = int(w * 0.04)
    max_width = int(w * 0.18)
    min_y_abs = int(h * 0.84)
    min_end_x = int(w * 0.92)

    for row_idx, row in enumerate(dark_crop):
        abs_y = row_idx + y0
        if abs_y < min_y_abs:
            continue
        xs = np.flatnonzero(row)
        if xs.size == 0:
            continue
        splits = np.where(np.diff(xs) > 1)[0] + 1
        for run in np.split(xs, splits):
            start_x = int(run[0] + x0)
            end_x = int(run[-1] + x0)
            if min_width <= run.size <= max_width and end_x >= min_end_x:
                candidate = (int(run.size), start_x, abs_y)
                if best is None or (candidate[0], candidate[2]) > (best[0], best[2]):
                    best = candidate

    if best is None:
        raise RuntimeError(
            "Scale bar was not detected. Draw the scale bar manually or adjust the threshold."
        )

    bw, x, y = best
    return x, y - 2, bw, 6


def prepare_detection_image(
    gray: np.ndarray,
    mask_rect: tuple[int, int, int, int] | None,
    contrast: str,
    brightness: float = 0.0,
    contrast_adjustment: float = 0.0,
    gamma: float = 1.0,
) -> np.ndarray:
    work = gray.copy()
    if mask_rect is not None:
        x, y, _w, h = mask_rect
        pad = 22
        work[max(0, y - 90) : min(work.shape[0], y + h + pad), max(0, x - 55) :] = int(
            np.median(gray)
        )

    work = adjust_luminance(work, brightness, contrast_adjustment, gamma)
    work = apply_contrast_mode(work, contrast)
    return cv2.medianBlur(work, 5)


def adjust_luminance(
    gray: np.ndarray,
    brightness: float = 0.0,
    contrast_adjustment: float = 0.0,
    gamma: float = 1.0,
) -> np.ndarray:
    if not -100 <= brightness <= 100:
        raise ValueError("Brightness must be between -100 and 100.")
    if not -100 <= contrast_adjustment <= 100:
        raise ValueError("Contrast adjustment must be between -100 and 100.")
    if not 0.2 <= gamma <= 3.0:
        raise ValueError("Gamma must be between 0.2 and 3.0.")

    work = gray.astype(np.float32)
    work += float(brightness) * 2.55
    factor = (259.0 * (float(contrast_adjustment) + 255.0)) / (
        255.0 * (259.0 - float(contrast_adjustment))
    )
    work = factor * (work - 128.0) + 128.0
    work = np.clip(work, 0, 255)
    if not math.isclose(gamma, 1.0):
        work = np.power(work / 255.0, 1.0 / float(gamma)) * 255.0
    return np.clip(np.rint(work), 0, 255).astype(np.uint8)


def apply_contrast_mode(gray: np.ndarray, contrast: str) -> np.ndarray:
    work = gray
    if contrast == "clahe":
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        work = clahe.apply(work)
    elif contrast == "background":
        background = cv2.GaussianBlur(work, (0, 0), sigmaX=28, sigmaY=28)
        work = cv2.addWeighted(work, 1.65, background, -0.65, 0)
    elif contrast != "none":
        raise ValueError(f"Unknown contrast mode: {contrast}")

    return work


def render_image_bytes(
    image_bytes: bytes | bytearray | memoryview, options: dict[str, Any]
) -> bytes:
    image = decode_image_bytes(image_bytes)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    adjusted = adjust_luminance(
        gray,
        brightness=float(options.get("brightness", 0.0)),
        contrast_adjustment=float(options.get("contrastAdjustment", 0.0)),
        gamma=float(options.get("gamma", 1.0)),
    )
    processed = apply_contrast_mode(adjusted, str(options.get("contrast", "clahe")))
    color_mode = str(options.get("colorMode", "color"))

    if color_mode == "color":
        ycrcb = cv2.cvtColor(image, cv2.COLOR_BGR2YCrCb)
        ycrcb[:, :, 0] = processed
        rendered = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)
    elif color_mode == "grayscale":
        rendered = processed
    else:
        raise ValueError(f"Unknown color mode: {color_mode}")

    ok, encoded = cv2.imencode(".png", rendered)
    if not ok:
        raise RuntimeError("Could not encode the processed image.")
    return encoded.tobytes()


def fit_circle_from_edges(
    edges: np.ndarray, circle: Circle, max_shift_fraction: float = 0.28
) -> Circle:
    x0, y0, r0 = circle.x, circle.y, circle.r
    pad = int(math.ceil(r0 + max(8.0, r0 * 0.22)))
    x_min = max(0, int(x0) - pad)
    x_max = min(edges.shape[1], int(x0) + pad + 1)
    y_min = max(0, int(y0) - pad)
    y_max = min(edges.shape[0], int(y0) + pad + 1)
    crop = edges[y_min:y_max, x_min:x_max]
    ys, xs = np.nonzero(crop)
    if xs.size < 18:
        return circle

    xs = xs.astype(float) + x_min
    ys = ys.astype(float) + y_min
    distances = np.hypot(xs - x0, ys - y0)
    band = np.abs(distances - r0) <= max(2.5, min(10.0, r0 * 0.18))
    xs = xs[band]
    ys = ys[band]
    if xs.size < 18:
        return circle

    matrix = np.column_stack([xs, ys, np.ones_like(xs)])
    rhs = -(xs * xs + ys * ys)
    try:
        a, b, c = np.linalg.lstsq(matrix, rhs, rcond=None)[0]
    except np.linalg.LinAlgError:
        return circle

    x = -a / 2.0
    y = -b / 2.0
    radius_sq = (a * a + b * b) / 4.0 - c
    if radius_sq <= 0:
        return circle
    r = math.sqrt(radius_sq)
    if not np.isfinite([x, y, r]).all():
        return circle
    if math.hypot(x - x0, y - y0) > max(5.0, r0 * max_shift_fraction):
        return circle
    if not (0.68 * r0 <= r <= 1.32 * r0):
        return circle

    return Circle(float(x), float(y), float(r), circle.score)


def circle_edge_score(edges: np.ndarray, x: float, y: float, r: float) -> float:
    samples = max(48, int(2 * math.pi * r / 2.5))
    angles = np.linspace(0, 2 * math.pi, samples, endpoint=False)
    xs = np.rint(x + r * np.cos(angles)).astype(int)
    ys = np.rint(y + r * np.sin(angles)).astype(int)
    valid = (xs >= 0) & (xs < edges.shape[1]) & (ys >= 0) & (ys < edges.shape[0])
    if not np.any(valid):
        return 0.0
    return float(np.mean(edges[ys[valid], xs[valid]] > 0))


def suppress_duplicates(circles: list[Circle]) -> list[Circle]:
    circles = sorted(circles, key=lambda c: (c.score, c.r), reverse=True)
    kept: list[Circle] = []
    for circle in circles:
        duplicate = False
        for existing in kept:
            center_dist = math.hypot(circle.x - existing.x, circle.y - existing.y)
            if center_dist < max(0.38 * min(circle.r, existing.r), 4.0):
                duplicate = True
                break
            if center_dist + min(circle.r, existing.r) < 0.92 * max(circle.r, existing.r):
                duplicate = True
                break
        if not duplicate:
            kept.append(circle)
    return kept


def is_in_annotation_area(
    x: float, y: float, scale_bar_bbox: tuple[int, int, int, int] | None
) -> bool:
    if scale_bar_bbox is None:
        return False
    bx, by, _bw, _bh = scale_bar_bbox
    return x >= bx - 80 and y >= by - 130


def detect_particles(
    gray: np.ndarray,
    microns_per_px: float,
    scale_bar_bbox: tuple[int, int, int, int] | None,
    min_diameter_um: float,
    max_diameter_um: float,
    sensitivity: float,
    contrast: str,
    brightness: float = 0.0,
    contrast_adjustment: float = 0.0,
    gamma: float = 1.0,
) -> list[Circle]:
    if microns_per_px <= 0:
        raise ValueError("Microns per pixel must be positive.")
    if min_diameter_um <= 0 or max_diameter_um <= min_diameter_um:
        raise ValueError("Diameter limits are invalid.")
    if not 0.01 <= sensitivity <= 0.98:
        raise ValueError("Sensitivity must be between 0.01 and 0.98.")

    work = prepare_detection_image(
        gray,
        scale_bar_bbox,
        contrast,
        brightness=brightness,
        contrast_adjustment=contrast_adjustment,
        gamma=gamma,
    )
    work = cv2.GaussianBlur(work, (5, 5), 1.2)
    min_radius = max(2, int(round(min_diameter_um / microns_per_px / 2)))
    max_radius = max(min_radius + 1, int(round(max_diameter_um / microns_per_px / 2)))
    min_dist = max(7, int(round(min_radius * 1.8)))

    edges = cv2.Canny(work, 50, 140)
    candidates: list[Circle] = []
    raw = cv2.HoughCircles(
        work,
        cv2.HOUGH_GRADIENT_ALT,
        dp=1.5,
        minDist=min_dist,
        param1=300,
        param2=sensitivity,
        minRadius=min_radius,
        maxRadius=max_radius,
    )
    if raw is None:
        return []

    for x, y, r in raw[0]:
        if is_in_annotation_area(x, y, scale_bar_bbox):
            continue
        rough = Circle(float(x), float(y), float(r), 0.0)
        refined = fit_circle_from_edges(edges, rough)
        score = circle_edge_score(edges, refined.x, refined.y, refined.r)
        if score >= 0.10:
            candidates.append(Circle(refined.x, refined.y, refined.r, score))

    return suppress_duplicates(candidates)


def circle_to_payload(
    circle: Circle, idx: int, microns_per_px: float, image_shape: tuple[int, int]
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


def analyze_image_bytes(image_bytes: bytes | bytearray | memoryview, options: dict[str, Any]) -> dict[str, Any]:
    image = decode_image_bytes(image_bytes)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    scale_um = float(options.get("scaleUm", 50.0))
    scale_threshold = int(options.get("scaleThreshold", 120))
    scale_px = options.get("scalePx")
    if scale_um <= 0:
        raise ValueError("Scale length must be positive.")

    if scale_px is not None and float(scale_px) > 0:
        microns_per_px = scale_um / float(scale_px)
        scale_bar_bbox = None
    else:
        microns_per_px, scale_bar_bbox = detect_scale_bar(gray, scale_um, scale_threshold)

    circles = detect_particles(
        gray=gray,
        microns_per_px=microns_per_px,
        scale_bar_bbox=scale_bar_bbox,
        min_diameter_um=float(options.get("minDiameterUm", 2.0)),
        max_diameter_um=float(options.get("maxDiameterUm", 95.0)),
        sensitivity=float(options.get("sensitivity", 0.88)),
        contrast=str(options.get("contrast", "clahe")),
        brightness=float(options.get("brightness", 0.0)),
        contrast_adjustment=float(options.get("contrastAdjustment", 0.0)),
        gamma=float(options.get("gamma", 1.0)),
    )
    circles = sorted(circles, key=lambda circle: (circle.y, circle.x))
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
