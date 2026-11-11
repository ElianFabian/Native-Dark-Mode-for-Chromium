# Website diagnostics and regression testing plan

Status: incremental implementation plan, 2026-11-11. The first working slice now includes independent capture/analysis, saved-run comparison, a local viewer and four canonical specimens. See [Rendering lab](RENDERING-LAB.md) for commands, verified behavior and explicit coverage limits. The rest of this document describes the target, not a claim that every phase is complete. The starting points are [the current audit command](../scripts/dev/audit-website.mjs), [browser-testing evidence](BROWSER-TESTING.md), [the focused fixture](../fixtures/contrast-controls.html), and [the renderer fix inventory](WEBSITE-THEME-RENDERING.md).

## Outcome

Implementation checkpoint: the first solid-paint vertical slice and viewer/comparison workflow are working, with deterministic source-aware triage and separate visual-review annotations. The gallery has four canonical specimens (three asserted, one capture-only), six generic and five original-site extended groups, seven linked manual pages, and a 44-mechanism coverage inventory (42 partial, two pending). The smoke run passes 19 assertions; the expanded canonical level/zoom matrix passed 163 assertions over 228 captures in isolated Brave/Windows. The extended groups produced another 77 stable snapshots; the unified browser command checks the UI, synthetic/original local assets and narrow Indeed fixture fidelity/contrast assertions. Temporal interaction automation, complex-image measurement, complete reproduction coverage and other browsers remain open. This checkpoint does not mark all phases complete.

Build one developer workflow that can capture a page, explain its paint, filter likely problems, reproduce an interaction, and compare the result after a renderer change. Use the same capture and analysis pipeline for public websites and a self-contained local regression gallery. Keep it outside the shipped extension except for explicitly enabled, bounded diagnostic hooks if those prove necessary.

The gallery should make the known cases easy to inspect together, while automated checks verify the properties a screenshot cannot establish: unchanged dimensions, preserved source geometry, state stability, teardown, and behavior across all three custom themes. Native is an optional visual reference, not the expected answer or an acceptance oracle.

## Feasibility and limits

This is practical with the existing Node/CDP workflow and a local fixture server. Solid-color paint, simple compositing, explicit geometry, and controlled state changes can be measured repeatably. Complex stacked graphics, screenshots, native menus, performance, and live personalized pages need qualified results rather than a universal pass/fail claim.

Deterministic means that the same captured facts and analyzer version produce the same analysis and comparison. Local scenarios can additionally control inputs, resources, actions, and checkpoints. A live website can change its DOM, resources, fonts, or responses; record that drift instead of claiming identical runs. Pixel-identical results across browser builds, operating systems, fonts, or GPU configurations are not a goal.

## What the current audit can and cannot supply

Reuse its isolated browser/profile lifecycle, extension loading, theme/level matrix, and initial collection concepts. Its current limits prevent it from being the full solution:

- It scans the current main-document viewport, up to 1,500 elements; interaction states, frame contents, Shadow DOM, and temporal behavior are not covered.
- Fixed waits and a root paint acknowledgment do not establish that every target has finished being themed.
- Positional selectors can identify a different node after live content changes.
- The color parser handles legacy RGB(A) serialization only. Complex backdrops are skipped, but the report needs explicit reasons and measurement provenance.
- Border contrast is measured against the element's backing, without a full account of the adjacent outside surface or independently generated edges.
- Image canvas samples represent source pixels; they do not by themselves establish filtered, composited on-screen contrast.
- Raw observations and finding generation are coupled in one script, and the HTML inspection/filtering and saved-run comparison interfaces do not exist.

Refactor incrementally. Do not start by building a replacement browser automation framework or copying the ignored research harness wholesale.

## Four components

### 1. Capture facts

Produce a versioned, serializable snapshot with raw CSS strings preserved alongside parsed values. Capture once; filtering and analysis must not re-read the website.

