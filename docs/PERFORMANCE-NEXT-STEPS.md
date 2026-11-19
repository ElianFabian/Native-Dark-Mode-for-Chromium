# Performance work after the Fable review

External research and further architecture options: [Further renderer performance](PERFORMANCE-WEB-RESEARCH.md). This separates browser mechanisms from unvalidated optimization hypotheses; it does not change the experiment outcomes below.

## Current assessment and next decisions (18 November 2026)

This section supersedes the proposed next steps at the end of individual historical experiments below. Those sections retain the reasoning at the time; they are not parallel commitments to build every proposed prototype.

### What the evidence supports

- Keep the existing production optimizations and the verified signature-input repair. The later experiments have yet to clear production validation. The settled Amazon diagnostics now confirm that source-ink batching executes during scrolling. The observed carousel makes no source-ink reads after settling.
- Pending-root coalescing reduced accumulated idle work by 21.6% in its balanced crossover, with little change in the largest frame and a paint failure. Source-ink batching reduces work in fixed color-invalidation workloads, with smaller gains in a local interaction test. These experiments identify where time can be saved and which correctness or comparison gaps remain.
- Additional signature checks can consume the benefit of skipped classification. The subtree precheck skipped 1,382 classifications per cycle but reduced total idle work only 3.4%. Optimize the cost of a complete operation, including validation, rather than a convenient counter.
- Source/output separation has a promising extraction microbenchmark and a demonstrated invalidation gap. The toggle reference differs from production local sampling; rebuilding, extra matching, resource access, fallback and all other classifications still cost time. Full source validation loses at scale. An ancestor dependency map would not solve unobserved CSSOM changes and requires a reliable way to identify source roots in the first place.
- The 22.62% rule-match count and 20/24 inherited-color observations are leads, not savings estimates. Calls have unequal cost; the latter is a concentrated sample representing 4.46% of recorded calls, and historical counts are associated with final-state styles. Identical colors do not imply identical backdrop, geometry, semantic role or final output.
- Source stability at interaction boundaries does not justify cross-task caching. State, ancestors, resources, animations, reparenting and changes between samples remain possible even when stylesheet text is identical.

We have not established a performance ceiling. We also have not established that the mirror architecture is the best remaining investment. The recent work increasingly measured prerequisites of that architecture rather than the loading, scroll and carousel delays the user wants reduced.

### Revised order

1. **Reconnect the decision to the remaining slowdown.** Inventory existing traces tied to the current production source seal before collecting more. Use the existing controlled harnesses to fill only the missing current measurements: plain/disabled versus Simulated Native for fresh loading, vertical scroll, and equal physical carousel actions. Keep loading separate from warmed interactions. Record content/geometry, readiness definition, main-thread blocking, frame intervals and queue-drain work; inspect an A/A control for ordinary variation. Do not compare different Amazon variants as though they were fixed-content pairs or call maximum rAF intervals INP.
2. **Locate the costly work in those delayed frames/tasks.** Separate traversal/queue handling, source exposure and reads, signature validation, classification, output writes, browser style/layout and paint. Use nested trace attribution without double-counting browser work inside JavaScript timers. Resource completions and repeated root scheduling need reason counts only if they explain a material share. Existing counters are reusable; a new general metrics framework is unnecessary. Diagnostic overhead must be absent or matched in the performance comparison.
3. **Choose one intervention from that attribution.** If source exposure dominates the delayed work, pursue a narrow source-sampling design with an explicit lifetime and fallback contract. If redundant scheduled work dominates, return to coalescing only after batch-independent source correctness. If validation consumes the savings, address validation cost without dropping dependencies. If frame delays come from one oversized group, test a smaller group or scheduling change with transient-paint controls. Fewer idle milliseconds alone do not establish smoother interaction. A larger hybrid rewrite stays deferred until measured avoidable time justifies its additional cascade/resource machinery.
4. **Require a complete, bounded experiment.** Specify the expected mechanism and baseline before editing; retain all failed/missing trials. Validate the existing inheritance negative, source-scheme/signature controls and relevant inline/variable/currentColor/reparenting/resize/shadow controls before live timing. A source-color correction may intentionally change defective output, but needs an independently justified expected result and unchanged preservation controls, not a blanket pixel waiver. For promotion retain the existing relevant work gates (10% normalized loading work or 15% carousel idle work), no material comparable readiness/stall regression, and a demonstrated benefit in the user-facing scenario being claimed. Effects must exceed observed A/A variation. Run complete sealed browser verification only after a production candidate earns promotion.

### Scope and stopping rules

- No further broad selector inventories: enough evidence exists to require a decision based on time, correctness and integration cost rather than more match percentages.
- No default expansion of the mirror into a general cascade engine. Its current acceptance on Amazon is still unsupported. Resolve the cross-world invalidation contract before describing reuse as safe; event notifications alone or periodic checks cannot silently satisfy immediate freshness.
- Sharing within one synchronous, unchanged source-exposure transaction could reduce invalidation requirements, but remains a hypothesis. `applyRoles` changes output between groups, and `getComputedStyle` objects are live; neither a whole callback nor equal source colors automatically makes a cache safe. Never yield while source styles are exposed.
- Keep the batch-inheritance defect visible and separate from optional performance work. It blocks changes that alter sampling batches, not every unrelated optimization. No Amazon-specific palette adjustment is part of this work.
- The next deliverable is one current bottleneck decision with its supporting trace/counter evidence and one selected experiment, rather than another sequence of partial architecture probes. This review makes no new timing claim and changes no production code.

## Current bottleneck measurements and selected experiment

Measured on 18 November 2026, Windows / isolated headless Brave / Chromium 157, Simulated Native/Off. Current raw renderer initializer: `b9bbbfa6c1efdec3ca48788e7c36847382c19256b316a99b0134bd31520d307d`. Code seal `122ed1152c8fcb1b36fbed6fda7d4fa894769557549c8a3778e923bbee75248a`; fixture seal `0e78cb1c711e9c3e54c552328f5a7266356010fcdd57c021f572b698f4325d55`. Research instrumentation is separately reflected in each runtime identity. Production is unchanged.

### Existing evidence and comparison limits

`research-artifacts/current-metrics-audit.json` inventories recognized source-seal/renderer fields in retained reports. A missing/mismatched field alone does not prove a renderer mismatch. Direct hashing confirms `review-corrected-baseline.js` matches the current renderer; the baseline rows in the earlier K2 loading report remain relevant. Older disabled/themed controlled comparisons use different renderers, while recent current-renderer inventories did not supply that comparison.

The refreshed unprofiled same-document comparison (`controlled-amazon-final-1795010093782`) stops on its second source/source control: content changed despite stable sampled source paint and geometry. No themed primary trial is accepted from that run. This failure is retained, not retried until favorable comparison data appear.

### Fresh loading

`current-loading-1795010173830` records eight balanced fresh-profile trials, rule saved before navigation. Seven complete with matching runtime identity; the last disabled trial times out before normal page readiness. All owned cleanup completes and start/end source seals match. The report is `incomplete-observations`. Medians below use completed trials only; do not interpret the missing trial as zero or silently remove it from the completion counts.

| Metric | Disabled (3/4 complete) | Simulated Native (4/4 complete) |
| --- | --- | --- |
| Normal document readiness | 1,778 ms | 2,374 ms |
| Browser task time through 15 s after readiness | 4,730 ms | 9,017 ms |
| Style recalculation in that observation | 339 ms | 1,766 ms |
| Layout in that observation | 112 ms | 154 ms |

Readiness means a complete document with expected navigation and minimum DOM size, not all controls usable or all content themed. At readiness, disabled documents have 1,558–1,756 inventoried nodes; themed documents have 1,228–3,127. Content/network variation, the failed trial, different total observation lengths and only four planned trials per condition prevent an exact causal loading penalty. The top-document renderer queues are empty at the final observation in every completed trial. Browser metrics include page work and are not independent quantities to add to nested renderer timers. CPU load was not continuously monitored; a sandboxed CIM snapshot was unavailable.

### Phase attribution

`current-phase-cost-1795010475372` uses synchronous nested timers around existing renderer functions, reporting inclusive and child-subtracted exclusive times. All behavior is preserved; instrumentation overhead is real. Two source controls plus two disabled and two themed primary trials complete, with matching identities and cleanup. Source/source content repeatability fails, so the report explicitly remains `complete-attribution-only`, never an accepted speed comparison. The scenario is activation followed immediately by scrolling on a warmed document, then physical carousel next/previous actions; it is not settled continuous-theme scrolling.

