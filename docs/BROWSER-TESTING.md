# Autonomous browser diagnostics

The first [rendering lab](RENDERING-LAB.md) delivery implements capture, analysis, comparison and a partial gallery. The [plan](DIAGNOSTICS-AND-REGRESSION-PLAN.md) separates this working slice from remaining state, image and performance coverage.

The current lab also has source-aware automatic triage, report-scoped accept/reopen annotations and six extended visual groups. `npm run verify -- --quick --browser` runs the canonical renderer assertions plus portable lab UI/asset checks (including actual changing GIF frames). The extended gallery's authored/custom snapshots remain capture evidence, not automated pixel-contrast or timing assertions. See [specimen provenance](../fixtures/diagnostics/README.md) for the historical structures reconstructed locally.

Five original-site groups now supplement those six generic groups, with 22 pinned resources. The lab browser check includes narrow Indeed gradient/path/heading assertions and Junta logo-container/light-backing assertions. The Junta reproduction was checked against the public page: an inline-only reduction shrank its logo anchor to 17px versus about 56px for the source, preventing the original white backing from being preserved. Restoring source geometry corrected the fixture. Preserve data-URI delivery, inline SVG context and dimensions before treating a local discrepancy as a renderer regression.

## Wrapped contact glyph follow-up

The additional [scroll-banner fixture](../fixtures/scroll-banner.html) reproduces a fixed notice that changes position over 0.5s after a body class change, above 240 static cards. Isolated Brave checks confirm the authored duration and both endpoints with no theme and all three custom themes. The shared idle scan now checks its time budget between small style-sampling groups. Public-page paired traces observed script durations of approximately 437/368/402ms before versus 382/306/309ms after for Simulated Native/Soft dark/High contrast over the same 140-frame probe, while style-recalculation time increased. Delayed-frame counts changed from 2/1/2 to 1/0/1. These single-run, instrumented headless observations are diagnostic evidence, not benchmarks or proof that all scroll overhead is resolved.

The [generated-frame fixture](../fixtures/generated-frames.html) reproduces a list-item `::before` outline with a deeply nested white backing. The public Junta subsidy index has 22 transparent ancestors before its body backing, beyond the previous authored-backdrop limit of 16. Extending the bounded walk to 32 and reusing the subtle-frame policy adapts the pale border in all custom themes. Local and live checks preserve widths; the local negative controls preserve colored selection, transparent borders, rotated arrows and deliberately strong borders. The regression checks were run through the ignored CDP harness; these checked-in pages are standalone reproductions for the future runner.

The public Junta course page's footer phone was inspected directly through CDP on 2026-11-11 in an isolated Brave/Chromium 157.0.8103.50 profile on Windows. `getComputedStyle(element, '::after')` showed an empty 0×0 clearfix on the field. The visible handset instead came from a 25×25 monochrome embedded SVG in the field's own `background-image`, with explicit `#555555` fill. The number lived inside a paragraph, so the direct-text-only background-glyph gate skipped it while adapting the label color.

The shared renderer now recognizes a bounded single-child text-wrapper chain and reuses its existing SVG classification/recoloring. Live checks covered all three custom themes, four repeated class resamples per theme, unchanged host bounds and SVG path data, and source restoration after disable. The generic [contact-glyphs fixture](../fixtures/contact-glyphs.html) reproduces the wrapped label and empty clearfix. Local browser assertions verify at least 7:1 glyph contrast and preserve already-readable, multicolor, oversized, repeating and mixed-content negative cases. The assertions ran through the ignored CDP research harness; the checked-in HTML is a portable reproduction, not yet a standalone automated gallery runner.

## Inspect without desktop control

Computed styles can be inspected directly through CDP `Runtime.evaluate`. Screen, mouse, and keyboard control are not required. Use an isolated browser/profile with the unpacked extension whenever the page is public or can be reproduced locally. A test profile does not share the user's cookies, tabs, extensions, zoom, or display configuration. Do not claim to have inspected their personal tab when using it.

Prefer autonomous probes before asking a reporter to paste console code. Record browser build, device pixel ratio, viewport, CSS zoom, theme, border level, state, and original versus themed paint. Inspect `::before` and `::after` explicitly; their existence in DevTools does not mean they draw visible content. Include hover/focus and repeated resampling. For an authenticated or environment-specific discrepancy, a reporter's computed styles may still be necessary if that browser session is not connected.

## Current toolchain

Use the [rendering lab guide](RENDERING-LAB.md) for the current interface and command profiles. `npm run lab` starts the local gallery/report viewer; its button runs the smoke suite in an isolated browser. `npm run verify -- --quick --browser` combines syntax, Node tests and that browser suite in one command. `npm run diagnose` captures the same local matrix without the UI, and supports targeted public URLs and offline analysis/comparison. The existing `audit:website` command is now an alias of this shared pipeline rather than a second collector.

