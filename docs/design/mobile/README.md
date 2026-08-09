# ParticleLens mobile implementation reference

These images are the visual source of truth for the mobile layout. Implementation and visual QA should compare the same viewport and state against the corresponding reference.

## Canvas tuning drawer

- [Brightness](tuning-brightness.png)
- [Contrast](tuning-contrast.png)
- [Gamma](tuning-gamma.png)
- [Sensitivity](tuning-sensitivity.png)
- [Diameter](tuning-diameter.png)

The drawer must support expanded and collapsed states. Collapsing it returns maximum space to the live canvas while keeping a clear affordance to reopen it. The active parameter and values must survive collapse and reopen.

## Analysis workspace

- [Data](analysis-data.png)
- [Distribution](analysis-distribution.png)
- [Export](analysis-export.png)

The analysis workspace is a sibling mobile view to the canvas. Returning to the image must preserve canvas zoom, pan, selected parameter, parameter values, and drawer state.

## Hold-to-compare control

- [Icon reference](hold-original-icon.png)

Use a compact icon-only control matching this reference. Pressing and holding shows the unedited source image. Releasing, cancelling, losing pointer capture, or losing focus restores the edited preview. The button must expose an accessible label and pressed state.

## Acceptance baseline

- Mobile visual target viewport: 390 x 844 CSS pixels.
- Minimum supported mobile QA viewport: iPhone SE at 375 x 667 CSS pixels. The full tuning workflow and every primary action in Data, Distribution, and Export must remain visible without horizontal clipping or a second page.
- Desktop and tablet layouts must retain their current behavior.
- The mobile UI must reuse the existing detection, preview, chart, export, localization, and canvas state rather than duplicate business logic.
- Core controls must remain keyboard accessible and use touch targets of at least 44 x 44 CSS pixels.
- Visual QA is complete only after reference and implementation screenshots are compared at the same viewport and state, and `design-qa.md` reports `final result: passed`.

## Rendered comparison evidence

- [Brightness comparison](qa/comparison-tuning-brightness.png)
- [Contrast comparison](qa/comparison-tuning-contrast.png)
- [Gamma comparison](qa/comparison-tuning-gamma.png)
- [Sensitivity comparison](qa/comparison-tuning-sensitivity.png)
- [Diameter comparison](qa/comparison-tuning-diameter.png)
- [Data comparison](qa/comparison-analysis-data.png)
- [Distribution comparison](qa/comparison-analysis-distribution.png)
- [Export comparison](qa/comparison-analysis-export.png)
- [Focused tuning drawer comparison](qa/comparison-focus-tuning-drawer.png)
- [Focused analysis header comparison](qa/comparison-focus-analysis-header.png)

## iPhone SE responsive evidence

- [Tuning drawer at 375 × 667](qa/implementation-iphone-se-tuning.png)
- [Data at 375 × 667](qa/implementation-iphone-se-data.png)
- [Distribution at 375 × 667](qa/implementation-iphone-se-distribution.png)
- [Export at 375 × 667](qa/implementation-iphone-se-export.png)
