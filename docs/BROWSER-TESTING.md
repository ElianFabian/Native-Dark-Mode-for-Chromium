# Autonomous browser diagnostics

## Inspect without desktop control

Computed styles can be inspected directly through CDP `Runtime.evaluate`. Screen, mouse, and keyboard control are not required. Use an isolated browser/profile with the unpacked extension whenever the page is public or can be reproduced locally. A test profile does not share the user's cookies, tabs, extensions, zoom, or display configuration. Do not claim to have inspected their personal tab when using it.

Prefer autonomous probes before asking a reporter to paste console code. Record browser build, device pixel ratio, viewport, CSS zoom, theme, border level, state, and original versus themed paint. Inspect `::before` and `::after` explicitly; their existence in DevTools does not mean they draw visible content. Include hover/focus and repeated resampling. For an authenticated or environment-specific discrepancy, a reporter's computed styles may still be necessary if that browser session is not connected.

## Reusable audit command

The dependency-free developer tool [audit-website.mjs](../scripts/dev/audit-website.mjs) launches an installed Brave/Chromium with a fresh temporary profile, loads `extension/`, drives rule settings through the extension API, and writes `audit.json` and `audit.md`. It never attaches to an existing browser. It deletes only the temporary profile it created; reports remain in the requested output directory. This tool is not part of end-user installation.

```powershell
node --experimental-websocket scripts/dev/audit-website.mjs --url https://plugins.gradle.org/plugin/io.github.elianfabian.kproxyable --output-directory research-artifacts/audit-gradle
```

Node versions with global WebSocket enabled by default can omit `--experimental-websocket`. Use `--browser "ABSOLUTE_PATH"` or `CHROMIUM_PATH` for another installed browser. The default discovery includes Brave on Windows/macOS and Chromium on Linux; only Brave on Windows has been verified. Some vendor builds ignore unpacked-extension launch flags; a missing extension worker is reported as an error.

Default matrix: custom themes `chromium,soft,contrast`, levels `off,low,maximum`, scales `1,1.25,1.5`. For a quicker check:

```powershell
node --experimental-websocket scripts/dev/audit-website.mjs --url https://plugins.gradle.org/plugin/io.github.elianfabian.kproxyable --scales 1.25 --themes chromium --levels off,maximum --output-directory research-artifacts/audit-quick
```

The scale matrix sets device emulation and CSS zoom to exercise fractional layout. It is not identical to every OS scaling/browser zoom combination; the report records the resulting computed widths and dimensions. Each scale gets a fresh page baseline with the saved rule disabled, then the theme/level matrix. Source comparison is approximate on dynamic pages where DOM structure or selectors change.

The tool brings its own headless tab to the foreground and checks the active theme's paint before sampling. Without that step, background-tab throttling can leave a source-colored page in a nominally themed case and produce misleading measurements. This does not activate or control the user's desktop browser.

Checks currently include:

- Direct visible text contrast against known solid/composited CSS backdrops, with large-text thresholds.
- Simple monochrome inline control SVG contrast and input placeholder contrast.
- Border width changes and amplification of originally subtle borders in Off, including fractional widths.
- Generated-layer evidence: content presence, border, background, and shadow for both pseudoelements.
- Whole-document horizontal overflow.
- Transparent, approximately single-color image candidates with poor local contrast, using bounded canvas samples when pixels can be read. Static/animation eligibility is not established by that check; it must not automatically authorize tinting.

Results are **review candidates, not confirmed defects or an accessibility certification**. Unknown image/gradient/generated backdrops are skipped rather than assigned a guessed solid background. The current tool scans visible main-document elements only (up to 1,500), not scroll states, child frames, Shadow DOM, pointer/focus transitions, animation stability, or performance traces. The report contains selectors and computed paint, not visible page text, form values, cookies, or image pixels; the output URL omits query and fragment. Use public/local test pages when sharing reports. Running a URL still makes normal website requests.

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
