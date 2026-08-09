# Mobile design QA

## Comparison target

- Source visual truth:
  - `docs/design/mobile/tuning-brightness.png`
  - `docs/design/mobile/tuning-contrast.png`
  - `docs/design/mobile/tuning-gamma.png`
  - `docs/design/mobile/tuning-sensitivity.png`
  - `docs/design/mobile/tuning-diameter.png`
  - `docs/design/mobile/analysis-data.png`
  - `docs/design/mobile/analysis-distribution.png`
  - `docs/design/mobile/analysis-export.png`
  - User-requested hold control asset: `docs/design/mobile/hold-original-icon.png`
- Rendered implementation: `http://127.0.0.1:4174/`
- Implementation screenshots: `docs/design/mobile/qa/implementation-*.png`
- Viewport: 390 × 844 CSS px, dark theme, device scale factor 1.
- Source pixels: 852–853 × 1844–1847 px, normalized with Lanczos resampling to 390 × 844 px.
- Implementation pixels: 390 × 844 px, captured directly from the in-app browser viewport.
- Minimum responsive viewport: iPhone SE at 375 × 667 CSS px, captured directly at device scale factor 1.
- State: generated droplet-emulsion fixture loaded at 0.6250 µm/px; tuning drawer expanded; analysis captures taken after local detection with the 4–180 µm default diameter range.

## Full-view comparison evidence

- `docs/design/mobile/qa/comparison-tuning-brightness.png`
- `docs/design/mobile/qa/comparison-tuning-contrast.png`
- `docs/design/mobile/qa/comparison-tuning-gamma.png`
- `docs/design/mobile/qa/comparison-tuning-sensitivity.png`
- `docs/design/mobile/qa/comparison-tuning-diameter.png`
- `docs/design/mobile/qa/comparison-analysis-data.png`
- `docs/design/mobile/qa/comparison-analysis-distribution.png`
- `docs/design/mobile/qa/comparison-analysis-export.png`

## Focused comparison evidence

- Tuning drawer controls, slider geometry, labels, and actions: `docs/design/mobile/qa/comparison-focus-tuning-drawer.png`
- Analysis header, result summary, statistics, and tabs: `docs/design/mobile/qa/comparison-focus-analysis-header.png`

## iPhone SE responsive evidence

- Expanded tuning drawer: `docs/design/mobile/qa/implementation-iphone-se-tuning.png`
- Data: `docs/design/mobile/qa/implementation-iphone-se-data.png`
- Distribution: `docs/design/mobile/qa/implementation-iphone-se-distribution.png`
- Export: `docs/design/mobile/qa/implementation-iphone-se-export.png`
- Collapsed image-settings entry: `docs/design/mobile/qa/implementation-iphone-se-drawer-collapsed.png`
- Analysis tab spacing: `docs/design/mobile/qa/implementation-iphone-se-analysis-tab-gap.png`

At 375 × 667, the five tuning tabs, selected-parameter content, All settings, Fit view, and Run Detection remain in the initial viewport. The analysis header, result summary, four statistics, tabs, distribution plot/actions, and complete export form/actions remain horizontally unclipped; all primary task actions are reachable without opening a second page.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: the implementation uses the product's existing Segoe UI/system stack and preserves the reference hierarchy. Long dynamic range values are forced to a compact single line. Residual optical differences in weight and antialiasing are P3.
- Spacing and layout rhythm: canvas, drawer, five-tab navigation, statistics, analysis tabs, form controls, and primary actions follow the same mobile hierarchy and fit the 390 × 844 viewport without overlap or inaccessible controls.
- Colors and visual tokens: existing ParticleLens dark surfaces, yellow accent, green live state, blue chart line, borders, and muted text map to the reference palette.
- Image quality and asset fidelity: the real ParticleLens logo, real microscope fixture, Lucide icon set, and supplied hold-control raster asset are used. No placeholder imagery, CSS illustration, emoji, or handcrafted SVG replacement was introduced.
- Copy and content: tuning labels, descriptions, analysis labels, and export copy match the reference intent in English and remain localized through the existing translation system.
- Interaction and accessibility: the drawer expands/collapses, all five tuning tabs work, analysis tabs return to the top, the compact compare control exposes a pressed state, and press/hold/release/cancel restores the appropriate image. Touch targets and keyboard semantics are retained.

## Comparison history

### Iteration 1 — blocked