| Area | Required facts |
| --- | --- |
| Environment | Browser build, OS, extension commit and dirty patch fingerprint, viewport, DPR, CSS zoom versus actual browser zoom when known, font/resource readiness, theme, separator level, color scheme, reduced motion, scenario and checkpoint |
| Identity | Stable fixture ID; document/frame/shadow path; within-run node identity; best-effort structural locator for live pages with a match status |
| Text | `color`, `-webkit-text-fill-color`, font size/weight/family, text shadow, opacity chain, visibility, line rectangles, placeholder paint and control state |
| Surfaces | Background color/image/layers, alpha, filters, blending, masks, clipping, position, stacking context and ancestor chain needed to explain the measured backing |
| Edges | Every border side's width/style/color, border image, radii, outline, inset/outer shadows, geometry in CSS/device pixels, plus the inside and outside backdrop when knowable |
| Generated layers | Separate `::before`/`::after` paint, bounds where obtainable, content kind, transform, mask, border sides, opacity and relationship to the host |
| SVG and images | Visible fill/stroke and opacity, nested shapes versus non-painting definitions, source dimensions, filter, alpha/monochrome/static classification evidence, resource readability and reasons for exclusions |
| Time | Action/checkpoint sequence and bounded paint/geometry samples for the relevant nodes; optional performance trace and screenshots |

Separate authored/source capture from themed capture. A single node's removed paint marker is insufficient to recover source appearance when themed ancestors, descendants, generated rules, or inherited values remain active. Prefer a resettable fixture and replayed source scenario; for live pages, use reversible whole-renderer disable/restore in the owned profile when safe, verify cleanup, and record DOM/state changes between captures. Never use observed themed paint as the source of another measurement accidentally.

Use batched reads, an ancestor-style cache per capture, and bounded resource work. Benchmark targeted page evaluation against CDP style/layout snapshots before choosing the bulk path. Feature-detect experimental protocol fields. Include open roots and eligible frames through explicit traversal/target handling; report missing coverage. Closed roots or browser-owned surfaces that cannot be inspected through the selected mechanism remain unsupported, not silently passed.

### 2. Analyze evidence independently

The analyzer consumes snapshots without launching a browser. It records the metric, target or invariant, measured value, applicability, backing method, evidence, and uncertainty for every finding. Use explicit categories such as measured, estimated, needs visual review, unsupported, not applicable, and unstable.

- Text: compute foreground/background contrast for a known backing, accounting for alpha and explicit text fill. Preserve font and polarity context. Do not invent one backing for a varying image or gradient.
- Icons: measure the visible SVG fill/stroke, mask, sprite or generated glyph, rather than assuming the wrapper's `color` is the displayed ink. Analyze a badge's backing separately from its inner glyph. Skip definitions and distinguish disabled/decorative cases.
- Borders: report width changes separately from contrast amplification. Compare source/themed edge-to-inside and edge-to-outside where available; report missing adjacency. Include shadows, outlines and generated backings so duplicated edges are visible in the evidence. Check that increasing emphasis does not reduce the baseline or alter layout unintentionally.
- Color preservation: report source-to-result hue/chroma/luminance changes, replacement of multiple inks by one, and unexpected label background additions. These are product review signals, not universal defects.
- Images and gradients: add bounded pixel sampling only when resource and geometry evidence support it. Record sampled line regions, minimum/distribution of contrast and coverage. CORS denial, overlapping layers, filters and unknown composition must remain explicit. Screenshots supplement CSS evidence; anti-aliased glyph edge pixels must not become the WCAG foreground color.
- Stability: identify unexpected light frames, repeated toggling after an interaction has settled, changes while idle, lost hover/focus indicators, and incomplete cleanup. Keep intentional transitions separate from incorrect flash or delayed adaptation.

Use independently tested contrast/compositing reference vectors. Share data contracts and generic serialization utilities where useful, but do not import the renderer's eligibility decisions or expected colors as the test oracle: the same bug must not make renderer and test agree incorrectly.

