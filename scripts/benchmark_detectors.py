from __future__ import annotations

import argparse
import json
import math
import platform
import sys
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np
import skimage
from skimage.feature import canny
from skimage.transform import hough_circle, hough_circle_peaks

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from particle_detection_core import Circle, detect_particles, prepare_detection_image


@dataclass(frozen=True)
class BenchmarkCase:
    name: str
    description: str
    image: np.ndarray
    truth: tuple[Circle, ...]


@dataclass(frozen=True)
class Metrics:
    truth_count: int
    detection_count: int
    true_positives: int
    false_positives: int
    false_negatives: int
    precision: float
    recall: float
    f1: float
    diameter_mape: float | None
    center_mae_px: float | None
    elapsed_ms: float


Detector = Callable[[np.ndarray], list[Circle]]

BASE_CIRCLES = (
    Circle(78, 82, 18, 1.0),
    Circle(205, 78, 30, 1.0),
    Circle(378, 94, 23, 1.0),
    Circle(114, 256, 37, 1.0),
    Circle(290, 250, 16, 1.0),
    Circle(430, 370, 28, 1.0),
)


def _background(kind: str, height: int = 480, width: int = 512) -> np.ndarray:
    if kind == "illumination_gradient":
        yy, xx = np.mgrid[:height, :width]
        values = 198.0 + 48.0 * (xx / width) + 16.0 * (yy / height)
        return np.clip(values, 0, 255).astype(np.uint8)
    return np.full((height, width), 228, dtype=np.uint8)


