# Reliable rendering diagnostics: implementation design

Prepared 13 November 2026. This document specifies the additional reliability work agreed after the first timing implementation. It extends the [efficiency plan](RENDERING-EFFICIENCY-PLAN.md); it does not replace its backlog or the [repair procedure](RENDERING-REPAIR-WORKFLOW.md). Developer tooling remains local, dependency-free and separate from production rendering policy.

## Problem and implementation order

A full shared run failed with `Active selector edge lost blue/geometry`, while a later border-only run passed 90 combinations. The combined assertion did not identify which element, predicate, theme, state or values failed. This is evidence of an unresolved discrepancy between executions, not proof of a renderer defect or a timing defect.

The immediate objective is to make the next failure actionable without another long run just to learn what happened. The subsequent objective is to establish which renderer actually ran and to reproduce intermittent behavior under explicit conditions.

| Order | Capability | Status and boundary |
| --- | --- | --- |
| 1 | Retained failure bundles and precise assertions | Implemented in the shared runner; detailed assertion migration starts with active selector frames. Other failures retain generic context/paint only. |
| 2 | Identity of the renderer running in a document | Implemented: initialized function-source fingerprints, separate expected disk identity, dependency-change checks and explicit unavailable/unknown states. Reload invalidation remains observable, not automatically repaired. |
| 3 | Controlled repeats and instability reporting | Available with explicit named cases and fresh browser/profile per attempt; mixed results fail, timeouts/unknown cleanup remain incomplete. Same-process and prerequisite-prefix experiments remain planned. |
| 4 | Observable cleanup and exclusion checks | Planned; measurable residue first, internal observer/queue assertions only with a bounded diagnostic interface. |
| 5 | Stability after repeated interactions | Planned; extend existing resampling/state checks with explicit source/state restoration and drift measurements. |

This implementation does not close reported Docs/Amazon glyph/frame defects, iframe startup flicker, context-reload behavior or live performance work. It changes diagnostic evidence, not theme heuristics.

## 1. Retained failure bundles

### Execution and artifact contract

Every valid shared-run invocation creates a unique ignored directory:

```text
research-artifacts/diagnostics/shared-<timestamp>-<random-id>/
  run.json
  results.json                 # completed successful run
  failure.json                 # failed run, including browser startup failure
  partial-results.json         # completed combinations before failure
  observed-paint.json          # bounded later observation, if available
  viewport.png                 # owned local fixture only
  element.png                  # selected visible element, when identifiable
```

The ordinary `shared-rendering-checks[-groups].json` remains the latest successful compatibility report. It is not evidence that the latest invocation passed. `run.json`, the per-run results and the timing journal identify individual attempts. A running manifest or journal start without a terminal result means unfinished; abrupt process termination cannot guarantee a screenshot or a final manifest.

The run manifest records groups, browser product, Node/platform, code/fixture hashes, session/run IDs, completion status/count and cleanup status. Hashes describe disk bytes at run initialization. Browser startup, failure collection and cleanup also append measured phases to the existing journal under category `shared`.

`failure.json` keeps the primary failure, the completed-result count, artifacts that were actually written and explicit collection gaps. Basic JSON and partial results are written before browser inspection. Browser disconnection or screenshot failure must not erase the assertion. The caller rethrows the original failure and retains a nonzero exit status. Cleanup is attempted for both owned browser and server; a cleanup error must not replace a primary assertion error.

### Precise assertions and pilot

`assertEvidence(condition, id, expected, actual, context)` snapshots bounded facts when the predicate fails. Context contains a stable case ID, theme, border level, state and element audit ID. The active selector pilot separates:

- `active-selector-blue-ink`: expected blue channel greater than red; actual CSS edge and parsed channels.
- `active-selector-geometry`: expected authored box; actual active box, retaining the existing exact equality requirement.
- `active-selector-inward-emphasis`: expected an inset reinforcement at Maximum; actual shadow declaration.

The source comparisons, inequalities, original state/level/theme loops and preservation controls remain unchanged. A more precise failure is not a relaxed assertion. Successful result counts still describe theme/case combinations, not the number of predicate evaluations.

