# Reporting rendering errors and shortening the repair loop

Use [the repair procedure](RENDERING-REPAIR-WORKFLOW.md) for the full evidence-to-verification loop. The [ordered efficiency plan](RENDERING-EFFICIENCY-PLAN.md) tracks pending automation separately from available commands. Batch independent console evidence requests per page/state rather than asking for known pieces one at a time.

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

The complete release path remains intact and also checks issue-bundle creation/redaction and missing-selector failure. Do not replace it with a focused run for release validation. `last-verification.json` records the latest invocation only. Verification and capture phase history is now appended separately to ignored `research-artifacts/process-metrics/events.jsonl`; inspect it with `npm run metrics`. The summary reports unfinished operations and invalid/partial lines explicitly. Parent/child and stabilization/collection times overlap; their sum is not elapsed session time. Shared pixel assertions still have stage-level timing only. Neither file caches results; a prior success never skips current tests. See the [repair procedure](RENDERING-REPAIR-WORKFLOW.md#local-timing-history) for fields, privacy and remaining gaps.

## Measured improvements and next steps

The original release run took about 52 seconds on Windows/Brave. Repository-wide `node --test` discovery consumed roughly 7–15 seconds although individual tests were short. `npm test` and verification now discover `.test.js`, `.test.mjs` and `.test.cjs` files recursively **inside `test/` only**, avoiding ignored research/report directories. The same original 90 tests ran in about 0.34 seconds in the warm comparison. New diagnostic tests add coverage rather than replacing existing cases.

An explicit border run measured about 6.6 seconds including syntax, every Node test and the three-theme/six-level browser group, versus about 17 seconds before the discovery fix and about 52 seconds for the previous full release suite. These are local wall-clock observations, not portable guarantees or equivalent-coverage comparisons.

The changed-backing state probe now waits for each actual backing transition within a bound while recording every frame, rather than assuming a fixed frame count always exercises the state. An absent transition or unadapted glyph remains a failure.

Further opportunities require separate evidence: reusing a single browser safely across complete suites, named hover/scroll actions for issue bundles, a report action in the extension UI, and measured dependency selection. No persistent user browser attachment, screenshot upload, result cache or parallel test execution has been added. Preserve source/theme isolation and fresh renderer code when exploring these optimizations.

## Retained shared-run failures

Full and focused shared regression checks now print a unique failure directory when an attempt fails: `research-artifacts/diagnostics/shared-<timestamp>-<id>/`. Inspect `failure.json`, `partial-results.json` and the successfully collected paint/PNG artifacts before repeating the run. The active-selector pilot reports separate expected/actual color, geometry and emphasis predicates. Other failures may have generic context; do not infer an expected value that was not recorded.

The viewport/element images are collected after failure and only from the owned local fixture server. They are not exact failed-frame captures or permission to capture a live page. The latest successful `shared-rendering-checks*.json` is not overwritten by a failed attempt; check the per-run manifest and history instead. See [diagnostic reliability design](DIAGNOSTIC-RELIABILITY-DESIGN.md) for format, limits and remaining planned work.

## Executing code identity

Capture JSON and issue Markdown now distinguish expected disk code from initialized renderer function-source fingerprints. `match` requires matching renderer/color/image-policy source and unchanged current dependencies; `mismatch` identifies differing fields. `unknown` and `unavailable` remain unverified. Instance/start time and active preset/level are separate from extension version and file-byte hash. This queries only the isolated owned browser, not the reporter's personal tab, and does not reapply/inject a theme to obtain a match. Canonical automated captures additionally require matching identity/settings. See [runtime identity design](DIAGNOSTIC-RELIABILITY-DESIGN.md#2-identify-the-executing-renderer), including bounded HTTP worker hashing and the observed runtime-reload limitation.

## Named case selection

```powershell
npm.cmd run verify -- --list-cases
npm.cmd run verify -- --cases select-proxy-and-field-frames
npm.cmd run verify -- --cases embedded-vector-caption,static-internal-mask
```

There are 47 registered result IDs in 42 atomic units, independent of the gallery specimen IDs. Use the listing rather than guessing an ID from a fixture filename. A selection preserves every existing theme/level/state/negative assertion inside its units. Shared setup/state companions are listed and included once in canonical order; for example, `short-shadow-card-emphasis` also runs `verified-svg-scroll-state-stability`. The selected variant inventory is checked at runtime, not used as a pass cache.

Each invocation prints its reduced scope; latest verification and unique shared-run manifests retain requested/included IDs, companions and expected count. Shared reports also retain elapsed per-unit times; their parent/child sums overlap. Named runs still execute syntax and all Node tests. They omit launcher/smoke/lab/diagnostic-self-test stages and cannot replace complete `--browser` release verification. Choose either `--cases`, `--focus` or complete `--browser`. Invalid, empty or duplicate IDs fail before browser startup. `--list-cases` runs alone and opens no browser.

The runner retains 375 full-suite combinations, including shared/varied catalogue inputs. A result combination can contain many pixel/state/preservation predicates; it is not an individual assertion count. No automatic dependency inference, automatic repetition, retry-to-green or cached test result is introduced. Explicit repetitions are documented below.

Companion bundles conservatively retain original execution blocks; they do not claim every companion is a necessary dependency. Some can be split further after independent setup/order validation. Group names in a named run describe case membership, not complete group coverage.

## Repeating a case explicitly

```powershell
npm.cmd run verify -- --cases embedded-vector-caption --repeat 2
npm.cmd run verify -- --cases select-proxy-and-field-frames --repeat 3 --attempt-timeout 120 --repeat-timeout 600
```

This runs syntax/all Node tests once, then the original named selection in a fresh owned browser/profile/server per attempt. All controls/companions/theme/state/level checks remain. The summary retains every attempt and unique evidence/log path under `research-artifacts/diagnostics/repeat-.../`. A mixed pass/fail result is unstable and exits nonzero; a timeout, unfinished budget, source/scope drift or unconfirmed cleanup is incomplete and exits nonzero. Every attempt must pass for success.

Repeat counts are 2–10; attempt work bounds are 1–300 seconds (default 120), total experiment work bounds 1–1800 seconds (default 600). Cooperative cleanup can extend wall time. These options require explicit `--repeat` and named `--cases`; full/group release paths are unchanged and never retry automatically. Browser/profile IDs and initial rule count verify the fresh-profile experiment; OS caches remain. Reusing a profile or replaying full-suite prerequisites is not implemented and must not be inferred from isolated passes. See [the detailed design](DIAGNOSTIC-RELIABILITY-DESIGN.md#3-repeat-unstable-cases-under-explicit-conditions).

## Finding local visual evidence

Use `npm.cmd run visuals -- list CASE` to locate local capture-suite images by run/theme/level/state. Full capture IDs and `selectedReference` are shown. `npm.cmd run visuals -- compare CASE RUN CAPTURE RUN CAPTURE` checks metadata compatibility, with code-revision drift noted separately. It does not calculate pixel differences or establish visual acceptance. `reference CASE RUN CAPTURE` is an explicit developer selection; capture commands never overwrite a selected reference. Original files/checksums and selection-request history are retained under ignored `research-artifacts/visual-regressions/`.

Only owned local steady-state capture-suite PNGs are currently archived. Missing metadata, unsettled resources or unknown runtime identity cannot be promoted to a reference. Browser/fixture/viewport/DPR/zoom/scroll/state/readiness differences are explicit; exact font-resource/spatial fidelity and temporal behavior still need separate evidence. No live screenshot collection or supplied-image import is enabled by this slice.

## Inspecting image changes

Use the lab **Visual comparison** tab for side-by-side, opacity and difference-map review of local archived images. It shows compatibility warnings before interpreting a change, retains original pixel dimensions, synchronizes zoom/scroll when geometry matches, and reports changed-pixel count/maximum channel delta/bounds at an explicit tolerance. Source/local fidelity and temporal behavior still require separate evidence. The existing `visuals compare` CLI remains metadata-only; the new pixel viewer is separate from computed **Compare runs**. Unsupported PNG encodings, oversized images and geometry mismatches are explicit. No original/reference is modified and no dynamic region is silently masked.