WCAG 2.2 ratios provide a useful first metric, with role-specific applicability. They do not require every decorative border or logo to meet a generic ratio. Display product-specific targets separately from standards-based checks. Add a pinned, license-reviewed APCA implementation as an optional text diagnostic after the basic pipeline works; do not silently equate it with WCAG 2.2 or treat a perceptual score as proof that everyone will prefer one polarity. Keep raw snapshots re-analyzable as policy evolves.

### 3. Compare saved runs

Two different comparisons are needed:

1. Authored/source versus themed: explains the transformation and what was lost, added, or preserved.
2. Renderer before versus renderer after a code change: shows resolved, new, persistent, improved, worsened, or unmeasurable findings for equivalent scenarios.

Match fixture nodes by permanent case/node IDs. On live pages, mark changed, missing, inserted and ambiguous nodes instead of using positional coincidence. Separate environment/resource drift from rendering regressions. Normalize volatile metadata out of the semantic comparison while preserving the original capture metadata. Analyzer and policy versions belong in the report; support re-analyzing two old captures with the same policy.

Combine invariant checks, numeric deltas with justified tolerances, and targeted screenshot comparisons. A changed screenshot is review evidence, not automatically a regression. Never refresh baselines just to make a failing test pass; record why the accepted behavior changed.

### 4. Inspect and filter locally

Provide a local report viewer with a summary, filterable findings table and element details. Load saved capture/analysis/diff files so browsing the report does not require a running browser or rerunning the page.

- Filter by category, theme, level, state, fixture, frame/root, metric range, applicability, measurement quality and comparison status.
- Show original and themed swatches, actual fill versus text color, composed backing chain, border widths and shadows, numeric deltas, screenshot crops when available, and the reason a result is uncertain.
- Drill into an element/subtree and copy a reproducible capture command or locator. A live-page highlight is optional and must be removed before collecting screenshots.
- Keep screenshots, DOM text, resource URLs and matched stylesheet details opt-in for live pages. Default reports omit field values, cookies, tokens, page text and personal accessible names; generated structural locators avoid exporting raw identifying IDs. Explain that optional screenshots can contain private information.

Serve the viewer separately from themed specimen documents. Do not let the extension recolor the diagnostic chrome or let viewer layout/CSS change a specimen's authored backing and dimensions.

## Local regression gallery

Create a dashboard of compact previews with categories, theme/level/state controls, source/themed comparison, pass/review status, and links to an isolated full-size case. Run full measurements in canonical specimen documents at fixed viewports, not resized dashboard thumbnails. Mount a bounded number of previews at once; keep the full matrix for the automated runner.

Every case needs a stable ID, related symptom/fix-inventory entry, HTML plus relevant authored CSS/generated layers, local assets, explicit states/actions/reset behavior, expected invariants, a negative control, and an evidence label: reported, locally reproduced, live confirmed, or still unresolved. A case being present does not mean its bug is fixed. Inventory entries can require several variants; do not conflate different drawing mechanisms because they look similar.

| Family | Cases to reproduce |
| --- | --- |
| Surfaces and text | Nested solid/translucent backings, `color` versus text fill, inherited ink, pale/colored notices, headings with and without links, price/deal labels, accidental dark label rectangles, alternating surfaces |
| Image overlays and gradients | Bright/dark/variable carousel artwork behind headings and subtitles, image crop/position and separate backing layers, gradient title/divider, mask gradients, pale embedded SVG decorative backdrop |
| Thin edges | Borders matching the light fill, intentionally strong neutral borders, colored outlines, fractional widths, transparent reserved borders, tab/currentColor edges, horizontal rules, text-based separators, empty spacing widgets |
| Cards and generated surfaces | Shadow-only linked cards, icon-only social controls, pseudo-element backings, decorative shapes behind cards, edge emphasis with Off through Maximum, hover exposing a light surface |
| SVG glyphs | `currentColor`, explicit fill/stroke, nested SVG/circle badges, clipping, masks/definitions, foreignObject, pointer-only handlers, icons beside labels/definition terms, multicolor and non-interactive negatives |
| CSS and font icons | Both carousel directions, background sprites, CSS border chevrons, generated icon fonts, masked icons, external/data SVG backgrounds, two-ink arrows and independent circular edges |
| Artwork | Neutral and colored single-ink transparent PNG/SVG/static GIF, dark lettering in multicolor logos requiring a backing, internal SVG paint classes, readable art/photos/flags/avatars that must remain intact, animated negatives, CORS permitted/denied resources |
| Inputs and menus | Search input and placeholder, yellow/orange action buttons, subtle input edges, native select label and SVG arrow, option/optgroup popup paint, disabled/custom-color/listbox negatives |
| Pagination and tiles | Inactive/active dots with hidden numeric labels, colored link tiles with uniform source labels, translucent carousel fade overlays |
| Dynamic behavior | Hover background plus independent underline, focus-visible, expanded/selected/disabled states, sticky class changes on scroll, lazy insertion, transform-only moving carousel, idle resampling, resize and theme handoff |
| Layered account widgets | Anonymous nested account-like panel, light/dark buttons and footer links, circle-plus-pencil glyphs, hover/focus backing changes; no real profiles or account information |
| Boundaries and teardown | Same/cross-origin frames, open roots, closed-root expectations marked by capability, slotted/custom-element icons, enable/disable, repeated switching, exclusion and removal of owned styles/observers |

