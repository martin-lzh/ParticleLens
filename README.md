# Particle size distribution

Python script for detecting approximately circular microscope particles, reading the
scale bar in the lower-right corner, annotating particle diameters, and exporting
summary tables/plots.

## Setup

```powershell
uv sync
```

## Example

```powershell
uv run python analyze_particles.py "E:\Temp\Cache\oPlusConnect\TempFiles\Probe4_400.jpeg" --out output
```

Batch mode:

```powershell
uv run python analyze_particles.py "E:\Temp\Cache\oPlusConnect\TempFiles\*.jpeg" --out output
```

Useful tuning options:

```powershell
# If automatic scale-bar detection is off, provide the 50 micron bar length in pixels.
uv run python analyze_particles.py "image.jpeg" --scale-px 223 --out output

# Reduce text clutter on dense images.
uv run python analyze_particles.py "image.jpeg" --label-limit 30 --out output

# Detect more or fewer particles. Lower sensitivity finds more candidates.
uv run python analyze_particles.py "image.jpeg" --sensitivity 0.84 --out output
uv run python analyze_particles.py "image.jpeg" --sensitivity 0.92 --out output
```

Outputs:

- `*_annotated.png`: original image with fitted circles, diameter lines, and labels.
- `*_particles.csv`: per-particle center/radius/diameter table.
- `*_histogram.png`: particle-size histogram.
- `summary.csv` and `all_particles.csv`: batch-level statistics.

## Interactive correction app

Start the lightweight local web app:

```powershell
uv run python particle_web_app.py
```

The command keeps running while the local server is active. Open
`http://127.0.0.1:8765`, choose an image, and run automatic detection.
Stop the server with `Ctrl+C`.
After that you can:

- collapse the left tool drawer and open the right data drawer so the center canvas keeps the full viewport;
- draw a scale line manually with `Redraw Scale Bar`;
- add missed particles with right-drag across the particle diameter;
- select with left click, multi-select with `Shift` + left click, and drag selected circles to move them;
- delete selected particles with `Delete` or `Backspace`;
- nudge selected particles with arrow keys, or `Shift` + arrow keys for larger moves;
- zoom the observation canvas with the mouse wheel or the `+`/`-` buttons, and pan with the middle mouse button;
- inspect live count/mean/median/range and the histogram in the right drawer;
- export the corrected CSV and annotated image together with `Export CSV + Image`;
- CSV includes `particle_id`, `center_x_px`, `center_y_px`, `radius_px`, `radius_micrometer`, and `diameter_micrometer`.

## Windows release build

Build a click-to-run Windows release ZIP:

```powershell
.\scripts\build_windows_release.ps1
```

The build creates:

```text
release/ParticleSizeAnnotator-Windows-v0.1.0.zip
release/SHA256SUMS.txt
```

Users can extract the ZIP and double-click `Particle Size Annotator.exe`. The
launcher starts the local app, opens it in the default browser, and provides a
small window with `Open App` and `Quit` buttons.
