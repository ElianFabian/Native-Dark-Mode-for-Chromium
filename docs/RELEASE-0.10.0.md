# Native Dark Mode 0.10.0

This release adds complete rule backups and selective imports, and improves shared rendering in Simulated Native, Soft dark, and High contrast. Native remains the default. Simulated Native aims to improve readability beyond Chromium's result, rather than reproduce it pixel for pixel.

## Features

- Export rules, Trash, and rule defaults together in one version 4 JSON backup.
- Choose which sections to import. Rules are selected initially; Trash and defaults are opt-in. Unavailable sections in older files are disabled.
- Keep the existing add, update, and replace policies for rules. Preview removals before replacing the list; imported Trash never restores or activates rules automatically.
- Close the import dialog with its close button, Cancel, Escape, or a click outside. Dismissing the dialog leaves settings unchanged and restores keyboard focus.
- Add a reusable developer browser audit and focused local fixtures for common contrast, artwork, border, and control regressions.

## Rendering fixes

These repairs use shared structural and computed-paint classification across all three custom themes, with separate theme palettes and Chromium-derived conversion policy. Production rendering does not use website-specific selectors.

- Prevent pale borders that originally blended into a pale surface from becoming excessively bright after darkening. Preserve original widths, including fractional CSS pixels at browser zoom levels.
- Make border emphasis increase consistently from the repaired Off appearance. Preserve transparent borders, layout dimensions, focus indicators, and selected states.
- Improve saturated outline-button borders while retaining their original hue.
- Improve contrast for compact inline SVGs, icons beside headings and definition terms, generated chevrons, circular controls, and private-use icon-font glyphs.
- Keep generated search glyphs stable across scroll-state changes instead of briefly exposing dark source ink.
- Preserve useful notice-link colors when they remain readable, and adapt them when their backdrop changes.
- Improve eligible transparent single-color linked logos and artwork without replacing their shapes or modifying their source URLs. Recognize safe static SVG fill/stroke classes and bounded, CORS-readable external SVG resources.
- Give otherwise unstyled native select menus a dark opaque backing with readable option text. Keep authored option colors, disabled states, and native selection highlighting.

## Backup compatibility and safety

Version 4 backups include rules, Trash, and defaults. Versions 1–3 remain importable as rule-only backups; older extension versions cannot import the new version 4 files. Exported defaults retain independent website/path settings and the shared separator preference. Interface appearance, language, text size, and list preferences are not included.

Imports validate the whole file before writing. Selected sections are committed through the shared storage queue in one write. Existing Trash entries win ID collisions, repeated imports are idempotent, and defaults only prefill future drafts. The existing file-size, rule-count, and replacement-confirmation safeguards remain in place.

All new interface strings are translated into the nine supported languages. Installation still requires no build tools or additional dependencies for end users. Reload the unpacked extension after replacing its files, then refresh open pages to load the updated renderer.

## Developer tooling and verification

See [Browser testing](BROWSER-TESTING.md) for the audit command, isolated CDP workflow, reproduction evidence, and limits. The checked-in fixture server can expose explicitly CORS-enabled test resources alongside denied controls. These tools are an initial regression baseline, not the planned comprehensive gallery.

Validation includes syntax checks and 70 automated Node tests, covering legacy backups, complete backup round trips, section combinations, validation failures, serialized concurrent writes, and failed storage writes. Isolated Brave/Chromium 157.0.8103.50 checks on Windows covered the three custom themes, representative live public pages, focused fixtures, fractional scaling, border levels, scroll-state icons, native menus, and import-dialog behavior. No authenticated account panel was verified by those public-page checks. See [PLAN.md](../PLAN.md) and the rendering guide's [fix inventory](WEBSITE-THEME-RENDERING.md) for detailed evidence.

Rendering remains heuristic and can fail on individual pages. Unreadable image pixels, denied CORS, animation, complex or multicolor artwork, unknown backdrops, and protected documents retain conservative fallbacks. Bounded page-resource reads can make network requests; cross-origin reads are credential-free and CORS-bound. Contrast thresholds alone do not establish accessibility conformance. Broader browser/platform testing and the inconsistent authenticated account panel remain open work in [the roadmap](ROADMAP.md).