Use minimal anonymized reproductions rather than copied full websites. Site/framework names and supplied snippets may be referenced in fixture provenance, never in production rendering rules. Recreate generic artwork locally or use assets with clear redistribution rights. Bundle fonts used for glyph tests with their licenses; a private-use character in a fallback system font is not a reliable visual icon fixture.

Track all current fix-inventory rows and reported unresolved cases in a coverage manifest. Classify each as ported, pending, needs missing CSS/resource evidence, or intentionally unsupported. Reuse vetted parts of the ignored harness but preserve no credentials or personalized HTML. Start with the existing checked-in fixtures and add missing families incrementally.

## Repeatability, speed and state handling

- Pin the tested browser build/environment for a baseline; record all versions and resource hashes. Keep local tests offline after setup, with seeded data, fixed viewport and controlled fonts/assets. Use two loopback origins and deterministic resource responses for CORS/frame cases.
- Reset scenario state before every steady-state theme/level test. Test theme transitions separately, including every directed pair among the three custom themes and enable/disable. Keep Native handoff checks in a separate browser-capability suite.
- Wait for required fonts/images and renderer readiness plus bounded stable target samples. A timeout produces an unstable result with the changing properties, never a successful sample after an arbitrary delay. Add a narrow developer-only pending-work/settled hook only if observable readiness is insufficient.
- Freeze animation for static checkpoints; replay controlled animation/scroll actions for temporal tests. Do not disable the behavior whose delay or flash is being tested. CSS/JS animation states in fixtures should have explicit step controls.
- Prefer a targeted element/subtree capture or current viewport by default. Offer bounded full-page/scroll scenarios explicitly, with truncation and coverage recorded. Do not run image decoding and deep style inspection on every node in the fast pass.
- Cache styles within a capture and immutable resource analysis by content/settings. Invalidate state-dependent data correctly. Capture facts in batches without writes between reads; analyze offline. Do not permanently cache inherited styles across interactions.
- Separate a quick developer smoke suite from the full theme/level/scale/state matrix. Record warm/cold startup, capture, analysis and comparison timings separately. Establish budgets on the reference machine after measuring; do not promise instantaneous full-page analysis.
- Keep performance checks separate from heavily instrumented contrast captures. Repeat menus/carousels against a no-extension baseline, recording long tasks/frame delays and coarse regression budgets. Timing is statistical evidence, not a deterministic equality assertion.