Only this pilot has precise assertion IDs/expected values. Do not infer a fully migrated runner from a generic bundle: other assertions may show `unscoped` and lack an expected value. Migrate additional cases as named-case extraction proceeds, without guessing the failed element from a previous case's context.

### Collection and privacy boundary

Before any computed-paint or screenshot collection, the current page must have the exact origin of the owned `http://127.0.0.1:<port>` server and a `/fixtures/` path. Other documents produce an explicit omission. There is no personal-tab attachment, live screenshot collection or expansion of `--labels` consent.

For an identified audit element, collect it and its inspectable descendants with up to four ancestor/generated-layer contexts using the existing collector. For an unscoped failure, collect at most 50 visible audit rows; this may not include the failed node. No automatic scroll, hover, state reset or theme switch occurs during evidence collection. The viewport and optional element crop preserve the observed state, not a reconstructed source baseline.

Facts exclude content/value/HTML fields and redact resource references. Strings, nesting, object keys and arrays have explicit limits/omission markers. Partial results retain every completed combination, with bounded facts per row. Screenshots are limited to checked-in local fixture content. Locally authored labels can appear in PNGs. This is a bounded diagnostic format, not an HTML exporter or a general-purpose private-data sanitizer.

The assertion timestamp and later observation timestamp are separate. Viewport, DPR, root/body CSS zoom, scroll and font status accompany screenshots; the element crop records its CSS coordinates. Generated layers and ancestry supplement expected/actual facts. These later images cannot establish the exact failed frame, source fidelity, successful font resource loading or temporal acceptance.

### Validation

- Node tests: predicate identity/frozen values, forbidden-document guard, disconnected browser, all partial-result retention and bounded/redacted facts.
- Browser self-test: deliberately fail an expectation on the existing canonical frame fixture, verify expected/actual values, ancestor/generated evidence and viewport/element PNGs, then navigate to `about:blank` and require collection refusal.
- Integrate the self-test in full browser verification. It deliberately fails a tooling assertion internally and succeeds only when the resulting failure evidence is correct; it is not a renderer regression or a live-site confirmation.
- Run the original full shared suite and retain its exact combination inventory. A failure remains a failure even if the new bundle succeeds. Inspect a real bundle if the discrepancy recurs.

```powershell
# Existing reduced/full paths now retain shared-run failure evidence
npm.cmd run verify -- --focus borders
npm.cmd run verify -- --browser

# Isolated developer self-test, no personal browser state
node --experimental-websocket scripts/dev/diagnostics/check-failure.mjs
```

Validation on 13 November: full Windows/isolated-Brave verification passed 109 Node tests, 7 launcher artifact tests, 19 canonical assertions, lab UI/assets, all 372 shared combinations, issue bundles and the new failure-evidence self-test. The prior intermittent active-selector failure did not recur, so its cause remains unresolved. A final refinement makes missing/unmeasured targets explicit and keeps a successful viewport image if an element crop fails; syntax/109 Node tests and the browser failure self-test were rerun successfully after that refinement. The full suite was not repeated for that collector-only branch change.

Known limitations: no first-frame trace, no authored baseline screenshot on failure, no automatic replay, no precise expected values for unmigrated assertions, no hard-kill artifact guarantee and no separate shared pixel-assertion timings yet. This directory is supplementary failure evidence, not the planned visual reference archive.

## 2. Identify the executing renderer

The acceptance criterion is to distinguish expected disk code from observed document code. Merely reading `chrome.runtime.getManifest().version`, fetching the current script resource or adding a DOM attribute with today's hash would not prove which old listener/closure owns existing paint.

### Implemented response and fingerprint boundary

The content-script listener accepts `diagnose-renderer-identity-v1` only from this extension. It returns a bounded version-1 response with instance ID, initialization time, package version captured at initialization, active preset/normalized separator level, observation timestamp, initialized renderer/color/image-policy fingerprints and current dependency fingerprints. It does not increment the theme revision, apply a preset, inspect the DOM, add observers, fetch files or write storage. Reinjection retains the existing listener/instance through the original deduplication guard. No page-facing API or DOM marker is used.

