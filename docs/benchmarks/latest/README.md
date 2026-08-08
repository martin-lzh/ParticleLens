# Circle detector robustness benchmark

All detectors receive the same eleven deterministic synthetic images and fixed
truth-independent parameters. A match requires center error within max(5 px, 35%
of radius) and radius error at or below 30%. Timing is indicative only.

| Detector | Precision | Recall | F1 | Diameter MAPE | Center MAE | Total time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ParticleLens | 100.0% | 100.0% | 100.0% | 2.7% | 0.23 px | 85.2 ms |
| OpenCV Hough Gradient ALT | 100.0% | 95.5% | 97.7% | 2.6% | 0.58 px | 44.8 ms |
| scikit-image circular Hough | 100.0% | 72.7% | 84.2% | 3.9% | 0.61 px | 1005.1 ms |

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
