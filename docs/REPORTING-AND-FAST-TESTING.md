# Reporting rendering errors and shortening the repair loop

## What to send

For a real website, send the URL, theme, border level, triggering action, and a screenshot showing the affected element. Include its selector or HTML fragment if readily available. State whether the source/Native rendering is a reference or itself problematic. One issue per report is easier to reproduce than an entire page of unrelated symptoms.

For the local lab, send the case/group name, element label, theme, border level and trigger. A screenshot helps distinguish a perception preference from a measured paint defect. There is no need to paste the whole document when a registered specimen already reproduces it.

The agent can then run a targeted capture. The reporter does not have to operate a console or expose an authenticated browser just to diagnose a public page.

## One element issue bundle

```sh
npm run diagnose -- --issue --url "https://example.org/page" --selector ".affected-control"
```

Defaults are 100% CSS zoom, Off, and all three custom themes, plus the original. Existing `--themes`, `--levels`, `--scales`, browser and output-directory flags can narrow or expand that explicit matrix.

The command opens fresh isolated documents and scrolls the first matching element into view. It writes an ignored `research-artifacts/diagnostics/run-…/` directory containing:

- `issue.md`: deterministic source/applied property differences for up to 50 visible rows, with 24 displayed changes per node and explicit omission counts.
- `capture.json`: full bounded measurements, including four ancestors and their `::before`/`::after` layers for selected roots.
- Existing `analysis.json`, `triage.json` and `summary.md`: measured checks and prioritized candidate findings, separate from the raw evidence.

Evidence includes foreground/fill, borders, opacity, background classification, geometry, shadows, layout context and text decoration. It captures computed paint, not a portable HTML/CSS reproduction. Original/themed structural matching remains best-effort and unmatched nodes are identified explicitly. The command rejects missing selectors and empty inspectable results instead of writing an apparently successful empty report.

Live screenshots, labels, generated text, HTML and input values are excluded by default; CSS resource references are redacted. `--labels` explicitly opts into visible labels, never input values. Review files before sharing: locators, public page path and computed facts can still reveal context. URL query strings/fragments are omitted from the issue header; the actual navigation still uses the supplied URL.

An isolated profile does not share the user's login, cookies, open state or viewport. This slice captures the default state only: it does not reproduce hover, scrolling animations, protected frames, closed roots or unavailable image pixels automatically. A successful capture is not a visual pass. For such reports, keep the action/screenshot and use a faithful local fixture or a separate controlled interaction check. Do not silently treat an unavailable authenticated state as the reported state.

## Focused verification

```sh
npm run verify -- --focus borders
npm run verify -- --focus icons,contact
```

Available groups are `icons`, `borders`, `images`, `surfaces`, `states`, `contact` and `cards`. Every selected group retains its complete existing expectations and all three custom themes; border checks still exercise all six levels and preservation controls. This is explicit mechanism selection, not automatic dependency inference. An invalid group fails instead of falling back to an empty suite.

Focused verification runs all syntax and Node unit checks, then only the chosen browser groups. It omits launcher artifacts, the canonical capture matrix, lab UI/assets and issue-bundle checks. Its console output and `research-artifacts/diagnostics/last-verification.json` state that reduced scope. Shared classification/scheduling changes should select all affected groups or use the complete command.

```sh
npm run verify -- --browser
```

The complete release path remains intact and also checks issue-bundle creation/redaction and missing-selector failure. Do not replace it with a focused run for release validation. `last-verification.json` records the latest invocation only, not a history or cache; a prior success never skips current tests.

## Measured improvements and next steps

The original release run took about 52 seconds on Windows/Brave. Repository-wide `node --test` discovery consumed roughly 7–15 seconds although individual tests were short. `npm test` and verification now discover `.test.js`, `.test.mjs` and `.test.cjs` files recursively **inside `test/` only**, avoiding ignored research/report directories. The same original 90 tests ran in about 0.34 seconds in the warm comparison. New diagnostic tests add coverage rather than replacing existing cases.

An explicit border run measured about 6.6 seconds including syntax, every Node test and the three-theme/six-level browser group, versus about 17 seconds before the discovery fix and about 52 seconds for the previous full release suite. These are local wall-clock observations, not portable guarantees or equivalent-coverage comparisons.

The changed-backing state probe now waits for each actual backing transition within a bound while recording every frame, rather than assuming a fixed frame count always exercises the state. An absent transition or unadapted glyph remains a failure.

Further opportunities require separate evidence: reusing a single browser safely across complete suites, named hover/scroll actions for issue bundles, a report action in the extension UI, and measured dependency selection. No persistent user browser attachment, screenshot upload, result cache or parallel test execution has been added. Preserve source/theme isolation and fresh renderer code when exploring these optimizations.