In its two themed trials, `inspect` accounts for 3,821–3,829 ms during activation-and-scroll, visible-target collection 617–639 ms, signatures 141–148 ms and output application 13–27 ms. Viewport flushes reach 731–734 ms; single inspections reach 157–161 ms. Carousel inspection work is 1,183–1,218 ms per pair. These costs include synchronous browser style/layout inside the timed calls. They do not identify pure JavaScript mathematics as the bottleneck. The browser reports 3,218–3,257 ms of style work during scrolling; this overlaps renderer timers and must not be added to them.

Two preceding attribution attempts are retained: `current-phase-cost-1795010342218` has a generated-renderer syntax error and supplies no valid costs; the harness now compiles the generated source before launching. `current-phase-cost-1795010414280` times out before a normal public page; one bounded retry produced the diagnostic report above. Neither failure is a completed measurement.

### Focused source-read attribution

`current-source-read-cost-1795010620392` adds nested attribution for source-image ink, transition source reads, artwork capture, color classification and text backdrops. Its two source controls and two themed diagnostic trials pass the existing content/geometry/source-restoration/action checks. Runtime identities and source seals match; cleanup completes. It is still an instrumented, small, fixed-order diagnostic on one page, not an unprofiled speedup result.

| Timed operation | Activation + scroll, two trials | Carousel next/previous pair, two trials |
| --- | --- | --- |
| `originalImageLabelInk`, inclusive | 917 / 808 ms (28 / 31 calls) | 435 / 452 ms (12 / 12 calls) |
| `inspect`, inclusive | 3,271 / 3,056 ms | 1,440 / 1,460 ms |
| `applyRoles` | 12.5 / 11.1 ms | 3.7 / 3.4 ms |

Do not sum these nested costs. `originalImageLabelInk` disables the entire theme sheet to recover original inherited text ink, calls `originalTransitionColors`, then restores the sheet. Most of its measured duration is charged to that nested helper, whose first operations read computed transition properties. This is consistent with deferred style recalculation being paid on the first property read; it does not establish that animation enumeration or transition mathematics itself is expensive. Individual source-ink calls reach approximately 47–52 ms. Timer data do not separate cache hits/misses or include all subsequent restoration invalidation cost.

**Selected experiment:** batch uncached original image-label ink reads within a single synchronous sampling transaction where possible, preserving current invalidation and transition-destination semantics. First use a restricted reproduction with several image-backed labels, explicit/inherited/inline/variable ink, source changes, transitions and a non-image control. Compare exact source snapshots and intermediate/final paint against the current helper. A previously known label set may support one shared source exposure; newly discovered labels must retain a conservative fallback. Do not pre-read arbitrary text across the document or keep unvalidated source ink across tasks. Measure probe count and inclusive transaction cost, including discovery, source restoration and ensuing style work. Never yield while the sheet is disabled.

At selection time this experiment was not implemented; the prototype and subsequent evidence are recorded below. The attributable helper cost is meaningful enough to test a local batching intervention before extending the mirror architecture. It cannot remove all inspection work, and preserving output is essential. Require the relevant local guards, a balanced candidate/production interaction comparison and an unprofiled responsiveness confirmation before claiming improvement. The pending batch-inheritance regression remains explicit; do not accidentally broaden sampling-batch changes while optimizing this helper.

## Image-label source-ink batching prototype

Implemented the selected experiment in `research-artifacts/image-ink-batch-candidate.js`, generated by `make-image-ink-batch.mjs`; SHA-256 `8bee662921670ac6594ce755d6ccb3846faeb7f7169bfc8ec3b882ae422a3489`. Production remains unchanged. This is a Simulated Native-only research candidate, not the stylesheet mirror.

`originalImageLabelInk` records consumers in a WeakSet. At the beginning of an existing local sampling transaction, if at least two known consumers lack a cached source ink, the candidate disables the sheet once and reads their source ink into a temporary Map. The original helper consumes those values only within that transaction and populates its existing cache when actually requested. First-use/new labels and unsuitable transactions retain the original helper. The temporary Map is restored in `finally`; existing invalidation is not relaxed, no targets are removed or reordered, and no asynchronous yield occurs while source styles are exposed. Palettes retain their existing path. Speculative values that are not consumed are discarded.

### Local verification

- `image-ink-batch-1795011159521`: 18 synthetic source-value checks over fresh documents for all three themes, including inherited/explicit/inline/variable ink, ancestor mutation, reparenting and a transition change. Batched values equal direct unthemed reads, first-use fallback is exercised, and disabled-sheet state restores. Non-transition checks also assert sampled themed color restoration. The transition probe checks source values, not every animated frame. Runtime identities match and cleanup completes. An earlier successful version did not reset the fixture between themes and is superseded by this fresh-document run.
- `image-ink-batch-source-1795011168532`: all 21 broader source-scheme states have identical computed facts and zero changed screenshot pixels against production, including all custom themes. This broader harness does not itself prove the batching path is exercised.
- `image-ink-rendering-1795011355454`: the retained `large-image-label` fixture is tested through natural rendering, with added synthetic inline, variable and transition mutations. All 18 settled comparisons across three themes have equal facts and zero changed pixels. Candidate counters confirm natural batching: eight prepared values used across four transactions in the Simulated Native sequence, with first-use/fallback reads retained. Existing authored backing and small-text controls are included in the screenshots. Runtime identities match and owned browsers are closed. This is local steady-state preservation, not original-page confirmation or intermediate-frame acceptance.

### Amazon pilot

`image-ink-crossover-1795011226862` uses one copied candidate with batching disabled/enabled in baseline/candidate/candidate/baseline order after two source controls. The baseline also records known consumers, so bookkeeping and nested timing instrumentation are shared. Each primary trial resets to source paint before activation, scroll gestures and physical carousel next/previous actions. Initializer identities match; source seals are unchanged and cleanup completes.

Source/source repeatability fails due to content changes, and primary comparability flags remain false. Therefore the following are **descriptive pilot observations, not accepted speedup estimates**. All failures remain in the report; no new performance threshold or tolerance was introduced.

| Metric | Baseline trials | Candidate trials |
| --- | --- | --- |
| Activation/scroll style work | 2,875 / 2,675 ms | 2,290 / 2,316 ms |
| Scroll-window browser task work | 5,900 / 5,434 ms | 5,446 / 5,272 ms |
| Largest scroll rAF interval | 1,092 / 1,150 ms | 758 / 683 ms |
| Carousel-pair browser task work | 2,000 / 1,954 ms | 2,026 / 2,023 ms |

Candidate scroll trials prepare and consume 7/8 source inks in 3/4 transactions, leaving 11 direct fallbacks. Baseline trials have 18/19 fallbacks. Each candidate carousel pair consumes four more prepared values in two transactions. Mechanism counters establish that work is being batched. However, total carousel task time does not improve; the descriptive median scroll style reduction is about 17%, while total scroll task time falls only about 5.4%. The larger apparent frame change requires unprofiled confirmation on comparable content.

The original helper's timer drops partly because work moves into preparation. It would be incorrect to call its near-zero carousel time an elimination of source reads. Preparation and its nested style reads remain included in `inspectLocal`/browser totals; the next diagnostic should time preparation explicitly. Do not add overlapping inclusive timers. A successful optimization must lower the complete transaction cost, including additional reads, restoration and subsequent invalidation.

### Intermediate states and repeat controls

The next checks use isolated headless Brave on Windows, the retained local image-label fixture, Simulated Native/Off, and fresh production/production-repeat/candidate profiles. They sample computed paint and geometry at animation frames, check whether the theme sheet is exposed at those samples, and retain exact final screenshot comparisons. Frame facts are not screenshots of every intermediate frame.

- `image-ink-frames-1795011559694`: non-transition frame-state sequences match, but transition sequences differ in both the production repeat and candidate. Candidate final screenshots differ in approximately 205,000 image-region pixels despite matching sampled paint. No tolerance was introduced.
- `image-ink-frames-1795011662004`: extended observations include image filter, transform, dimensions and object fitting. The same image-region difference also occurs between two production runs, with these facts unchanged. Its cause remains unestablished; it is neither accepted pixel equivalence nor an established candidate regression. Ordinary transition sequences remain inconclusive.
- `image-ink-lifecycle-1795011738490`: pause animation playback and explicitly advance transitions to 0/60/120 ms, then reload the local image with 200 ms network latency. All nine candidate final states match production facts and pixels, and all nine deduplicated candidate frame-fact sequences match. The production repeat differs in its transition-end frame sequence, so the aggregate status is `candidate-matched-with-repeat-control-difference`, not a complete pass. The original aggregate classification omitted that control; it was corrected without changing raw observations. Image reload includes 24/26/25 pending-image samples for production/repeat/candidate. No sampled frame exposes the theme sheet. Natural batching is exercised, but the unresolved ordinary-transition and image-capture differences remain open.

