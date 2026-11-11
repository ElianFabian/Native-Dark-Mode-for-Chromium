# Chromium-inspired website theme handoff

See [Website theme rendering](WEBSITE-THEME-RENDERING.md) for current renderer conventions.

This document records the original Chromium-parity experiment and its subsequent implementation history. As of 0.9.0, Simulated Native deliberately goes beyond replication: Chromium supplies the color-conversion starting point, while the extension adds shared contrast, icon, image-overlay, border, and interaction repairs. Read the current rendering guide for policy and remaining limits. Native is still available and remains the default; possible retirement and naming changes are only recorded in [the roadmap](ROADMAP.md).

## Objective and starting point

Implement an opt-in website theme that approximates Chromium's Auto Dark Mode using JavaScript for color decisions and CSS for reversible overrides. It should work through the normal rule editor and toolbar popup without attaching `chrome.debugger` or requiring the optional launcher. Keep **Native** as the default for new and existing rules without a preset. Preserve **Soft dark**, **High contrast**, and all existing rule matching and exclusions. Treat the new preset name and identifier as implementation choices. `chromium` is a provisional internal identifier.

The implementation baseline is release `v0.8.0`, commit `0fb6188`. The first solid-color prototype is implemented as **Simulated Native** (`chromium`). Start by checking the current worktree and reading [AGENTS.md](../AGENTS.md).

## Reference source

The local snapshot is in `research-artifacts/chromium-dark-mode/`. Its README maps the 22 dark-mode files and five additional paint and DevTools files. It contains Chromium's license and verified `SHA256SUMS`. Git ignores this directory, so a fresh checkout will need to retrieve any missing references from the pinned upstream revision. Keep the original C++ outside `extension/`. Preserve upstream attribution and applicable license notices for any code ported from Chromium. [Pinned Chromium revision](https://chromium.googlesource.com/chromium/src/+/39567dda62f317e0d95c05c608e68ff81f7d9e42/)

The following filenames are under `third_party/blink/renderer/platform/graphics/` unless a different path is given.

| Source | What to use |
| --- | --- |
| `dark_mode_color_classifier.cc` and `dark_mode_settings_builder.cc` | Compute integer brightness as `floor((299R + 587G + 114B) / 1000)` for 8-bit RGB. At the pinned runtime defaults, transform foreground below 150 and background above 205. The comparisons are strict. Constructor defaults in `dark_mode_settings.h` differ and are used by some upstream tests. |
| `dark_mode_color_filter.cc` and `dark_mode_lab_color_space.h` | Port the sRGB ↔ CIELAB conversion with D65-to-D50 adaptation, change lightness to `min(110 - L, 100)`, keep the other Lab components, and preserve alpha. Follow the upstream clamping and dark-gray adjustment. Use the pinned source for numeric constants. |
| `dark_mode_filter.cc` and `dark_mode_filter.h` | Map paint roles to classifiers. Foreground, list markers, SVG, and borders use the foreground classifier. Background and selection use the background classifier. Borders and selections have additional contrast logic. |
| `dark_mode_filter_test.cc`, `dark_mode_color_classifier_test.cc`, and `dark_mode_lab_color_space_test.cc` | Use the test vectors as references. Examples include white background → `#121212` and the same output RGB with the original alpha for translucent white. Reproduce the matching test settings or use the runtime settings explicitly. |
| `graphics_context.cc`, `core/paint/box_painter_base.cc`, and `core/paint/paint_auto_dark_mode.h` | Show where Blink supplies paint roles, enables force-dark, and uses painting context such as the contrast background. The extension approximates this from DOM and computed styles. |

