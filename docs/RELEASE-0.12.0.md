# Native Dark Mode 0.12.0

This release speeds up rendering investigations and fixes shared custom-theme carousel arrows and selected-card borders. Native remains the default. Rendering remains best-effort and can vary by website; passing local fixtures does not guarantee every live page renders correctly.

## Features and developer workflow

- Add element-focused diagnostic bundles with deterministic original/themed style differences, bounded ancestor context and generated-layer evidence.
- Include border, outline, shadow, geometry, text decoration and background facts to help distinguish color changes from extra paint layers.
- Keep live labels opt-in, redact CSS resource references, and exclude HTML and input values from issue bundles by default. Reject missing selectors instead of reporting an empty success.
- Add focused verification through `npm run verify -- --focus borders` or selected groups such as `icons,borders`, retaining all Node tests and the selected groups' theme/level matrix.
- Speed up Node test discovery by searching only the test directory, avoiding large ignored diagnostic artifacts. Record the latest verification scope and timings without caching success or skipping current tests.
- Document reporting requirements, one-element diagnostics, focused checks, measured timings and their coverage limits.

## Fixes

- Improve contrast for small carousel SVG backgrounds that specify a viewBox without explicit dimensions, preserving original paths, viewport origins, sizes and rotation.
- Fix tiny PNG sprite arrows whose hidden accessible labels previously prevented safe adaptation. Scale the evidence threshold only for bounded compact crops while retaining static-image, transparency, single-ink, CORS and preservation checks.
- Extend shared colored-border repairs to selected cards and containers around nested heading links, without page-specific renderer selectors.
- Make colored-border emphasis strengthen the visual stroke in the exact repaired Off color instead of fading selection/status colors toward white.
- Preserve the original soft shadow, CSS border widths, layout dimensions and focus behavior while extending eligible uniform colored frames inward.
- Add original public arrow resources, pinned checksums, nested selection-card reproductions, visible-child and multicolor preservation controls, and screenshot-pixel checks for increased same-color stroke coverage.
- Make changed-backing state checks wait for actual bounded transitions and recognize equivalent image backings on either the image or its unpadded wrapper, while retaining separate padded-backing assertions.

## Verification and limits

Release verification uses `npm run verify -- --browser`: syntax checks, 93 Node tests, launcher artifact tests, 19 canonical rendering assertions, lab interface/resource checks, 24 shared theme/case combinations and diagnostic-bundle checks. The border group covers all six levels in all three custom themes and checks actual screenshot pixels at Off/Maximum.

Browser verification is on Windows with an isolated headless Brave profile. Public Amazon arrow CSS/resources were inspected; personalized carousel structures are reduced local reproductions. Indeed blocked isolated live requests; selected-card coverage uses supplied DOM/computed evidence and local fixtures, with the final visual fix confirmed by the reporter. Chrome/Edge end-to-end checks and Linux/macOS desktop integration remain pending. No rule/backup format, permissions, telemetry or Native-renderer behavior changes are introduced.
