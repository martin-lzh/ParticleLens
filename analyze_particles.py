from __future__ import annotations

import argparse
import glob
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Circle:
    x: float
    y: float
    r: float
    score: float

    @property
    def diameter_px(self) -> float:
        return 2.0 * self.r


def circle_rect_visible_fraction(circle: Circle, image_shape: tuple[int, int], samples: int = 240) -> float:
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


def read_image(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return image


def detect_scale_bar(
    gray: np.ndarray,
    scale_um: float,
    dark_threshold: int,
    roi_x_fraction: float = 0.50,
    roi_y_fraction: float = 0.72,
) -> tuple[float, tuple[int, int, int, int]]:
    """Return microns per pixel and the scale-bar bounding box.

    The method looks only in the lower-right image area, thresholds dark pixels,
    and keeps long, thin horizontal components. This avoids matching particle
    edges while still tolerating the black scale label text.
    """

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
            "Scale bar was not detected. Try --scale-px, --scale-threshold, "
            "or crop the lower-right annotation area less aggressively."
        )

    bw, x, y = best
    return x, y - 2, bw, 6


def prepare_detection_image(
    gray: np.ndarray, mask_rect: tuple[int, int, int, int] | None, contrast: str
) -> np.ndarray:
    work = gray.copy()
    if mask_rect is not None:
        x, y, w, h = mask_rect
        pad = 22
        work[max(0, y - 90) : min(work.shape[0], y + h + pad), max(0, x - 55) :] = int(
            np.median(gray)
        )

    if contrast == "clahe":
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        work = clahe.apply(work)
    elif contrast == "background":
        background = cv2.GaussianBlur(work, (0, 0), sigmaX=28, sigmaY=28)
        work = cv2.addWeighted(work, 1.65, background, -0.65, 0)

    work = cv2.medianBlur(work, 5)
    return work


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


def detect_particles(
    gray: np.ndarray,
    microns_per_px: float,
    scale_bar_bbox: tuple[int, int, int, int] | None,
    min_diameter_um: float,
    max_diameter_um: float,
    sensitivity: float,
    contrast: str,
) -> list[Circle]:
    work = prepare_detection_image(gray, scale_bar_bbox, contrast)
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


def is_in_annotation_area(
    x: float, y: float, scale_bar_bbox: tuple[int, int, int, int] | None
) -> bool:
    if scale_bar_bbox is None:
        return False
    bx, by, bw, bh = scale_bar_bbox
    return x >= bx - 80 and y >= by - 130