def _draw_case(
    kind: str,
    circles: tuple[Circle, ...] = BASE_CIRCLES,
    seed: int = 20260808,
) -> np.ndarray:
    gray = _background(kind)
    contrast = 24 if kind == "low_contrast" else 112
    for circle in circles:
        center_value = int(np.median(gray)) - contrast
        cv2.circle(
            gray,
            (round(circle.x), round(circle.y)),
            round(circle.r),
            center_value,
            -1,
            lineType=cv2.LINE_AA,
        )

    rng = np.random.default_rng(seed)
    if kind == "gaussian_noise":
        noise = rng.normal(0.0, 14.0, gray.shape)
        gray = np.clip(gray.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    elif kind == "defocus_blur":
        gray = cv2.GaussianBlur(gray, (0, 0), sigmaX=3.2, sigmaY=3.2)
    elif kind == "jpeg_compression":
        ok, encoded = cv2.imencode(".jpg", gray, [cv2.IMWRITE_JPEG_QUALITY, 38])
        if not ok:
            raise RuntimeError("Could not encode the JPEG benchmark case.")
        decoded = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
        if decoded is None:
            raise RuntimeError("Could not decode the JPEG benchmark case.")
        gray = decoded
    return gray


def make_benchmark_cases() -> list[BenchmarkCase]:
    overlap = (
        Circle(85, 88, 25, 1.0),
        Circle(214, 110, 38, 1.0),
        Circle(270, 112, 31, 1.0),
        Circle(400, 92, 19, 1.0),
        Circle(138, 310, 34, 1.0),
        Circle(360, 330, 27, 1.0),
    )
    clipped = (
        Circle(3, 92, 30, 1.0),
        Circle(190, 70, 24, 1.0),
        Circle(405, 105, 37, 1.0),
        Circle(110, 300, 18, 1.0),
        Circle(300, 475, 29, 1.0),
        Circle(486, 350, 34, 1.0),
    )
    definitions = [
        ("clean", "High-contrast, separated circles", BASE_CIRCLES),
        ("low_contrast", "24-level foreground/background contrast", BASE_CIRCLES),
        ("illumination_gradient", "64-level diagonal illumination gradient", BASE_CIRCLES),
        ("gaussian_noise", "Gaussian sensor noise, sigma 14", BASE_CIRCLES),
        ("defocus_blur", "Gaussian defocus blur, sigma 3.2 px", BASE_CIRCLES),
        ("jpeg_compression", "JPEG compression at quality 38", BASE_CIRCLES),
        ("overlap", "Two partially occluding particles", overlap),
        ("boundary_clipping", "Three particles clipped by image boundaries", clipped),
    ]
    return [
        BenchmarkCase(name, description, _draw_case(name, circles), circles)
        for name, description, circles in definitions
    ]


def particlelens_detector(gray: np.ndarray) -> list[Circle]:
    return detect_particles(
        gray=gray,
        microns_per_px=1.0,
        scale_bar_bbox=None,
        min_diameter_um=24.0,
        max_diameter_um=82.0,
        sensitivity=0.68,
        contrast="clahe",
        minimum_edge_score=0.10,
        circle_fit_tolerance=0.08,
        minimum_contour_coverage=0.30,
    )


def opencv_hough_detector(gray: np.ndarray) -> list[Circle]:
    """Raw OpenCV Hough Gradient ALT baseline using ParticleLens search bounds."""

    work = prepare_detection_image(gray, None, "clahe")
    work = cv2.GaussianBlur(work, (5, 5), 1.2)
    raw = cv2.HoughCircles(
        work,
        cv2.HOUGH_GRADIENT_ALT,
        dp=1.5,
        minDist=22,
        param1=300,
        param2=0.68,
        minRadius=12,
        maxRadius=41,
    )
    if raw is None:
        return []
    return [Circle(float(x), float(y), float(radius), 1.0) for x, y, radius in raw[0]]


def skimage_hough_detector(gray: np.ndarray) -> list[Circle]:
    """scikit-image circular Hough baseline with fixed, truth-independent settings."""

    work = prepare_detection_image(gray, None, "clahe")
    edges = canny(
        work.astype(np.float32) / 255.0,
        sigma=1.2,
        low_threshold=50 / 255,
        high_threshold=140 / 255,
    )
    radii = np.arange(12, 42, 2)
    hough_spaces = hough_circle(edges, radii)
    accumulators, centers_x, centers_y, peak_radii = hough_circle_peaks(
        hough_spaces,
        radii,
        min_xdistance=18,
        min_ydistance=18,
        threshold=0.30,
        total_num_peaks=64,
        normalize=True,
    )
    return [
        Circle(float(x), float(y), float(radius), float(score))
        for score, x, y, radius in zip(accumulators, centers_x, centers_y, peak_radii, strict=True)
    ]


def match_circles(
    truth: tuple[Circle, ...], detections: list[Circle]
) -> list[tuple[int, int, float, float]]:
    candidates: list[tuple[float, int, int, float, float]] = []
    for truth_idx, expected in enumerate(truth):
        for detection_idx, actual in enumerate(detections):
            center_error = math.hypot(actual.x - expected.x, actual.y - expected.y)
            radius_error = abs(actual.r - expected.r) / expected.r
            center_limit = max(5.0, 0.35 * expected.r)
            if center_error <= center_limit and radius_error <= 0.30:
                normalized_error = center_error / center_limit + radius_error / 0.30
                candidates.append(
                    (normalized_error, truth_idx, detection_idx, center_error, radius_error)
                )

    matches: list[tuple[int, int, float, float]] = []
    matched_truth: set[int] = set()
    matched_detections: set[int] = set()
    for _score, truth_idx, detection_idx, center_error, radius_error in sorted(candidates):
        if truth_idx in matched_truth or detection_idx in matched_detections:
            continue
        matches.append((truth_idx, detection_idx, center_error, radius_error))
        matched_truth.add(truth_idx)
        matched_detections.add(detection_idx)
    return matches


def evaluate(
    truth: tuple[Circle, ...], detections: list[Circle], elapsed_ms: float = 0.0
) -> Metrics:
    matches = match_circles(truth, detections)
    true_positives = len(matches)
    false_positives = len(detections) - true_positives
    false_negatives = len(truth) - true_positives
    precision = true_positives / len(detections) if detections else 0.0
    recall = true_positives / len(truth) if truth else 1.0
    f1 = 2.0 * precision * recall / (precision + recall) if precision + recall > 0 else 0.0
    return Metrics(
        truth_count=len(truth),
        detection_count=len(detections),
        true_positives=true_positives,
        false_positives=false_positives,
        false_negatives=false_negatives,
        precision=precision,
        recall=recall,
        f1=f1,
        diameter_mape=(
            float(np.mean([radius_error for *_indices, radius_error in matches]))
            if matches
            else None
        ),
        center_mae_px=(
            float(np.mean([center_error for *_indices, center_error, _radius_error in matches]))
            if matches
            else None
        ),
        elapsed_ms=elapsed_ms,
    )


def aggregate(metrics: list[Metrics]) -> Metrics:
    truth_count = sum(item.truth_count for item in metrics)
    detection_count = sum(item.detection_count for item in metrics)
    true_positives = sum(item.true_positives for item in metrics)
    false_positives = sum(item.false_positives for item in metrics)
    false_negatives = sum(item.false_negatives for item in metrics)
    precision = true_positives / detection_count if detection_count else 0.0
    recall = true_positives / truth_count if truth_count else 1.0
    f1 = 2.0 * precision * recall / (precision + recall) if precision + recall > 0 else 0.0
    matched_count = sum(item.true_positives for item in metrics)

    def weighted_mean(field: str) -> float | None:
        if not matched_count:
            return None
        return (
            sum(float(getattr(item, field) or 0.0) * item.true_positives for item in metrics)
            / matched_count
        )

    return Metrics(
        truth_count=truth_count,
        detection_count=detection_count,
        true_positives=true_positives,
        false_positives=false_positives,
        false_negatives=false_negatives,
        precision=precision,
        recall=recall,
        f1=f1,
        diameter_mape=weighted_mean("diameter_mape"),
        center_mae_px=weighted_mean("center_mae_px"),
        elapsed_ms=sum(item.elapsed_ms for item in metrics),
    )


def benchmark_detector(detector: Detector, cases: list[BenchmarkCase]) -> dict[str, Metrics]:
    results: dict[str, Metrics] = {}
    for case in cases:
        started = time.perf_counter()
        detections = detector(case.image)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        results[case.name] = evaluate(case.truth, detections, elapsed_ms)
    results["aggregate"] = aggregate(list(results.values()))
    return results


def _format_percent(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def _annotated_panel(
    image: np.ndarray,
    title: str,
    truth: tuple[Circle, ...],
    detections: list[Circle] | None,
) -> np.ndarray:
    canvas = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    for circle in truth:
        cv2.circle(
            canvas,
            (round(circle.x), round(circle.y)),
            round(circle.r),
            (50, 190, 50),
            1,
            lineType=cv2.LINE_AA,
        )
    if detections is not None:
        for circle in detections:
            center = (round(circle.x), round(circle.y))
            cv2.circle(canvas, center, round(circle.r), (30, 120, 240), 2, lineType=cv2.LINE_AA)
            cv2.circle(canvas, center, 2, (30, 120, 240), -1, lineType=cv2.LINE_AA)
    cv2.rectangle(canvas, (0, 0), (canvas.shape[1], 28), (24, 24, 24), -1)
    cv2.putText(
        canvas,
        title,
        (10, 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.52,
        (245, 245, 245),
        1,
        lineType=cv2.LINE_AA,
    )
    return canvas


def _write_case_images(
    cases: list[BenchmarkCase], output_dir: Path, detectors: dict[str, Detector]
) -> None:
    examples_dir = output_dir / "examples"
    examples_dir.mkdir(parents=True, exist_ok=True)
    for case in cases:
        panels = [_annotated_panel(case.image, "Ground truth", case.truth, None)]
        panels.extend(
            _annotated_panel(case.image, detector_name, case.truth, detector(case.image))
            for detector_name, detector in detectors.items()
        )
        cv2.imwrite(
            str(examples_dir / f"{case.name}.png"),
            np.concatenate(panels, axis=1),
        )


def write_report(
    output_dir: Path,
    cases: list[BenchmarkCase],
    results: dict[str, dict[str, Metrics]],
    detectors: dict[str, Detector],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_case_images(cases, output_dir, detectors)
    payload = {
        "environment": {
            "python": platform.python_version(),
            "opencv": cv2.__version__,
            "scikit_image": skimage.__version__,
            "platform": platform.platform(),
        },
        "cases": [
            {"name": case.name, "description": case.description, "truth_count": len(case.truth)}
            for case in cases
        ],
        "results": {
            detector_name: {case_name: asdict(metrics) for case_name, metrics in detector.items()}
            for detector_name, detector in results.items()
        },
    }
    (output_dir / "results.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    lines = [
        "# Circle detector robustness benchmark",
        "",
        "All detectors receive the same eight deterministic synthetic images and fixed",
        "truth-independent parameters. A match requires center error within max(5 px, 35%",
        "of radius) and radius error at or below 30%. Timing is indicative only.",
        "",
        "| Detector | Precision | Recall | F1 | Diameter MAPE | Center MAE | Total time |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for detector_name, detector_results in results.items():
        summary = detector_results["aggregate"]
        lines.append(
            f"| {detector_name} | {_format_percent(summary.precision)} | "
            f"{_format_percent(summary.recall)} | {_format_percent(summary.f1)} | "
            f"{_format_percent(summary.diameter_mape)} | "
            f"{summary.center_mae_px:.2f} px | {summary.elapsed_ms:.1f} ms |"
        )

    lines.extend(
        [
            "",
            "## Results by case",
            "",
            "| Case | Truth | ParticleLens F1 | OpenCV F1 | scikit-image F1 | ParticleLens diameter MAPE |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for case in cases:
        particlelens = results["ParticleLens"][case.name]
        opencv = results["OpenCV Hough Gradient ALT"][case.name]
        scikit_image = results["scikit-image circular Hough"][case.name]
        lines.append(
            f"| {case.name} | {len(case.truth)} | {_format_percent(particlelens.f1)} | "
            f"{_format_percent(opencv.f1)} | {_format_percent(scikit_image.f1)} | "
            f"{_format_percent(particlelens.diameter_mape)} |"
        )
    lines.extend(
        [
            "",
            "## Baselines and interpretation",
            "",
            "- [OpenCV](https://docs.opencv.org/4.x/d4/d70/tutorial_hough_circle.html) uses",
            "  `HOUGH_GRADIENT_ALT` with the same radius bounds, CLAHE, blur,",
            "  and sensitivity as ParticleLens, but without ParticleLens contour recovery,",
            "  edge-support filtering, circle refinement, or duplicate suppression.",
            "- [scikit-image](https://scikit-image.org/docs/stable/auto_examples/edges/plot_circular_elliptical_hough_transform.html)",
            "  uses its documented Canny, `hough_circle`, and `hough_circle_peaks` pipeline",
            "  with fixed radius bounds and a 0.30 normalized peak threshold.",
            "- The benchmark never gives a detector the expected particle count. Detector",
            "  parameters are fixed across all cases and do not depend on ground truth.",
            "",
            "This suite measures controlled perturbations, not scientific validity on real",
            "microscopy. Synthetic geometry is easier than irregular particles, textured",
            "backgrounds, non-circular objects, and modality-specific artifacts. Use these",
            "numbers for regression detection and kernel comparison, then validate against",
            "independently annotated images from the intended experiment.",
            "",
            "Reproduce the report from the repository root:",
            "",
            "```powershell",
            "uv run python scripts/benchmark_detectors.py --output-dir docs/benchmarks/latest",
            "```",
            "",
            "The four-panel images in `examples/` show truth in green and detections in",
            "orange for direct visual comparison. See",
            "`results.json` for counts, false positives, false negatives, and environment",
            "versions.",
            "",
        ]
    )
    (output_dir / "README.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "output" / "detector-benchmark",
        help="Directory for the Markdown report, JSON metrics, and example images.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cases = make_benchmark_cases()
    detectors = {
        "ParticleLens": particlelens_detector,
        "OpenCV Hough Gradient ALT": opencv_hough_detector,
        "scikit-image circular Hough": skimage_hough_detector,
    }
    results = {name: benchmark_detector(detector, cases) for name, detector in detectors.items()}
    write_report(args.output_dir, cases, results, detectors)
    for name, detector_results in results.items():
        summary = detector_results["aggregate"]
        print(
            f"{name}: precision={summary.precision:.3f}, recall={summary.recall:.3f}, "
            f"F1={summary.f1:.3f}, diameter MAPE={summary.diameter_mape:.3f}, "
            f"time={summary.elapsed_ms:.1f} ms"
        )
    print(f"Report: {args.output_dir / 'README.md'}")


if __name__ == "__main__":
    main()