The three existing script initializers now have names. Their source getters close over those function objects. The theme instance captures dependency getters at initialization; later module reinjection cannot relabel that captured source. SHA-256 is computed lazily from `Function.prototype.toString()` source with CRLF/CR normalized to LF, cached by source-getter identity, and labeled `initializer-source-sha256-lf-v1`. This covers initializer bodies, including their closure definitions/constants. It deliberately excludes license/file text outside the function, wrapper invocation bytes and unrelated package files. It is a code-source diagnostic, not an exact package/file-byte hash or a security attestation against modifications inside the extension world.

Actual HTTP testing found that the isolated content world lacks WebCrypto on an untrusted HTTP origin. In that case only, an authorized identity request sends bounded own initializer source (at most 2 Mi characters per module) to the extension worker's `fingerprint-renderer-source-v1` handler. That handler checks the sender's extension ID/tab, initializer shape and size, computes the same SHA-256 and replies with a digest. It reads no page resources/content/rules and writes no storage/logs. The content side bounds this fallback wait to two seconds and clears its timer. Missing APIs, absent worker responses or invalid source yield null fingerprints and an explicit unknown result. Failures are cached for that getter/instance; diagnostics do not repeatedly retry an unavailable service.

The worker helper itself is part of the ordinary package/disk code hash; it is not claimed as an independently attested loaded dependency. Likewise, the diagnostic does not attest arbitrary monkeypatches of global exports or browser native functions. Existing scripts from before this endpoint was added may only produce `unavailable`; that is not evidence of a match.

### Tooling integration and outcomes

The owned-browser helper resolves its CDP target through the extension's existing debugger permission and sends the read-only query to the exact tab/frame. It does not attach a debugger, find a tab by a potentially duplicated URL, inject files, navigate, reload or repair the target as part of querying identity. Test-only reinjection/reload/isolated-execution helpers are separate operations on the owned profile.

The Node helper derives expected fingerprints from the trusted disk initializers and compares them with the response:

| Outcome | Meaning |
| --- | --- |
| `match` | All three initialized fingerprints match expected source, and current dependency fingerprints match those captured at initialization. |
| `mismatch` | An initialized source differs, or a current dependency differs from its initialized source. `differences` identifies each field. |
| `unknown` | A response has an unsupported schema/kind or missing/invalid fingerprints. This is not a pass. |
| `unavailable` | No receiver, no target/response or an invalidated extension context. This is not a pass. |

Captures retain this comparison independently of the original disk-byte renderer hash. Issue Markdown shows outcome and instance ID; `capture.json` retains the complete metadata. Automated canonical theme assertions also require a matching identity and the requested preset/level. Capture-only/live reports remain measurements, not fixture passes. Shared-run failure environments attempt the same later identity observation; disconnected browsers remain explicit. Successful shared runs still have stage-level source hashes rather than a new per-case identity assertion.

### Controlled validation and reload limitation

`check-identity.mjs` uses an ignored copied extension in a unique owned profile. A harmless initializer comment creates a controlled source mismatch without changing rendering or the package version. The test updates the copied file on disk and proves the already initialized instance remains stale; reinjection preserves that instance. Replacing a real dependency initializer is reported separately. The production extension files are not edited by the test.

The test also covers all three custom presets and Off, sender rejection, absent receivers, a fresh instance, an eligible same-origin child with a distinct instance, and a reserved `.test` HTTP origin mapped only to loopback (including the worker hash fallback). Node tests compare fingerprints against the JS engine's actual function source, CRLF normalization, source changes, unknown/missing responses, dependency changes and the bounded worker helper. No public/authenticated page is accessed.

Real `chrome.runtime.reload()` testing in the current load-extension Brave session stopped the worker and left the extension context unavailable. Queries correctly returned unavailable without relabeling/recovering the existing document. The test records this boundary, then separately starts a fresh owned browser to validate the current copied source. This is not proof of successful same-process recovery, stale observer cleanup, or the desktop Extensions-page Reload workflow. Those lifecycle scenarios remain pending. Where a browser makes the extension available after reload, the test instead verifies a subsequent fresh navigation.