No additional downloads are required for solid backgrounds and text. For closer border and selection parity, fetch `ui/gfx/color_utils.{cc,h}` and `third_party/blink/renderer/platform/graphics/color.cc` at the same revision to inspect contrast and `Color::Dark()`. For a later image phase, fetch `third_party/blink/renderer/core/paint/paint_auto_dark_mode.cc` and `third_party/blink/renderer/platform/graphics/darkmode/darkmode_classifier.{cc,h}`. The image path combines size-based eligibility, pixel sampling, a decision tree, a generated neural-network fallback, and a Skia filter. Pixel access across origins and differences from Blink rasterization need separate investigation. [Contrast utilities](https://chromium.googlesource.com/chromium/src/+/main/ui/gfx/color_utils.h) · [Image classifier model](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/graphics/darkmode/)

## First implementation slice

1. Implement and unit-test the color transform as a pure function. Start with sRGB solid colors and alpha. Exercise the classifier boundaries, light and dark grays, saturated colors, and upstream vectors. Keep mathematical classification separate from DOM scheduling.
2. Integrate it into the custom theme renderer in [website-theme.js](../extension/website-theme.js). Start with solid `background-color` and text `color`. Transform original computed colors by role and preserve transparency. Defer bitmap and background-image processing, gradients, and exact border and selection contrast until the solid-color path is verified.
3. Reuse the existing frame message lifecycle, batched traversal, stylesheet handling, and Shadow DOM discovery where applicable. Existing palettes assign fixed colors, so the new preset needs per-color overrides. Read original styles before applying overrides and handle rescans, inheritance, and dynamic restyling without transforming the extension's own output again. Remove all owned styles, markers, observers, and queued work on disable, exclusion, or renderer switch. Preserve author inline styles and changes made while the theme is active.
4. Wire the preset through both normal UI entry points, storage, and backups. Confirm it can be selected, saved, edited, imported, and exported before calling the prototype usable.

## Integration points to audit

- [rules.js](../extension/rules.js) defines `CUSTOM_PRESETS` and normalizes saved rules. A missing preset means Native.
- [background.js](../extension/background.js) answers `website-preset` based on the top-level rule. [controller.js](../extension/controller.js) injects the color port and renderer as a fallback for existing tabs and clears the previous renderer when switching. Keep declarative and fallback injection in sync if the content-script file list changes. The new preset uses the custom path without a debugger attachment.
- [website-theme.js](../extension/website-theme.js) samples computed styles with its sheet disabled and reuses CSS rules for identical color overrides. Palette acknowledgments check the root background. The new renderer checks a computed property from its sheet so a page with a pre-existing dark root can acknowledge success. The controller uses `apply-website-preset-v4` for the new preset so older content scripts cannot acknowledge it.
- [popup.html](../extension/popup.html), [options.html](../extension/options.html), [popup.js](../extension/popup.js), and [popup.css](../extension/popup.css) define the theme controls, preset labels, and help text visibility. Localize the new user-facing strings in all nine [interface catalogs](../extension/translations/). Keep both READMEs aligned.
- [backup.js](../extension/backup.js) validates presets through `CUSTOM_PRESETS`. Versions 2 and 3 carry custom presets, and existing 0.8.0 builds reject unknown presets. Test the new preset's round trip and keep imports of existing backups working. If a format change is needed, document compatibility explicitly and preserve old readers' behavior for supported presets.

## Verification and completion

- Run `npm.cmd run check`, `npm.cmd test`, and `git diff --check`. Add focused cases for the port's color vectors, backup round trip, and switching from Native to the new custom preset and back. Verify that the controller never attaches a debugger for the new preset.
- Reload the unpacked extension in Brave on Windows. Serve [the local fixture](../fixtures/test.html) with `python -m http.server 8765 --bind 127.0.0.1 --directory fixtures`. Use both the popup and manager. Check a matching rule, an unmatched URL, an exclusion, a dynamic style change, eligible frames, and cleanup after switching or disabling. The local iframe is not an out-of-process frame test.
- Compare screenshots or sampled rendered pixels for light surfaces, colored text, dark surfaces, and transparency on the same page and browser build in Native and the new preset. Record the browser version and Chromium revision. The pinned source is a reference revision of Chromium main, which may differ from the installed Brave build. Record which comparisons succeeded and which cases diverge. Earlier headless native-image probes did not produce a successful pixel comparison. [Prior image research](../IMAGE-RESEARCH.md)
- Keep launcher changes and native debugger flag detection outside this task. Existing [release notes](RELEASE-0.8.0.md) describe the baseline. A new release requires a separate version bump.

## Prototype limits

The [color port](../extension/chromium-colors.js) uses the pinned Chromium defaults for sRGB text and solid backgrounds. The renderer also adapts near-neutral light gradient stops in layers made entirely of gradients and recolors wide, unblurred light shadows. It keeps the author's text color over unchanged images and gradients where it can identify the backdrop through the DOM. It supplies a dark viewport background when the root and body are transparent and have no background image. Author inline `!important` declarations keep precedence. Mutation observation covers DOM, attribute, and style-element changes. Changes made only through CSSOM or pseudo-class state can remain unsampled until another rescan.

## Local verification record

Brave 1.99.55 in headless mode on Windows 11 25H2 used Chromium 157.0.8103.39, revision `d5f73ccfbb8887db2367b182fa86df82c6b705c`. The local fixture exercised the toolbar popup and manager, a matched rule, an unmatched hostname, an exclusion, dynamic styles, an about:blank-based local iframe, and closed Shadow DOM. The checks also covered renderer switching, cleanup, keyboard navigation, and layouts at 100% and 200% with light, dark, and high-contrast settings.

The sampled Native and Simulated Native pixels matched on the white surface (`#121212` after darkening), blue text (`#dc98ff`), the original dark surface (`#222222`), and half-transparent text composited over a dark surface (`#888888`). The first prototype left a flat white gradient bright. The follow-up added support for that gradient, mixed photo-layer protection, and wide shadow backdrops.

The public Amazon.es and BOOTH homepages both applied the preset in the isolated browser profile. The public Amazon page differs from the signed-in view in the report.

The reload follow-up moves visible updates into a single animation frame and leaves the rest of the document to idle batches. A local stress test inserted 800 visible tiles at once and observed all 800 receive the theme in the same frame. The public-page reload probe observes theme markers before first contentful paint. Marker counts include offscreen and dynamically inserted elements, so they only show when application starts.

BOOTH's main container declares a 180 ms CSS transition on all properties. Disabling the paint sheet for sampling could restart that transition on every scan. A separate sheet keeps zero-duration entries for the affected paint properties on themed elements while preserving the sampled author transition list for other properties. The author list is captured when the guard is first added to the element and restored when its theme overrides are removed.

In a 120-frame probe of the public BOOTH page after reload, the main container stayed at `rgb(33, 35, 38)` with zero background-color transitions while idle and during scrolling. A local case with `transition: all 180ms` kept its transform transition and held its dark background through repeated rescans.

Scroll updates use the next animation frame. Palette themes look ahead by 75% of the viewport height in both vertical directions. Simulated Native looks ahead by 125% vertically and half a viewport horizontally. It schedules the larger pass after painting the first visible area. The local scroll probe jumps 2,400 pixels and checks the newly visible surface and surfaces farther down and to the side.

Switching from a palette to Simulated Native now samples and applies the visible area in the same task. If removing the palette starts a CSS transition, the renderer classifies its destination color. Frame sampling on the public BOOTH page confirmed that both the page body and its main container stayed dark when switching from High contrast.

Soft dark, High contrast, and Simulated Native share the viewport frame scheduler, scroll lookahead, idle traversal, and transition protection for theme-owned colors. Each renderer still decides which styles to apply. Palette rendering keeps its existing contrast repair.

When leaving Native, the controller clears the native override and applies the incoming theme before detaching the debugger. In the public BOOTH check, the sampled background went directly from Native to High contrast without any bright intermediate samples in five screenshots taken around the switch.

Soft dark and High contrast preserve opacity stops and geometry in light CSS fades, tinting them to match the themed backdrop. The BOOTH carousel uses a fade from 0% opacity through 66% to fully opaque over the last cards.

Simulated Native checks text contrast against solid backgrounds, translucent layers over solid colors, and opaque gradients with dark sRGB stops. For those gradients it uses the lightest stop as a conservative backdrop for light text. It can neutralize darkening blends and brightness filters on short text-only labels. These corrections deliberately diverge from the native filter. Photo backgrounds remain outside the contrast check.

Semantic headings of at least 16px and weight 600 use signed perceptual contrast to choose a text polarity on known backgrounds. Short visually styled headings need at least 14pt and weight 700. Candidates must reach a 3:1 ratio as a rendering preference. Other text keeps the existing contrast checks. The perceptual calculation follows the published sRGB 0.0.98G-4g equations for self-illuminated web content. [Perceptual contrast background](https://git.apcacontrast.com/documentation/WhyAPCA)

Soft dark and High contrast change the fill and add a thin edge when a solid card blends into its surrounding panel. Bitmap backgrounds on the page root or body use a dark blend while retaining their original placement.

High contrast applies a heading color before traversal, keeps saturated solid control backgrounds including near-opaque ones, and repairs contrast for small monochrome SVG icons in controls. On the public BOOTH page this kept the eight featured link colors and made the locale icon readable.
