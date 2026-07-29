# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

## [Unreleased]

### Added

- Added live image-adjustment previews for brightness, manual contrast, gamma,
  CLAHE, and background correction.
- Added shared color or grayscale rendering for the workspace and annotated PNG
  exports without modifying the source image.

### Changed

- Particle detection and annotated-image export now use the same adjustment
  parameters shown in the preview.
- Image adjustments begin rendering immediately and display completed
  intermediate frames while the user continues dragging a control.
- Original-image comparison is now a press-and-hold action in the canvas tool
  rail; releasing it always restores the processed preview.
- Browser runtime upgrades now use a versioned manifest and content-addressed
  assets so an older service worker cannot mix a stale Python core with the
  current preview worker.

## [0.2.1] - 2026-07-29

### Fixed

- Kept the scale-length and length-per-pixel inputs vertically aligned when
  the English length-per-pixel label wraps onto two lines.

## [0.2.0] - 2026-07-29

### Added

- Browser-only GitHub Pages app powered by Pyodide 0.28.3, NumPy 2.2.5, and
  OpenCV 4.11.0 in a Web Worker.
- Verified byte-accurate runtime download progress and integrity manifest.
- Service Worker caching, retry, cache repair, and offline reload.
- Custom domain configuration for `particlelens.liuzhaohan.com`.
- Browser parity, offline, privacy, 20 MP, Pages, and Windows packaging checks.
- Per-user Windows installer with Start Menu and uninstall integration.
- Open-source contribution, conduct, security, ownership, issue, and PR files.
- Packaged launcher `--self-test`.

### Changed

- Shared the detection algorithm between CLI, native local app, Windows builds,
  and browser execution.
- Sent raw image bytes to the native local API instead of Base64.
- Made the Web App the primary documented entry point.

### Validation note

Validation uses deterministic synthetic images and clearly licensed public
samples. It does not yet include private research images or claim coverage of
every scientific imaging workflow.

[Unreleased]: https://github.com/martin-lzh/ParticleLens/compare/v0.2.1...development
[0.2.1]: https://github.com/martin-lzh/ParticleLens/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/martin-lzh/ParticleLens/compare/v0.1.1...v0.2.0
