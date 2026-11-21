# Further renderer performance: external research

The 18 November 2026 research covers Simulated Native and the shared custom-theme renderer, especially Amazon loading and carousel interactions. The 19 November follow-ups include measured scroll and carousel experiments. External references came from web search and may change independently of the recorded experiments.

Implementation follow-up: the [authored-paint separation experiment](PERFORMANCE-NEXT-STEPS.md#authored-paint-separation-prototype-18-november-2026) now tests one architectural prerequisite. Restricted source extraction is cheap when change notifications are complete, but the fast prototype retains a demonstrated cross-world invalidation gap. Full validation becomes expensive at stylesheet scale. This does not validate a hybrid renderer or establish an Amazon improvement.

## Revised priorities after profiling first input and settled scrolling (19 November 2026)

The most actionable opportunity is a window scroll on an already sampled document. The largest open latency question is the first wheel or click while the page is still changing. They take different code paths. The eight previous fresh Amazon profiles put median navigation-to-first-wheel movement at 879 ms with an explicit exclusion and 1,381 ms with Simulated Native. A separate warmed Amazon comparison already demonstrated a shorter worst scroll interval after batching source ink. Neither comparison establishes which part of a fresh interaction the next change can remove. [Prior trials and controls](PERFORMANCE-NEXT-STEPS.md#fresh-amazon-navigation-and-first-input)

### Where renderer work overlaps the user's wait

I intersected each recorded callback interval with the actual input window in `amazon-first-attribution-1795017400288/results.json` and took the union to avoid double counting. Windows and callback timestamps use the same document clock. These two older Chromium 157 profiles recorded callbacks longer than 35 ms. Shorter calls and browser work outside the callbacks remain unattributed. Nested columns overlap.

| Instrumented Amazon window | Total wait | In long viewport flushes | In long local inspections | In long full visible passes |
| --- | ---: | ---: | ---: | ---: |
| First wheel armed → first observed movement, trial 1 | 379 ms | 223 ms | 109 ms | 108 ms |
| Same, trial 2 | 471 ms | 343 ms | 117 ms | 166 ms |
| Click event → first observed carousel movement, trial 1 | 190 ms | 91 ms | 85 ms | 0 ms |
| Same, trial 2 | 90 ms | 44 ms | 42 ms | 0 ms |

No recorded long idle callback overlapped any of these four windows. The wheel timer starts before dispatch. The carousel timer in this table starts at the observed click event. Neither measures monitor presentation or field INP. Some renderer time includes Chromium resolving pending page styles. A counterfactual timing requires an intervention. The separate eight-profile run without renderer timers also shows longer click-event-to-motion medians with darkening enabled (about 160 versus 79 ms, four profiles per condition, only two geometry-matched pairs). This makes the post-click inspection worth investigating independently of the loading and idle averages. [Interaction latency phases](https://web.dev/articles/optimize-inp)

### 1. Eliminate proven-empty window-scroll scans

`collectVisibleSurfaces` calls `querySelectorAll('*')` on each participating tree before checking whether individual elements have already been sampled. The 664-element local image-label catalogue was allowed to settle and then received a physical 1,840 px wheel trip in both directions. On both themed repeats, 354 viewport collections consumed 165 and 181 ms respectively. Neither route called `inspect` at all. A separate counting run recorded 235,056 node visits in each repeat (354 × 664) with zero unsampled eligible elements. These are aggregate costs over roughly three seconds of scrolling. The largest observed themed frame intervals were already 9.2 and 8.6 ms in the timing run. The direct opportunity here is CPU cost. A visible reduction in stutter requires a more demanding document. Reports under `research-artifacts/diagnostics/` are `current-carousel-profile-1795111937911` and `current-carousel-profile-1795112005338`. Each used an excluded control and two themed repeats. Sampled paint and geometry matched within the themed repeats, the route and carousel reversal were observed, runtime identities matched, and cleanup completed on Windows / Chromium 158.0.8127.42.

**Candidate design.** During an ordinary exhaustive membership walk, establish whether any eligible element in each participating tree remains unsampled, including offscreen elements. A pure scroll request can reuse a proven-empty result while that proof is valid. An empty visible target set or a drained queue alone proves too little. Invalidate on insertions, moves, root registration/removal, any path that deletes or resets sampled membership, and any uncertain observation boundary. Preserve synchronous full refreshes, dirty subtree work, pending lookahead invalidation, and their existing order even when a scroll is coalesced. Test newly inserted nodes in the same frame, a known offscreen unsampled node scrolled directly into view, nested scrollers, shadow hosts and roots, resource completion, resize, focus and preset changes. Unknown membership uses the current collector. Account for bookkeeping during startup and DOM churn. A cached static node list alone can miss newly inserted elements. [DOM Standard](https://dom.spec.whatwg.org/#dom-parentnode-queryselectorall)

**Fixed-page intervention.** On this settled route only, a research copy bypassed the ordinary unpainted-window collection while physical scrolling was armed. Dirty/scroller-root requests and full refreshes kept the original path. The bypass was turned off before the carousel clicks. This relies on the fixed fixture and contains no general membership invalidation mechanism. The ten trials in `settled-scroll-ceiling-1795112074701` include two baseline repeats followed by four alternated pairs. The function timers and per-node counters were removed for this comparison.

| Completed scroll route | Current renderer | Fixed-page bypass |
| --- | ---: | ---: |
| Median browser task time | 257.9 ms | 132.7 ms |
| Median gesture round trip | 3,040 ms | 3,042 ms |
| Largest frame interval, four trials | 8.8, 8.7, 8.6, 8.8 ms | 8.9, 8.6, 18.3, 17.5 ms |
| Median browser style recalculation | 0 ms | 0 ms |

The 353–354 bypasses saved 121–133 ms in each adjacent pair. The two initial baseline trials differed by 12.4 ms. Median browser task time fell 48.6%. Two bypass runs had a longer worst frame, so the experiment supports a CPU saving only. Motion reached the required distance and returned to the origin. Sampled card paint and geometry matched across all themed trials, renderer identities matched, source seals held and cleanup completed. The fixture does not establish arbitrary-page coverage or intermediate-frame equality. No production change was made.

### Verified empty collection in Simulated Native

The implementation reuses an empty collection only after an ordinary frame has enumerated the document and its participating shadow roots and found no eligible unsampled element, including offscreen elements. Every relevant element insertion, sampled membership deletion or reset, and shadow-root registration change invalidates the result. A request combined with dirty work, a nested scroller, preloading or a full resample follows the existing collection path. A state microtask also follows the existing path because pending DOM mutations may still await observer delivery.

`verified-empty-scroll-1795112795469/results.json` measures the actual verification and invalidation logic. Ten sequential isolated Brave trials on Windows / Chromium 158.0.8127.42 used one diagnostic renderer with the optimization enabled or disabled. Two initial baseline repeats preceded four balanced pairs. In each candidate route the first collection verified membership and the next 353 could be skipped.

| Settled local scroll | Baseline | Verified collection |
| --- | ---: | ---: |
| Median browser task time | 270.6 ms | 141.9 ms |
| Median physical gesture round trip | 3,037 ms | 3,040 ms |
| Largest frame interval across measured pairs | 8.7 ms | 8.7 ms |

Each adjacent pair saved 115–137 ms of browser task time. The baseline repeats differed by 18.2 ms. Sampled paint and geometry matched throughout, the gesture reached its required distance and returned, the carousel clicked in both directions, runtime identity matched and browser/profile cleanup completed. The task-time saving is 47.6% on this fixture. The route and frame timings were similar. Amazon startup, settled scrolling and carousel latency remain unmeasured for this implementation.

The browser verification stage `Settled scroll collection` checks that a settled document can enter the fast path. It then inserts cards after a scroll callback is queued and compares their first sampled paint with themed controls in the document, a closed shadow root and a nested scroller. It also verifies that an offscreen insertion invalidates the result, checks first sampled paint after bringing that card into view, removes a closed shadow root and checks cleanup on deactivation and reactivation. These are frame-boundary computed observations with geometry checks.

### 2. Reduce synchronous source reads on actual carousel state changes

On the same local fixture a physical next click that changes an ancestor class causes 40 inspections, and the return click causes 34. Across the four actions, inclusive local inspection through queue drain is 17–27 ms, signature calls are zero, and original transition-color reads take 4–10 ms rounded. These totals include work after the first movement. This small image-label carousel exercises different content from the Amazon profiles. It cannot identify which helper caused the live 42–85 ms overlaps.

Trace one large fixed carousel click with the actual class mutation and physical motion. Distinguish marker removal, source-scheme exposure, the first style/layout flush, per-element transition destinations, image sampling, and restoration. One concrete experiment if repeated transition reads dominate is to pass the destination already computed by `inspect` to `chromiumColors` for that same element, only when both reads observe the same sampling state. The existing batch map caches animations, while each call to `originalTransitionColors` can still read their keyframes. Measure repeated calls on the *same* element/transition before implementing this. Preserve native-control and shadow paths and compare paused and progressing transitions. If a single browser flush accounts for most of the time, prioritize reducing the number of source-exposure transactions within that click. Group membership already affects inherited ink in a retained regression, so a speedup from simply changing which nodes are sampled together has an unresolved correctness cost. [Chrome forced reflow guidance](https://developer.chrome.com/docs/performance/insights/forced-reflow)

#### Carousel click-to-motion trace results

`research-artifacts/carousel-click-trace.mjs` instruments an isolated renderer copy. It hit-tests the storefront's next and previous controls and activates them with mouse input. The analysis starts at the captured click and ends at the first animation-frame sample that observes 2 px of directional movement. Each action must subsequently travel at least 100 px. Click and motion trace markers must agree with the page clock, and style and layout intervals are clipped to that time window and renderer thread. The trace retains aggregate facts and timing intervals. Timing scopes overlap, and the sampling callback can itself force styles or layout. These instrumented values describe the observed browser sessions.

| Completed run | Darkening disabled, four clicks | Simulated Native, four clicks | Themed local inspection | Browser style and layout in themed window |
| --- | ---: | ---: | ---: | ---: |
| Amazon first trace, 12 cards | — | 49.8–65.1 ms | 31.2–42.8 ms | 10.6–15.2 ms |
| Amazon same-document comparison 1, 12 cards | 12.2–20.3 ms | 56.9–70.1 ms | 37.9–47.0 ms | 10.4–14.8 ms |
| Amazon same-document comparison 2, 12 cards | 17.8–63.8 ms | 77.6–140.1 ms | 51.5–92.2 ms | 14.5–29.6 ms |
| Fixed 39-card local carousel, phase trace | 10.4–17.9 ms | 96.9–171.9 ms | 80.5–146.0 ms | 7.9–29.3 ms |

Both storefront comparisons held the same document and carousel across conditions, used two next/previous cycles per condition, and always ran disabled first. Each live pair of directions started at the same observed offsets, 0 and −487 px, and passed the motion gate. The three documents had different node counts. One disabled action also spent 32.5 ms in style and layout. The comparisons support a substantial extension-related cost in these sessions. The order, small samples and unsealed live DOM prevent a precise or general Amazon latency estimate. These settled clicks differ from the earlier first interaction during loading.

- **Classification occupied most of local inspection.** The 12 themed Amazon clicks spent 27.8–82.4 ms in the classification loop. Chromium style/layout events accounted for 3.8–11.4 ms within that loop. Scheme setup took 2.6–8.7 ms, marker exposure and restoration each took less than 1 ms, and role application took 0.2–0.6 ms. The remainder of the classification interval includes JS, CSSOM/property and DOM reads, allocation, and instrumentation. The summed time in individual helpers overlaps these intervals.
- **No single small helper explained the stall.** The detailed live traces put the main `chromiumColors` function at 22–56 ms inclusive, list-item generated-frame checks at 3–8 ms, backdrop resolution calls at 1–5 ms inclusive, and image-label checks at 1–3 ms. The checks measure a small number of helpers, leaving some work unattributed. On the deliberately image-heavy fixed workload, image-label checks alone took 31–46 ms. That workload is a useful contrast for avoiding a general conclusion from a synthetic bottleneck.
- **Two proposed shortcuts have little measured headroom.** There were 2–4 transition keyframe reads per live click, totaling at most 0.1 ms at the timer's resolution, with zero repeated keyframe reads within one element inspection. The visit-count follow-up reported 254–272 distinct elements per click and 0, 0, 0, and 16 repeat visits across the four actions. The 16 repeats all came from one idle batch after the viewport pass. The fixed local workload also classified 466–523 distinct elements per click with 7–16 repeats. The evidence favors reducing the cost of the ordinary per-element path. It supplies little support for a transition cache or for merging hover, idle and viewport batches to improve first motion.

This trace motivated timing the authored-paint snapshot and the remaining classification sections separately. The follow-up below also measures how many classified elements ended up with identical output.

Reports live in `research-artifacts/diagnostics/`. The initial live trace is `carousel-click-trace-live-1795113634114`. The completed comparisons are `carousel-click-trace-live-detail-1795113707694` and `carousel-click-trace-live-detail-1795113807249`. The fixed fixture reports are `carousel-click-trace-local-1795113621318` and `carousel-click-trace-local-detail-1795113795332`. All completed reports matched renderer identity, retained identical starting and ending source seals, and cleaned up their isolated Brave profiles (Windows, Chromium 158.0.8127.42). Incomplete attempts remain in the same directory. The first local harness queried preset identity before activation settled. Two live attempts had a storefront but yielded no supported target within the probe's conditions.

#### Inline transition edits and first motion

On 19 November, an isolated copy of renderer `8f57e3f` ran on two anonymous Amazon.es storefronts with 12-card carousels. Across eight physical clicks, 1,539 of 1,882 classified updates (82%) retained the same output rule or continued to have no rule. The other 343 assigned, changed or removed a rule. The instrumented classification loop took 28–67 ms per click. Copying authored paint into the per-element snapshot took 3.4–7.5 ms. Ink and surface classification took 4.1–9.3 ms, generated-frame and glyph checks took 2.8–8.6 ms, and the final border and repair section took 2.9–9.9 ms. These are ranges across clicks. A CSSOM read can include browser style work within any section.

The viewport collector attributed all 190–271 selected elements per click to roots dirtied by inline style changes. In the second run one track edit per click accounted for 253–271 selections. The observer's old and delivered values differed in `transform` and the five `transition` longhands. The later policy comparisons recorded a change from no inline transition property to `all` on the live actions. The current movement filter already handles a transform by itself. Broadening that filter to transition changes would affect a different set of author behaviors.

To measure the scheduling opportunity, both policies parsed the same bounded inline edits in the same instrumented extension copy. For eligible transform/transition edits, the experimental policy left the ordinary idle scan active and omitted the immediate dirty-root request. Each block used a physical Next and Previous on the same document, with the theme reset and queues drained between themed blocks. One session used current/deferred/deferred/current and the next reversed that order. Source ran first in each session. Each cell below is the median of four clicks, measured to first observed 2 px movement. All clicks subsequently traveled at least 100 px.

| Public Amazon.es session | Darkening disabled | Current Simulated Native, Off | Experimental deferral | Current / deferred inspections before motion |
| --- | ---: | ---: | ---: | ---: |
| Current policy first | 36.9 ms | 88.4 ms | 31.5 ms | 254–288 / 1 |
| Deferred policy first | 16.9 ms | 60.2 ms | 26.5 ms | 254–272 / 1–17 |

The disabled timings in the first session ranged from 18.8 to 262.9 ms. The reversed session held the same 363 carousel descendants and 1,425 px viewport at every block boundary. The metric covers settled interactions on those two documents. It excludes navigation, total work after motion, display presentation and personalized pages.

**Preservation failed.** The checked-in synthetic track has an author selector that matches the inline transform and changes the background of one swatch. Its neighbor has the same initial paint and no dependency. Darkening disabled and the current renderer each matched the expected first-motion paint on four of four clicks. Deferral missed on four of four. Forward motion left the old dark gray in place. Reverse motion exposed the authored light gray before the dark mode repair caught up. Both swatches matched the reference after idle in all four trials. A settled screenshot would miss this regression. The measured CSS dependency uses only a transform transition, a narrower case than the storefront's `all`. [Fixture](../fixtures/diagnostics/inline-motion-dependency.html)

A separate same-document paint audit sampled six computed properties on 96 fixed element references, evenly spaced through the live carousel. For each direction and property, the comparison required the original element to intersect the carousel viewport at first motion in every themed trial, equal starting values across policies, and repeatable first-motion values within each policy. The same 363 descendants were present by count at all block boundaries. Next had 10 different foreground colors among 76 eligible elements. Previous had 14 among 75. All of those differences converged after the interaction and queue drain. Text fill and top border color had the same counts. The sampled backgrounds, opacity and visibility had zero repeatable differences. Computed border or foreground color can exist without a painted border or visible text. The sample excludes generated layers and supplies no pixel or legibility verdict. The extra reads ran in a separate session from the timing table. Its report ends in `1795115070220`.

**Decision.** Keep the current synchronous behavior. Across 1,882 updates, 1,010 returned the same single foreground declaration with no transition or generated rules. This identifies a group worth profiling. It does not establish eligibility on the next frame. Test whether a cheap check can verify the current authored ink, inherited backing and repair eligibility within the existing source-exposure transaction for those elements. Fall back to full classification when any required input is unknown or changed. Include the live first-motion ink comparison, the inline-selector swatch, generated frames, transitions and the existing batch-inheritance case as preservation controls. Compare total click latency including the check. An expensive signature can erase the saving.

Reproduce with the following commands from the repository root. The first exercises the local color control. The live runs use isolated profiles, public controls and aggregate facts. The browser runner supports `CHROMIUM_PATH`. Raw CDP trace streams are processed in memory. Results and instrumented extension copies stay under the ignored `research-artifacts/diagnostics/` directory.

```sh
node --experimental-websocket tools/research/carousel-click-trace.mjs --probe-motion
node --experimental-websocket tools/research/carousel-click-trace.mjs --live --phases --compare-source
node --experimental-websocket tools/research/carousel-click-trace.mjs --live --probe-motion --compare-source
node --experimental-websocket tools/research/carousel-click-trace.mjs --live --probe-motion --compare-source --defer-first
node --experimental-websocket tools/research/carousel-click-trace.mjs --live --probe-motion --compare-source --audit-paint
```

Phase reports end in `1795114348555` and `1795114423345`. Live scheduling comparisons end in `1795114567851` and `1795114686445`. The checked-in color control ends in `1795114716113`. Each run matched the instrumented renderer identity, preserved its code/fixture seals, and completed isolated profile cleanup on Windows with Brave (Chromium 158.0.8127.42).

The final diagnostic repeated the local color control with policy order reversed (`1795115474052`). All four deferred clicks again missed first-motion paint. Across both orders the authored page and current renderer matched their references on eight of eight clicks each. The independent swatch and settled colors passed for every policy.

#### Testing reuse of a single foreground declaration

On a fresh isolated Brave visit to Amazon.es, the four physical clicks spent 24.6–32.2 ms inspecting elements whose previous output was a single color declaration. The enclosing classification loop took 43.4–57.2 ms. These instrumented intervals overlap. They include reading current inputs and updating source snapshots, work a safe implementation would still need. A diagnostic compared old and current authored color, text fill and projected solid backing against the result of full classification. Of 671 previous-color-only inspections, 623 met the comparison and all 623 retained their paint. The probe read the backing already computed by full classification. Its timing does not establish the cost of obtaining that backing independently or a realizable speedup.

The unmodified local image-label carousel also returned correct predictions on all 355 admitted inspections. A synthetic state that adds a broad white shadow to track descendants and a generated frame on card groups broke the prediction on 81 and 83 inspections on the two forward clicks. Comparing the complete stored own-paint snapshot rejected all 164 incorrect predictions, but supplied zero correct admissions during those forward clicks. The snapshot omits some contextual and generated-layer inputs, so this single control cannot validate general reuse. Keep full classification. The next experiment should price the required guards separately and exercise generated-only paint changes with the element's own snapshot held constant.

Run `node --experimental-websocket tools/research/carousel-click-trace.mjs --phases --challenge-color` for the adversarial workload. The live, local control and final challenge reports end in `1795115618096`, `1795115640073` and `1795115705166` respectively. These are retrospective rule predictions with production paint still applied on every click.

#### Generated border changes with stable element paint

A local carousel variant puts three list items on each card group. The forward click adds a border to the first item's existing `::before`, changes the second item's transparent border to opaque gray at the same width, and leaves the third item's paint alone. The renderer's stored element paint, authored foreground and projected backing agreed with their prior values on **108 inspections that nevertheless required a different rule**. Checking the content and top border width of both pseudos rejected 54 of those predictions. Including their top border colors rejected the other 54. The forward trials also admitted 220 correct predictions with the expanded check. The final local rerun enforced these outcomes with assertions.

On four physical clicks in one anonymous Amazon.es carousel session, the two computed pseudo-style reads and the six property reads took **3.0–5.2 ms per click** across 158–180 previously color-only inspections. The combined check, including equal stored element paint and projected backing, admitted 613 correct predictions and zero incorrect predictions in the observed windows. The pseudo timing includes storing the result for comparison. It excludes snapshot comparison and independent backing resolution. Full classification still ran on every element, so the measurement provides the cost of this part of the check. A complete shortcut would also need evidence for other inputs, including generated images, side borders, element geometry and ancestor-dependent paint. Directly reusing a previous paint rule remains experimental.

Reproduce the local control with `node --experimental-websocket tools/research/carousel-click-trace.mjs --phases --generated-frame`. Measure the same reads on the public carousel with `--phases --live --compare-source --measure-frame-check`. The detailed local, assertion rerun and live reports end in `1795115914043`, `1795115971085` and `1795115927511`.

#### Backing and signature costs before rule reuse

On four physical clicks with 0.13.1 in isolated Brave, an own-paint snapshot comparison took 0.4–0.6 ms per click. Resolving the backing ahead of classification took 0.4–0.8 ms for the 143–167 candidates per click that passed the snapshot check. The backing check used a separate cache with the production sampling batch's lifetime. It agreed with every sampled production backing. Together with the generated-border reads, the measured checks took 3.7–6.6 ms per click. The combined check correctly predicted 620 unchanged rules. On the local generated-frame workload it admitted 464 correct predictions and rejected the 108 known changes. Reports end in `1795196848981` and `1795196842692`.

A separate storefront session timed the existing wider sampling signature for the same type of candidate. It includes element geometry, authored state, image information, backing, and more generated-layer properties. That read cost 11.2–13.1 ms per click over four clicks, and correctly predicted 688 unchanged rules with zero observed false matches. The two sessions served different documents, and their timings describe the checks rather than the speedup from using them. Both probes kept full classification and produced diagnostic comparisons. The broader-signature report ends in `1795196971946`.

Use `node --experimental-websocket tools/research/carousel-click-trace.mjs --phases --live --compare-source --measure-backing-check` to repeat the narrower probe. Replace `--measure-backing-check` with `--measure-paint-signature` for the wider signature. For the local control use `--phases --generated-frame --measure-backing-check`.

The next performance checks, in priority order:

1. **First scroll after navigation.** Repeat the cold first-wheel measurement on matched page content. Attribute long tasks to full viewport refreshes, dirty subtree inspections and browser style/layout. Then test which stylesheet edits actually require a full resample. Keep a first-frame reveal and an unchanged control.
2. **Repeated reads within a carousel sample.** Measure repeated pseudo-style and backdrop reads before persistent paint reuse. A per-sample cache has a smaller invalidation surface. Verify it across author transitions, generated images, side-only borders, inherited paint, and shadow trees. Score it on paired click-to-first-motion timing with first-frame paint and geometry as controls.
3. **Scroll while the page is still changing.** Add a fixed workload with image decoding, inserted cards, and a nested scroller. Compare browser task time and the slowest frame intervals. The settled-scroll benchmark establishes a CPU saving and provides a baseline for this more demanding case.

#### Repeated computed-style lookups within one carousel inspection

On four physical carousel clicks in a public Amazon.es session, each themed click performed 254–288 repeated own-element style lookups and 22–28 repeated own pseudo-element lookups within an inspection. Together the calls to obtain the style objects took 0.1–0.5 ms per click. The timers exclude subsequent CSS property reads. Classification took 37.6–73.8 ms in the same windows. A cache of style objects has little measured time to recover, so these reads retain their current behavior. Repeat with `node --experimental-websocket tools/research/carousel-click-trace.mjs --live --compare-source --measure-style-reads`. The report ends in `1795256081679`.

#### Scrolling while a catalogue inserts cards and decodes images

The synthetic route uses the fixed 300-card catalogue. Each physical 800 px gesture crosses four insertion thresholds and decodes 32 new local images. The window gesture starts after visible theme paint is ready while background sampling can still run. The nested scroller follows within the same page. Both gestures record frame intervals, task time, newly inserted notice paint at the first sample, and a fixed independent control.

In the initial four-per-policy comparison, median browser task time for the window gesture was about 68 ms with darkening disabled and 624 ms with Simulated Native. Nested-scroll medians were about 61 and 144 ms. Frame p95 was about 8.5 ms across configurations. The separate attribution run measured 98–137 ms in viewport collection and 337–342 ms in idle sampling during the window gesture. The latter includes time inside local inspection, so the nested phase totals overlap. The baseline and attribution reports end in `1795256222598` and `1795256274179`.

Clean Simulated Native window-scroll frames now retain the unsampled elements in each observed tree. They still evaluate current geometry, including offscreen and hidden elements. Insertions, forgotten samples, shadow observation changes and renderer resets discard the list. Newly encountered shadow trees are fully collected until the renderer observes them. A proven empty collection discards the list and keeps the existing empty-collection shortcut.

| Four adjacent pairs per run | Window task time, current → retained | Task time through queue drain, current → retained |
| --- | ---: | ---: |
| Prototype, current first | 588 → 540 ms | 741 → 694 ms |
| Prototype, retained first | 610 → 546 ms | 768 → 691 ms |
| Integrated collector, retained first | 628 → 593 ms | 782 → 735 ms |

The integrated comparison saved work in three of four adjacent pairs. Window frame p95 stayed at 8.5 ms, nested timings varied, and all first-frame notice and settled control samples matched. Each run includes two extra current-collector trials to observe baseline variation. This is a CPU saving on a local loading workload. Scroll smoothness and live-page gains remain open. The comparison reports end in `1795256431972`, `1795256492372` and `1795256645957`. Re-run the integrated comparison with `node --experimental-websocket tools/research/scroll-during-load.mjs --compare-collector --reverse`.

On the final renderer, two additional window gestures counted 1,392 initial idle inspections each, alongside 191–239 inspections of already sampled elements. That means roughly 85–88% of idle inspections began with an unsampled element. Prioritize reducing the cost of initial classification on this workload. The counts describe sampled membership at classifier entry. A mutation can forget membership and require fresh classification. The report ends in `1795257374929`. Reproduce with `--attribute --count-inspections`.

### 3. Determine which stylesheet edits really require a global resample

#### First-wheel attribution and skipped image signatures

Two fresh anonymous Amazon.es loads on 21 November recorded 12 and 16 full visible passes, taking 669 and 762 ms respectively over the observation window. The stylesheet audit found one equal serialization across separate mutation batches in each load. The other 43 equal observations were repeats within a batch. Each load also recorded an actual rule replacement across batches. This provides little support for adding a CSSOM comparison to discard repeat stylesheet refreshes.

A separate physical-wheel run completed two Simulated Native trials and one excluded trial. Another excluded visit returned a 39-node page with no storefront navigation and was omitted from timing. From arming the first wheel to observed movement, the themed trials took 507 and 209 ms. Full visible passes occupied 141 and 54 ms of those windows, including explicit stylesheet loads or insertions and root attribute edits. The excluded trial took 296 ms, with substantially different content at the time of input. These samples attribute work within the themed windows. They do not support a paired claim about the extension's input delay.

The full visible pass always re-inspects images so resource-backed classification can respond to its context. It now omits their unused signature while populating the same batch backdrop cache entry. The local comparison used a 300-card catalogue with 300 decoded multicolor images, two initial baseline repeats, and four adjacent baseline/candidate pairs. Each 12-edit stream retained its refresh and inspection counts. It skipped 576 signature builds per stream. Median browser task time for broad edits fell from **1,566 to 1,471 ms**, with all four pairs saving work. Median JavaScript time fell from **832 to 767 ms**. The narrow stream had mixed results, with task medians of 984 and 974 ms. The change stays limited to full viewport image signatures.

First-frame and settled sampled paint matched in every trial. Small settled screenshot differences of 45–50 pixels appeared against the first baseline in both baseline repeats and the candidate. In a three-trial follow-up (`image-signature-images-1795249812465`), the second baseline and candidate produced byte-identical PNGs for the affected state. Each differed from the first baseline by the same 50 pixels at a maximum channel delta of one. The no-image control skipped zero signatures. The benchmark measures a CPU reduction on a fixed image-heavy workload. The production effect on live first-wheel latency remains unmeasured.

Evidence under `research-artifacts/diagnostics/` includes `amazon-first-sheet-inventory-1795249092713`, `amazon-first-wheel-attribution-1795249279917`, `image-signature-images-1795249335097`, and the no-image control `image-signature-1795249164808`. Runs used Windows and isolated Brave (Chromium 158.0.8127.42). This focuses the next startup comparison on shorter full passes and the rendering cost of genuine authored changes.

#### Earlier stylesheet inspection and inventory

The current full visible pass exposes the source sheet state, visits every visible candidate and compares full signatures. The fixed narrow stream spent 582 ms in signatures and 11 ms classifying elements across the measured paths. Accelerating only known mismatches barely changed broad-stream browser task time (3,910 → 3,870 ms, within repeat variation). A potentially larger saving is to avoid initiating a redundant full pass. This needs evidence about the stylesheet *and all other reasons coalesced into the same pass*. In the two detailed earlier Amazon startup profiles, passes attributed solely to stylesheet text occupied 75 and 264 ms. Those totals include necessary work and are descriptive ceilings for eliminating those sole-cause full calls in those runs. [Fixed benchmark and startup causes](PERFORMANCE-NEXT-STEPS.md#full-pass-signature-shortcut-on-a-fixed-stylesheet-workload)

An audit of the older `c3-rule-scope-probe.mjs` found two measurement defects. It recurses on `rule.cssRules` before collecting the rule's own selector. A normal style rule can expose an empty child list, and a nested style rule can contain its own declarations as well as children. It also starts reading at the previous rule count, missing replacements at the same length and removals. Its zero affected counts cannot establish that a sheet change had no effect. Dark Reader keeps serialized rule keys and tracks grouping context and deletions when modifying stylesheets. That is a useful precedent for the research inventory. Its caches do not establish that our contextual repairs can skip an element. [CSS Nesting CSSOM](https://drafts.csswg.org/css-nesting-1/#cssom) · [Dark Reader stylesheet modifier](https://github.com/darkreader/darkreader/blob/main/src/inject/dynamic-theme/stylesheet-modifier.ts)

The corrected research probe compares ordered top-level CSSOM serializations including nested content, records style rules with their own declarations/children, distinguishes first observation from replacement, and labels multiple records delivered in the same observer batch. Two isolated controls each detected six expected states, including a same-length replacement, append, removal, comment-only equality and a nested rule. Both subsequent anonymous Amazon visits returned a complete 39-node page without the expected storefront navigation. No storefront rule distribution or new live timing was obtained. Both profiles were removed and start/end source seals matched (`amazon-first-sheet-inventory-1795111786866`). Equal observed rules alone cannot prove unchanged paint. Sheet ordering, enabling, media, imports, intervening CSSOM changes, relational selectors on the style element and unrelated coalesced causes still matter. Keep full processing for uncertain cases. Only count a possible saving after isolating the affected pass and testing the first frame of a real reveal.

### When to revisit broader architectures

An earlier specificity-preserving index for generated paint rules lowered median style work by 19.846% on the varied-color catalogue, with nearly flat action time. The shared-color control had only seven paint entries and slightly higher completed work. Consider reviving that candidate only if a current costly interaction spends appreciable time matching our generated rules. Blink looks up attribute rule lists by attribute name and may skip a list using its value. Chrome's Selector Stats distinguishes elapsed matching time, attempts, and matches, and adds tracing overhead. Run it for attribution, then disable it for timing. The current settled-scroll intervention recorded zero style recalculation in both conditions, so indexed CSS cannot explain that particular saving. [Earlier experiments](../PLAN.md) · [Blink rule collector](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/css/element_rule_collector.cc) · [Chrome Selector Stats](https://developer.chrome.com/docs/devtools/performance/selector-stats)

A stylesheet-first renderer remains a larger architectural possibility for pages with widely shared base declarations. Our mirror experiment established a counterexample where an edit from another isolated world leaves cached source ink stale, and full-sheet validation was more expensive than source exposure at scale. Reopen this route when there is a bounded source policy with reliable invalidation and enough measured coverage to retire existing per-element work. A second complete pipeline would add startup work. [Mirror experiments and opportunity measurements](PERFORMANCE-NEXT-STEPS.md#authored-paint-separation-prototype-18-november-2026)

### Decision gates

Use a paired comparison of the current renderer and one candidate, with repeat controls and identical physical input on the same fixed content. For settled scrolling, measure renderer task time across the completed route, frame tails and time to first correctly themed newly exposed content. For startup, use navigation-to-first-movement and match content and response timing as far as possible. For the carousel, use actual click-to-first-motion and check both directions. Require a gain exceeding repeat variation on the user-visible metric before claiming smoother interaction. A reproducible decrease in CPU work with equal frames is a separate valid outcome. Keep exact sampled first-frame and settled appearance, geometry and source restoration checks. Recheck a normal anonymous storefront before attributing any fixture improvement to Amazon.

## Assessment against our evidence

We have not established a hard performance ceiling. We have established that two additional sample-reuse candidates did not justify promotion. The latest narrow candidate skipped zero elements: median idle callback work was 381.45 versus 379.00 ms and median largest frame interval was 50.10 versus 50.00 ms. Those are aggregate callback work and frame intervals, not page-load time or INP. They do not measure the extension's overhead against an unmodified page. See [the retained experiments](PERFORMANCE-NEXT-STEPS.md).

The earlier K2 loading confirmation failed its normalized-work gate, while its promising interaction results used differing live content. Repeated inspections are therefore a lead, not proof that their results can safely be reused. Source/resource invalidation and different sampling contexts matter.

The present implementation already uses constructed stylesheets, CSSOM insertion and shared output rules keyed by paint. It skips unchanged output, reuses unused rule entries, batches authored reads in several paths, prioritizes visible work, and performs bounded idle batches. Suggestions to introduce these mechanisms from scratch would misdescribe the code.

Our largest remaining opportunities appear to be reducing how often authored styles must be exposed and sampled, and reducing the number of elements that need contextual classification. This is an engineering inference, not a measured speedup prediction.

## Browser mechanisms and their implications

**Invalidation is deferred work.** Blink builds invalidation sets from stylesheet features, accumulates affected nodes, and processes pending invalidations when styles are needed. Its sets deliberately allow some extra work to preserve correctness. A style read can consequently pay for earlier writes. [Blink design](https://chromium.googlesource.com/chromium/src/+/master/third_party/blink/renderer/core/css/style-invalidation.md)

For our renderer, the relevant unit is the entire write/read/recalculate sequence, not just JavaScript time in a color function. Track stylesheet/root-scheme exposure, marker changes, computed-style and geometry reads, and the subsequent restoration cost. Inclusive JavaScript durations and nested style/layout events must not be added together as independent work. Historical measurements before K1 are useful attribution evidence, not today's complete cost distribution.

**Read/write ordering matters.** Chrome documents that reading geometry after changing styles can force synchronous layout, and recommends batching reads before writes. This does not imply every computed-style call triggers layout. [Layout thrashing guidance](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing)

We already apply batching. Further changes must preserve the authored sampling state and transitions. Combining groups is only useful if reduced recalculation outweighs a longer uninterrupted task. The current 6 ms budget is checked between groups; it cannot interrupt one expensive browser style flush. Never yield while the theme sheet is disabled or authored-sampling markers are temporarily removed.

## Candidate directions

### 1. Coalesce pending subtree scans before execution

Dark Reader's tree observer collects additions, moves and deletions, removes immediate-parent duplicate additions/deletions, and handles very large mutation batches separately. This is evidence for normalizing pending work, not a transferable performance result. [Observer source](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/utils/dom.ts)

Our `schedule()` already collapses document-root work. `paintBatch()` also checks whether a pending parent or grandparent covers a selected root. A bounded next experiment can measure deeper ancestor overlap and roots enqueued in the opposite order.

- Count overlapping pending roots and the actual repeated element visits they cause, including the cost of identifying overlap.
- Coalesce only work whose scan has not begun, within the same tree and compatible invalidation requirements. Keep active iterators separate.
- Retain a follow-up scan for mutations after an active scan's snapshot; cover detached/reparented nodes and shadow roots.
- Stop if the avoidable work is small. Do not broaden cache reuse to make this experiment appear successful.

This differs from the rejected candidate: one future scan covers two requests, rather than a previous classification being assumed fresh. Expected magnitude remains unknown.

### 2. Prototype a stylesheet-based base layer with contextual repairs

Dark Reader's stylesheet modifier transforms declarations while retaining selectors and rule grouping, caches modified rules, and skips rebuilding when rules and theme have not changed. [Modifier source](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/stylesheet-modifier.ts)

The architectural hypothesis is to transform eligible source color declarations once and let the browser apply them to matching elements and states. Keep our existing element inspection for backdrop-dependent contrast, image labels, functional glyphs, generated layers and semantic borders. A shared rule used by hundreds of ordinary elements could then avoid hundreds of equivalent classifications. This is the strongest candidate for a substantial change in work volume, but also the largest implementation risk.

Critical feasibility question: **can we identify a useful set of safe cases without first paying the full per-element inspection cost?** A hybrid that runs both complete pipelines could be slower. Start with one explicit, conservative class of declarations on synthetic repeated components, with transparent/image backdrops and inherited color as contrasting controls. Measure fallback coverage and its cost before proposing a renderer rewrite.

Preserve cascade order, specificity, importance, layers, variables, media/container conditions, inline styles, dynamic CSSOM changes and shadow-root scope. A declaration's role alone does not establish its final backdrop or semantic role. Class-name-only caches would lose this context. The ordinary browser CSSOM can also deny access to cross-origin stylesheet rules; unsupported sheets need a conservative fallback within our existing resource-access policy. [CSSStyleSheet documentation](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet)

The base layer must not contaminate the authored values read by the repair layer. If repairs still require repeated whole-sheet disabling, much of the expected saving may disappear. Exact existing output on a fixture is a gate, not proof of universal compatibility. This proposal neither establishes that Dark Reader is faster than our renderer nor adopts its site-specific exceptions.

### 3. Narrow invalidation by recorded dependencies

Our latest reason probe rejected 908 checks per cycle because a source/resource invalidation was newer. That count combines reasons and does not show that those invalidations were unnecessary. A useful follow-up, only if attribution supports it, is to distinguish global stylesheet changes from a resource completing for a small known set of dependent labels or glyphs.

Record which consumers depend on an analyzed image/resource and invalidate those consumers where the dependency is complete. Ancestor backdrops, descendants and shared resources can expand that set. Unknown dependencies retain broad invalidation. This is a bounded dependency map for our own repairs, not a reimplementation of Blink's selector engine. First measure how many global invalidations originate from local resource completions and how much work they actually cause.

### 4. Improve scheduling only where pauses justify it

`scheduler.yield()` resumes in a new task with a prioritized continuation; it can improve responsiveness during long JavaScript work. [Chrome scheduling documentation](https://developer.chrome.com/blog/use-scheduler-yield)

Changing from idle callbacks is not automatically an optimization: our background work already yields. Consider an experiment only if traces show a harmful scheduling pattern or oversized groups. Compare input-to-presentation latency, frame intervals, queue-drain time and transient visual correctness together. Deferring restyles can reduce immediate work while leaving stale paint visible; that is a behavior tradeoff requiring explicit evaluation.

## Attractive suggestions with limited fit

| Suggestion | Assessment for this renderer |
| --- | --- |
| Move classification to a worker | Workers cannot directly access the page DOM. Pure image/color calculations could move, but authored reads and applying paint still need the document thread. Include transfer, scheduling and stale-result handling in any test. |
| Rewrite calculations in WebAssembly | Only useful if remaining pure computation occupies a substantial measured share. It does not eliminate browser style invalidation, layout or DOM access. Our image-luminance optimization already substantially reduced one numerical hotspot. |
| Replace appended style elements with CSSOM | Already implemented. Shared output rules also already exist. Further gains would concern rule matching, churn or sampling, not simply changing the insertion API. |
| Add `content-visibility` or containment everywhere | Unsuitable as a blanket extension optimization: containment can change containing blocks, stacking and clipping. Prefer respecting existing page containment where safe. Geometry/style reads can undermine skipped rendering. |
| Cache by class or a smaller style fingerprint | The repaired pseudo-border and side-width collisions demonstrate the correctness risk. A shared class is not a complete rendering dependency. |

Sources: [worker capabilities](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers), [content visibility and forced rendering](https://web.dev/articles/content-visibility), [containment effects](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/contain). The WebAssembly recommendation is an inference from which work remains on the document thread, not a new benchmark.

As a simple upper bound, if a pure kernel accounts for 10% of total work, eliminating it entirely can save at most 10% of that total. This is an illustration, not an estimate of our current kernel share. A small average share can still matter if concentrated in one interaction stall.

## Measurements that can decide these proposals

1. Use the existing runner: disabled/plain, current production and one candidate. Match instrumentation between conditions, preserve equal physical actions and source identity, and alternate order. A warmed same-document comparison reduces network/content variation; separate fresh-load trials are still necessary. Discarding unpaired failures or missing controls would bias the result.
2. Separate DOM traversal, authored sampling, classification, output writes, browser style/layout, and paint. Record global-toggle counts and affected-element counts. Use nested trace accounting rather than summing overlapping timers. Quantify how much work an intervention could remove before building it.
3. Use Selector Stats only for attribution. It identifies expensive matching but adds recording overhead; final timings need equivalent lighter instrumentation. [Chrome Selector Stats](https://developer.chrome.com/docs/devtools/performance/selector-stats)
4. Long Animation Frames can describe slow frames, but Chrome explicitly excludes isolated-world extension scripts from script attribution. An empty attribution list does not exonerate the extension. Keep CDP traces, renderer counters and controlled condition differences. Also retain shorter frame intervals: a frame need not exceed the API's 50 ms threshold to be visibly late. [Chrome LoAF documentation](https://developer.chrome.com/docs/web-platform/long-animation-frames)
5. Preserve intermediate and final paint, geometry, controls, resize, source-scheme changes and generated-layer invalidation. Synthetic acceptance precedes live confirmation. Do not rename total idle work or a maximum frame interval as INP.

Recommended order: one bounded pending-root overlap experiment; targeted invalidation attribution if it explains meaningful work; then a small hybrid feasibility prototype if a substantially larger improvement remains the objective. Set numerical promotion gates before candidate timings and require evidence beyond ordinary run variation. Stop each direction when its measured opportunity is too small or preservation fails. Native remains the default; this research proposes no product-mode change.