### Unprofiled Amazon confirmation

`image-ink-unprofiled-1795011812634` removes nested function timers and the CPU profiler; both policies retain the same research counters and queue observations. Its second unthemed source control fails source-content and scroll-content repeatability while sampled geometry, source paint and action checks remain stable. The strict gate stops the run before candidate performance trials, without retrying for a favorable result. Runtime source seals remain unchanged and cleanup completes. This run supplies **no accepted Amazon speedup estimate**.

### Decision

At this stage batching stayed in research. The fixed workload established a substantial reduction under repeated source-color invalidation and the follow-up found a smaller work reduction during a local carousel class change. The subsequent warmed Amazon comparison below supplies comparable scroll evidence. The batch-inheritance defect remains a separate pending issue.

### Fixed-workload cost confirmation

`image-ink-fixed-1795011935508/results.json` and `summary.json` retain eight complete trials in baseline/candidate/candidate/baseline/baseline/candidate/candidate/baseline order on one fixed document. This synthetic workload repeats the retained fixture's three-card group 120 times (2,530 DOM elements), warms four color changes, then toggles a body class that changes label color 12 times per trial, waiting for the observed renderer queues after each change. Both policies use the same copied candidate and research counters; there are no nested function timers or CPU profiles. Runtime identity matches, candidate file hash remains the one above, and browser/profile cleanup completes.

| Metric over 12 changes | Baseline median (range), four trials | Candidate median (range), four trials |
| --- | --- | --- |
| Wall time | 64.01 s (53.62–74.46) | 31.19 s (24.92–36.57) |
| Browser task time | 62.52 s (52.15–72.83) | 29.88 s (23.60–35.42) |
| Style recalculation | 49.86 s (41.35–57.95) | 20.18 s (15.12–24.04) |
| Largest sampled rAF interval per trial | 75.1 ms (50.0–99.8) | 37.4 ms (25.0–66.6) |

Median browser task time is 52.2% lower and style work 59.5% lower in this workload; wall time is 51.3% lower. All candidate task/style totals are below all baseline totals despite substantial variation within each policy. These are descriptive results from four trials per policy, not confidence bounds. Browser task and style times overlap and must not be added. The frame ranges overlap, and this synthetic queue-drain scenario is not Amazon input latency or INP.

Each baseline trial performs 4,320 individual source-ink fallbacks. Each candidate trial performs 264 fallbacks and prepares/uses 4,056 values in 1,668 shared transactions. This reduces source exposure operations without skipping the requested values; total browser metrics include preparation and subsequent restoration work. Sampled color, text fill, background and dimensions of the original visible group match their warmed references after all 96 changes. Cloned offscreen groups are not individually asserted and this benchmark does not supply full-page pixel acceptance. Initial fixture images decode before cloning; the four warm-up changes and queue checks precede timing, but the harness does not independently certify every asynchronous resource task as idle. Matched queue polling and fact reads remain measurement overhead.

The workload deliberately stresses repeated whole-page source-color invalidation. The measured reduction applies to that local workload. The follow-up below tests input and resampling under different conditions.

### Aligned lifecycle and settled interactions

`image-ink-aligned-1795012462313` captures the pre-action facts and performs the action in one browser task before scheduling frame observations. The earlier transition-end repeat difference was an extra sample of the midpoint in production and candidate when input and observation were scheduled separately. This run also waits for image decode and two animation frames before taking final screenshots. All nine controlled states match exactly in production, its repeat and the candidate. This includes sampled state sequences, final pixels, and the delayed reload with pending image samples. The candidate uses eight batched values across four transactions by the end and every owned profile closes. In both historical ordinary-transition runs, sequence differences are confined to the animated text wrapper and its interpolated color. The sampled descendants and the final wrapper color match. The historical image-only difference reproduced between production profiles and its cause is still unknown.

Both local interaction runs use a fixed 664-element fixture derived from the retained image-label page. Each runs two unthemed source controls and four trials per themed policy in balanced order. Each trial starts with the selected theme settled before a 1,840 px wheel trip and return, then physical next/previous button input performs a 324 px smooth carousel move and return. Paint and geometry of the sampled labels match across trials of the same theme. Metrics include time until renderer queues drain and common polling overhead. Initializer identities, source seals and cleanup match. No function timers or CPU profiler run.

- `image-ink-interactions-1795012574286` changes an attribute that the renderer ignores while moving the carousel. Neither themed policy makes source-ink reads in these interactions. Median scroll task time is 264 vs 266 ms and carousel task time is 44.1 vs 44.6 ms. This workload gives the batch path no work to remove.
- `image-ink-interactions-1795012657610` changes a watched class on each carousel click. Each baseline pair makes six individual source reads. The candidate consumes five prepared values in two shared transactions and retains one fallback. Carousel task median falls from 82.2 to 70.8 ms (13.9%). Style median falls from 17.5 to 10.0 ms (42.6%). The combined motion-completion median is 635 vs 645 ms, with overlapping ranges. The largest next-click frame interval per trial ranges from 8.6 to 33.3 ms at baseline and 8.4 to 25.1 ms with batching. Scroll still makes no source-ink reads. The result shows lower work when carousel clicks invalidate known label ink. A visible responsiveness gain remains unverified.

`image-ink-settled-amazon-1795012725126` revises the public test to wait for theme queues and sampled source state to settle before the fixed input route, park the pointer consistently, and hash structure, classes and image URLs independently. The second unthemed control again fails the exact check. All four snapshots in that control agree on structure, 8,104 elements, 233 decoded images and their URLs. Class hashes change before and over the scroll, despite matching geometry and sampled source paint. The earlier description of changing content was too broad. This run identifies CSS class churn as the immediate comparison blocker. The renderer uses classes for both theme selection and resampling, so removing them from the comparison without identifying their role could bias the result. No candidate timings qualify. Browser and profile cleanup complete.

A separate mechanism-only run (`image-ink-settled-amazon-1795012854467`) retains the failed repeat control and collects two settled trials per themed policy. Both baseline scrolls perform ten source-ink fallbacks. The candidate scrolls use 8 and 7 prepared values in 3 and 2 transactions respectively, with two fallbacks each. One prepared value is discarded. All four measured carousel windows have zero new source-ink reads. Window counters include work between the recorded action boundaries and do not measure delayed work after those boundaries. A change in structure and image URLs also appears during the first candidate scroll in this session. The final two trials have matching sampled structure, classes, image URLs and geometry throughout the observed scroll and source reset. In that single exploratory pair, scroll style time is 873 ms for candidate vs 1,301 ms for baseline, and task time is 3,728 vs 3,887 ms. The largest sampled frame interval is 375 vs 650 ms. This pair is exploratory because the session fails the repeat control and there is only one such pair. Browser cleanup and source seals pass.

The result narrows the applicability of batching on this page to scroll windows that trigger source-ink reads. At this stage the candidate remained in research. The next comparison warms the input route and retains the full class and structure checks.

### Warmed Amazon comparison

`image-ink-warmed-amazon-1795013135496` adds three predeclared warm-up cycles with the same scroll and carousel input before the source controls. It also counts class changes, node replacements and their locations at the warm-up and control boundaries. All three cycles and both unthemed controls match their start and return snapshots. The document gains two elements after the source controls and before the first themed trial. All eight themed trials then share the same sampled DOM shape, classes, image URL hash, geometry and carousel positions. The source and themed groups belong to different page states, so the report retains `complete-inconclusive` under its original gate. The eight themed trials provide a balanced within-state signal to confirm with a themed repeat control.

| Settled scroll on the shared themed state | Batching disabled, median (range) | Batching enabled, median (range) |
| --- | --- | --- |
| Browser task time | 5,219 ms (4,978–5,348) | 4,182 ms (4,084–4,248) |
| Style recalculation | 3,260 ms (3,052–3,366) | 1,561 ms (1,498–1,591) |
| Wheel round trip | 5,305 ms (5,051–5,416) | 4,477 ms (4,416–4,522) |
| Largest sampled frame interval in each trial | 1,817 ms (1,692–1,883) | 642 ms (542–700) |

All four candidate scrolls use 16 prepared source values and zero individual fallbacks. Each baseline scroll makes 16 fallbacks. Very long frame intervals shrink while the number of intervals over 50 ms does not. The carousel pair uses less median browser task time (2,566 to 2,260 ms) while measured motion completion overlaps (1,441 vs 1,453 ms median). The source groups are useful as repeat controls within their own page state. Runtime identities, source seals and cleanup match. These observations cover a settled input route on this one anonymous document.