- P2: the five tuning-tab icons were present in markup but absent in the render because the new Lucide icons were not registered.
- P2: the original full-canvas fit centered square images against the entire viewport, creating a large black band and reducing the live preview above the drawer.
- P2: the diameter description clipped behind the settings row, and defaults differed from the 4–180 µm source state.
- P2: analysis statistics rendered as generic cards, wrapped to another row, and the distribution controls wrapped 2 + 1.
- P2: the export primary action and distribution result action fell below the intended above-the-fold composition.

Fixes made: registered the required Lucide set; added a mobile visible-canvas fit frame; tightened drawer rows; aligned diameter defaults; rebuilt the analysis result summary and four-column statistics; kept the three distribution toggles in one row; compressed mobile analysis density; added the distribution-to-export action.

### Iteration 2 — blocked

- P2: analysis-tab switching could preserve a scrolled position after chart rendering.
- P2: long dynamic range values wrapped and changed the statistics rhythm.
- P2: the mobile distribution state showed Live overlay enabled while the source state showed it disabled.

Fixes made: reset the analysis scroller after tab rendering; added a resilient single-line range style; defaulted the overlay off only in compact layout. Post-fix evidence is in the final full-view and focused comparison files listed above.

### Iteration 3 — passed

The post-fix 390 × 844 captures have no overlapping controls, clipped required copy, broken tabs, missing assets, or actionable P0/P1/P2 fidelity differences. The compact hold-original button intentionally differs from the wide Before/After control in the earlier source because the user explicitly requested the supplied icon and press-and-hold behavior.

### Iteration 4 — passed

The short-screen density rules were verified at the iPhone SE baseline of 375 × 667. The initial automated check exposed only transition-in-progress geometry when the drawer and analysis page were measured immediately after opening; the regression now waits for the 180–230 ms UI transitions before asserting final layout bounds. Stable-state screenshots and bounding-box assertions confirm that required controls are not clipped.

### Iteration 5 — passed

Browser annotations identified three P2 usability issues: the collapsed drawer had no descriptive entry label, the analysis tabs visually touched the statistics row, and the drawer changed state by click instead of a physical pull gesture. The collapsed state now exposes a dedicated “Image settings / Processing parameters” title row while hiding the expanded controls; the analysis tabs have an 8–10 px responsive top gap; and the handle tracks vertical pointer movement before snapping through two hysteresis thresholds (expand at ≤ 38%, collapse at ≥ 62%, otherwise return to the starting state). Clicking the handle no longer changes state. Keyboard users retain Arrow/Page/Home/End controls. Post-fix evidence is in the two iPhone SE screenshots above.

## Primary interactions tested

- Open a microscope image and render the live canvas.
- Switch all five tuning tabs and synchronize values with the existing settings.
- Collapse and reopen the tuning drawer.
- Press and hold the supplied compact control to show the original; release to restore the edited preview.
- Open full settings and return to the image.
- Run local detection and open Data, Distribution, and Export.
- Switch analysis tabs, restore the top position, and use the distribution-to-export action.
- Verify 390 × 844 pinch zoom and Fit view through the mobile regression test.
- Verify every tuning state and the Data, Distribution, and Export primary actions at 375 × 667 through a dedicated iPhone SE regression test.
- Verify shallow and committed upward/downward drawer pulls against both snap thresholds, and verify that a click alone does not change state.
- Verify at least 6 px of stable separation between the statistics row and analysis tabs at 375 × 667.

## Verification

- Browser-rendered screenshots: present in `docs/design/mobile/qa/`.
- Console warnings/errors checked in the final in-app browser state: none.
- Unit tests: passed.
- Chromium end-to-end suite: 19 passed, including the iPhone SE regression.
- Dedicated iPhone SE end-to-end regression: 1 passed.
- Lint: passed.
- Production web build: passed.

## Follow-up polish

- P3: the implementation deliberately uses the compact supplied hold icon instead of the source's wide Before/After segmented control.
- P3: dynamic detection counts, measured diameters, image crop, and chart bins differ because the comparison uses a live fixture rather than rasterized mock data.
- P3: system font rendering and slider thumb sizing retain small optical differences from the generated reference.

## Implementation checklist

- [x] Five tuning states implemented and linked to the existing controls.
- [x] Drawer collapse state implemented.
- [x] Hold-for-original interaction implemented with cancel/release recovery.
- [x] Data, Distribution, and Export states implemented.
- [x] Same-viewport full-view and focused comparisons captured.
- [x] Browser console and automated regression checks passed.
- [x] iPhone SE 375 × 667 screenshots and layout-bound regression passed.

final result: passed
