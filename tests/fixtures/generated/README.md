# Generated validation fixtures

These images are deterministic repository fixtures created for decode, analysis,
and software-regression tests. They are not ground-truth annotations and must not
be used as evidence of scientific accuracy until independently reviewed and
annotated.

| File | Description | Source | SHA-256 |
| --- | --- | --- | --- |
| `mixed-droplet-emulsion-1024.jpg` | Bright-field-style emulsion with small, medium, large, overlapping, and boundary-clipped droplets | Generated with OpenAI image generation on 2026-07-29; resized to 1024 × 1024 and encoded as JPEG at quality 92 | `C76F90395E8A78B90420C56CA8E795196051E1E928661308CFCE91B36D38C032` |

`mixed-droplet-emulsion-1024.baseline.json` is the versioned software-regression
source of truth for this image. Its nine cases are recorded from the built web app
through Chromium: Playwright fills the visible controls, runs detection, downloads
the exported CSV, and stores those user-visible values at the CSV's published
precision. Chromium, Edge, Firefox, and WebKit must all reproduce the same data.

After an intentional detector or parameter-semantics change, regenerate the file
with `npm run test:e2e:update-recognition-baseline` and review the complete diff.
Do not update the baseline to make an unrelated feature or presentation change
pass CI.

The image intentionally has no scale bar. Tests supply a manual scale so scale-bar
detection is not part of this fixture's contract.

The Python suite also includes a small check for six visually unambiguous rings
that the earlier Hough-only detector missed. Neither that check nor the browser
baseline is a complete annotation set or a claim of quantitative accuracy. Before
promoting this fixture to scientific validation, add independently reviewed circle
annotations and define tolerances for count, center position, and diameter.
