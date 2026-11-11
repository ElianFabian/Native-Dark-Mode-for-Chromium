# Native Dark Mode 0.11.0

This release adds developer diagnostics and a local regression lab, and improves custom-theme rendering. Simulated Native is inspired by Chromium and aims to improve readability and behavior where useful; it is not a pixel-for-pixel replica. Native remains available and is still the default. Product naming and possible Native retirement remain undecided.

## Features

- Add a local rendering lab with searchable two-column previews, taller specimen frames, raw paint inspection, filtered findings and comparisons between saved runs.
- Add deterministic source-aware analysis and a grouped review queue to locate likely text, icon, surface and border regressions faster.
- Keep raw measurements separate from analysis and visual acceptance; reopen accepted findings when evidence changes.
- Capture the actual extension in an isolated Brave/Chromium profile, with original/themed screenshots, computed styles, generated layers and environment fingerprints.
- Add a portable regression collection covering SVGs, sprites, generated glyphs, transparent PNG/SVG artwork, static and animated GIFs, selectors, placeholders, purchase controls, colored labels, cards, borders, gradients and interaction states.
- Include selected original public resources and reduced reported structures from Amazon, BOOTH, Indeed, Gradle, Google Help, SEPE, Junta de Andalucía and training websites, alongside generic positive and preservation controls. Record resource provenance and checksums; exclude private account data and original live handlers.
- Add one verification command: `npm run verify -- --browser` runs syntax checks, Node tests, launcher artifact tests, local rendering smoke, lab interface checks and shared rendering regressions. Use `--quick` to skip launcher artifacts.
- Retain command-line website audits, offline analysis and saved-report comparisons, with explicit consent for live visible labels.

## Fixes and improvements

- Improve shared compact SVG, CSS background, sprite-crop and generated-icon contrast while preserving drawing geometry, image placement and useful source colors.
- Adapt eligible small multi-ink SVG glyphs independently, preserving distinct inks and adjacent multicolor artwork.
- Preserve flags and multicolor sprites instead of flattening them to white; verify the visible crop before tinting.
- Improve safe static monochrome image/GIF tinting and transparent logo backings, retaining conservative behavior for animated, opaque, complex or unreadable resources.
- Restore original delivery, dimensions, inheritance and backing context in extracted logo, GIF and decorative-background reproductions.
- Improve colored glyph and thin outline contrast using source-derived colors rather than website-specific overrides.
- Reduce scroll-driven repaint and sampling work for animated notices; preserve responsive source interaction feedback.
- Keep verified SVG image treatments stable across scroll and resampling. Retain authored parent display, border and shadow context so child sampling does not alternate between unrelated backing classifications.
- Give comparable source cards consistent dark surfaces, regardless of incidental wrapping or height. Keep raised cards distinguishable from the page and adapt eligible dark source shadows to subtle light separation.
- Preserve neutral compact fills and suppress spurious title gradients and text-label backings without changing image pixels.
- Replace single-worst-pixel image-text selection with weighted word-region sampling and font/polarity-aware perceptual scoring, shared by all custom themes.
- Preserve color frequency, report weak regions and uncertainty, and compare dark, light and useful authored foregrounds. Bright-picture controls retain dark text; dark-picture controls use light text.
- Remove manufactured text halos and outlines that made letters and underlines look doubled. Preserve authored shadows, stroke, dimensions and hover behavior.
- Make default-color underlines follow their label ink. Adapt independent colored underlines only when a source-derived alternative improves the whole-link score, retaining one color across wrapped lines.
- Preserve already suitable dark or pale underlines on their respective picture backgrounds.
- Repair overly bright matching-fill borders and generated frames while retaining fractional widths, transparent reservations, selected colors and focus indicators.
- Apply border emphasis to eligible compact icon controls and short shadow cards without changing layout dimensions.
- Preserve borders authored for already-dark surfaces instead of reducing them to faint translucent edges. Make stronger emphasis increase from the repaired Off baseline.
- Keep hidden pagination labels distinct from visible dot paint, and restore spacing between local dot controls.
- Repair double-encoded Spanish fixture text and retain UTF-8 checks in served-browser verification.
- Hash the color primitive, image-text policy and renderer together so report comparisons identify rendering changes accurately.

## Verification and limits

Release validation on Windows with owned Brave: syntax checks, 90 Node tests, seven launcher artifact tests, 19/19 canonical rendering smoke assertions, lab interface/source-asset checks and 24 shared rendering theme/case combinations passed with `npm run verify -- --browser`. This does not establish desktop integration on other operating systems.

See [Rendering lab](RENDERING-LAB.md), [image-text selection](IMAGE-TEXT-CONTRAST.md), [browser evidence](BROWSER-TESTING.md), the [rendering fix inventory](WEBSITE-THEME-RENDERING.md) and [PLAN.md](../PLAN.md) for scope and validation history. New unusual cases must update the checked-in regression collection.

The basic browser smoke has 19 assertions. The extended gallery captures 77 steady states across 11 groups; those counts are not 77 visual passes. Narrow shared checks cover 24 theme/case combinations, with border-level, hover/focus and repeated-resampling checks inside them. Coverage remains explicitly partial, manual or pending where appropriate. Source reproductions are not complete copies of live websites, and passing them does not establish that authenticated panels or every live state work correctly.

Rendering remains heuristic and can fail despite efforts to support many websites. Word bounds approximate glyph coverage; mixed pictures may remain difficult even when the chosen foreground is better. Contrast thresholds and perceptual scores are not accessibility certification. CORS, resource eligibility, animation, complex graphics, protected documents and browser changes limit adaptation. Bounded reads of page-referenced resources can make network requests; cross-origin reads remain credential-free and CORS-bound. No telemetry service is added.

No new end-user dependencies or build step are required. Developer tools require Node.js, an installed compatible browser for captures, and Python/Bash/Windows Script Host as applicable for launcher artifact checks. Brave on Windows has been tested; broader browser/platform and temporal/performance testing remains open. Reload the unpacked extension and refresh existing pages after updating.
