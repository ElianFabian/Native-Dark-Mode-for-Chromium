# Direction and open work

These are plans and questions, not behavior promised by the current release.

## Development compatibility policy

The extension has not been published. Compatibility with backups from earlier development versions is a low priority. Format changes can simplify or remove legacy support when useful; migrations are optional rather than a prerequisite. Document intentional changes and keep validation, clear unsupported-format errors, and safe import behavior. Current support for backup versions 1–4 is implemented behavior, not a long-term compatibility commitment.

## A local rendering regression gallery

See the [diagnostics and regression implementation plan](DIAGNOSTICS-AND-REGRESSION-PLAN.md) for the proposed capture/analyze/compare workflow, local gallery inventory, implementation phases, and acceptance gates. The [first rendering lab delivery](RENDERING-LAB.md) is implemented; the complete inventory and temporal/performance coverage remain incremental work.

The initial local lab reproduces selected unusual rendering cases found during the custom-theme work. The next step is to extend its coverage and interaction scenarios. Keep it available in the repository so future contributors can rerun the checks without authenticated accounts or personalized live pages.

Cover solid and translucent surfaces; nested and generated backings; text over pictures; gradients and masks; transparent logos; static and animated image eligibility; sprites, external background SVGs, clipped and layered SVG glyphs; placeholders and selects; pagination; cards and optional borders; hidden accessible labels; hover, focus, sticky headers, scrolling, carousels, theme handoff, and frame/Shadow DOM cleanup. Include negative controls, source paint, expected behavior, and theme/level selectors. Preserve the drawing and dimensions in assertions where relevant. Add stress cases for menus, long documents, and moving carousels.

The checked-in baseline and focused control/artwork fixtures cover selected regressions, not the complete gallery. Portable diagnostics and selected assertions now live under `scripts/dev/diagnostics/`, `tools/diagnostics/` and `fixtures/diagnostics/`. Ignored `research-artifacts/` holds generated reports and additional investigation; it is not the portable regression suite. Do not describe the partial gallery as a complete regression suite. Keep private account details out of fixtures.

An initial reusable [browser audit command](BROWSER-TESTING.md) now covers a theme/level/scale matrix and common computed-paint checks in an isolated profile. It supplies candidate reports, not the complete gallery, state-transition tests, or confirmed accessibility results.

## Possible replacement of Native

The current direction is to investigate whether Simulated Native can eventually replace the debugger-based Native mode. Its goal is readable, stable dark rendering inspired by Chromium, including improvements over Native's contrast and controls. Exact visual parity is not an acceptance criterion.

Removal is not decided or scheduled. Version 0.12.0 retains Native as the default and preserves existing rules, exclusions, backups, debugger cancellation, and launchers. A future change must assess behavior and performance across browsers and pages, explain any lost capabilities, and decide how rules without a preset should behave. Legacy development-backup migrations are optional under the policy above. Removing Native would also require reviewing debugger permissions, controller behavior, the debugging-banner launcher workflow, and documentation.

If the native renderer is removed, reconsider the extension's name and the Simulated Native label together. No replacement name has been selected. Keep the current product name and internal `chromium` preset identifier until a separate naming and compatibility decision is made.

## Remaining investigation

- Some states of the authenticated Google account panel still show inconsistent surfaces or insufficient text contrast. Clipped and layered pencil icons have local coverage, but that does not establish that the whole personalized panel is fixed.
- Cross-origin or otherwise unreadable pixels, complex SVGs, photos with embedded lettering, closed roots not exposed by Chromium, and protected documents require conservative fallbacks.
- Broader Chrome/Edge/other Chromium and Linux/macOS end-to-end testing remains pending. Browser and website updates can invalidate a previous visual result.
- The Save settings action can appear redundant because saved themes, separator levels, and supported scope switches update immediately. URL and website/path changes still require explicit saving. Disabling the save action when no draft changes remain is a proposed UI improvement, not implemented behavior.