The first slice has four canonical specimens and links five earlier manual fixtures. Its 28 smoke captures produce 19 required assertions, including an intentionally corrupted border. Capture-only/manual cases and the inventory's pending mechanisms are not covered by those passing assertions. Refer to the guide for supported solid-paint/SVG measurements, limits and reproduction steps. The historical evidence below predates this toolchain and remains useful; ignored research probes are not required to run the checked-in smoke suite.

## The fractional tag-border regression

On 2026-11-11, Brave reporting Chromium `157.0.8103.50` on Windows reproduced a Gradle tag whose CSS declared `border: 1px solid #F7F7F8` on a matching light background. At scale 125%, computed width was **0.8px**, not 1px; at 150% it was **0.666667px**. A minimum-width eligibility test incorrectly skipped the repair. Do not impose integer CSS-pixel lower cutoffs on positive painted borders.

The autonomous CDP demonstration selected `a.plugin-tag[href="/search?term=kotlin"]`, sampled its styles, temporarily removed only its extension paint marker, sampled the original styles, and restored the marker in `finally`. Observed at 125%:

| Property | Original | Simulated Native, Off |
| --- | --- | --- |
| Bounds | 48.91250228881836 × 24.80000114440918 CSS px | Unchanged |
| Border width, all sides | 0.8px | 0.8px |
| Border color | `rgb(247, 247, 248)` | `rgb(47, 47, 48)` |
| Background | `rgb(247, 247, 248)` | `rgb(33, 33, 34)` |
| Outline | None | None |

Both pseudoelements had `content: none` and 0px borders. All six levels were checked through the manager chips in all custom themes, including returning to Off. Scope the regression around structure, paint, fractional widths, and level response; the production renderer must not contain Gradle selectors.

## Transparent solid-color logo evidence

The two Gradle assets reported in the same investigation were a 292×102-viewBox SVG with internal CSS/classes and a 180×180 transparent PNG. Both used the single opaque color `#02303a`; the SVG showed no animation in the inspected source and the PNG's opaque pixels had one RGB color. The renderer now applies a measured channel lift to these two linked images when their local dark backdrop makes them unreadable. The original exclusion required adjacent link text, small natural dimensions and, for neutral silhouettes, grayscale ink. Image-only links now have a separate bounded single-color/transparency check, followed by static-resource verification. Static SVG metadata and simple internal fill/stroke class rules are accepted; animation and other CSS remain excluded. PNG verification uses the decoder's completed frame count. This is general image classification, with no Gradle selector or fixed replacement color in production.

Live Brave/Windows checks at 125% verified both filters in Simulated Native, Soft dark and High contrast, unchanged 160×56 and 32×32 rendered dimensions, stability under repeated resampling, and restoration after disabling. This is not a guarantee for every logo: unreadable/CORS-blocked, animated, multicolor, oversized, already filtered or ambiguous images keep the conservative fallback.

The audit measured approximately 1.15:1 for the small elephant and 1.33:1 for the horizontal logo against their Simulated Native backdrops on the public page. These are pixel-color/backdrop estimates; rendered anti-aliasing and image composition still require visual review. That original audit flagged both images for review without changing them; the later renderer verification above confirms the actual filter.

The ignored investigation harness and its original JSON are not available in a fresh checkout. This document preserves the measurements, and the checked-in audit tool supplies a reusable first pass. A complete local rendering regression gallery remains planned in [the roadmap](ROADMAP.md).

## Focused control and artwork fixture

Serve `fixtures/` and open [contrast-controls.html](../fixtures/contrast-controls.html) alongside the baseline test page. This small regression fixture is not the planned complete gallery. It includes:

- A static CSS-class-based single-color SVG inside an image-only link, plus multicolor and animated resources that must keep their original paint.
- A strongly contrasting neutral navigation edge, a low-contrast frame, a colored edge and a transparent border.
- A colored notice link, generated breadcrumb chevrons and a pointer-enabled anchor with a small two-ink SVG and circular border.
- A non-interactive decoration that must not be classified as a control arrow.

On 2026-11-11, Brave/Chromium 157.0.8103.50 on Windows passed all three themes at 125% and 150%, Off/Maximum/Off changes, repeated class resampling, unchanged dimensions, and complete restoration on disable. Notice link contrast measured 4.55:1, 5.08:1 and 7.77:1 respectively. The two-color control retains separate green and neutral inks; the ring is measured independently. Navigation edges retain 0.8px widths. A separate live Gradle run still passed all six emphasis levels through the actual manager chips, pointer entry/exit, focus, and negative controls.

Live Junta course details and SEPE navigation were also inspected via CDP in the isolated profile; these are public-page checks, not authenticated-session checks. These measurements do not verify every browser, page state or pixel composition. Record unknown backdrops and avoid presenting thresholds as accessibility certification.

### Emphasis must increase the repaired Off result

The first dark-edge repair used a 3:1 target in Off, but Very low still used the generic absolute 1.65:1 target. This could make a line look thinner even though its width stayed unchanged. For eligible repaired neutral dark edges, emphasis now adds the level's increment above the measured Off contrast, including quantization of the repaired color. This does not raise the baseline of originally subtle frames.

