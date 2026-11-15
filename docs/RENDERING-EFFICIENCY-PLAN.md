# Rendering efficiency implementation plan

Prepared 12 November 2026 for the next development session. This is an ordered backlog; checked entries and dated progress notes identify implemented slices, while remaining entries are planned. Use [the working procedure](RENDERING-REPAIR-WORKFLOW.md) during implementation and keep its capability table current.

## Objective and starting evidence

Reduce reporter effort, inaccurate reproductions, repeated verification and renderer latency without weakening coverage or introducing site-specific renderer rules. Treat three costs separately: developer repair time, verification time, and page rendering/scroll latency.

The last complete Windows/isolated-Brave verification passed in approximately 199 seconds: shared rendering 159.55s, canonical smoke 16.28s, lab UI/assets 8.65s, launchers 7.30s, issue bundles 5.34s, syntax 1.77s and Node tests 0.45s. The shared runner already reuses one browser. Browser startup is not established as the main cost.

An ignored retrospective at `research-artifacts/process-metrics/2026-11-12-summary.json` aggregates 102 log records and about 103 minutes of recorded stage durations, including about 90 minutes of rendering stages. These are summed subprocess times, not unique executions, user waiting time or a complete work timeline. Diagnosis and rework were not separately timed. Do not invent percentages for those phases.

Known reproduction mistakes included hidden HTML versus visible embedded-SVG text, transparent versus almost-transparent native overlays, inline capsule ancestry versus a block reduction, and a translated full-width progress fill versus a shortened child. Source fidelity must be checked before interpreting local themed results.

## Ordered work: easiest first

Each step has its own acceptance condition. Check it only after implementation and validation. Difficulty is relative; do not promise unmeasured speedups.

### 1. Use a consistent repair procedure immediately

- [ ] Adopt the linked working procedure and record case/status/next action in each handoff.
- [ ] Batch independent console requests into one script per page and relevant state, returning a single JSON object keyed by case ID. Include explicit missing/error results. A second batch is justified by a newly discovered dependency, not an omitted known case.
- [ ] Prefer public/local CDP evidence over asking the reporter to operate a console. Do not assume access to their authenticated state.
- [ ] Before editing renderer code, list source facts, unknowns and the contrasting preservation control.

Acceptance: the next repair records these facts and avoids a chain of independent one-element requests. Scripts omit input values, account content and unapproved live labels; no automatic state-changing handlers are copied.

### 2. Record useful timings automatically

- [x] Add an append-only ignored JSONL history alongside the existing latest verification summary; retain failed/interrupted attempts and scope.
- [ ] Record session/case ID, attempt, phase, monotonic duration, wall-clock timestamps, result, command/action category, code/fixture hash and artifact references. Record rework reason when known; distinguish human annotations from measured events.
- [ ] Instrument browser startup, navigation, readiness, theme application, stabilization, collection, pixel assertions, screenshot export and analysis per case.
- [x] Provide a small summary of total/median/slowest phases and attempts. Do not treat overlapping stage durations as elapsed session time.

Acceptance: a successful run and a failure both retain usable records; timing overhead is measured. No page text, secrets, form values or sensitive command arguments enter the history. Do not introduce a telemetry service or a large task-management system.

Progress on 13 November: verification and capture suites now append start/end evidence under `research-artifacts/process-metrics/events.jsonl`; `npm.cmd run metrics` summarizes attempts, failures, unfinished operations and phase costs. Capture navigation, readiness, theme application, stabilization, collection, screenshot export, analysis and browser startup/cleanup are instrumented with session/case IDs and source hashes. Raw start records survive interruption; missing ends stay unfinished. Measured append cost is recorded, but total overhead has not been benchmarked. Human annotations/rework reasons and per-case shared pixel/assertion instrumentation remain pending, so step 2 as a whole is incomplete. See the working procedure and PLAN.md for validation.

### 3. Execute individual regression cases during iteration

- [x] Refactor the shared runner into named cases with group/dependency metadata while preserving its assertions and ordering requirements. Shared setup/state remains in atomic units with explicit companion IDs.
- [x] Add explicit case selection; unknown IDs and empty selections must fail. Keep the existing group and complete commands intact.
- [x] Include required preservation controls and all affected theme/state/level variants. Report the exact reduced scope.
- [x] Compare full-suite case/assertion inventory before and after the refactor; run the complete suite to check equivalence. All 42 original unit bodies are identical; the full ordered 372-result variant inventory matches and complete verification passed.

Acceptance: a small repair can run its case and negatives without the entire group. Full verification still executes all existing checks. Prior pass results never skip current tests. Available commands: `npm.cmd run verify -- --list-cases` and `npm.cmd run verify -- --cases ID[,ID...]`. Catalog: 48 result IDs in 42 ordered atomic units, preserving all in-fixture controls and reporting shared companions. Unit-level case timings are now appended; pixel assertions are not separately timed.

Validation on 13 November: 118 Node tests, both named browser selections (18 selector combinations; 6 shadow/SVG companion combinations), and complete browser verification passed with all 372 combinations. Scope/limits and evidence are recorded in PLAN.md. No assertion thresholds, state waits or production renderer policies were changed.

