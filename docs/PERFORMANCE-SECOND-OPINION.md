# Performance second-opinion handoff

Prepared 14 November 2026 for an independent review by Fable 5.1. Read this alongside the actual source and raw evidence; its interpretations are reviewable hypotheses, not instructions to agree with them.

## Objective and boundaries

Identify reliable, substantial ways to reduce main-thread stalls in this Chromium extension, especially Simulated Native on Amazon. Recommend the highest-return next experiment and a realistic implementation sequence. The user has deferred Amazon-specific visual adjustments. Performance changes must retain rendering behavior and site independence.

Native Dark Mode is an unpublished Manifest V3 extension, version 0.12.0. **Native** remains the default and uses Chromium's debugger-driven auto-dark renderer. **Simulated Native** is the `chromium` custom preset, implemented by the extension's DOM/computed-style renderer. Soft dark and High contrast share structural mechanisms with it but have different palette policy. Native and Simulated Native are different paths; do not benchmark Native as the no-theme control.

Read `AGENTS.md` for constraints. End users load `extension/` directly without a build or dependencies. Preserve rules, exclusions, frame lifecycle, reversible cleanup, source resource delivery, useful color relationships, imagery and geometry. Repairs must not contain Amazon hostnames or proprietary selectors. Research scripts may use site-specific selectors. Image reads remain bounded and CORS-aware. A contrast threshold alone does not establish accessible appearance.

## What to read

1. `AGENTS.md`, `README.md`, `docs/ROADMAP.md` for product intent and constraints.
2. `extension/website-theme.js` and its dependencies, independently of our conclusions.
3. `docs/WEBSITE-THEME-RENDERING.md`, `docs/IMAGE-TEXT-CONTRAST.md`, and `docs/CHROMIUM-DARK-MODE-HANDOFF.md`. The last document contains historical upstream context, not the entire current design.
4. `docs/RENDERING-EFFICIENCY-PLAN.md`, especially section 8, then the performance sections near the end of `PLAN.md`. `PLAN.md` is chronological; later corrections supersede earlier interpretations without erasing failed evidence.
5. The evidence table below, first summaries and then corresponding `results.json`, scripts, copied initializers, CPU profiles and traces.
6. `docs/RENDERING-REPAIR-WORKFLOW.md`, `docs/INCIDENT-RESPONSE-FLOW.md`, `docs/REPORTING-AND-FAST-TESTING.md`, fixture notes and tests for preservation/verification requirements.

The portable review package contains the complete Git-visible working tree, including uncommitted and untracked source/documentation, under `project/`. Research paths below are relative to that project directory. A GitHub ZIP or `git archive HEAD` alone would omit most evidence and current untracked implementation files. Consult the package's snapshot, manifest and patch rather than assuming HEAD equals the measured source.

## Current source and verification

- Raw renderer initializer SHA-256: `97274f0535f3d7ce907d112be248d3b217f2967587d7f02b256550a1a9bae8ca`.
- Measured code seal: `0f611b3aaaa72392af29b5bf4e40de9f39fe42dd287a41abba9c11e74e65f32e`.
- Fixture seal: `0d3d0c5e56706c53071923c2e6b81ea0a4ffa8f0d193c0260ed67a9c7b22761f`.
- Code seals cover `extension/`, `scripts/dev/`, `tools/diagnostics/`, `test/`; fixture seals cover `fixtures/`. They do not cover every project document or research script. The package also hashes each included file.
- Complete verification on these source seals passed on Windows/isolated Brave, reported browser product Chrome/157.0.8103.79: 140 Node tests, seven launcher checks, 19 canonical assertions, lab UI/assets, 375 shared combinations/42 atomic units and diagnostic/lifecycle/source-paint checks. Report: `research-artifacts/diagnostics/verification-01e0eb7f-b8a8-4107-8342-7b4f56c9baf3.json`.
- Later performance research did not modify production code/fixtures. This handoff adds documentation only. A complete local suite pass is not Amazon performance or visual acceptance.

## Implementation map

Current line numbers are navigation aids; use function names if they drift.