`image-ink-themed-control-amazon-1795013358557` uses two repeats of the same themed baseline after three route warm-ups, followed by four baseline and four candidate trials in alternating pair order. Before timing, two class changes appear on the scroll route outside the measured carousel. The warm-up return states and both baseline repeats match. The eight crossover trials all pass the full source, themed-scroll shape, geometry, paint restoration and action checks. All scored carousel position sequences match. Both renderer identities and source seals pass, and cleanup completes. The two baseline repeat trials are excluded from the primary medians below.

| Settled scroll on the second document | Batching disabled, median (range) | Batching enabled, median (range) |
| --- | --- | --- |
| Browser task time | 2,544 ms (2,506–3,044) | 2,574 ms (2,493–3,171) |
| Style recalculation | 678 ms (671–889) | 658 ms (631–821) |
| Wheel round trip | 4,008 ms (3,997–4,015) | 4,001 ms (3,996–4,035) |
| Largest sampled frame interval in each trial | 292 ms (275–450) | 179 ms (158–275) |
| Observed long-task excess over 50 ms | 343 ms (330–623) | 253 ms (216–450) |

Every candidate scroll has a shorter largest sampled frame interval than its adjacent baseline, by 75–175 ms. The two baseline repeat intervals differ by 67 ms. Candidate style time is lower in all four pairs, while total task time rises in three. Batching consumes six prepared source values per scroll and removes six individual fallbacks. No measured carousel window reads source ink on this page variant. Median carousel motion completion is 989 vs 971 ms with overlapping ranges. The confirmed benefit on this document is shorter scroll stalls. Page loading and fresh interactions were outside this run.

### Integration and rendering verification

`image-ink-label-transition-1795013608894` explicitly creates and pauses concurrent `-webkit-text-fill-color` transitions on two actual image-label consumers. Both transitions are present in production, the production repeat, and the candidate. The candidate prepares and consumes both source values in the same inspection when the colors change. All six stages match production and its repeat in sampled paint sequences and exact final screenshots, including start, midpoint, end, and restoration. An initial probe (`image-ink-label-transition-1795013533871`) did not produce active label transitions because the theme already controlled the winning color. It also reproduces the older initial image capture difference in the production repeat. The corrected probe verifies the two active transitions explicitly.

The integrated renderer uses the same transaction and individual fallback with production naming and without the experiment controls and counters. It leaves inspection membership and order intact, preserves the existing cache and invalidation policy, and restores the stylesheet and temporary values in `finally`. It uses the authored transition destination helper in both paths. The optimization applies to Simulated Native. The two palette themes continue through the original read path.

- `image-ink-label-transition-1795013996671` repeats the active-transition comparison on the integrated renderer (initializer `748dfaabbf38201bae5126f8efd27d6f064f96211cd7c368994081b82c5fefb8`) against the preserved pre-integration renderer. All six states match exactly, including both active label transitions, with complete cleanup.
- `npm.cmd run verify -- --browser` passes all 13 stages on Windows and isolated Brave (Chromium 157). This includes 140 Node tests, 19 smoke assertions and 375 shared combinations. The sealed report is `research-artifacts/diagnostics/verification-41b9807b-3372-41bc-bd24-ae0dafd4114f.json`. The shared report `shared-1795013772548-e5a36b2c` records complete cleanup.
- The separate pending inherited-label batch-membership probe still reports the same six mismatches at Off/Maximum across three themes. Every sampled state matches the pre-integration probe. The current report is `sampling-batch-inheritance-1795014008986`.

### Fresh Amazon navigation and first input

`amazon-first-input-1795017304148` measures the integrated renderer on Windows with isolated headless Brave (Chromium 157). Eight fresh profiles run in balanced disabled/enabled order. All have the extension loaded and the rule saved before navigation, and all match renderer identity with complete cleanup. Disabled means an explicit exclusion for the measured page. The observer arms a 480 px wheel gesture once the navigation and enough scroll range are present. It then reveals the first supported carousel, verifies the pointer hits a non-navigating next-page control, clicks, and observes the first forward motion and its end. Long tasks and browser work are recorded through about 8 seconds after navigation. Polling for scroll range can force layout, and the measured tab's metrics include page work and common input instrumentation.

| Median across four completed profiles per condition | Darkening disabled | Simulated Native |
| --- | --- | --- |
| Navigation to first observed wheel movement | 879 ms | 1,381 ms |
| Wheel armed to first observed movement | 189 ms | 314 ms |
| Carousel click armed to first forward motion | 111 ms | 204 ms |
| Carousel click armed to motion complete | 538 ms | 788 ms |
| Document load event | 1,179 ms | 2,063 ms |
| Browser task time through the observation | 1,405 ms | 6,257 ms |
| Style recalculation through the observation | 168 ms | 1,706 ms |
| Long-task excess over 50 ms in the first 8 s | 170 ms | 867 ms |

First wheel movement comes 424–709 ms later with Simulated Native across the four adjacent pairs. The two pairs with matching carousel index, width, card count and movement distance show 48 and 105 ms more click-to-motion time. The other two pairs present different card counts. Time to first byte also varies, and early document sizes and final content differ. These are live observations on fresh profiles, with matching actions and two matching carousel targets. They do not establish an exact extension latency penalty for a fixed document. Input timings include dispatch and observation overhead. Eight first-attempt timeouts (`amazon-first-input-1795017081229`) and the failing single-profile probe are retained. A fresh probe showed a normal scrollable page and a missing observer, then passed after adding explicit Page initialization and an idempotent fallback. No Amazon labels or screenshots were captured.

### Startup stall attribution

`amazon-first-attribution-1795017400288` repeats the input route twice with function timers around renderer operations. During the first five seconds, it measures 41–43 viewport flushes and 1,281–1,352 ms inclusive viewport time, 1,465–1,596 ms inclusive local inspection across all callers, and just 14–15 ms applying paint rules. Local inspection runs for up to 117–124 ms in a single call. Several long browser tasks overlap those inspections or complete visible passes. Other long tasks have no matching timed renderer call. The timers include synchronous browser work and overlap each other, so they cannot be summed or interpreted as pure JavaScript CPU time.

In the four separate no-input profiles (`amazon-first-refresh-causes-1795017525844` and the finer attribution `amazon-first-refresh-causes-1795017619820`), 15–20 full viewport passes take 509–923 ms per profile during the first eight seconds. In the finer pair, in-place style text changes are associated with 10 and 13 passes. They are the sole recorded cause of 2 and 4 passes, representing 75 and 264 ms. Other head mutations are the sole cause of 0 and 2 passes, representing 0 and 132 ms. Script-only notifications already defer and coalesce to 2–3 eventual refreshes. Causes can share a pass. Attribution measures observed cost, not time recoverable by discarding those callbacks. Runtime identities and source seals match and cleanup completes in each group.

The next performance experiment should target the cost of full visible inspection when authored stylesheet text changes. Use a fixed local stream of stylesheet changes with a visible reveal and a contrasting preserved element, then compare time per completed pass and the first rendered state. Existing authored selector and transition behavior requires refreshing real stylesheet changes. The data do not support extending the script-only debounce indiscriminately. This investigation changes only the diagnostic harness and notes.

### Full-pass signature shortcut on a fixed stylesheet workload

`research-artifacts/check-stylesheet-inspection.mjs` derives a 1,518-element synthetic page from the retained heavy-CSS dynamic catalogue. A dedicated authored stylesheet alternates between hiding and revealing a notice. The narrow stream changes the notice and its link. The broad stream also changes the catalogue's tile backgrounds and inherited ink. A fixed independent control is checked in both. The unthemed source must show the intended reveal and retain the control before the themed comparison starts. The harness samples the next animation frame after the mutation observer can queue its response, then compares settled computed paint, geometry and exact screenshot pixels. The timing windows cover 12 changes per stream and include the final idle queue drain. Mutation-to-frame time includes frame scheduling and the probe's sampling reads. It measures the harness observation, rather than presentation timestamps or input latency.

The prototype tests the first four paint fields of an already recorded full-pass signature. A different prefix already requires inspection, so it skips the remaining comparison reads, warms the same backdrop cache and still records a complete signature after inspection. A matching prefix runs the existing complete comparison. It changes no stylesheet scheduling, signature fields, inspection membership or writes. Both policies run the same copied initializer with the same counters. Only the prototype switch differs.

`stylesheet-inspection-1795018491995` is the initial three-trial pilot. All sampled and settled checks match. The baseline repeats and later candidate show timing variation, so the test proceeds to a balanced comparison. `stylesheet-inspection-1795018586750` completes two baseline repeats plus four pairs in alternating order. All 40 first-frame and settled checks have matching facts and zero differing settled pixels. Every stream holds 12 full passes and 3,000 full-pass targets. Renderer identity, source seals and cleanup match.