The live SEPE navigation line at 125% retained 0.8px top/bottom widths throughout all levels. Measured contrast progressed from 3.78:1 (Off) to 4.74, 5.79, 7.08, 8.54 and 12.02:1. Returning to Off restored exactly the original repaired color. This was checked with an isolated Brave/Chromium 157.0.8103.50 profile on Windows, with repeated class resampling. Generic fixture checks preserve subtle/transparent borders and verify all three themes separately.

### Scroll-state icon-font stability

The public SEPE search anchor uses a private-use icon-font glyph in `::before`. Its unscrolled ink is inherited, while a scroll state assigns dark ink directly to the pseudoelement. A repair conditional on the current contrast disappeared when resampling inherited already-themed ink; after the next scroll state, the dark source color was exposed until resampling caught up. The live 200-frame traces caught 48 dark frames in Simulated Native and 3–4 in each palette theme before the repair.

`controlGlyphPaint` now keeps a measured explicit override for this recognized generated glyph even when it is currently readable. After the change, 200 frames per theme retained exactly one glyph color: `rgb(224,224,224)` in Simulated Native, `rgb(181,220,255)` in Soft dark and `rgb(197,229,255)` in High contrast. These are observed outputs of the theme and contrast rules, not site-specific replacement constants.

The portable contrast-controls fixture includes a generic sticky icon control and scroll-triggered authored color change. A separate 160-frame trace per theme confirms stability; decorative and disabled glyphs keep their source colors, and disabling restores the dark source scroll state. The fixture uses a generic font to test paint state, not to reproduce the site's exact icon font. Measurements were made through CDP in isolated Brave/Chromium 157.0.8103.50 on Windows at 125%.

### Native select popup surfaces

The public SEPE language select and its options originally had transparent computed backgrounds. Once the inherited text became light, the browser/OS popup could still supply a light menu surface; DOM transparency alone does not describe that separately painted backing. `selectPopupPaint` supplies a shared opaque dark backing for otherwise unstyled single-row menus, without changing the closed select's transparency or replacing the native control. Eligibility checks are bounded to 256 options and retain conservative fallbacks for custom colors and unknown backdrops.

On Brave/Chromium 157.0.8103.50 on Windows at 125%, the live opened menu was inspected in all three themes after rejecting cookies in the isolated profile. Screenshots show dark options and the preserved blue native selected-item highlight. Computed option backgrounds were `rgb(18,18,18)`, `rgb(48,55,69)` and `rgb(17,21,29)` respectively, paired with the theme text. The local contrast-controls fixture checks grouped/disabled options, at least 4.5:1 enabled-option text contrast, repeated resampling, keyboard selection and restoration. Selects with custom option colors, listboxes and disabled selects do not receive the shared popup override. Other native popup implementations remain unverified.

### Fill versus color, and cross-origin logo analysis

Live InfoJobs login checks on 2026-11-11 found the eye's source fill `rgb(11,77,208)` and the three tip glyphs' `rgb(116,114,126)` unchanged while their wrapper text colors were already themed. The pointer-handler span was not a semantic button, and the tip glyphs were inside definition terms rather than interactive controls. Bounded structural context now qualifies these SVGs for the shared visible-paint analysis. Simulated Native changed the eye fill to `rgb(153,169,255)` and tips to `rgb(162,161,172)`; the palette policies were checked separately. Thin saturated action borders share source-color adaptation and preserve widths/focus state.

The logo's original img points to an external CDN and taints canvas (`SecurityError`); its server nevertheless allows a credential-free CORS SVG read. A cached static SVG verification plus clean analysis-only Blob decode now supplies the silhouette color. The logo's actual src, crossOrigin attribute, alpha and geometry remain unchanged. Static cross-origin raster formats are still a conservative fallback. The full SVG resource read remains CORS-bound, and decode/classification limits are recorded in the rendering guide. This explains why the earlier same-origin logo tests had not covered this case.

For portable cross-origin checks, run `python scripts/dev/serve-fixtures.py` and open `http://127.0.0.1:8765/contrast-controls.html`. The fixture references `localhost` as a second origin. Only `/cors/` resource paths receive the permissive CORS response; the ordinary path deliberately denies the cross-origin read. The allowed monochrome SVG receives a filter, while multicolor, animated and denied-CORS controls retain their paint. A plain `python -m http.server` still serves baseline fixtures but does not supply the positive `/cors/` endpoint.

Brave/Chromium 157.0.8103.50 on Windows at 125% passed all three custom themes, repeated resampling, unchanged glyph paths/border dimensions, negative controls and disable cleanup. The login page was public and no credentials were entered. This is not authenticated-state validation.


## Faster reports and focused iteration

Use [Reporting and fast testing](REPORTING-AND-FAST-TESTING.md) for the selector-scoped `--issue` bundle, ancestor/generated-layer evidence, privacy defaults and focused browser groups. `npm test` now searches only the `test/` tree. Narrow `verify --focus` runs retain all unit checks and the selected groups' full expectations; they do not replace full release checks. The changed-backing probe waits for actual bounded transitions and checks each intervening frame instead of assuming fixed frame counts.
