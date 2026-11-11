# Native Dark Mode 0.9.0

## New features

- Add **Simulated Native**, a custom website renderer inspired by Chromium's color conversion that runs without a debugger session. Its goal includes improving contrast and usability beyond Native, not reproducing Native pixel for pixel. Native remains available and is still the default.
- Add six **Emphasize separators** choices: Off, Very low, Low, Medium, High, and Maximum. Save one preference per website or path and reuse it across Simulated Native, Soft dark, and High contrast. Switching to Native retains the preference for later use.
- Apply optional emphasis to eligible card edges, structural separators, and compact icon controls, including full-size generated backings. Preserve layout dimensions, rounded corners, existing borders, and focus styling.
- Add a **Rule defaults** dialog in the manager for the initial website theme, separator level, and scope. Configure website and path domain switches independently, including subdomains, regional domains, base-domain scope, and path descendants. Defaults prefill new rules without changing existing ones.
- Add confirmed permanent deletion for individual Trash entries while retaining restoration and Empty trash.

## Rendering and contrast fixes

- Share contrast measurement, backdrop traversal, icon classification, image-overlay analysis, optional edges, scheduling, and cleanup across custom themes while retaining each renderer's paint policy.
- Improve text over colored surfaces, translucent layers, nested cards, purchase controls, prices, and deal labels. Merge eligible short label backings into their surrounding surface instead of creating unnecessary dark rectangles.
- Measure text over separate image layers using bounded pixel samples where available. Preserve readable source ink and image content; use a local text backing when needed. Use higher targets for High contrast.
- Repair monochrome SVG fills and strokes, clipped and nested glyphs, sprites, masks, generated icons, select arrows, placeholders, carousel arrows, and pagination dots. Preserve original artwork geometry and avoid treating clipping/mask definitions as visible colors.
- Account for an icon's own CSS backing or an opaque SVG shape behind a nested glyph. Reinspect compact SVG controls together with their descendants when hover changes their colors.
- Adapt small external monochrome SVG control backgrounds with bounded resource reads and cached classification, keeping the original paths. Increase contrast for small external control glyphs.
- Keep inactive carousel dots visible and the current dot distinct without adding a ring. Preserve visible numbered pagination.
- Improve treatment of pale decorative SVGs, gradients, masked fades, and wide backdrop shadows without indiscriminately dimming photos or replacing multicolor logos and flags.
- Recover contrast for eligible transparent wordmarks and static monochrome artwork using conservative backing or tint decisions. Skip ambiguous, animated, unsupported, or unreadable resources.
- Reduce excessive neutral border contrast in Simulated Native with emphasis Off. Preserve transparent borders, selected-state accents, thin separator geometry, and authored outlines.
- Handle compact icon-control backings drawn by `::before` or `::after`, including offscreen or transparent accessible labels. Apply emphasis to the backing layer so its radius and transforms remain intact.

## Performance and state fixes

- Prioritize visible content and preload nearby content before idle traversal to reduce progressive darkening during scrolling.
- Sample local changes without disabling the paint stylesheet for the entire document. Cache authored ancestor paint so repeated inspection does not misclassify an already-adapted backdrop.
- Coalesce pointer updates, repaint affected subtrees, and defer background work while horizontal carousels move. Ignore redundant attributes and movement-only style changes.
- Keep transition guards active during sampling and stage theme handoff to reduce white flashes when switching renderers or scrolling sticky content.
- Observe relevant visibility and expansion state changes. Clean up extension-owned styles, markers, observers, and queued work when a custom theme is cleared.

## Interface improvements

- Put Simulated Native immediately after Native in the theme choices and update help text in all nine interface languages.
- Make the popup more compact while retaining readable controls, text scaling, wrapping, and keyboard access. Keep Manage rules beside the title.
- Improve manager column widths and editor action rows. Place Rule defaults beside the editor heading and use the existing rounded fieldsets, radio chips, and switches.
- Allow Rule defaults to close through its centered close button, Cancel, Escape, or a backdrop click. Keep website and path switch groups visible together.
- Ellipsize overflowing rule addresses in saved rules and Trash and expose the complete address in accessible, selectable tooltips. Improve long-hostname handling in the popup.
- Show explanatory warnings and disable rule controls on protected stores, internal/extension pages, and detected PDF viewers instead of leaving a misleading checking state. Viewer detection remains limited.
- Stack Restore above Delete permanently at the right of Trash entries and align entry information vertically with its actions.
- Refresh the popup and manager screenshots and expand user, interface, rendering, and contributor documentation.

## Compatibility, privacy, and limits

- Existing rules without a preset still use Native. Existing scope precedence, exclusions, explicit ports, regional-domain matching, and serialized rule writes are retained.
- Backups preserve Simulated Native and the shared separator preference. Versions 1–3 remain importable; export uses version 2 for custom themes/preferences and version 3 for exact-only paths. Older extension builds may reject settings introduced after their release. Rule defaults, Trash, and UI preferences are not included in rule backups.
- There is no telemetry service. Contrast analysis can read resources referenced by the page: cross-origin reads use credential-free CORS; same-origin reads may use the existing page session. Resource servers can observe those requests. Work is bounded and cached, and failures retain conservative fallbacks.
- Rendering is not perfect. Dynamic or personalized states can still have incorrect colors, flashes, or delayed adaptation. Some Google account-panel states remain under investigation. Contrast targets are not an accessibility certification.
- Brave on Windows has the most coverage. Other browsers and operating systems still need broader end-to-end checks. Native uses an experimental Chromium command.

## Update and verification

Replace the extension files, reload the unpacked extension, and refresh affected website tabs so existing frames receive the new content script. Export rules before downgrading; older builds may not understand the new theme or separator settings.

Validation for this release is recorded in [PLAN.md](../PLAN.md). The rendering guide distinguishes live-page checks from local/anonymized reproductions. The proposed portable regression gallery, possible retirement of Native, and any product rename remain [future work](ROADMAP.md).