| Source | Review focus |
| --- | --- |
| `extension/website-theme.js:497` — `inspect` | Classification, computed paint, semantics, source snapshots and repair selection |
| `:1920` — `authoredBackdropStyle` | Uses retained authored facts when local sampling leaves ancestor paint active; this snapshot is not an optional duplicate read |
| `:3685` — `originalTransitionColors` | First computed transition-property read can expose expensive pending style work |
| `:4376` — `applyChromiumColors` | Shared rules, unchanged-key early return, recycling, CSSOM and marker updates |
| `:4435` — `schedule` | Pending subtree work and existing ancestor coalescing |
| `:4449` — `inspectLocal` | Removes target markers and exposes the authored scheme per element through the sampling token when the authored root scheme is `normal` (root-rule exposure otherwise); restores synchronously. Promoted 14 November after the review's A1 experiment |
| `:4490` / `:4515` — `paintVisibleSurfaces` / `collectVisibleSurfaces` | Current-paint geometry collection, source sampling, full versus local passes |
| `:4650` — `paintBatch` | Idle scheduling, authored scheme per synchronous callback, Chromium groups of 16, palette groups of four, soft 6ms budget |
| `:5118` — `flushViewport` | Dirty and newly visible work, source sampling and paint application. A refresh coalesced with a scroll resamples the visible set only; the lookahead follows on the next frame (A5, promoted 15 November). Local batches force one style recalc instead of two and query running transitions once per batch (D2, promoted 15 November as an exact work reduction); image-label sampling reads cached pixel luminances and stops floor comparisons at the first failing pixel (E1, promoted 15 November, exact) |
| `:5175` / `:5210` — `refreshChromium` / `setPreset` | Broad invalidation, activation, source restoration, observers and lifecycle |
| `extension/chromium-colors.js` | Deterministic Chromium-derived color conversion |
| `extension/image-contrast.js` | Numerical image/foreground selection and uncertainty policy |
| `extension/controller.js`, `background.js` | Per-tab reconciliation and messaging; distinguish acknowledgment from visible readiness |

The renderer already uses **constructed CSSStyleSheet objects, adoptedStyleSheets, insertRule and direct declaration updates**. It is not repeatedly appending one style element per node. Identical paint can share a rule; unchanged paint keys skip writes. A worker cannot read this document's computed styles, geometry or DOM, nor make the browser's style calculation run in that worker. Those facts do not rule out a useful worker-ready kernel; its actual cost and integration overhead still need evidence.

## Most useful current measurements

### Local component attribution

Existing synthetic 300-card, heavy-CSS, varied-color catalogue plus 32 inserted-control/scroll steps; 1440x1000, DPR 1, zoom 1. Three ordinary runs, three aggregate-instrumented runs in balanced order, one separately sampled run, then three targeted getter diagnostics.

| Measurement | Median |
| --- | ---: |
| Ordinary complete work, including 200ms quiet confirmation | 4074.86ms |
| Ordinary browser style recalculation | 2828.66ms |
| Ordinary CDP ScriptDuration | 538.85ms |
| Ordinary layout | 11.70ms |
| Instrumented inspection, including native DOM/style and children | 1857.20ms |
| Instrumented visible-target collection | 83.30ms |
| Instrumented applying Chromium CSS/markers | 17.80ms |
| Four selected numeric helpers, nesting subtracted | 78.10ms |

These are overlapping measurements from distinct instrumentation conditions, **not additive buckets**. Instrumented script time rises; total-wall ranges overlap. Do not claim zero or negative probe overhead. The four numeric helpers do not upper-bound all worker-ready work. The sampled run attributes about 32ms to GC but is not pooled with ordinary timings.

Targeted diagnostics measure about 1221ms reading `transitionDuration`/`transitionDelay` inside `originalTransitionColors`, with **zero calls to getAnimations in this no-transition fixture**. This exposes a style-read hotspot; removing/reordering that getter can simply move the flush to the next reader. It is not proof the function's numerical work takes 1.2 seconds or that all pages have zero transitions.

### Latest real Amazon interaction evidence