| Median across four scored trials per policy | Baseline | Shortcut |
| --- | --- | --- |
| Narrow browser task time | 2,024 ms | 1,956 ms |
| Narrow style recalculation | 609 ms | 655 ms |
| Narrow maximum mutation-to-frame time | 105 ms | 125 ms |
| Broad browser task time | 3,910 ms | 3,870 ms |
| Broad style recalculation | 1,143 ms | 1,148 ms |
| Broad maximum mutation-to-frame time | 266 ms | 264 ms |

In the broad stream the shortcut avoids 2,904 comparison signatures per trial and preserves all 2,904 actual inspections. Median total signature reads fall from 9,247 to 6,343, including idle work. Task time falls by about 1% and the four paired differences have mixed signs. In the narrow stream only 24 signatures can short-circuit. The repeat controls vary by 467 ms in narrow task time and 733 ms in broad task time. These differences exceed the median shifts from the shortcut. This candidate is rejected for production.

Separate timing of renderer phases (`stylesheet-inspection-attribution-1795018805359`) measures 616 ms inclusive viewport work and 582 ms of signature reads across viewport and idle work for narrow changes. Only 11 ms is charged to actual classification in that stream. Broad changes measure 1,829 ms inclusive viewport work, 986 ms of signature reads across callers, and 939 ms of classification. The timings are nested and include browser work forced by reads. They cannot be added as independent costs. The next promising target for narrow edits is reducing the cost of validating unchanged targets while preserving invalidation. Further tuning of the changed-prefix shortcut is unlikely to materially help that case.

## Initial plan (18 November 2026; execution recorded below)

1. Establish a correct baseline before further skipping. Reproduce stylesheet-only changes to generated borders and asymmetric side widths; compare the cached result with fresh classification of the identical authored state. Retain the case in complete browser verification.
2. Add the missing signature inputs without paying for absent generated layers. This closes the demonstrated collisions, not every possible dependency of the heuristic. Ancestor-layout dependencies remain a known limitation.
3. Regenerate K2 against this baseline, leaving palettes outside its timestamp-based dedupe. Require the new regression, the three-theme source-state differential, and existing source-scheme guards before timing it.
4. Run balanced baseline/candidate anonymous Amazon loading and interaction trials sequentially. Record content size, identity, failures, cleanup, readiness, long tasks, full-pass and idle work. Require at least 10% lower per-element idle work, at least 15% lower carousel idle work, and no material (>5%) comparable readiness/interaction-stall regression for promotion. Missing comparable samples means inconclusive, not acceptance. Inspect host load; do not close unrelated browsers.
5. Promote only if correctness and performance evidence support it. Run complete sealed browser verification on the final production tree. Retain rejected or inconclusive candidates separately.

## Baseline repair

- The old renderer fails the synthetic browser differential at Simulated Native/Off: a changed generated frame keeps rgb(62,62,62) instead of the freshly classified rgb(255,255,255), and the asymmetric right border retains stale adapted ink. Evidence: `research-artifacts/diagnostics/signature-invalidation-1794997163205/results.json`; owned browser/profile cleanup complete.
- An initial sandboxed attempt exited during browser startup and supplied no rendering evidence (`signature-invalidation-1794997150038`).
- Adding both side widths and generated-layer paint/geometry dependencies passes the six theme/level combinations (`signature-invalidation-1794997193639`). Absent pseudo-elements subsequently use only their content sentinel to avoid unnecessary property reads; the complete run verifies that final form.
- This is a synthetic general renderer repair, not an Amazon visual adjustment. No website-specific classification is introduced.

## K2 confirmation outcome (18 November)

- Regenerated the timestamp-dedupe candidate against the corrected production baseline; candidate remains in `research-artifacts/review-k2-candidate.js`, not production. New signature regression passes in all six theme/level states (`signature-invalidation-1794997254533`); all 21 three-theme source states have identical computed facts and zero changed pixels (`review-k2-source-sampling-1794997294357`).
- Loading: `review-k2-loading-1794997328645`, eight balanced fresh-profile anonymous Amazon loads, four per condition, every identity matched and every owned profile cleaned. CPU load read 17% before the series (not continuous monitoring). Median baseline/candidate idle work 2062.5/2164.2 ms; median per-unique-element idle work 0.6757/0.6996 ms (+3.5%, fails the required 10% reduction); readiness 2394.7/2153.3 ms; long-task time 885/1101.5 ms; style work 1443.3/1713.9 ms. Live content differs, so these descriptive medians do not establish a universal regression or improvement. Source seals unchanged throughout.
- Interactions: `review-k2-interaction-ab-1794997487010`, eight planned fresh-profile loads, one candidate normal-page timeout; three missing second carousels. Six baseline and five candidate completed carousel windows, each with two mouse actions before the next control disappeared (no programmatic click fallback in completed windows). Median idle work per window 760.2/352.5 ms; median largest rAF interval 99.95/58.7 ms; median largest dirty flush 61/44 ms. These are differing live content variants, not fixed-content pairs or INP measurements; multiple windows from the same load are not independent trials. Overall report remains incomplete. Completed identities match and cleanup is retained.
- Decision: do not promote broad K2. It failed the loading work criterion despite a promising interaction signal. No extra timing runs are needed to label the same evidence a pass. Retain the corrected signature baseline and its portable regression.

## Next bounded experiment

Investigate deduplication restricted to post-interaction subtree rescans, keeping loading and stylesheet-triggered document scans unchanged. First attribute the carousel savings to the subtree/document queues on the same warmed document; only design a candidate if the useful portion can be isolated. Require equal action counts, stable content/geometry, negative controls for mutations after queueing, and exact source/pixel preservation. The existing K2 data motivate this experiment but do not validate that narrower implementation. No scheduling delay or broader cache omission is authorized by a performance result alone.

- Complete final verification passed on Windows / isolated Brave, all 13 stages (including 140 Node tests, 375 shared combinations and the new six-state exact-pixel signature guard). Sealed report: `research-artifacts/diagnostics/verification-995051bc-66b4-47c3-878d-acd4f0b0be7e.json`; unchanged code seal `86c681d61b92e525bd2c4a51bf04ac1d18bc3959f78581c861526e5bd4c59261`, fixture seal `d562db0395ea4509535e32dbcd570a708010b4f9e35017ad9cf5c0f3a35d6bd0`. Final regression evidence: `signature-invalidation-1794997953351`, all identities match, zero changed cached-versus-fresh pixels, owned profile cleanup complete.


## Narrow carousel dedupe investigation (18 November 2026)

- Attribution used one warmed anonymous Amazon document, physical next/previous clicks, bounded queue drain, actual movement and reversal checks. `carousel-attribution-1794998225643` retained a stable 3,149-node shape/resource hash and geometry over a warmup and four measured cycles. All repeated work was in subtree scans; no document-scan inspections occurred. Same-observed-mutation-epoch repeats cost 69.2–137.0 ms per measured cycle. This is an opportunity count, not proof those samples can be reused: renderer resource invalidations and input association are additional requirements. The earlier `carousel-attribution-1794998185059` timed out before a normal page, with no measured samples.
- Built `research-artifacts/interaction-subtree-candidate.js` through `make-interaction-subtree.mjs`. It is research only. Simulated Native subtree queues associated with trusted input can reuse a later foreground local sample only in the same invalidation epoch; document scans, images, palettes, initial loading without input, and refresh handling are excluded. Sample/resource invalidation remains conservative. No production source was changed in this investigation.
- First crossover `carousel-attribution-1794998343118` used an input-task-only lifetime and skipped zero elements. A subsequent harness build failed its anchor assertion before browser launch (`carousel-subtree-crossover-1794998410679`). The next diagnostic (`carousel-subtree-crossover-1794998423931`) accidentally omitted the queue-drain interaction reset when injecting timing; it is not evidence for the final candidate and is excluded from promotion decisions. The instrumentation was corrected to preserve the reset.
- Corrected balanced crossover `carousel-subtree-crossover-1794998484045`: same warmed document, one warmup then four baseline/four candidate cycles, each next and previous with confirmed reversal. Median idle callback work 381.45/379.00 ms, median largest frame interval 50.10/50.00 ms, **zero skipped elements in every candidate cycle**. The timing difference is noise, not an optimization. Source seals unchanged, runtime identity matched, cleanup complete.
- The report's `compatible` boolean covers shape/resource hash, document height and carousel reversal only. It does not certify paint equality. Forward-state paint hashes mostly matched, but return-state inherited link colors varied within baseline trials as well; raw paint arrays retain the differences. No candidate regression or live visual repair is inferred from those variations, and strict paint acceptance remains unestablished.
- Rejection-reason probe `carousel-subtree-reasons-1794998553401` retained two candidate cycles with the same results each: 1,958 checks outside the input-associated queue, 908 with newer source/resource invalidation, 322 without a foreground local sample, 54 images; zero eligible skips. This diagnostic explains why the optimistic repeat count cannot be used as a speedup claim.
- Decision: reject the narrow timestamp/sample-reuse candidate; leave production and the prior verified cache repair unchanged. Do not broaden invalidation rules merely to produce a saving. No full-suite rerun is required for these research scripts and documentation: the production/fixture tree remains the one verified by `verification-995051bc-66b4-47c3-878d-acd4f0b0be7e.json`.
- Next distinct hypothesis: pending subtree roots may overlap beyond the current parent/grandparent guard. Attribute that overlap and test coalescing roots *before either scan executes*, rather than assuming a previous classification is reusable. Keep active scans separate, preserve shadow-root boundaries and late mutations, and require same-document interaction evidence plus local mutation/preservation controls before promotion. This alternative is not implemented or validated by the present experiment.