```powershell
# Included in complete browser verification
node --experimental-websocket scripts/dev/diagnostics/check-identity.mjs

# Existing issue bundles now include initialized runtime identity
npm.cmd run diagnose -- --issue --url "https://example.org/page" --selector ".affected-control"
```

Validation on 13 November: complete Windows/isolated-Brave verification passed 112 Node tests, 7 launcher tests, 19 canonical assertions, lab UI/assets, all 372 shared combinations, issue/failure bundles and the identity self-test. All 28 canonical captures recorded matching runtime source; the 18 themed assertions additionally verified preset/level. Retained identity evidence: `research-artifacts/diagnostics/identity-self-test-1794561235141-eac1ceb1/results.json`. Runtime reload invalidation is a measured limitation, not a recovery pass. Metadata-only updates keep the existing manual reload fixture/registration/coverage pending and describe the narrower tooling coverage.

There is no personal-tab diagnostic UI or automatic recovery action in this slice. Hashing and metadata collection are on demand; initial instance metadata and source getters are small new startup allocations. No rendering speedup or total overhead improvement is claimed.

## 3. Repeat unstable cases under explicit conditions

### Implemented experiment and commands

```powershell
npm.cmd run verify -- --cases embedded-vector-caption --repeat 2
npm.cmd run verify -- --cases select-proxy-and-field-frames --repeat 3 --attempt-timeout 120 --repeat-timeout 600
```

Repetition requires explicit `--cases`; it cannot be combined with `--focus` or complete `--browser`. Named aliases retain their original atomic companions and every existing theme/state/level/negative assertion. Syntax/all Node tests run once before the experiment. Normal named/group/release verification never gains automatic retries. There is no stop-on-first-pass behavior or retry-to-green.

Each attempt starts a new Node child, local fixture server, owned browser and temporary profile. The original selected-unit setup and internal state sequence are retained, including any reuse of the document between themes/levels. The browser reports its unique instance/profile ID and initial saved-rule count. Completed pass/fail comparisons require unique browser/profile identities, an empty initial rule list, matching code/fixture hashes and identical selected units. OS caches are retained; this is not a guarantee of cold machine, font, GPU or network caches.

This implements the **fresh owned browser** experiment only. Fresh documents in a retained browser/profile and replay after the original full-suite prerequisite sequence remain unimplemented. A passing isolated case still cannot establish that an intermittent full-run failure has been reproduced under equivalent preceding state.

### Bounds, cancellation and evidence

- Repeat count: integer 2–10.
- `--attempt-timeout`: 1–300 seconds of attempt work, default 120.
- `--repeat-timeout`: 1–1800 seconds of experiment work, default 600. Remaining experiment time caps the next attempt; no new attempt starts after it is exhausted.
- These work bounds include child startup, source hashing and browser/test execution, but exclude outer syntax/Node verification, initial parent setup/hash and final report handling. Cleanup may extend wall time beyond the work budget.

For current availability, commands and limits, use the single [capability table](RENDERING-REPAIR-WORKFLOW.md). At a work timeout, the parent sends a private IPC cancellation to its owned child. The shared runner also takes that cooperative path on IPC `disconnect`. The child is detached with hidden windows so abrupt parent termination can be observed independently; it checks cancellation at startup/case/stabilization boundaries and closes its owned browser to release active CDP work, then attempts browser/server cleanup, failure evidence and a terminal aborted manifest. A 40-second child deadline leaves cleanup unconfirmed if cooperation cannot finish. Sending a command after a closed browser connection rejects without leaving a new 15-second pending CDP timer.

Browser cleanup returns separate process-exit and profile-removal results with owned path and errors. Removal retains the existing six bounded retries. Incomplete results propagate to the shared manifest and repetition summary, stop later attempts and prevent aggregate success. A browser whose exit is unconfirmed retains its profile. There is no orphan sweeper.

If cooperative cleanup does not finish within 45 seconds, the process adapter attempts termination of that owned child tree/process group, with a further bounded confirmation wait. Forced/unconfirmed cleanup makes the aggregate incomplete and stops further attempts; temporary profile leftovers are possible. This fallback is not claimed tested on actual Windows/Linux/macOS desktops. The verified timeout experiment used cooperative cleanup and no forced termination.

