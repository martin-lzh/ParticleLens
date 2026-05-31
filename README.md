# ParticleLens

ParticleLens is an open-source tool for measuring particle-size distributions
from microscope images. It was originally built for counting droplets in optical
microscope images, then expanded into a lightweight workflow for automatic
detection, manual correction, and export of droplet or particle measurements.

The project includes both a command-line analyzer and a local browser-based app.

## Features

- Detect approximately circular droplets or particles in microscope images.
- Estimate pixel-to-micrometer calibration from a lower-right scale bar.
- Override or redraw the scale bar when automatic detection is not reliable.
- Review and correct detections in a local interactive app.
- Add missed droplets manually by drawing across their diameter.
- Select, move, delete, and nudge detected circles.
- Zoom and pan large microscope images without changing the source image.
- Inspect live count, mean, median, range, and histogram statistics.
- Export corrected CSV measurements and annotated images.
- Run fully locally; no microscope image data is uploaded to an external service.
- Use the bilingual Chinese/English web UI.

## Methods

ParticleLens uses a classical computer-vision pipeline rather than a trained
machine-learning model. The current workflow is:

1. Convert the microscope image to grayscale.
2. Detect the lower-right scale bar by thresholding dark pixels and finding long
   horizontal runs in the expected annotation region.
3. Convert pixels to micrometers from the detected or manually supplied scale.
4. Preprocess contrast with CLAHE or background correction.
5. Detect circular candidates with OpenCV's Hough circle transform.
6. Refine each circle against edge pixels with a least-squares circle fit.
7. Score candidates by edge support, remove duplicates, and exclude detections
   in the scale-bar annotation area.
8. Compute visible-area fraction so partially clipped droplets or particles can
   be excluded from the main distribution.
9. Export per-object measurements and summary statistics.

The interactive app keeps the automatic detections editable, because microscope
images often contain overlapping droplets, partial objects near the image edge,
uneven illumination, or scale-bar annotations that need human correction.

## Credits

ParticleLens builds on several open-source tools and algorithms:

- [OpenCV](https://opencv.org/) for image decoding, Canny edge detection,
  contrast preprocessing, Hough circle detection, drawing, and image export.
- [NumPy](https://numpy.org/) for numerical operations and circle-fit math.
- [Pandas](https://pandas.pydata.org/) for CSV tables and batch summaries.
- [Matplotlib](https://matplotlib.org/) for histogram generation.
- [PyInstaller](https://pyinstaller.org/) for Windows executable packaging.
- [uv](https://docs.astral.sh/uv/) for dependency management and reproducible
  local builds.

The droplet/particle detector itself is project code in `analyze_particles.py`.
It combines OpenCV primitives with custom scale-bar detection, edge-supported
circle refinement, duplicate suppression, and visible-area filtering.

## Outputs

ParticleLens can export:

- `*_annotated.png`: source image with fitted circles, diameter lines, and labels.
- `*_particles.csv`: per-droplet or per-particle center, radius, diameter, and scale data.
- `*_histogram.png`: particle-size or droplet-size histogram.
- `summary.csv`: batch-level statistics.
- `all_particles.csv`: combined batch measurement table.

The interactive app exports CSV rows with `particle_id`, `center_x_px`,
`center_y_px`, `radius_px`, `radius_micrometer`, and `diameter_micrometer`.

## Installation

Install dependencies with [uv](https://docs.astral.sh/uv/):

```powershell
uv sync
```

Python 3.11 or newer is required.

## Command-Line Usage

Analyze one image:

```powershell
uv run python analyze_particles.py "image.jpeg" --out output
```

Analyze a batch:

```powershell
uv run python analyze_particles.py "E:\MicroscopeImages\*.jpeg" --out output
```

Useful tuning options:

```powershell
# If automatic scale-bar detection is off, provide the scale-bar length in pixels.
uv run python analyze_particles.py "image.jpeg" --scale-px 223 --out output

# Reduce text clutter on dense images.
uv run python analyze_particles.py "image.jpeg" --label-limit 30 --out output

# Detect more or fewer candidates. Lower sensitivity finds more circles.
uv run python analyze_particles.py "image.jpeg" --sensitivity 0.84 --out output
uv run python analyze_particles.py "image.jpeg" --sensitivity 0.92 --out output
```

## Interactive App

Start the local app:

```powershell
uv run python particle_web_app.py
```

Open `http://127.0.0.1:8765`, choose a microscope image, and run automatic
detection. Stop the server with `Ctrl+C`.

In the app you can:

- collapse the tool panel and open the data panel to maximize the image canvas;
- draw a scale line manually with `Redraw Scale Bar`;
- add missed droplets or particles with right-drag across the diameter;
- select with left click, multi-select with `Shift` + left click, and drag selected circles;
- delete selected circles with `Delete` or `Backspace`;
- nudge selected circles with arrow keys, or `Shift` + arrow keys for larger moves;
- zoom the canvas with the mouse wheel or the `+`/`-` buttons;
- pan with the middle mouse button;
- inspect live statistics and the histogram;
- export corrected CSV and annotated images with `Export CSV + Image`.

## Windows Release

Build a click-to-run Windows release:

```powershell
.\scripts\build_windows_release.ps1
```

The build creates:

```text
release/ParticleLens-Windows-v0.1.0.zip
release/ParticleLens-Windows-OneFile-v0.1.0.exe
release/SHA256SUMS.txt
```

Users can extract the ZIP and double-click `ParticleLens.exe`. The launcher
starts the local app, opens it in the default browser, and provides a small
window with `Open App` and `Quit` buttons. The one-file EXE provides the same
app as a single executable.

## Repository Layout

```text
analyze_particles.py          Command-line detection and export workflow
particle_web_app.py           Local HTTP API and static file server
particle_app_launcher.py      Desktop launcher for packaged Windows builds
static/                       Browser UI for correction and export
packaging/                    PyInstaller specs
scripts/                      Release build scripts
```

## Citation

If you use ParticleLens in academic work, cite it with the BibTeX entry in
[`CITATION.bib`](CITATION.bib).

## License

ParticleLens is licensed under the MIT License. See [`LICENSE`](LICENSE).
