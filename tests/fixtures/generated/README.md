# Generated validation fixtures

These images are deterministic repository fixtures created for decode-and-analysis
smoke tests. They are not ground-truth annotations and must not be used as evidence
of scientific accuracy until independently reviewed and annotated.

| File | Description | Source | SHA-256 |
| --- | --- | --- | --- |
| `mixed-droplet-emulsion-1024.jpg` | Bright-field-style emulsion with small, medium, large, overlapping, and boundary-clipped droplets | Generated with OpenAI image generation on 2026-07-29; resized to 1024 × 1024 and encoded as JPEG at quality 92 | `C76F90395E8A78B90420C56CA8E795196051E1E928661308CFCE91B36D38C032` |

The image intentionally has no scale bar. Tests supply a manual scale so scale-bar
detection is not part of this fixture's contract.

The automated suite includes a small regression check for six visually
unambiguous rings that the earlier Hough-only detector missed. This is not a
complete annotation set and does not establish quantitative accuracy. Before
promoting this fixture to quantitative validation, add independently reviewed
circle annotations and define tolerances for count, center position, and
diameter.
