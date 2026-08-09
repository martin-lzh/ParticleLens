# Design QA: Detection Sidebar Layout

**Comparison target**

- Source visual truth: `C:\Users\marti\AppData\Local\Temp\codex-clipboard-40e93860-2dcc-49bb-a01c-8c2513eb90e7.png`
- Source pixels: 491 × 1305; density metadata unavailable
- Implementation: `http://127.0.0.1:4174/`
- Collapsed implementation screenshot: `D:\Projects\particle-size-distribution\output\design-qa\desktop-after-collapsed.png`
- Expanded implementation screenshot: `D:\Projects\particle-size-distribution\output\design-qa\desktop-after-expanded.png`
- Implementation pixels and CSS viewport: 1280 × 720; browser device pixel ratio 1.5; screenshot output normalized to CSS pixels
- State: English, dark theme, no image selected, detection settings panel open; collapsed and expanded advanced-settings states checked

**Evidence**

- Full-view collapsed comparison: `D:\Projects\particle-size-distribution\output\design-qa\sidebar-comparison.png`
- The comparison normalizes the 491 × 1305 source sidebar to 247 × 656 and compares it with the 340 × 656 implementation sidebar crop.
- Focused expanded-state evidence: `D:\Projects\particle-size-distribution\output\design-qa\desktop-after-expanded.png`
- Browser geometry gives both the base calibration grid and the first advanced grid `x = 16px` and `width = 292px`.
- With advanced settings expanded, the local-processing note remains fully visible at `top = 643.67px`, `bottom = 704px` in the 720px-high viewport. The settings region scrolls independently (`472px` client height, `1155px` scroll height).

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: The existing family, weights, sizes, line heights, wrapping, and hierarchy are preserved.
- Spacing and layout rhythm: Advanced controls now align exactly with the base controls. The advanced section uses full-width horizontal separators instead of a nested card, and the local-processing note sits at the desktop sidebar bottom.
- Colors and visual tokens: Existing panel, border, accent, muted-text, and status colors are unchanged. The advanced section background is transparent.
- Image quality and asset fidelity: Existing logo and Lucide icon assets are unchanged; no new visual assets were introduced.
- Copy and content: English and Chinese product copy are unchanged.

**Comparison history**

- Earlier P2 finding: In the supplied screenshot, the local-processing note followed the controls in normal flow and left a large unused area below it instead of occupying the sidebar bottom.
- Earlier P2 finding: Advanced settings appeared as a nested card with 10px horizontal body padding, making its controls narrower than the base settings.
- Fixes: Made the desktop settings area independently scrollable, pinned the note in the non-scrolling bottom region, removed the advanced card border/radius/background, and removed its horizontal body inset.
- Post-fix evidence: The collapsed comparison shows the note at the sidebar bottom and the advanced row on the same visual plane. The expanded screenshot and browser geometry confirm equal 292px control widths while the note remains visible.

**Interaction and runtime checks**

- Opened and closed advanced settings in the browser.
- Confirmed the advanced controls scroll independently while the note remains visible.
- Checked the browser console on the production preview: no errors.
- Ran the complete Chromium end-to-end suite: 18 tests passed, including desktop sidebar, mobile layout, language, offline, and runtime-recovery coverage.

**Implementation Checklist**

- [x] Keep the local-processing note visible at the desktop sidebar bottom.
- [x] Preserve natural whole-panel scrolling on mobile layouts.
- [x] Remove the nested-card treatment from advanced settings.
- [x] Align advanced and base control widths.
- [x] Add regression coverage for desktop note placement and advanced-control width.

**Follow-up Polish**

- None required for this change.

final result: passed
