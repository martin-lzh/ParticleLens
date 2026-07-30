from __future__ import annotations

import argparse
import glob
from pathlib import Path

import cv2
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from particle_detection_core import (
    Circle,
    circle_rect_visible_fraction,
    detect_particles,
    detect_scale_bar,
)


def read_image(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return image


def annotate_image(
    image: np.ndarray,
    circles: list[Circle],
    microns_per_px: float,
    scale_bar_bbox: tuple[int, int, int, int] | None,
    label_limit: int,
) -> np.ndarray:
    annotated = image.copy()
    circles_for_labels = sorted(circles, key=lambda c: c.r, reverse=True)
    label_set = {id(c) for c in circles_for_labels[:label_limit]}

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
    edge_threshold_low: int,
    edge_threshold_high: int,
    minimum_edge_support: float,
    circle_fit_tolerance: float,
    minimum_contour_coverage: float,
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
        edge_threshold_low=edge_threshold_low,
        edge_threshold_high=edge_threshold_high,
        minimum_edge_score=minimum_edge_support,
        circle_fit_tolerance=circle_fit_tolerance,
        minimum_contour_coverage=minimum_contour_coverage,
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
        help="ALT Hough circle threshold from 0.01 to 0.98. Lower detects more circles; higher reduces false positives.",
    )
    parser.add_argument(
        "--contrast",
        choices=["clahe", "background", "none"],
        default="clahe",
        help="Contrast preprocessing before circle detection.",
    )
    parser.add_argument(
        "--edge-threshold-low",
        type=int,
        default=50,
        help="Lower Canny edge threshold from 0 to 254.",
    )
    parser.add_argument(
        "--edge-threshold-high",
        type=int,
        default=140,
        help="Upper Canny edge threshold from 1 to 255; must exceed the lower threshold.",
    )
    parser.add_argument(
        "--minimum-edge-support",
        type=float,
        default=0.10,
        help="Minimum fraction of a fitted circumference supported by edge pixels.",
    )
    parser.add_argument(
        "--circle-fit-tolerance",
        type=float,
        default=0.08,
        help="Maximum normalized radial error accepted for contour-fitted circles.",
    )
    parser.add_argument(
        "--minimum-contour-coverage",
        type=float,
        default=0.30,
        help="Minimum fraction of a circumference represented by a fitted contour.",
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
            args.edge_threshold_low,
            args.edge_threshold_high,
            args.minimum_edge_support,
            args.circle_fit_tolerance,
            args.minimum_contour_coverage,
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
