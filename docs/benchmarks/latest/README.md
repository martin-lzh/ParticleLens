# Circle detector robustness benchmark

All detectors receive the same eleven deterministic synthetic images and fixed
truth-independent parameters. A match requires center error within max(5 px, 35%
of radius) and radius error at or below 30%. Timing is indicative only.

## Benchmark parameters

No detector receives the expected particle count, and no parameter changes by
case. Values below come from the constants and configuration manifest beside the
benchmark calls; fixed ParticleLens kernel internals are recorded explicitly. The
JSON report contains the same manifest.

### Shared input and preprocessing

| Parameter | Value |
| --- | --- |
| source width | 512 px |
| source height | 480 px |
| color conversion | cv2.COLOR_BGR2GRAY for BGR sources; grayscale sources unchanged |
| diameter search range | 24-82 px |
| radius search range | 12-41 px |
| calibration | 1 micrometer per pixel |
| contrast mode | CLAHE, clip limit 2.0, 8 x 8 tiles |
| median blur | 5 x 5 |

### ParticleLens

| Parameter | Value |
| --- | --- |
| Gaussian blur after median | 5 x 5, sigma 1.2 |
| sensitivity / Hough param2 | 0.68 |
| Hough method | cv2.HOUGH_GRADIENT_ALT |
| Hough dp | 1.5 |
| Hough minimum center distance | 22 px |
| Hough param1 | 300.0 |
| edge thresholds | Canny low 50, high 140 |
| minimum edge support | 0.1 |
| circle-fit tolerance | 0.08 |
| minimum contour coverage | 0.3 |
| annular radial support | ceil(22% of radius), clamped to 2-6 px |
| brightness / contrast adjustment / gamma | 0 / 0 / 1.0 |

### OpenCV Hough Gradient ALT

| Parameter | Value |
| --- | --- |
| Gaussian blur after median | 5 x 5, sigma 1.2 |
| method | cv2.HOUGH_GRADIENT_ALT |
| dp | 1.5 |
| minimum center distance | 22 px |
| param1 | 300.0 |
| param2 | 0.68 |
| minimum radius | 12 px |
| maximum radius | 41 px |
| post-processing | none |

### scikit-image circular Hough

| Parameter | Value |
| --- | --- |
| Canny sigma | 1.2 |
| Canny low threshold | 50 / 255 |
| Canny high threshold | 140 / 255 |
| radius grid | 12-41 px inclusive, 1 px step |
| minimum x/y peak distance | 22 / 22 px |
| normalized peak threshold | 0.3 |
| maximum returned peaks | 64 |
| normalize accumulators | true |

### Matching and timing

| Parameter | Value |
| --- | --- |
| assignment | greedy ascending normalized error, one detection per truth circle |
| center-error limit | max(5 px, 35% of truth radius) |
| radius-error limit | 30% of truth radius |
| diameter error | mean absolute percentage error over matched circles |
| warm-up runs per detector and case | 1 |
| timed repetitions per detector and case | 5 |
| reported case time | median |
| reported total time | sum of per-case medians |
| detector execution | sequential in displayed order |

### Execution environment

| Parameter | Value |
| --- | --- |
| operating system | Windows-11-10.0.26200-SP0 |
| machine | AMD64 |
| processor | Intel64 Family 6 Model 198 Stepping 2, GenuineIntel |
| logical CPU count | 24 |
| Python | 3.13.3 |
| NumPy | 2.2.5 |
| OpenCV | 4.11.0 |
| OpenCV threads | 24 |
| scikit-image | 0.26.0 |

## Aggregate results

| Detector | Precision | Recall | F1 | Diameter MAPE | Center MAE | Total time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ParticleLens | 100.0% | 100.0% | 100.0% | 2.7% | 0.23 px | 94.9 ms |
| OpenCV Hough Gradient ALT | 100.0% | 95.5% | 97.7% | 2.6% | 0.58 px | 49.2 ms |
| scikit-image circular Hough | 100.0% | 72.7% | 84.2% | 6.1% | 0.04 px | 1838.9 ms |

## Results by case

| Case | Truth | ParticleLens F1 | OpenCV F1 | scikit-image F1 | ParticleLens diameter MAPE |
| --- | ---: | ---: | ---: | ---: | ---: |
| clean | 6 | 100.0% | 100.0% | 100.0% | 2.7% |
| low_contrast | 6 | 100.0% | 80.0% | 0.0% | 2.9% |
| illumination_gradient | 6 | 100.0% | 100.0% | 100.0% | 3.0% |
| gaussian_noise | 6 | 100.0% | 100.0% | 100.0% | 3.6% |
| defocus_blur | 6 | 100.0% | 100.0% | 0.0% | 2.1% |
| jpeg_compression | 6 | 100.0% | 100.0% | 100.0% | 2.7% |
| overlap | 6 | 100.0% | 100.0% | 100.0% | 2.5% |
| boundary_clipping | 6 | 100.0% | 100.0% | 100.0% | 2.4% |
| edge_only_dark_rings | 6 | 100.0% | 100.0% | 100.0% | 1.7% |
| edge_only_colored_rings | 6 | 100.0% | 100.0% | 100.0% | 1.7% |
| edge_only_weak_colored_rings | 6 | 100.0% | 90.9% | 0.0% | 4.1% |

## Baselines and interpretation

- [OpenCV](https://docs.opencv.org/4.x/d4/d70/tutorial_hough_circle.html) uses
  `HOUGH_GRADIENT_ALT` with the same radius bounds, CLAHE, blur,
  and sensitivity as ParticleLens, but without ParticleLens contour recovery,
  edge-support filtering, circle refinement, or duplicate suppression.
- [scikit-image](https://scikit-image.org/docs/stable/auto_examples/edges/plot_circular_elliptical_hough_transform.html)
  uses its documented Canny, `hough_circle`, and `hough_circle_peaks` pipeline
  with fixed radius bounds and a 0.30 normalized peak threshold.
- The benchmark never gives a detector the expected particle count. Detector
  parameters are fixed across all cases and do not depend on ground truth.
- The three edge-only source images retain BGR color in the comparison panels;
  detector inputs use the same OpenCV BGR-to-grayscale conversion as the app.
- Threshold values are not numerically equivalent across libraries: OpenCV
  `param2` is a Hough center-confidence threshold, while scikit-image's 0.30
  value is a normalized accumulator peak threshold. They are fixed and
  disclosed, but the table does not claim each baseline is optimally tuned.
- OpenCV can return subpixel radii. scikit-image evaluates the disclosed 1 px
  radius grid. ParticleLens intentionally includes its contour recovery and
  refinement because the benchmark evaluates the complete detector kernel.

This suite measures controlled perturbations, not scientific validity on real
microscopy. Synthetic geometry is easier than irregular particles, textured
backgrounds, non-circular objects, and modality-specific artifacts. Use these
numbers for regression detection and kernel comparison, then validate against
independently annotated images from the intended experiment.

Reproduce the report from the repository root:

```powershell
uv run python scripts/benchmark_detectors.py --output-dir docs/benchmarks/latest
```

The four-panel images in `examples/` show truth in green and detections in
orange for direct visual comparison. See
`results.json` for counts, false positives, false negatives, and environment
versions.