## Pending-root coalescing experiment (18 November 2026)

- Attribution `pending-overlap-1795004396250`: one warmed anonymous Amazon document, 3,043 elements in the recorded structural inventory, physical next/previous actions, warmup plus four measured cycles. Each measured cycle started 24 scans already covered by an earlier parent scan, representing 672 repeated descendant visits and 75.3–81.5 ms of inspection work. Probe bookkeeping took 0.3–0.4 ms per cycle. These are opportunity counts; repeated classification can affect final paint. Structural hashes and geometry remained stable. Runtime identity matched and owned cleanup completed.
- Built a research-only candidate (`research-artifacts/pending-coalesce-candidate.js`, generator `make-pending-coalesce.mjs`). On selecting a queued root, it checks all pending ancestors and removes covered pending descendants before taking the static scan snapshot. Active iterators are not merged. New mutations can enqueue another scan. This candidate has not been promoted or accepted for late-mutation/shadow-tree behavior.
- Local source-state comparison `pending-coalesce-source-1795004490686`: all 21 computed-fact states matched. Twenty captures matched exactly; Soft dark/dark had one pixel at (1153,139) differing by one red-channel value (111 versus 110). That difference was not attributed or waived; report remains `differences-require-review`.
- Balanced same-document crossover `pending-coalesce-crossover-1795004516016`: warmup then four baseline/four candidate cycles. Median accumulated idle callback work **382.00 → 299.55 ms (21.6% lower)**; idle inspections **2,864 → 2,229 (22.2% fewer)**; 22 queued scans removed per candidate cycle. Median largest frame interval **66.75 → 66.70 ms**, effectively unchanged. These are current-production/candidate interaction measurements, not plain-page overhead, load time or INP. Source identities matched and cleanup completed; production sources were unchanged during the run. The preregistered 15% idle-work gate was met, but paint acceptance failed.
- Forward-state paint differed in a nested red label: rgb(255,95,107) versus rgb(215,86,105), with identical recorded geometry and parent backing. Return-state ink also varied within baseline trials. The structural `compatible` flag does not certify paint equality. Do not present the reduced work as a shipped or visually accepted optimization.
- Context follow-up `pending-coalesce-context-1795004635238` confirmed batch-associated red-label differences on another public-page load. It captured bounded ancestor/style facts without labels or screenshots. Authored label ink was inherited rgb(204,12,57), transparent inline span, 12px bold, opaque white parent, blue link ancestor; parent darkened to rgb(18,18,18). Some labels differed even in production. Eight page stylesheets were inaccessible to ordinary CSSOM; complete cascade, pseudo-element content, exact font family and carousel sequencing were not recovered. This follow-up is attribution, not another balanced performance confirmation.
- Synthetic fixture `sampling-batch-inheritance.html` first reproduced the two inks with a direct research sampling hook (`sampling-batch-inheritance-1795004742612`), then reproduced them through ordinary unused-class mutations and natural scheduling (`sampling-batch-inheritance-1795004815758`). The parent-plus-label and label-only states have constant geometry, backing and independent control. The same dependency appears in Soft dark (pink versus blue) and High contrast (pink versus blue), at Off and Maximum. Source restoration succeeds. The local fixture preserves measured color/inheritance facts, but is explicitly not a complete Amazon reproduction.
- Retained the case in the gallery, coverage inventory and rendering guide. Standalone `node --experimental-websocket scripts/dev/diagnostics/check-sampling-batch-inheritance.mjs` uses a read-only queue hook and asserts paint invariance after recording all six states; it currently fails as a pending defect (`sampling-batch-inheritance-1795004887736`, all six mismatches retained, cleanup complete). It is not silently included as a passing full-suite stage. Syntax and all 140 Node tests pass with `npm.cmd run verify -- --quick`; the prior complete browser verification predates this added fixture.
- **Decision:** retain the candidate outside production. The measured opportunity is real, but removing work changes sampling batches and exposes an existing correctness dependency. No site-specific visual adjustment is made. Next prerequisite is batch-independent authored sampling for inherited paint, using this negative regression and constant-backing controls. Only after that should the coalescing candidate receive active-scan/late-mutation/shadow-tree checks, loading confirmation and complete browser verification. Broad resource-invalidation changes and a hybrid rewrite remain hypotheses, not work implemented by this experiment.

## Source inheritance repair experiments (18 November 2026)

All candidates below remain under ignored `research-artifacts/`; none changes the production renderer. Timings compare conditions within each run, not across runs with different live content and host load. The standalone inheritance check now accepts `NDM_BATCH_RENDERER`, records the selected initializer fingerprint, and checks every repeated state rather than only the first pair. Its default remains production, where the defect is pending.

### Expose the complete source ancestor chain

`make-source-ancestry.mjs` extends local sampling's temporary marker removal to composed ancestors, including slots and shadow hosts, restoring them synchronously. This eliminates the demonstrated inherited-color contamination: all six theme/level combinations pass the local natural-mutation invariant (`sampling-batch-inheritance-1795005144236`). It does not establish complete correctness of the approach.

The broader source-state comparison (`source-ancestry-source-1795005185776`) preserves all seven Simulated Native states exactly, but changes palette captures and two computed-fact states. Those differences remain unaccepted. A combined ancestor-repair/coalescing crossover (`source-ancestry-combined-1795005208396`) has four measured cycles per condition: median idle work 739.25 → 3138.10 ms, largest-frame median 91.65 → 133.40 ms. One candidate cycle changed the recorded structural context; all rows are retained rather than silently discarded. Runtime identity matched and cleanup completed. Reject this approach: removing ancestor overrides exposes correct source ink in the reduced case but substantially increases work and has broader rendering effects.

### Expose only inherited ink, preserving ancestor surfaces

`make-source-ink.mjs` splits Simulated Native's inherited ink declarations into a separate shared rule, excluded by a temporary source-ink sampling marker on ancestors. Other ancestor declarations remain active. This is a research implementation, not a stylesheet-based renderer rewrite.

- Natural-mutation invariant (`sampling-batch-inheritance-1795005451023`): Simulated Native passes Off/Maximum. Soft dark and High contrast retain their four existing failures because this candidate does not change their role rules; the aggregate check correctly fails.
- Broader comparison (`source-ink-source-1795005480709`): all 21 source-state facts and pixels match production.
- Bounded diagnostic (`source-ink-crossover-1795005518609`): two measured cycles per policy after warmup, median idle work 606.45 → 878.75 ms, largest-frame median 100.15 → 116.65 ms. **Both policies use split output rules**; the control disables source-ink exposure and coalescing. This is not an exact production/candidate speed comparison. Even against that control, enabling the repair and coalescing increases work. Identity matched and cleanup completed. No promotion or palette repair.

### Preserve batches and precheck unchanged subtree inputs

`make-subtree-signatures.mjs` extends the existing document-scan signature precheck to idle subtree roots and descendants. It preserves queue order and grouping, leaving the inheritance defect unresolved. This is a distinct alternative to removing entire scans.

- Local comparison (`subtree-signatures-source-1795005632356`): all 21 computed-fact states match. Twenty captures are exact; one High contrast/dark capture differs by one pixel. No tolerance was relaxed and the difference remains unclassified.
- One instrumentation-anchor assertion stopped a harness build before browser launch; it provided no samples. Corrected crossover `subtree-signatures-crossover-1795005672654` completed four cycles per condition after warmup. Median classifications 3248 → 1867.5, median skipped classifications 1382, but median accumulated idle work only 499.05 → 482.25 ms (3.4% lower, fails the preregistered 15% gate). Largest-frame median 50.05 → 54.10 ms. Forward paint differs in some candidate cycles; structural compatibility is not paint acceptance. Identity matched, owned cleanup completed and source seals stayed unchanged during measurement.
- Classification time fell substantially while total callback work barely changed. This supports attributing the added precheck work before any further cache expansion; it does not prove every remaining millisecond is style recalculation.

