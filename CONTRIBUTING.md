# Contributing to ParticleLens

Thank you for helping improve ParticleLens. Contributions can include code,
tests, documentation, issue triage, translations, and carefully licensed
detection samples.

## Before opening an issue

Search existing issues and Discussions first. Use the structured form that best
matches a bug, feature, or detection result. Do not upload confidential images,
personal data, credentials, or proprietary datasets.

Detection examples must state who owns the image and the license that permits
public redistribution. A minimal crop is preferred when it reproduces the
problem.

## Branch and pull-request flow

1. Fork the repository and branch from `development`.
2. Keep a pull request focused on one problem.
3. Add deterministic tests for behavior changes.
4. Target `development` for normal contributions.
5. Maintainers promote a validated release with a `development` to `main` PR.

`main` is the protected, deployed release branch. Do not base ordinary feature
work on an unreleased `main` hotfix without first checking whether it has been
merged back into `development`.

## Local setup

```powershell
npm ci
uv sync --locked
npx playwright install chromium firefox webkit msedge
```

Run the development server with `npm run dev`. The native local app also needs
`npm run build:native` before `uv run python particle_web_app.py`.

## Required validation

```powershell
uv run ruff check .
uv run pytest -q
npm run lint
npm test
npm run build:web
npm run test:e2e
```

Algorithm changes should compare the shared Python result in native Python and
Pyodide. Particle count must agree, matched centers and radii must remain within
2 px, and the scale conversion must remain within `1e-9`, unless the PR clearly
documents and justifies an intentional compatibility change.

## Design constraints

- Hosted analysis must remain browser-only and must not upload images.
- Heavy analysis runs in the Web Worker so the UI remains responsive.
- Runtime dependencies must be pinned and SHA-256 verified.
- Python CLI arguments remain backward compatible unless a major release
  documents a migration.
- The Windows build uses native Python and must not bundle Pyodide.
- New dependencies require a clear maintenance and security justification.

## Review

All required CI checks and review conversations must be resolved before merge.
The project currently does not require an approval from a second maintainer, so
the maintainer can publish a release without being locked out.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