### 4. Organize the ignored visual archive

- [x] Use `research-artifacts/visual-regressions/<case-id>/<run-id>/` rather than a new top-level archive. The existing parent is already ignored by Git.
- [ ] Save a manifest with live/local provenance, sanitized URL, source versus theme, border level, state/action, browser/OS, viewport, DPR, zoom, scroll/crop coordinates, font/resource readiness, renderer/fixture hashes and timestamps.
- [x] Separate selected reference captures from candidate runs. Never replace a reference automatically after a changed result.
- [ ] Support supplied screenshots with explicitly unknown metadata; do not label them comparable when conditions are missing.
- [ ] Preserve brief frame sequences for startup/handoff/flicker cases; a stable final PNG cannot establish a temporal pass.

Acceptance: two compatible captures can be located by case/state, and incompatible conditions are flagged. Keep necessary fixtures, pinned public resources and expectations tracked in Git; ignored screenshots are supplementary evidence. Keep capture opt-in/redaction policy for live pages and avoid collecting personal-page screenshots by default.

Progress: local capture-suite PNGs now have immutable per-capture manifests and explicit reference selection. `npm.cmd run visuals -- list/reference/compare` exposes case/state lookup and metadata compatibility only. Metadata is complete for the current steady-state local scope; supplied/live screenshots, exact font/resource fidelity and temporal sequences remain pending, so step 4 as a whole is not complete. Complete verification passed 129 Node tests and all 372 shared combinations; two real same-condition archive captures compared compatible, and an Off/Maximum pair compared incompatible. See the working procedure and PLAN.md for evidence and limitations.

### 5. Add visual comparison to the existing lab

- [x] Add side-by-side views with synchronized zoom/scroll, opacity slider overlay and a difference image with changed-region bounds.
- [x] Prefer local HTML/Canvas and existing infrastructure; measured client diff computation at about 8.4ms for a 1000x900 identical pair on the checked Windows/Brave run (excluding decode/transfer/layout). No worker/dependency added.
- [ ] Compare compatible captures of the same state and theme across revisions. Use source/live versus source/local comparisons separately to validate reproduction fidelity.
- [ ] Retain originals. If a dynamic region needs exclusion, record and display the mask and reason; never hide the reported defect.
- [x] Treat antialiasing/content changes as review evidence, not automatic renderer failures. Keep raw pixel differences separate from visual acceptance.

Acceptance: known identical and deliberately changed images exercise the viewer, geometry mismatch is explicit, and existing measurement comparison still works. The retained Compare runs tab compares computed checks; the new Visual comparison tab compares archived image pixels. Local steady-state first slice: no source/live import, masks or temporal frames yet. The supported 8-bit RGB/RGBA PNG path is bounded and uses Node/zlib rather than perturbed browser readback; other formats remain explicit gaps.

Validation: full Windows/isolated-Brave verification passed 133 Node tests, all 372 shared combinations and the independent visual viewer suite. Controlled identical, single-pixel-changed and geometry-mismatch cases, real archived 1000x900 images, synchronized scroll, zoom/overlay, keyboard focus and narrow/large-text layout passed. The viewer preserves originals and raw metadata warnings. Source/live import, color-managed perceptual metrics, masks and frame sequences remain later work; no mask is applied implicitly.

### 6. Build automatic contextual element extraction

- [ ] Begin with ordinary DOM controls/cards and static glyphs; explicitly defer unsupported mechanisms.
- [ ] Capture a bounded subtree plus relevant ancestors, authored rules/variables, computed reference facts, generated layers, geometry and requested states. Inspect a scope broader than one guessed leaf to find actual visible paint.
- [ ] Preserve inheritance, `currentColor`, resource delivery (`img`, background, CSS `content`, inline SVG, mask), crop/position/size/repeat, clipping, opacity and source control state. Do not flatten every computed property into inline CSS for the renderer regression fixture.
- [ ] Sanitize content and remove live handlers/private values. Keep authored baselines separate from extension-applied styles. Preserve provenance/checksums for public assets and model origin/CORS differences explicitly.
- [ ] Produce an export manifest listing matched facts, substitutions, unavailable styles/resources, state limitations and reduced surrounding layout. Cross-origin CSS, frames, closed roots, canvas, scripts and inaccessible pixels must not silently pass.
- [ ] Compare the unthemed local rendering with the source: computed context, paint/geometry and screenshot crop under matched viewport/zoom/fonts/state. Then demonstrate that the local case reproduces the reported defect.
- [ ] Only after that gate, minimize the fixture and implement the general repair. Register the fixture, coverage status and positive/negative expectations.

Acceptance: pilot at least a transparent inline capsule, a content/mask sprite and a translated progress fill. Deliberately alter ancestry/opacity/resource delivery to prove the gate detects consequential differences. A static visual clone is useful reference evidence but is not automatically a faithful heuristic test.

### 7. Optimize test execution using the timing evidence