Anonymous public page, current code, one warmed document, real input, no CPU profiling or tracing. Each trial resets to stable unthemed source, requests its condition, then immediately scrolls; the carousel uses the same real next/previous controls. This is **activation/initial-busy interaction after loading**, not continuously themed navigation or settled themed scrolling.

Both final A/A controls pass. Six source/theme pairs were attempted. Amazon later changes its body/resource snapshot, so the original unchanged-reference six-pair verdict remains **incomplete/incompatible**. A separately labeled exploratory analysis identifies five adjacent pairs that match their own snapshots, source paint, geometry, route and starting carousel state, spanning two cohorts. One incompatible pair remains excluded from paired summaries and retained raw. Do not promote that post-run grouping to predeclared confirmation.

| Exploratory matched-pair median | No website theme | Simulated Native/Off |
| --- | ---: | ---: |
| Real scroll gesture completion | 4172.37ms | 5696.41ms |
| Counter observation window | 4176.06ms | 6063.76ms |
| Browser style work | 321.73ms | 3425.07ms |
| CDP ScriptDuration | 453.71ms | 2241.98ms |
| Browser layout | 0.637ms | 28.677ms |
| Largest sampled rAF gap per trial | 91.6ms | 958.4ms |
| Carousel host dispatch-to-observed-settling | 698.86ms | 1050.76ms |
| DOM click-to-first-observed carousel movement | 25.35ms | 275.40ms |

Carousel host timings include CDP/polling and a 100ms stability confirmation, after pointer placement. Computed movement/direction/reversal are verified; these are not INP or monitor-presentation measurements. Baseline means the extension is loaded without website overrides, not extension absent.

### Loading and remaining gaps

Six balanced fresh-profile navigations per condition completed with HTTP 200 and intended runtime/preset. Host navigation to normal-DOM-ready proxy:

| Statistic | No theme | Simulated Native/Off |
| --- | ---: | ---: |
| Mean | 2288.95ms | 4058.26ms |
| Median | 1599.46ms | 3853.68ms |
| Range | 1519.24–5884.94ms | 3588.33–5191.62ms |

The slow source outlier is retained. FCP means are about 322/325ms and do not establish usable, correctly themed content. Fresh profiles do not clear OS/GPU/proxy caches; public content differs, so these are descriptive proxies rather than a matched-content loading slowdown percentage. There is no extension-absent control.

The themed pilot still has a background scan running after the declared 45s observation budget. **Settled themed scrolling was not observed**, and 45s is not its completion time.

Earlier quick availability checks could stop on a transient tiny document. A corrected gate reaches the normal page. Treat old claims of unavailability based only on those quick probes as superseded; keep genuine failed normal-page attempts as failures. Earlier CPU-profile experiments also stop their action wall timer before profiler shutdown but read counters afterward; do not divide those counters by the narrower wall timer. The latest component diagnostics use consistent metric boundaries and clipped CPU weights.

## Evidence entry points

Every row is under `research-artifacts/diagnostics/`. The package index inventories additional runs, failed attempts and files.

| Evidence | Read first |
| --- | --- |
| Latest Amazon interactions; original versus exploratory verdict | `controlled-amazon-final-1794668645051/summary.json`, then `results.json` |
| Fresh-profile loading, all 12 samples | `controlled-amazon-loading-1794668410106/results.json` |
| Initial-busy and failed 45s settlement gate | `controlled-amazon-pilot-1794668004193/results.json` |
| Failed early reference / impossible short-page route | `controlled-amazon-pairs-1794668223567/results.json`; `controlled-amazon-confirmation-1794668498040/results.json` |
| Corrected normal-page availability | `controlled-amazon-readiness-1794667841275/results.json` |
| Component attribution and current sampled profile | `component-timings-1794666266303/summary.json`, `results.json`, `current-workload.cpuprofile` |
| Getter versus animation enumeration | `component-getter-1794666451098/summary.json`, `results.json` |
| Public source-sampling style trace and repeated work | `phased-attribution-1794589956681/summary.json`, `results.json`, `theme-scroll-traced-trace.json` |
| Queue requests versus actual scans | `queue-refresh-1794591911400/results.json` |
| Controlled DOM/CSS matrix | `performance-matrix-summary.json`; `performance-matrix-1794575695441/results.json` |
| Synthetic selector-indexing hypothesis and failed promotion gates | `queue-selector-investigation-summary.json`; `viewport-context-1794593793324/results.json`; `viewport-context-1794593942176/results.json` |
| Adaptive sampling research, not shipped | `sampling-investigation-summary.json` |