**Outcome:** no production repair or speedup from this follow-up. We have a local mechanism explanation and rejected implementations with evidence. Repeatedly exposing ancestor styles is too costly in these probes; broadly computing signatures also consumes most of the potential saving. The next architectural question is how to retain or derive authored paint without repeatedly toggling large inherited scopes, while invalidating it correctly for source CSS, ancestors, state, resources and shadow trees. A prototype must first demonstrate that separation with explicit-color, inherited-color, `currentColor`, source-mutation and preservation controls. Do not promote queue coalescing or reuse an old authored snapshot merely because it passes this one label case.

Final tooling verification: syntax and all 140 Node tests pass (`npm.cmd run verify -- --quick`). The updated standalone production check reports the six expected unresolved invariance failures, all runtime identities match, and cleanup is complete (`sampling-batch-inheritance-1795005815010`). No production renderer edit, complete-suite rerun, commit or release occurred in this follow-up.

## Authored-paint separation prototype (18 November 2026)

Implemented an isolated research extractor, `research-artifacts/authored-paint-mirror.mjs`, rather than another production cache. It copies eligible authored color declarations into private CSS custom properties, preserving selectors, source order, importance and supported media/supports grouping. The browser resolves those properties while the existing dark renderer stays active. Untyped tokens preserve `currentColor` through variables; separate registered color properties normalize resolved values. Inherited source ink is resolved independently of the already-themed `color` property. No theme palette or output declaration is replaced by this prototype.

The current experiment covers only `color`, `background-color` and `border-top-color` in a restricted document-tree HTML fixture. It does not cover the complete CSS cascade. Inline paint, inaccessible/pending sheets, layers/nesting, generated paint, animations/transitions, relevant UA paint and context-dependent unresolved colors produce explicit unsupported outcomes in the tested probes. Shadow trees, complete shorthand/logical-property coverage, all color syntaxes, full resource/backdrop classification and arbitrary page compatibility are not established. A `supported` outcome means admission by the experimental checks, not a guarantee for arbitrary CSS. Unsupported extraction supplies no values; production integration and fallback are not implemented.

### Correctness and source changes

Final reports, Windows / isolated headless Brave / Chromium 157:

- Full source validation: `authored-paint-mirror-1795008692102/results.json`.
- Experimental change notifications: `authored-paint-mirror-tracked-1795008650793/results.json`.
- Both live under `research-artifacts/diagnostics/`. Their prototype/harness source hashes match at start/end, initialized renderer identities match, and owned browser/profile cleanup is complete.

Each report retains 36 supported comparisons, including all three custom themes at Off, plus six explicit unsupported cases. The synthetic document has 640 targets: explicit and inherited ink, `currentColor` backgrounds/edges, variables and an independent color control. Changes include ancestor class, direct CSSOM color assignment, stylesheet text, variable mutation, resize/media, `setProperty`, `cssText`, rule insert/delete, selector replacement, constructed-sheet adoption/removal, asynchronous replacement, disabling and media updates. The additional supported → unsupported inline paint → identical source recovery catches reuse of a compiled mirror after it was cleared. Immediate CSSOM checks occur before waiting for the renderer to drain.

Mirrored values match a direct unthemed three-property reference in these supported states. Eight sampled themed text colors remain unchanged across each extraction. This is **not** full-pixel acceptance, a fix for the production inheritance regression, or complete intermediate-frame verification. First building/rebuilding the mirror also has a cost: the large-sheet build plus extraction of 640 targets took 40.4 ms in the tracked report; it is excluded from the warmed batch totals below and must be accounted for in any loading experiment.

### Extraction timing and its limit

Each table cell gives the two retained trial totals in milliseconds. A trial performs 48 synchronous batches of 16 target reads; order is toggle / mirror / mirror / toggle, on the same synthetic document. The larger case adds 12,000 unmatched rules, 3,000 with paint declarations. Both arms retain the mirror stylesheet. These are narrow warmed extraction timings, not renderer callback time, input latency, loading or Amazon performance. The toggle reference disables/restores the theme and transition sheets; it is not an exact benchmark of production's marker-based local sampling path. Two trials are descriptive, not a statistical performance estimate.

| Source validation | Stylesheet scale | Theme-sheet toggle reference | Mirror reads, including validation |
| --- | --- | --- | --- |
| Full current-rule fingerprint | Small | 230.5 / 228.3 | 5.2 / 5.3 |
| Full current-rule fingerprint | 12,000 extra rules | 233.6 / 244.0 | 439.8 / 495.3 |
| Experimental change tracker | Small | 285.6 / 260.7 | 4.4 / 4.6 |
| Experimental change tracker | 12,000 extra rules | 262.2 / 254.6 | 5.0 / 4.3 |

Do not compare absolute times between the two separate browser runs. Within each, the result shows the tradeoff: repeated full-rule validation removes the advantage at scale; avoiding it makes repeated supported reads cheap. It does not establish a corresponding reduction in total page work. Mirror construction, ongoing selector matching, bridge overhead during mutations and fallback work remain necessary costs.

`source-style-tracker.mjs` is a research-only main-world bridge installed before document scripts by the harness. It wraps selected native CSSOM mutations and watches declarations without replacing native objects with Proxies. The isolated extractor receives invalidation events, checks pending DOM mutation records synchronously and compares the active sheet list/order/media before reuse. Normal source variable and selector matching still resolve through the browser; paint values are not cached across reads.

The native-object admission check initially found that the wrapper mishandled `style.color = null`; corrected it and retained the negative evidence (`source-style-tracker-1795008606231`). Final check `source-style-tracker-1795008620508` passes the tested setter inputs, native identity/borrowed-method checks and eleven notification paths. An earlier integration attempt did not enable the CDP Page domain before early injection and missed a CSSOM update (`authored-paint-mirror-tracked-1795008533340`); final runs enable it and assert tracker installation. This is a harness correction, not proof of an extension deployment path.

**Known correctness blocker:** the final tracked report deliberately changes source ink from another isolated JavaScript world. That edit bypasses main-world hooks: the mirror returns rgb(34,68,102), while the direct reference is rgb(153,51,85). The full-fingerprint report sees the same edit correctly. The tracked report explicitly records `supported-subset-passed-with-known-invalidation-gap`; it is not an overall safe-renderer pass. No automatic detection/fallback for this missed notification exists. Unwrapped mutation paths, other realms, page interference, property reflection compatibility and initialization timing need an explicit policy and tests before deployment. Periodic validation alone would leave a stale interval and is not an established repair.

### Amazon source availability

Read-only anonymous-page inventory `authored-mirror-amazon-coverage-1795007835955` found 19 CSSOM-readable sheets and eight CSSOM-inaccessible sheets. All eight inaccessible resources were readable through bounded, credential-free cross-origin CORS fetches: HTTP 200, no imports detected by the probe. Reads used two concurrent requests, six-second resource deadlines and a 2 MiB per-resource cap. No visible labels, screenshots, stylesheet contents or URLs were exported. Identity matched and cleanup completed.

The accessible inventory counted 4,523 rules and 850 paint declarations, including 424 variable-valued declarations. Fetched sheets added 7,761 parsed rules; these are inventory counts, not applied-rule coverage, and may include duplicates or inactive rules. CSSOM denial therefore does not by itself rule out legitimate source access on this observed page. It also does not guarantee access on another page/session. The strict prototype rejects the Amazon document for multiple unsupported mechanisms; it has **not** measured useful hybrid coverage or improved Amazon.

### Decision and next gate

Keep both prototypes outside production. Authored/output separation is technically promising in a restricted case, but reliable cheap invalidation and useful real-page coverage remain unproven. The existing production batch-inheritance defect and coalescing candidate remain pending.

Before a full renderer integration, establish a bounded invalidation/fallback contract that cannot silently reuse unsupported source paint, and measure how much real-page work the supported subset could replace. Then test one integration against the production local sampler, including initial construction, source churn, ordinary style/layout work and fallback cost. Require the retained inheritance invariant, broader pixel/state controls and a balanced same-document performance comparison before proceeding to loading trials or complete browser verification. The current microbenchmark does not justify a broad rewrite or a claimed Amazon speedup.

Final verification for this follow-up: research-script syntax checks and `git diff --check` pass; `npm.cmd run verify -- --quick` passes syntax and all 140 Node tests. The browser evidence above is from isolated research copies. No new complete production browser-suite result is claimed.

### Full validation without JSON serialization

Follow-up `authored-paint-mirror-1795008931880/results.json` tests `--linear`: compare current sheet identity/order/media and every current rule's `cssText` against the retained snapshot, creating a new snapshot only after a difference. This removes the repeated JSON serialization and unchanged snapshot allocation while preserving full-rule checks, including nested rule text. No main-world tracker is installed.