## Implementation order and acceptance gates

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| 1. Contract and vertical slice | Refactor browser launch, capture, pure analysis and reporting into developer modules. Add minimal snapshot/scenario schemas and two known local cases: a fractional pale frame and a nested SVG glyph, each with a negative control. | Same snapshot yields identical normalized findings. Source and themed captures remain distinct. All custom themes are tested. A deliberately introduced bad border or glyph is detected; the unchanged negative cases pass. |
| 2. Compare and inspect | Saved-run comparison and the first local filterable HTML report with element evidence. | Before/after identifies the deliberate regression, its repair and unmatched nodes without rerunning the capture. Contradictory environments are flagged. Raw values remain inspectable even if no policy applies. |
| 3. Gallery and inventory | Dashboard, canonical specimen pages, local assets and a manifest mapping every known symptom to coverage or an explicit gap. Migrate existing portable cases and selected research reproductions. | Fresh checkout can serve and run the core gallery without accounts, external assets, or ignored scripts. Fast previews and full-size cases use the same definitions. Missing cases are visible. |
| 4. States and lifecycle | Declarative hover/focus/scroll/theme-switch/reset steps, bounded temporal traces, frame/open-root cases, teardown assertions and a quick automated suite. | Reproduce light flashes, late hover and scrolling glyph changes intentionally; detect them without accepting normal animation as failure. Disable restores paint/layout and observable diagnostic/lifecycle state. |
| 5. Complex paint and broader matrix | Targeted pixel evidence, generated-layer/own-SVG-backing cases, optional perceptual text metric, native-popup visual checks, separate performance suite and additional browser environments. | Measurements carry explicit assumptions and coverage. Complex unsupported cases cannot silently pass. Baselines are environment-specific and performance reports separate probe overhead. |

Keep `npm test` for pure deterministic tests and add separate browser commands for smoke/full/scenario capture and saved-run comparison. Preserve `audit:website` as a discoverable entry point, with updated help. Proposed command syntax and file layout should be finalized during Phase 1 rather than presented as already implemented.

Use the existing `npm run verify` orchestrator as the contributor-facing entry point. Today its standard profile runs syntax, Node tests and launcher artifact tests; `--quick` omits launcher checks. When the portable browser runner exists, integrate explicit browser/full profiles under the same command rather than requiring a sequence of manual server/browser/test commands. Start and stop owned fixture servers/profiles automatically, report dependencies and skipped coverage, return a nonzero exit code on failures, and summarize per-stage timings and report locations. Do not label a standard/quick run as a full rendering check. Document the supported profiles in both READMEs; measure startup, active tests and lingering handles separately before optimizing test speed.

A useful first milestone is Phases 1–2 with the initial fixture pair: capture, filter, explain, introduce a regression, fix it, and compare. This proves the workflow before investing in every gallery case. The complete inventory and temporal coverage are a larger incremental task, not one extra diagnostic function.

## Maintenance and boundaries

- Each new renderer regression gets a minimal fixture, a contrasting negative case, a source/theme/state expectation and a fix-inventory link.
- Updating the local page is a required part of investigating every new unusual rendering case, including unresolved reports. Register its stable ID, evidence, relevant styles/assets and triggering actions; expose pending or missing-evidence status rather than waiting for a fix or silently omitting it. Until the gallery exists, add a checked-in minimal fixture and documented status. Once fixed, update expectations and keep the case permanently in the regression collection. Review renderer fixes together with their fixture/gallery updates.
- Keep analyzer reference tests independent of renderer heuristics. Do not auto-promote measured thresholds into accessibility certification.
- UI strings for shipped extension changes still need all nine languages. Developer tooling/docs can stay English; these tools must not add end-user dependencies or shipped permissions.
- This unpublished development project does not need legacy diagnostic-report migrations or long-term backup compatibility. Version schemas enough to reject incompatible reports clearly; prefer simplicity over multiple old readers.
- This plan does not change rendering, rules, backups, the current release tag or publication state.

## Primary references

- [WCAG 2.2: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): text applicability, font-size context and anti-aliasing limitations.
- [WCAG 2.2: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): meaningful visual cues and adjacent colors; not every border is required to have the same contrast.
- [Chrome DevTools Protocol definitions](https://github.com/ChromeDevTools/devtools-protocol): snapshot, style, target and tracing capabilities must be checked against the running browser.
- [APCA implementation and licensing](https://github.com/Myndex/apca-w3): optional additional diagnostic, with pinned version and separate interpretation.
