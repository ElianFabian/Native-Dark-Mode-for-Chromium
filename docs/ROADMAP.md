# Direction and open work

These are plans and questions, not behavior promised by the current release.

## A local rendering regression gallery

The next intended task is a local website that reproduces the unusual rendering cases found during the custom-theme work. Keep it available in the repository so future contributors can rerun the checks without authenticated accounts or personalized live pages.

Cover solid and translucent surfaces; nested and generated backings; text over pictures; gradients and masks; transparent logos; static and animated image eligibility; sprites, external background SVGs, clipped and layered SVG glyphs; placeholders and selects; pagination; cards and optional borders; hidden accessible labels; hover, focus, sticky headers, scrolling, carousels, theme handoff, and frame/Shadow DOM cleanup. Include negative controls, source paint, expected behavior, and theme/level selectors. Preserve the drawing and dimensions in assertions where relevant. Add stress cases for menus, long documents, and moving carousels.

The existing checked-in fixture is only a baseline. Much of the investigation currently uses an ignored harness under `research-artifacts/`; it is not a portable regression suite. Do not claim the gallery exists until it is checked in and reproducible. Keep private account details out of fixtures.

## Possible replacement of Native

The current direction is to investigate whether Simulated Native can eventually replace the debugger-based Native mode. Its goal is readable, stable dark rendering inspired by Chromium, including improvements over Native's contrast and controls. Exact visual parity is not an acceptance criterion.

Removal is not decided or scheduled. Version 0.9.0 retains Native as the default and preserves existing rules, exclusions, backups, debugger cancellation, and launchers. A future change must assess compatibility and performance across browsers and pages, explain any lost capabilities, and define migrations for rules without a preset and old backups. Removing Native would also require reviewing debugger permissions, controller behavior, the debugging-banner launcher workflow, and documentation.

If the native renderer is removed, reconsider the extension's name and the Simulated Native label together. No replacement name has been selected. Keep the current product name and internal `chromium` preset identifier until a separate naming and compatibility decision is made.

## Remaining investigation

- Some states of the authenticated Google account panel still show inconsistent surfaces or insufficient text contrast. Clipped and layered pencil icons have local coverage, but that does not establish that the whole personalized panel is fixed.
- Cross-origin or otherwise unreadable pixels, complex SVGs, photos with embedded lettering, closed roots not exposed by Chromium, and protected documents require conservative fallbacks.
- Broader Chrome/Edge/other Chromium and Linux/macOS end-to-end testing remains pending. Browser and website updates can invalidate a previous visual result.
- The Save settings action can appear redundant because saved themes, separator levels, and supported scope switches update immediately. URL and website/path changes still require explicit saving. Disabling the save action when no draft changes remain is a proposed UI improvement, not implemented behavior.
