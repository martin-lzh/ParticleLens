# Design QA: Calibration Input Alignment

**Comparison target**

- Source visual truth: `C:\Users\marti\AppData\Local\Temp\codex-clipboard-bf5da70c-3a30-4195-946b-c86c868225d4.png`
- Source pixels: 2048 × 1224, including 106 px of browser chrome
- Normalized source content: `D:\Projects\particle-size-distribution\output\design-qa\source-app-content.png`
- Implementation: `http://127.0.0.1:4173/`
- Implementation screenshot: `D:\Projects\particle-size-distribution\output\design-qa\implementation-calibration-alignment.png`
- Implementation pixels and CSS viewport: 2048 × 1118 at device pixel ratio 1
- State: English, dark theme, no image selected, detection settings panel open

**Evidence**

- Full-view comparison: `D:\Projects\particle-size-distribution\output\design-qa\comparison-full.png`
- Focused calibration comparison: `D:\Projects\particle-size-distribution\output\design-qa\comparison-focused-calibration.png`
- The focused comparison normalizes the source panel from 408 px to the implementation's 340 CSS px so the calibration rows can be compared at the same layout scale.
- Browser measurements place both `#scaleUm` and `#micronsPerPixel` at `y = 194.5833px`, with equal `34.6667px` heights.
- The “Length per pixel (µm/px)” label remains two lines at `33.5833px` high.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: Existing family, size, weight, line height, wrapping, and copy are preserved. The two-line label remains readable and no longer changes the input position.
- Spacing and layout rhythm: The two calibration inputs are vertically aligned. The additional label height is scoped to the paired calibration fields and resets in the single-column sidebar layout.
- Colors and visual tokens: Existing muted and disabled-state colors are unchanged.
- Image quality and asset fidelity: Existing logo and icon assets are unchanged; this fix introduces no new visual assets.
- Copy and content: English and Chinese translations are unchanged.

**Comparison history**

- Earlier P2 finding: In the supplied screenshot, the two-line length-per-pixel label pushed its input below the scale-length input.
- Fix: Added a shared 34 px label area to the two calibration fields, with a 17 px reset when the sidebar switches to one column.
- Post-fix evidence: The focused comparison and browser geometry show equal input `y` coordinates with the label still wrapping naturally.

**Interaction and runtime checks**

- Confirmed the local runtime completes loading.
- Switched from Chinese to English to reproduce the supplied label state.
- Checked the browser console: no errors.
- Automated regression check passed in Chromium.

**Implementation Checklist**

- [x] Preserve the wrapped label.
- [x] Align the paired inputs.
- [x] Keep the narrow single-column layout compact.
- [x] Add regression coverage.

**Follow-up Polish**

- None required for this change.

final result: passed