- [ ] Rank measured costs; reduce redundant CDP round trips and batch independent style/pixel reads.
- [ ] Avoid repeatedly exporting the entire screenshot matrix during a small iteration while retaining images required by pixel assertions and selected reference/failure captures.
- [ ] Reuse owned browser infrastructure between suites only after proving fresh documents, renderer code, rules, caches and cleanup remain isolated.
- [ ] Replace redundant waits with observable bounded completion where equivalent; retain temporal coverage and stability assertions. Do not merely reduce frame counts/timeouts to produce a speedup.
- [ ] Trial bounded parallelism only for independent non-timing cases after rule/storage/artifact isolation. Keep performance and animation measurements free of competing workers.

Acceptance: repeated comparable before/after measurements show an improvement with identical required assertions and no added instability. Record machine/browser conditions and distributions, not one best run.

### 8. Profile and optimize page rendering, Amazon first

Detailed investigation plan, updated 13 November 2026. This is the next performance work; unfinished extraction, archive and test-runner projects above are not prerequisites. The [repair procedure](RENDERING-REPAIR-WORKFLOW.md) remains the single capability table. Preserve the current appearance; Amazon quantity/wishlist visual repairs are explicitly out of scope.

#### Starting evidence and unanswered questions

| Evidence already retained | What it establishes | What remains unknown |
| --- | --- | --- |
| Public Amazon.es source/application/scroll profiles, `amazon-performance-1794572364039` | Substantial style work occurs on extension stacks. The first computed-style getter in `originalTransitionColors` can pay for earlier invalidation; the function name does not establish an expensive animation API. | Which mutations force that work, how much repeats, and which work delays visible content versus an offscreen scan. CPU sampling adds overhead. |
| Public queue observations, `amazon-queue-benchmark-1794573308352` | Neither observed workload drained within 45 seconds; each accumulated about 33 seconds of style work. | A valid live speed comparison: the documents had 7773 versus 7510 nodes and different images. Equal node counts alone would also be insufficient to establish equal work. |
| Existing synthetic catalogue, `sampling-benchmark-1794573044850` | Keeping the authored scheme for an entire idle callback reduced complete-scan median from 2737ms to 2296ms in six samples per version. | The size of any Amazon benefit. This is complete background-scan timing, not first-visible-response latency. |
| Bounded-group follow-up, `source-sampling-1794577572277` | Six trials/version reduced local heavy-catalogue complete-scan median from 5329ms to 1463ms, retaining inspected work and source sampling; only Simulated Native uses the accepted group of up to 16. | Initial useful paint and live loading/scroll/carousel benefit. A faster background scan is a separate outcome. |
| Final complete verification, session `92d793b2-78db-48fe-97f0-133e4749264d` | Current code passed 140 Node tests, 372 shared combinations, the new Simulated Native source-scheme guard and the other complete checks. All 28 canonical PNG pairs had zero changed pixels; the global fixtureHash warning remains because a fixture was added. | Live smoothness and temporal acceptance of the reported Amazon context. Local preservation does not establish either. |