Research scripts sit at the top level of `research-artifacts/`; preserve the `project/` directory layout to run them. Copied extension trees and baseline/candidate files identify what was actually executed. Do not substitute current code for an older recorded initializer and call it reproduction.

## What already changed, and what did not ship

Accepted local changes include authored-scheme batching over a synchronous idle callback, bounded Chromium-only groups of 16, phased collection/source reads/application, and discovery of newly inserted shadow trees. A later three-line sprite-publication change keeps ready visible cohorts ahead of idle work. It is an ordering repair, not an Amazon speedup claim.

Research decisions worth independently challenging:

- Static matrix: equal inspection counts with heavier equivalent CSS cause substantially more style work. A no-scheme ablation dramatically reduces style cost but changes native-control pixels; it is attribution evidence, not a valid fix.
- Ignoring script-only head changes is rejected: authored CSS can depend on `html:has(head > script)`. The checked-in head-dependent negative demonstrates this. Coalescing them (promoted 14 November as the review's A2) keeps the dependency: the refresh still runs, after a bounded trailing window.
- Holding source context across more viewport work has promising local timings but failed image preservation and was rolled back. Failures remain; isolated passes do not erase them.
- Adaptive grouping has a strong local full-scan result but no accepted live/interaction benefit; it is unpromoted.
- Scroll deferral fails completion/performance gates and is unpromoted.
- The review's A5 (promoted 15 November) is not scroll deferral: the scroll's visible work is unchanged. It stops a refresh that coalesces with a scroll from widening its synchronous resample to the 1.25-viewport lookahead region; that region is classified on the next frame through the local path. On the heavy anonymous Amazon variant the 1.2–1.9 s lookahead passes disappear and the worst settled scroll frame drops from 2.1–2.9 s to 1.1–1.7 s (`research-artifacts/diagnostics/a5-crossover-1794682981259`).
- Indexed rule-specific attribute selectors preserve specificity in a prototype. Six local pairs with varied colors show 19.846% less style work and 12.119% less complete work, missing prospectively chosen 20%/15% gates. Shared-color controls do not improve. The thresholds and their rationale are open to review; do not silently call the candidate shipped or round it into a pass.
- 1535 scheduling requests do not mean 1535 scans: 1442 had a queued ancestor; one observed scan had started and none completed. Mutation epochs are not proof of unchanged source paint.

The historical full-suite image failures and active-selector observations remain in evidence. Some final-state test waits were strengthened after readiness gaps were identified; original assertions, thresholds and failed runs remain. The active-selector control can be offscreen at 125% zoom; contrast-only readiness accepted a preceding neutral border. An identity-checked idle-hold diagnostic reproduces that gap. This does not retrospectively explain every older failure.

## Requested independent output

Please verify code and data before ranking solutions. Separate measured facts, interpretations and missing evidence. Identify any flawed instrumentation, unfair comparisons, unsupported conclusions or tests that might mask a real defect.

Then propose at most three high-return approaches, each with exact functions/state affected, a causal hypothesis, expected benefit scope, risks to source fidelity/lifecycle/first-frame paint, and a minimal falsifiable experiment. Compare reducing invalidation, repeated source work, selector matching, worker-ready computation and broader architecture on evidence rather than generic advice. Explain whether an apparent hot function merely receives native flush attribution.

Choose one next experiment with control conditions, retained-work/preservation assertions, completion budget, failure criteria and acceptance criteria. Distinguish immediate low-risk changes from architectural work. Give file/line references. Challenge our preferred explanation where the evidence warrants it. Do not edit or implement changes in this review phase, and do not claim to have executed code or read files that were not accessible.