Each experiment gets a unique ignored directory:

```text
research-artifacts/diagnostics/repeat-<timestamp>-<id>/
  summary.json
  attempt-01.log
  attempt-02.log
  ...
```

The summary is atomically replaced after experiment start, each attempt start/end and final classification. A hard interruption can therefore leave an explicit running attempt/experiment, not a fabricated pass. Logs retain stdout/stderr from the local fixture child only. Each attempt references its unique existing `shared-.../` success/failure directory, variant results, source hashes and cleanup outcome. No live screenshot/label or personal-tab access is enabled. The journal records `repetition` run/attempt results with shared session linkage; it does not copy raw errors, logs or command arguments.

### Aggregate outcomes

| Status | Meaning |
| --- | --- |
| `passed` | All requested attempts passed with compatible source/scope and verified fresh isolation/cleanup. |
| `failed` | Every requested compatible completed attempt failed. Inspect its evidence; this does not certify a renderer defect. |
| `unstable` | Compatible completed attempts contain both failures and passes. The aggregate exits nonzero even if its last attempt passed. |
| `incomplete` | Work budget, missing attempts, timeout, infrastructure failure, source/scope/isolation drift or unconfirmed cleanup prevents a complete comparison. |

Any outcome except passed exits nonzero. An ordinary failed case with complete cleanup does not suppress later requested attempts; unconfirmed cleanup and incompatible inputs stop the experiment. Source changes are not mislabeled as rendering instability. Startup failures without a usable browser manifest are infrastructure errors. No threshold/assertion is weakened and previous passes never skip an attempt.

Each completed failed attempt carries an exact error signature (case, assertion ID when available, error name and SHA-256 of the exact error text). `failureGroups` records its attempt numbers; absent signatures remain null. Heterogeneous signatures retain `failed` when every attempt failed. Matching signatures do not prove a common renderer cause; raw failure evidence stays in each shared bundle, not the metrics journal.

### Validation and residuals

Node tests cover deterministic alternating failure/pass retention (all four requested attempts), stable all-pass/all-fail outcomes, total-budget exhaustion, cleanup/source/isolation gaps, execution exceptions and invalid CLI/count/time limits. The alternating sequence uses a controlled executor to test aggregation; it is not a claimed browser rendering failure.

Actual isolated-Brave experiments passed two independent `embedded-vector-caption` attempts with distinct profiles and empty initial rules. A deliberately short 5s attempt limit on `select-proxy-and-field-frames` yielded two timed-out attempts, nonzero aggregate/incomplete status, retained aborted evidence and complete cooperative cleanup without forced termination. Full normal verification is retained separately in PLAN.md.

External parent-death observation is now included in complete browser verification: terminate only the owned supervisor, inspect remaining OS processes (CIM on Windows) by owned profile path, verify runner/browser exit and directory removal, and retain the aborted manifest. The test passed on Windows with isolated Brave. It is not a forced-child-kill recovery test. Synchronous work can delay the disconnect event; forced child death can leave a browser behind because there is no Job Object guarantee. Same-process profile/cache retention, original prerequisite-prefix replay, broader interruption stress and hard-kill recovery remain future work. This adds no production observer cleanup, extension recovery action or live performance acceptance.

## 4. Check cleanup and exclusions

Start with existing local fixture transitions: custom theme to Off, matching rule to exclusion, and changes between custom presets. Retain an unthemed/excluded negative control and verify authored geometry and paint return where expected.

Measure residual extension markers/sheets and observable paint changes after subsequent DOM mutations. Absence of markers alone cannot prove observer teardown or an empty queue. Add a bounded, read-only isolated diagnostic query only where internal lifecycle counts are needed. Do not expose DOM objects or make production queues depend on test instrumentation.

Acceptance: a deliberate leaked marker/sheet is detected, theme-off mutation work does not republish paint, and documented queue/observer counts terminate within an observable bound. Open/eligible frames and inaccessible roots must have explicit coverage/gaps. Extension-reload cleanup remains a separate scenario from ordinary theme removal.