Paths above are under ignored `research-artifacts/diagnostics/`; [PLAN.md](../PLAN.md#amazon-performance-baseline-and-first-sampling-optimization-2026-11-13) records exact sources, conditions and limitations. Start new comparisons from the current tested renderer, not from the older pre-optimization variant. The isolated scheme-sheet prototype is an experiment, not a shipped capability or an accepted improvement.

Primary question: **which avoidable work makes the current renderer block or delay useful paint during application and scrolling?** Measure three independent outcomes:

1. **Visible readiness:** first correct themed viewport, newly exposed content/menu paint, and any unadapted intermediate frame.
2. **Interaction responsiveness:** frame-interval distribution and long pauses during the same scroll/reveal sequence, with the theme continuously active.
3. **Background completion:** actual progress and completion of the observed queues, together with CPU/style work and memory. A smaller queue or earlier empty observation is not sufficient success.

Report visible/reveal latency, frame count and interval p50/p95/tails, longest pauses, style/script/task metrics separately, total versus unique inspections, queue progress and restored-state memory observations. Small frame samples and a single heap delta do not establish a latency distribution or a memory leak.

The baseline is **no website theme**, compared with **Simulated Native and separator level Off**. Separator Off does not mean the extension is disabled. Native's debugger renderer is neither changed nor used as the no-theme baseline.

#### User-facing scenarios — loading, scrolling and carousels

Reporter clarification, 13 November: measure the experience of using Amazon, including average loading time and working carousels. These are required live scenarios, not acceptance already supplied by the local scan benchmark.

| Scenario | Measurement and functional check | Conditions kept separate |
| --- | --- | --- |
| Navigation with the intended rule already saved | Navigation-to-main-content readiness; browser content-paint timings where available; navigation/load events as supporting facts. Record whether content is actually visible and controls usable. A load event or active-theme marker alone does not establish a correctly painted, responsive page. | Fresh profile/cache versus repeat navigation; ordinary source page versus continuously themed navigation. Enabling a theme after navigation is a separate scenario. |
| Scroll while initial work is pending | Repeat a fixed route using the same input method, distances and duration. Retain actual positions, viewport/content height, frame-interval distribution, longest pause, long tasks and newly exposed-content readiness. | Initial-busy scrolling versus genuinely settled scrolling; page scrolling versus a nested scroller. More lazy-loaded content changes the workload. |
| Settled scroll | Repeat the declared route after the completion predicate is met. Observe stale/unadapted content as well as timing. | If completion is not observed within the budget, mark this scenario unavailable; do not rename an early scrolling trial as settled. |
| Carousel navigation | Use real browser input on the same visible previous/next controls in a declared sequence. Observe input-to-content-change latency, completion/settling, frame intervals during movement, item/position progression and reversal. A click acknowledgment alone is insufficient. | First exposure/lazy loading versus subsequent moves; animated versus reduced-motion setting; automatic rotation versus explicit input. Missing or non-equivalent carousels are unavailable, not passes. No product navigation or shopping actions. |

For loading, retain every trial and report the arithmetic mean, median, range, failures and timeouts. Start with a small pilot to fix the protocol, then use at least six trials per comparable condition in balanced order; do not publish a tail percentile from six loading samples. For scrolling and carousel movement, retain individual frame/interaction samples and report p50/p95 only when sample size supports them, plus the worst pause and missed/incorrect actions. A custom click-latency measure is not automatically the page's INP. Primary user-facing trials run without CPU profiling; collect attribution profiles separately.

The routine source control has the extension loaded but no website theme applied. For initial-loading attribution, also include an extension-absent control when the launch harness supports it; otherwise record that missing control. It distinguishes an ordinary page from possible inactive-extension overhead. Compare the accepted renderer with its predecessor separately from these source-versus-theme measurements. Keep the browser foreground, match viewport/zoom/motion, and retain structural/resource differences. A changing public page can support descriptive observations; a causal percentage requires comparable workloads and repeatability. Visible-paint acceptance still needs appropriate evidence; computed facts are proxies and live capture consent remains unchanged.

#### Phase A — establish a comparable measurement contract

- [ ] Check branch/worktree, source/fixture hashes and the initialized renderer identity/settings outside timed regions. Record browser product, OS, viewport, DPR, zoom, motion setting and browser refresh/frame conditions. Keep source and instrumented-copy fingerprints distinct.
- [ ] Separate fresh-profile navigation with a rule already enabled, enabling the theme in an already loaded document, scrolling while initial work is pending, and genuinely settled scrolling. Do not repeatedly turn the theme Off/On and call every subsequent scroll steady state. A fresh browser profile does not clear OS/GPU/proxy caches.
- [ ] Begin with the existing public anonymous Amazon.es reference. Record structural fingerprints, actual node/image counts, geometry, relevant source-style facts, asset/readiness changes and the action sequence before/after each trial. If content changes materially, retain the result but exclude it from paired speed claims. Never compare different pages by dividing duration by node count alone.
- [ ] Use deterministic local content for exact pairs. Preserve authored baseline facts, inherited/system colors, native controls, `currentColor`, generated layers and resource delivery. Synthetic workloads remain visibly separate from a faithful public-page reduction.
- [ ] Use unprofiled trials for primary latency/frame comparisons; collect short CPU profiles separately for attribution. Measure A/A repeatability and instrumentation overhead before judging a candidate. Do not add inclusive function costs, or script/style/task durations, as if they were disjoint costs.
- [ ] Retain the full result and mismatches from every requested trial. Unknown readiness, unavailable CSS/resource evidence and inaccessible frames remain explicit. A source/layout mismatch is a measurement problem to correct before a renderer optimization.

**Output:** one experiment record with fixed content/actions, conditions, current hashes, measurement windows, A/A variability, completion predicates and explicit exclusions. Do not add a general benchmark manager.

#### Phase B — attribute the cost with minimal instrumentation

Use the existing CDP connection, CPU profiles, metrics and ignored investigation scripts. The queue probes used in copied extensions are diagnostic-only; no equivalent production interface is assumed. Add only the bounded counters needed for the current hypothesis, and compare their overhead with an uninstrumented run.

| Priority / hypothesis | Experiment that can confirm or reject it | Candidate only if supported |
| --- | --- | --- |
| 1. Root scheme transactions and paint-rule writes repeatedly invalidate large style contexts | Correlate scheme exposure/restoration, marker/rule writes and the next style read. Compare equivalent small/heavy CSS at fixed DOM size, then fixed CSS at different DOM sizes. Isolate scheme and rule-write costs in diagnostic variants; ablations that omit paint are attribution probes, never speedup candidates. | Fewer source-context transactions or a validated change in stylesheet ownership/read-write batching. The existing scheme-sheet prototype must be compared with current code and pass lifecycle/cascade controls. |
| 2. The same nodes/subtrees are inspected repeatedly | Count total and unique inspections, scheduling reasons, root coalescing and revisits per interaction. Distinguish genuinely changed state from reprocessing an unchanged descendant of an already queued ancestor. | Coalesce redundant work within the same document/root; preserve shadow/frame boundaries, new mutations and prompt state paint. |
| 3. Sampling interleaves writes and reads or repeats the same facts | Attribute cost around `inspectLocal`, `inspect`, viewport collection and applying generated rules. Track synchronous read/write phases without wrapping every style getter by default. | Batch compatible reads/writes or cache immutable facts within a validated sampling epoch. Never reuse a live style object or cached source facts across an invalidating change. |
| 4. Invisible/background work competes with useful paint | Record visibility categories, viewport versus background time, timeouts and progress during scrolling. Distinguish `display:none`, offscreen content, `display:contents`, transparent controls and nested scrollers. | Defer only work proved unnecessary now, with a tested path that paints revealed content before its first visible frame. Do not classify opacity-zero activation controls as irrelevant. |
| 5. Resource/decode or transition work is a remaining bottleneck | Investigate bounded image/SVG/crop queues, cache misses or actual transitions only if traces show material cost after the leading issues are addressed. | Deduplicate legitimate work without disabling repairs, weakening resource bounds or making cache invalidation stale. |

Queue roots, inspected nodes and painted markers are different quantities. `pending.size` is not a remaining-node count; an iterator can hold a large subtree. `marked.size` is not completed inspections because a correctly inherited result may need no own marker. Record actual progress separately.

An expensive first computed-style read can flush earlier writes. Do not optimize or remove transition handling merely because its function owns that sample. Costs of diagnostic ablations interact; their differences are evidence, not additive accounting.

Reporter follow-up: the current profiles do not justify a WebAssembly port. The measured leading cost is browser style recalculation after sampling/invalidation, which translating the surrounding JavaScript would not remove. Consider a small Wasm experiment only if a separately timed, batched numeric/pixel kernel dominates actual latency after DOM/style work is separated. Include transfer, call and startup costs, retain identical results, and compare against optimized JavaScript. Frequent per-element crossings are not an assumed win; see [Chrome's Wasm integration guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/wasm/cpp-on-the-web?hl=en). No Wasm toolchain or production dependency is proposed now.

Before another performance change, the next bounded live probe should distinguish viewport calls by trigger (scroll, mutation, root refresh, state and resource completion), total/unique elements scanned and inspected, source-scheme/sheet/marker changes, and actual paint-rule writes. Time the read/write groups rather than wrapping every getter. In the earlier static 1512-node matrix, 1660 inspections of 1508 unique nodes and nine paint-rule writes stayed fixed while heavy CSS raised median style work from 1412ms to 3788ms; source-scheme transactions also increased as callbacks did less work. This supports costly invalidation, not a claim that final declarations are rewritten thousands of times. Live repetition and trigger attribution remain unmeasured at this detail. The remaining foreground path is flushViewport/paintVisibleSurfaces/inspect, separate from the optimized background grouping.

**Output:** a ranked cause table with supporting trace locations, repeated/unique work, uncertainty and a negative/control experiment. Stop expanding instrumentation once one mechanism can be reproduced and evaluated.

#### Phase C — reproduce the leading mechanism and screen one change

- [ ] Start with a four-cell local experiment: two measured DOM sizes and two CSS complexities, with equivalent visible presentation for the CSS pair. Extend the existing catalogue minimally; add a separate fixture only for a mechanism it cannot represent. Increase to an intermediate size or dynamic mutation scenario only when the first matrix justifies it.
- [ ] Keep a source/preservation control alongside the slow positive. Vary one cause at a time: scheme transaction, overlapping roots, a repeated source read, or background scheduling. Preserve final work and source fidelity; doing less required rendering is not a performance improvement.
- [ ] Implement one candidate in an isolated copy. Prefer eliminating confirmed repeated work over changing scheduling budgets. Keep the currently validated group limits and soft 6ms budget unless a separate measured experiment justifies another policy and demonstrates responsiveness preservation. The source-context follow-up validated up to 16 for Simulated Native only; palettes retain four. One expensive element can already exceed that budget.
- [ ] For invalidation/caching changes, test ancestor and element class/style changes, inheritance, hover/focus/active/disabled states, inserted/removed content, native controls, SVG/generated layers and affected frames/shadow roots. A cache scoped to unchanged synchronous reads is a different proposal from a persistent cache.
- [ ] For hidden/offscreen deferral, additionally test reveal by direct style, an ancestor class, a menu opened inside a page rAF callback, keyboard focus and nested scrolling. Source context must be available and the first visible frame themed. `display:contents` and transparent functional controls are preservation negatives, not automatically skippable work.
- [ ] Register any new unusual mechanism in fixtures/cases/coverage and the rendering guide; keep unresolved live confirmation pending. No Amazon hostname, proprietary selector or framework class enters renderer policy.

**Screening:** use three comparable local pairs to reject weak candidates quickly. If promising, predeclare the meaningful improvement and allowed regression margins from A/A repeatability, then use six paired trials per version in balanced order. Retain cold/warm groupings and all trials; report medians, ranges, per-pair direction and frame/latency tails. Repeat an inconclusive comparison only after identifying a confound or changing the experiment, never until it turns green. Do not claim statistical significance from a handful of runs.

#### Phase D — verify preservation and return to Amazon

The following existing commands are available; selectors include their registered atomic companions:

```powershell
npm.cmd run verify -- --list-cases
npm.cmd run verify -- --cases dynamic-catalogue-workload,nested-job-pane-scroll,scroll-default-link-stability,native-return-boundary
```

- [ ] Add/check the mechanism-specific expectations, including visual and first-frame controls where relevant. Keep local originals and compare pixels without masks/tolerance changes that hide the defect. Check all affected custom themes and border levels, source restoration/Off, state transitions and exclusions. Structural classification/scheduling changes usually require broader controls than this starting selection.
- [ ] Repeat the comparable public action sequence with current code and the accepted local candidate, using no parallel workloads. Treat page variants, ongoing lazy loading and differences in assets/layout as separate cohorts or gaps. If equivalent public conditions cannot be obtained, report a local optimization with live confirmation pending; do not relabel it an Amazon fix.
- [ ] Distinguish initial-busy and settled scrolling. A live queue need not become empty for the visible experience to improve, but reduced first-viewport latency cannot excuse stale offscreen work or delayed revealed content. Check both outcomes.
- [ ] When a concrete change is ready, run one complete `npm.cmd run verify -- --browser` on the final source tree and retain its hash-sealed report. Do not repeat the full suite for every hypothesis or for prose-only edits. Update the intermittent active-selector counter only from the complete runs already required; a non-recurrence does not establish its cause.

#### Bounds, interpretation and decision rules

- Reuse the existing 45s application-observation budget initially. If work remains, report "not observed complete within 45s" with progress/CPU facts; never substitute 45s as its completion time or call a smaller unfinished queue a win. Longer observation requires a concrete diagnostic reason, not a larger timeout to manufacture success.
- Observe declared scroll windows and collect short diagnostic CPU profiles separately. Record actual positions, document height, frame count and intervals. An rAF trace is a proxy, not a measured monitor FPS guarantee; tracing/profiling overhead belongs in the report.
- Completion must account for the active preset, the deferred document refresh and relevant scan/viewport timers. Resource/animation/iframe work not covered by the probe stays unknown. Zero observed queues at one instant is not universal quiescence. Use actual bounded transitions for functional assertions, not shorter sleeps or a fixed frame count.
- Reject a candidate that merely skips required assertions, leaves work stale, changes paint policy, introduces new flashes or increases unbounded memory. Do not trade first-frame interaction correctness for a faster final screenshot. Preserve original shadows, geometry, icon/image content, semantic edges and reversible cleanup.
- A **local mechanism improvement** requires repeatable gain beyond measured noise and preserved behavior. **Amazon performance closure** additionally requires comparable public/original-context evidence for the relevant visible/scroll scenario. Keep these statuses independent.
- No live labels, DOM content, screenshots, account state or network secrets are exported by default. Preserve public/local provenance, bound tracing/counters and sanitize URL parameters. Live visual/label evidence requires the existing explicit opt-in. Use the isolated profile, not the user's personal browser state.
- Do not add retained-profile modes, a general extractor, frame archive, worker framework or dashboard unless a specific experiment is blocked without it. Other sites remain preservation controls; BOOTH/Indeed profiling follows after the leading Amazon mechanism is addressed.

**First controlled matrix completed, 13 November:** three trials per cell at 512/1512 actual nodes and 0/128 equivalent matching CSS rules. Total/unique inspections stay 660/508 or 1660/1508 respectively, independent of CSS complexity. Median complete-work times are 381/838ms for small simple/heavy CSS and 2278/5081ms for large simple/heavy CSS. Repeated inspections are a fixed 152 in this workload, while style cost grows strongly. Source/themed simple/heavy PNGs are identical. Counter overhead is not distinguishable from the observed three-sample baseline variation; this does not establish zero overhead.

An attribution-only copy omitting root scheme sampling reduces large/heavy median style work from 3788ms to 26ms, but changes 2882 pixels of the native batch button. This strongly supports investigating source-scheme invalidation; the altered policy is not an acceptable speedup. Exact records and failed instrumentation attempts are retained in PLAN.md. The optional matrix variants are now retained in the existing fixture; production renderer policy is unchanged by this investigation.

**Source-context follow-up:** direct Typed OM reads still resolve system/light-dark colors under the active scheme. Stable-rule and separate-sheet prototypes did not establish a consistent improvement. A separate bounded-group experiment retained the original scheme sampling and found a repeatable improvement at up to 16 samples for Simulated Native, with unchanged inspected work, six balanced trials, callback/frame observations and local native/inheritance pixel comparisons. Palette groups remain four. Detailed validation and live-measurement gaps are in PLAN.md.

**Viewport attribution, 13 November:** two bounded anonymous public observations now retain counters in copied renderers and a sanitized style trace. The first traced scrolling window has 319 UpdateLayoutTree events totaling 2473ms, versus 81ms Layout and 61ms sampled GC trace slices; nested costs are not additive. Some recalculation touches more than 7000 elements. One instrumented window visited about 137000 nodes across viewport/new/dirty passes and inspected about 15700 (not unique), with broad refreshes revisiting many elements. The coarse observed-mutation revision does not prove those revisits were unnecessary. A second observation counted 26 script-only head change notifications and five root-style changes during traced scrolling. These source events request broad refreshes; asynchronous invalidation costs can fall outside the immediate probe scope. CPU profiles alone do not expose that causal detail.

A candidate ignoring script-only head mutations was tested on an isolated copy and rejected: authored relational CSS can depend on the presence of those scripts. The new synthetic head-dependent/independent controls in source-scheme-sampling and the portable source guard preserve this counterexample. Current production passes; the candidate leaves source ink stale. No change to production scheduling, paint or cache policy is promoted. Exact results/limitations are in PLAN.md. Traced and untraced diagnostic windows contain changing live content; they do not measure tracing overhead or a live speedup. Initial-load averages, genuinely settled scrolling and carousel-input trials remain pending.

**Shared-viewport-context experiment:** the saved counters expose three to four duplicate source-scheme exposure pairs per observed scroll window. A lazy Chromium-only context shared across dirty/new-content passes was screened, then measured in six balanced local trials/version. Fixed-action median fell from 728ms to 589ms; observed complete work from 2372ms to 2213ms. Final pixels/facts and 21 separate source-state comparisons matched. All candidate trials inspected 2296 elements; one baseline inspected 2295, the others 2296. This strict work-count discrepancy remains explicit. Counter overhead was not calibrated against a plain run, and these are not Amazon figures.

Full candidate verification subsequently failed the existing static/opacity SVG tint-equality assertion. The runtime change was rolled back to the exact prior initializer rather than weakening the assertion or accepting the narrow passes. The cause is pending comparison with the original renderer and source-ink/backing evidence. The new late-control/scroll guard remains as a preservation check, and the failed full-run evidence is retained. A next prototype should separate target collection, source-fact reads and paint application while preserving the image/transition context; simply holding a global source context longer is not accepted. Do not pursue fresh timing claims until that preservation gap is understood.

**Phased implementation completed:** Simulated Native now collects geometry under current paint, samples/classifies targets into update records and restores the source context before applying them. Dirty/new targets share a deduplicated local batch. Visible new shadow trees are collected before sampling, including selected hosts and dirty-only updates. Palette sampling remains on its prior path. New open/closed first-frame and static/opacity image guards, 21 exact A/B snapshots and final complete verification pass. Six plain local pairs show action median 723ms to 565ms and complete-work median 2293ms to 2150ms; these are not Amazon percentages. Final public observations still show substantial style work and scroll pauses. Exact fingerprints, runs and limits are in PLAN.md.

**Further sampling experiment, not promoted:** same-value stylesheet setters did not trigger recalculation in the bounded synthetic probe. Fixed larger groups improved scan completion but increased individual callback costs. A second observed-cost prototype keeps the first Chromium group and, only after a group already takes 16ms, adds a single 4ms target of smaller follow-up groups. Six plain local pairs on the approximately 6012-node heavy-CSS catalogue reduce complete-work median from 23946ms to 9099ms, with unchanged final facts/pixels. The fixed scroll/insertion action median is essentially unchanged and does not meet the reused harness's 10% action-reduction gate. All 21 stressed three-theme preservation comparisons match. This is a local completed-scan result, not a live load/scroll result.

An unprofiled same-document Amazon crossover retains three trials per policy, matching executing identities and complete cleanup. All six still have queued work after the declared 45s post-action observation; style work remains about 36–38 seconds during each roughly 49-second action/observation window. Partial source paint hashes and sampled positions vary despite later stable DOM-shape hashes. Post-observation scrolling is not settled scrolling. The prototype remains in ignored research files; production scheduling and the last complete browser verification are unchanged. PLAN.md records exact evidence, rejected candidates and limits.

**Queue/selector follow-up:** the bounded live queue probe records 1535 requests but only one started, unfinished document scan, so it does not establish repeated overlapping-scan savings. Clock/frame-based background-scroll deferrals remain unaccepted. A specificity-preserving generated-selector prototype gives a strong isolated 1000-rule benefit, but six balanced actual-renderer pairs with 293 paint entries/499 rules reduce style work by 19.846% and complete work by 12.119%, missing its prospective 20%/15% gates. Interaction is essentially unchanged; low-rule controls and all outliers remain recorded. No prototype is shipped. The existing catalogue now retains `colors=varied` alongside its shared-color default, with all-theme functional/source/geometry/UTF-8/offscreen checks rather than performance assertions. Exact reports and limits are in PLAN.md.

A separate synchronization defect was reproduced in complete and isolated Soft dark sprite-cohort checks. Causal copies show all crops ready together, followed by idle painting before their queued visible pass; the 200ms publication deadline did not fire. Publication now requests the existing pre-paint flush so visible cohort work stays ahead of idle sampling. The unchanged three-theme case and fixed attribution copy record 0/32 without intermediate counts. Limits/colors/geometry are unchanged. This is a local ordering repair, not promotion of a performance prototype or live loading acceptance; complete verification is recorded in PLAN.md.

**Component attribution, 14 November:** current-code local measurements now separate same-window browser counters from aggregate function timers and a separately sampled profile. Three ordinary synthetic runs have medians 4075ms complete work (including 200ms quiet confirmation), 2829ms style, 539ms script and 12ms layout. Three instrumented controls measure 1857ms inspection including native style reads, 83ms collection, 18ms applying CSS/markers and 78ms for four selected numeric helpers after subtracting nested helper time. These costs overlap and are not an additive partition; the selected helpers do not bound all worker-ready computation. An additional three-run getter control attributes about 1221ms to reading transition properties and zero calls to animation enumeration in this no-transition fixture. The expensive getter exposes style invalidation; removing it can move the flush to another reader. Worker/Wasm construction remains unjustified by these measurements alone. Full results, instrumentation effects, exact executing identities, cleanup and old profiler-window limitations are recorded in PLAN.md. Public availability was rechecked and still fails the normal-page requirement.

**Live measurement follow-up, 14 November:** a longer normal-page gate corrected a premature availability check: the tiny complete document can be transient, and the normal public page is reachable. Six fresh-profile navigations per condition now provide descriptive normal-DOM-ready means/medians (not full usability); a same-document comparison uses real scroll gestures and carousel next/previous input. Themed queues remain active after the declared 45s pilot budget, so settled themed browsing remains unobserved. Two final A/A controls pass, but later body/resource changes prevent the full six-pair fixed-reference verdict. Five snapshot-matched pairs are retained only as a separately labeled exploratory cohort analysis, with one pair excluded and every raw result preserved. Observed source/theme medians are about 4.17/5.70s for the warmed-document activation/scroll scenario, 0.32/3.43s style work and 0.70/1.05s host carousel input-to-observed-settling. These costs/scopes overlap, include observation overhead and do not establish a universal slowdown ratio, monitor FPS, INP or visual acceptance. See PLAN.md for exact scopes, failed gates, loading outliers and retained evidence.

**Next task:** isolate the remaining source-sampling/global invalidation cost using the now reachable normal document and comparable states. Keep source, earlier-renderer and current-renderer controls distinct. The strict original fixed-reference interaction verdict, continuously themed settled scrolling and full usability are still incomplete; do not replace them with the exploratory matched-cohort or DOM-ready proxies. Do not infer paint equivalence from coarse mutation epochs or repeat rejected queue/group-size/context-holding policies without a new hypothesis. Source-context fidelity remains mandatory; native controls, authored/explicit schemes, inherited links, important-cascade priority, source restoration, image/backing/transition lifecycle and frame-boundary checks remain preservation controls. Any local/subtree sampling proposal must establish its original scheme/inheritance context, not assume `normal` or `light`. Complete the loading/scroll/carousel contract above before claiming live closure. No visual Amazon repair or additional infrastructure phase is implied.

## Diagnostic reliability extension — 13 November 2026

The [detailed reliability design](DIAGNOSTIC-RELIABILITY-DESIGN.md) adds retained failure bundles, executing-renderer identity, controlled instability experiments, cleanup checks and interaction-drift checks. Failure evidence is implemented first because the full-run/border-only discrepancy currently lacks exact facts. Shared runs now retain unique manifests/results/failures and precise active-selector predicates, and append startup/evidence/cleanup timings. Named-case selection is now available with atomic companions and per-unit timing; separate shared pixel-phase timing remains incomplete. Initialized runtime identity is also available in captures and shared failures, with explicit function-source/HTTP/reload limits; explicit fresh-browser repeated named cases are available; retained-profile/prefix repeats and lifecycle/drift extensions remain planned; no new production rendering policy is included. Validation is recorded in PLAN.md.

## Next-session starting point and residuals

Reporter clarification on 13 November: the four review follow-ups precede Amazon performance, not every unfinished tooling step above. Those follow-ups are recorded in PLAN.md. Amazon visual quantity/wishlist adjustments are explicitly deferred. Follow [the concrete performance investigation](#8-profile-and-optimize-page-rendering-amazon-first) using existing tools; build another subsystem only for a demonstrated blocker. A bounded sampling-context optimization is locally verified, while the anonymous public page still retains substantial queued/style work; do not call Amazon performance resolved.

Use the verified capabilities and retained evidence in the working procedure. Remaining unchecked tooling items stay in the backlog; the reporter's current performance priority above governs the next work. No version bump or push is implied by this plan.

Retain these unresolved reports: small Docs Share/Editing indicators; Amazon Quantity arrow and complete wishlist joined-frame weight; GitHub counter iframe startup/theme-handoff flicker; Amazon performance first, followed by BOOTH/Indeed and sequential repairs. They remain pending in the regression inventory; this process plan does not close them.

At each completed step, update the capability table and exact commands in the working procedure, link the evidence in PLAN.md, and retain unresolved gaps. The procedure should describe shipped developer tooling, not future intentions.


Fresh-browser repetitions are now implemented as a separate reliability slice (`verify --cases IDS --repeat 2..10`) with per-attempt logs/evidence, compatible-source/isolation checks, work budgets and nonzero mixed/incomplete outcomes. This is sequential diagnostic repetition, not parallel execution or a release retry policy. See [the detailed reliability design](DIAGNOSTIC-RELIABILITY-DESIGN.md#3-repeat-unstable-cases-under-explicit-conditions) and PLAN.md for reset semantics, cooperative-timeout validation and remaining retained-state/prefix replay gaps.