All 36 supported comparisons and six unsupported controls pass, including the isolated-world mutation that the fast tracker missed. Source seals remain equal, runtime identity matches and owned cleanup completes (Windows, isolated Brave). The original subset limitations still apply.

For 48 warmed batches, small-sheet mirror totals are 7.0/6.3 ms versus toggle-reference 427.1/386.6 ms. With 12,000 extra rules, mirror totals are **876.8/894.6 ms**, versus **393.2/392.3 ms**. These are within-run descriptive comparisons; different host conditions prevent attributing the absolute difference from earlier runs to this implementation. The complete validation path still loses at large stylesheet scale. Reject it as a performance solution; avoiding JSON alone does not make full-rule polling cheap enough. No production edit or broader renderer speedup is established.

This closes the bounded serialization hypothesis. Further work should first quantify useful replacement coverage and source-change frequency on the real page before investing in the mirror architecture. Cheap notifications alone remain insufficient, and periodic polling would change the correctness contract by allowing stale intervals. Neither is accepted as an automatic fallback.

### Live opportunity inventory

Two anonymous Amazon sessions on Windows / isolated Brave retained one warmup and four measured physical next/previous carousel cycles. Movement and reversal were confirmed; structural/resource hashes and geometry remained stable within each session. Reports: `carousel-attribution-1795009090540` (initial literal-only probe retained the older output prefix) and `mirror-opportunity-1795009147126`, under `research-artifacts/diagnostics/`. Runtime identities match, production source hashes are unchanged and owned cleanup completes. The research harness is `mirror-opportunity.mjs`, generated by `make-mirror-opportunity.mjs`. No labels or screenshots were exported.

At all ten before/after cycle boundaries in each session, readable source-sheet fingerprints were unchanged. Eight sheets were CSSOM-inaccessible in both sessions. These snapshots cannot detect changes that reverted between boundaries, changes in inaccessible sheets, or inline/ancestor/state changes; they do not establish a complete mutation rate. Snapshot overhead was roughly 15–24 ms, so this instrumented run is attribution, not a clean performance comparison. Loading and unrelated interactions were not sampled for source-change frequency.

The second session recorded 30,235 inspections across loading, positioning, warmup and interactions, on 2,951 unique elements. An end-state selector-match inventory queried 1,092 readable paint rules and skipped 77 (unsupported selectors/values); it did not hit the 2,000-query cap. Literal-rule matches covered 46 connected inspected elements and 158 calls (0.52%). Variable/currentColor-rule matches covered 80 elements and 1,006 calls; the union covered 1,122 calls (3.71%). Categories overlap. The first session's literal-only result was similar: 165 of 30,214 calls.

These are **direct selector-match opportunities, not replaceable-work percentages**. Matches are evaluated at the final state and weighted by historical inspection counts; their cascade may lose, grouping conditions may be inactive, and remaining contextual classification may still be required. Conversely, inherited effects on descendants and the eight inaccessible sheets are missing, so the counts are not an upper bound on a complete architecture. No time saving can be inferred from call counts alone.

The current extractor rejects the whole document in both sessions: inaccessible sheets, visited/generated paint, animations/transitions, unsupported at-rules, nesting, source color scheme and inline paint. Therefore its current accepted replacement coverage on these documents is zero. Stable readable stylesheets motivate amortizing source setup, but do not solve invalidation correctness. Before a rewrite or a negative conclusion about its full potential, the next coverage gate must include bounded CORS-readable external rules and inherited consumers, then establish actual cascade/admission rather than counting selector matches. No production integration is justified by this partial inventory.

### External stylesheet and ancestor opportunity extension

`external-opportunity-1795009294789/results.json` extends the inventory on one anonymous Amazon document with 4,725 structurally inventoried nodes. One warmup and four measured next/previous cycles retain stable structural/resource hashes and geometry, actual movement/reversal, equal readable source fingerprints at all ten boundaries, matching renderer identity, unchanged production source hashes and complete owned cleanup. The research implementation is `external-paint-opportunity.mjs`, injected through `make-external-opportunity.mjs` / `external-opportunity.mjs`. Windows / isolated headless Brave; no labels, screenshots, source CSS or URLs exported.

All eight referenced external stylesheets were fetched successfully through CORS, with cross-origin credentials omitted, two concurrent requests, six-second deadlines and a 2 MiB per-resource limit. No imports were detected. Parsed sheets were not applied to the page. Active media/supports conditions are respected; unknown grouping semantics and unsupported selectors/values remain excluded. The probe queried 2,619 rules, below its 5,000-query cap, skipped 175 paint rules, counted 115 inactive groups/sheets and retained 52 unknown groups. This is an incomplete selector inventory, not a cascade engine.

The inspected-element/count map is frozen before resource reads. Final-state matches are weighted by those historical counts, which include loading, positioning, warmup and interactions:

| Candidate relation | Inspection calls | Share of 32,363 recorded calls |
| --- | --- | --- |
| Direct matches from CSSOM-readable sheets | 1,306 | 4.04% |
| Direct matches after including fetched external sheets | 7,320 | 22.62% |
| Additional elements with a color-rule-matched ancestor | 25,013 | 77.29% |

Direct matches cover 1,166 connected inspected elements. Ancestor-only candidates cover 3,560 more. There are 32,350 connected calls; detached elements remain outside these match counts. The near-total union (32,333 calls) is **not an inheritance or replaceable-work measurement**: a root/body ink rule matched, so mere ancestry is almost universal. Descendants may override color, depend on context, or still need all other classification work. Winning declarations, actual inheritance, unsupported-rule interference and source fidelity are not established by selector matching. Resource fetches reflect this session's responses and are not proven byte-identical to the originally loaded resources.

Decision: the external CSS substantially expands direct candidate coverage within the same document, so the earlier 3.71% partial inventory must not be used to dismiss the architecture. Conversely, the ancestor count supplies no useful speedup estimate. The next evidence gate is property-level winning-source/inheritance attribution for a bounded inspection-weighted sample, followed by exact source-value comparison. Do not build an all-page integration from these percentages. The existing strict mirror admission remains unsupported; production is unchanged and no Amazon speedup is claimed.

### Bounded source-color dependency attribution

`source-attribution-1795009623343/results.json` selects the 24 connected HTML elements with the highest accumulated inspection counts after the same five carousel cycles. It synchronously disables the theme/transition sheets, records source color, temporarily sets each element's color to `inherit !important`, records the counterfactual, and restores its exact original style attribute and both sheets before returning. All 24 sampled themed colors match their pre-probe values afterward. CDP matched-style reads then retain only color declarations and origin/group metadata, excluding renderer selectors; no visible labels, screenshots or selectors are exported. This is research intervention in an owned isolated page, not a production technique.

The sample accounts for 1,377 of 30,861 recorded inspections (4.46%). Twenty elements have no retained own color declaration and unchanged counterfactual color, consistent with inheritance in this observed state. Four change under forced inheritance: two blue link sources and one dark text source have variable-based author declarations; one red source has inline color. Actual source colors are rgb(33,98,161), rgb(15,17,17) and rgb(204,12,57). Duplicate declaration representations returned by CDP are retained as evidence, not counted as distinct winning rules.

This establishes a color dependency for the four changed elements and provides inheritance evidence for the other twenty. It does not uniquely select a winning selector when equivalent declarations match, establish every ancestor's source, or prove safe classification reuse. Equal counterfactual color alone would not prove inheritance; the absence of own color candidates is additional evidence. Shorthands such as `all`, animations, dynamic state, generated paint and unsampled elements remain outside a full cascade proof. This top-frequency sample is concentrated in a small carousel subtree and is not representative of the whole page or all 22.62% candidate work from the earlier session.

The first attempt (`source-attribution-1795009572874`) completed its interaction windows but failed CDP node resolution before retaining attribution rows. The corrected harness requests the DOM document first and additionally checks restoration; no failed sample is treated as success. Final runtime identity matches, source hashes remain unchanged, structural/resource hashes and geometry are stable during interactions, and owned cleanup completes on Windows / isolated Brave. Research-script syntax and patch whitespace checks pass; no production code changed or complete-suite result is claimed.

Implementation implication: a useful source layer needs variable-based roots, inline color roots and inherited descendants together. Merely transforming literal stylesheet colors misses the observed hot subtree. The next bounded prototype should propagate source ink through an explicit ancestor dependency model, with inline/variable mutations and reparenting as invalidation controls, then compare source values against direct unthemed reads. Keep backdrop-dependent output classification separate; shared source color does not imply shared final dark ink. The demonstrated notification gap remains unresolved and still blocks production reuse.