## 5. Detect interaction drift

Extend existing steady-backing/changed-backing and resampling probes rather than replacing them. Establish the source and first settled theme baseline. Apply a named sequence of menu opening/closing, focus, scroll and theme transitions, then restore the same state and backing.

Compare geometry, foreground/backing, authored and extension-generated shadow layers, marker/rule counts and resource/crop identity. Separate legitimate adaptation to a changed backing from drift under a constant backing. Preserve original shadows, SVG paths, crop delivery, source opacity and active/disabled state. Use actual bounded state transitions, not shorter sleeps or arbitrary frame counts.

Acceptance: a deliberately accumulated reinforcement is detected; a changed-backing control is allowed to adapt; restoration to the original state is stable in all affected themes/levels. Delayed publication and startup flashes still need frame evidence; equal final values alone do not pass them.

## Completion and handoff

At each implemented slice, update the capability table and commands in the repair procedure, link validation in PLAN.md and leave gaps in this design explicit. Failure evidence and runtime identity are now available; use them with named selection and fresh-browser repetitions; retained-state/prefix repetition modes remain future work. Defer a larger dashboard until the evidence actually answers failures. No renderer repair, version bump, commit, tag or push is implied by checking off a tooling feature.


## Named selection implementation

The shared runner now exposes 48 result IDs through `--cases`, backed by 42 ordered atomic units in `tools/diagnostics/shared-cases.mjs`. The additional varied-color catalogue result retains its shared-color and popup companions. A selected alias expands to its original unit, not a smaller set of guessed leaf assertions. Companion result IDs are explicit in the listing, console, latest verification and per-run manifests. All source/negative/state/theme/level/pixel assertions inside those units remain together. No automatic cross-mechanism dependency inference is claimed.

`tools/diagnostics/shared-case-inventory.json` is a checked-in expected result-variant oracle. Each current unit must produce the expected ordered case/theme/level/cycle tuples, and the selected run must produce every selected unit and expected combination. These checks assert current execution completeness; the inventory contains no cached pass/fail values and skips no work. Result variants summarize combinations, not every predicate or internal frame. Intentional future case/variant changes require deliberate inventory/test updates.

Every original unit body was compared before/after the refactor using LF-normalized SHA-256; all 42 bodies were identical. The comparison artifact is supplementary local evidence, not a test-result cache. Named callbacks add selection, per-unit timing, inventory verification and current-case failure context around the existing bodies. The source baseline and per-case comparisons are retained under ignored `research-artifacts/process-metrics/case-selection-refactor/`.

The original full runner order and group membership remain. Named runs preserve that order among selected units, but omit unselected prerequisites from the full run; they are not proof that an intermittent full-run failure reproduces under an identical preceding sequence. Cases that share setup/state remain inseparable in this first implementation. Named selection now supports explicit fresh-browser repetition experiments. Same-process/prefix replay and retry-to-green are not implemented; retry-to-green is not an acceptance policy.

The atomic bundles conservatively follow original guarded execution blocks. They are not a proof that every companion is a necessary dependency: for example, the final card block retains separate heading/form/article checks together. Splitting these further requires preserving or explicitly recreating their setup/ordering and validating equivalence. The current listing reports that extra work rather than hiding it. Group labels on a named result are mechanism tags, not a claim that the whole group ran.

Validation: 118 Node tests and the complete browser path passed, retaining all 372 combinations in 42 units and an identical ordered pre/post result-variant inventory. Named selector and shadow/SVG companion runs passed separately. Case-body and variant-comparison artifacts are linked in PLAN.md. This named-selection validation preceded the separate repeated-run implementation documented above; no broad-renderer speedup is claimed.


Repetition closeout: complete normal verification passed 125 Node tests, 372 shared combinations and all existing ancillary/browser diagnostic stages. After the final aggregate-only failed-profile compatibility refinement, syntax/all 125 Node tests and two fresh-profile browser attempts passed again. Intentional timeouts retained incomplete/nonzero results with cooperative cleanup. Exact artifacts, timings and untested interruption/forced-termination boundaries are recorded in PLAN.md.