def annotate_image(
    image: np.ndarray,
    circles: list[Circle],
    microns_per_px: float,
    scale_bar_bbox: tuple[int, int, int, int] | None,
    label_limit: int,
) -> np.ndarray:
    annotated = image.copy()
    circles_for_labels = sorted(circles, key=lambda c: c.r, reverse=True)
    label_set = set(id(c) for c in circles_for_labels[:label_limit])

    for circle in circles:
        center = (int(round(circle.x)), int(round(circle.y)))
        radius = int(round(circle.r))
        cv2.circle(annotated, center, radius, (0, 255, 255), 2, lineType=cv2.LINE_AA)
        cv2.circle(annotated, center, 2, (0, 0, 255), -1, lineType=cv2.LINE_AA)
        if id(circle) in label_set:
            diameter_um = circle.diameter_px * microns_per_px
            cv2.line(
                annotated,
                (int(round(circle.x - circle.r)), center[1]),
                (int(round(circle.x + circle.r)), center[1]),
                (0, 0, 255),
                1,
                lineType=cv2.LINE_AA,
            )
            text = f"{diameter_um:.1f} microns"
            cv2.putText(
                annotated,
                text,
                (center[0] + 5, max(18, center[1] - radius - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.46,
                (0, 0, 255),
                1,
                cv2.LINE_AA,
            )

    if scale_bar_bbox is not None:
        x, y, w, h = scale_bar_bbox
        cv2.rectangle(annotated, (x, y), (x + w, y + h), (255, 0, 0), 2)
    return annotated


def write_histogram(diameters: np.ndarray, output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(7.5, 4.5), dpi=160)
    if diameters.size:
        ax.hist(diameters, bins="fd", color="#377eb8", edgecolor="white")
    else:
        ax.text(0.5, 0.5, "No particles with visible_fraction >= 0.5", ha="center", va="center")
    ax.set_xlabel("Particle diameter (microns)")
    ax.set_ylabel("Count")
    ax.set_title("Particle size distribution")
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    fig.savefig(output_path)
    plt.close(fig)


def analyze_one(
    path: Path,
    out_dir: Path,
    scale_um: float,
    scale_px: float | None,
    scale_threshold: int,
    min_diameter_um: float,
    max_diameter_um: float,
    sensitivity: float,
    contrast: str,
    label_limit: int,
) -> pd.DataFrame:
    image = read_image(path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    if scale_px is None:
        microns_per_px, scale_bar_bbox = detect_scale_bar(gray, scale_um, scale_threshold)
    else:
        microns_per_px = scale_um / scale_px
        scale_bar_bbox = None

    circles = detect_particles(
        gray,
        microns_per_px,
        scale_bar_bbox,
        min_diameter_um,
        max_diameter_um,
        sensitivity,
        contrast,
    )
    if not circles:
        raise RuntimeError(f"No particles detected in {path}")

    rows = []
    for idx, circle in enumerate(sorted(circles, key=lambda c: (c.y, c.x)), start=1):
        visible_fraction = circle_rect_visible_fraction(circle, gray.shape)
        rows.append(
            {
                "image": path.name,
                "particle_id": idx,
                "x_px": circle.x,
                "y_px": circle.y,
                "radius_px": circle.r,
                "diameter_px": circle.diameter_px,
                "radius_microns": circle.r * microns_per_px,
                "diameter_microns": circle.diameter_px * microns_per_px,
                "visible_fraction": visible_fraction,
                "included_in_distribution": visible_fraction >= 0.5,
                "edge_score": circle.score,
                "microns_per_px": microns_per_px,
            }
        )

    df = pd.DataFrame(rows)
    stem = path.stem
    annotated = annotate_image(image, circles, microns_per_px, scale_bar_bbox, label_limit)
    cv2.imencode(".png", annotated)[1].tofile(str(out_dir / f"{stem}_annotated.png"))
    df.to_csv(out_dir / f"{stem}_particles.csv", index=False)
    distribution = df.loc[df["included_in_distribution"], "diameter_microns"].to_numpy()
    write_histogram(distribution, out_dir / f"{stem}_histogram.png")
    return df


def expand_inputs(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            paths.extend(Path(match) for match in matches)
        else:
            paths.append(Path(pattern))
    unique = sorted({path.resolve() for path in paths})
    missing = [path for path in unique if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing input files: " + ", ".join(map(str, missing)))
    return unique


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Detect circular particles, calibrate from the lower-right scale bar, and export annotations/statistics."
    )
    parser.add_argument("images", nargs="+", help="Image path(s) or glob pattern(s).")
    parser.add_argument("--out", default="output", help="Output directory.")
    parser.add_argument("--scale-um", type=float, default=50.0, help="Scale bar length in microns.")
    parser.add_argument(
        "--scale-threshold",
        type=int,
        default=120,
        help="Dark-pixel threshold used for automatic scale-bar detection.",
    )
    parser.add_argument(
        "--scale-px",
        type=float,
        default=None,
        help="Known scale-bar length in pixels. If omitted, it is detected automatically.",
    )
    parser.add_argument("--min-diameter-um", type=float, default=2.0)
    parser.add_argument("--max-diameter-um", type=float, default=95.0)
    parser.add_argument(
        "--sensitivity",
        type=float,
        default=0.88,
        help="ALT Hough circle threshold from about 0.75 to 0.95. Lower detects more circles; higher reduces false positives.",
    )
    parser.add_argument(
        "--contrast",
        choices=["clahe", "background", "none"],
        default="clahe",
        help="Contrast preprocessing before circle detection.",
    )
    parser.add_argument(
        "--label-limit",
        type=int,
        default=80,
        help="Maximum number of largest particles to label with diameter text.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_frames = []
    for image_path in expand_inputs(args.images):
        df = analyze_one(
            image_path,
            out_dir,
            args.scale_um,
            args.scale_px,
            args.scale_threshold,
            args.min_diameter_um,
            args.max_diameter_um,
            args.sensitivity,
            args.contrast,
            args.label_limit,
        )
        all_frames.append(df)
        distribution = df.loc[df["included_in_distribution"], "diameter_microns"]
        print(
            f"{image_path.name}: {len(distribution)}/{len(df)} particles in main distribution, "
            f"median={distribution.median():.2f} microns, "
            f"mean={distribution.mean():.2f} microns"
        )

    combined = pd.concat(all_frames, ignore_index=True)
    combined.to_csv(out_dir / "all_particles.csv", index=False)
    summary = (
        combined.loc[combined["included_in_distribution"]]
        .groupby("image")["diameter_microns"]
        .agg(["count", "mean", "median", "std", "min", "max"])
        .reset_index()
    )
    summary.to_csv(out_dir / "summary.csv", index=False)
    print(f"Wrote outputs to {out_dir.resolve()}")


if __name__ == "__main__":
    main()
