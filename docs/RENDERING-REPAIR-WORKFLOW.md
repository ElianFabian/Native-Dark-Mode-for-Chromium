# Efficient rendering repair procedure

Reference for human and AI contributors. Read with [AGENTS.md](../AGENTS.md), [reporting and fast testing](REPORTING-AND-FAST-TESTING.md), [the rendering lab](RENDERING-LAB.md) and [renderer policy](WEBSITE-THEME-RENDERING.md). Future work is tracked in [the ordered efficiency plan](RENDERING-EFFICIENCY-PLAN.md); [diagnostic reliability design](DIAGNOSTIC-RELIABILITY-DESIGN.md) specifies retained failures, runtime identity, repeats and lifecycle checks.

## Capability status — 13 November 2026

| Capability | Status and limits | Command / entry point |
| --- | --- | --- |
| Selector-scoped source/theme computed issue bundle | Available; default state, isolated profile, bounded context; not an HTML/CSS exporter | `npm.cmd run diagnose -- --issue --url URL --selector SELECTOR` |
| Explicit browser group selection | Available; reduced scope retains Node/syntax checks, not release acceptance | `npm.cmd run verify -- --focus GROUPS` |
| Controlled repeated cases | Available; fresh browser/profile, no retry-to-green; exact error signatures grouped without inferring a common cause | `npm.cmd run verify -- --cases IDS --repeat 2` (2–10) |
| Individual case selection | Available; includes registered atomic companions and every existing variant/control | `npm.cmd run verify -- --cases IDS`; `--list-cases` |
| Shared-run failure bundles | Available for owned local fixtures; exact expected/actual assertions currently cover active selector frames only | Shared runner via `verify`; unique `shared-.../` artifacts |
| Executing renderer identity | Available; initialized function-source fingerprints, not full runtime-state attestation; missing/unknown never pass | Capture/issue reports and shared-run environments |
| Local PNG captures and original/applied evidence | Available; owned local fixture scope | `npm.cmd run diagnose`; ignored `research-artifacts/` |
| Computed run comparison | Available; computed measurements, not pixels | Lab Compare runs tab via `npm.cmd run lab` |
| Organized visual archive | Available; immutable local PNGs, explicit CLI references; missing dimensions/essential conditions cannot pass compatibility; supplied/frame imports pending | `npm.cmd run visuals -- list/reference/compare ...` |
| Interactive pixel comparison | Available; side/overlay/difference and metadata warnings; no temporal acceptance | Lab Visual comparison tab via `npm.cmd run lab` |
| Browser/profile cleanup and parent loss | Available; separate process/removal results, incomplete cleanup prevents repetition success; detached hidden child handles IPC loss with a 40s cooperative bound. Forced child death and synchronous stalls remain gaps | `verify -- --browser` includes external process/profile observation |
| Contextual DOM/CSS/resource extraction with source fidelity | Planned; perform baseline checks manually | Repair sequence below |
| Verification timings and tested-source seal | Available; start/end code and fixture hashes must agree. Scope is recorded explicitly; not a fingerprint of all repository prose or the installed user's extension | `npm.cmd run verify -- --browser`; `research-artifacts/diagnostics/last-verification.json` (overwritten) |
| Authored color-scheme sampling preservation | Synthetic Simulated Native Off/Maximum native/inherited colors, exact element paint/font/border/filter/layout-box inventory across main/shadow/child/child-shadow, source restoration, late images and open/closed first-frame/detached-root checks. Marker counts check activation/zero-marker cleanup, not visual identity. Computed evidence is not full pixel acceptance; palette child-cycle/live limits remain | Complete `verify -- --browser` includes `check-source-scheme.mjs` |
| Sprite publication timing | Existing 32-crop zero/all frame guard. An idle-before-viewport ordering failure is locally repaired through the existing pre-paint flush; three-theme attribution and the complete 375-combination suite pass without changing the 200ms bound. Live performance remains separate | `npm.cmd run verify -- --cases grouped-sprite-publication`; sealed complete verification recorded in PLAN.md |
| Append-only phase/case metrics | Available; shared pixel/assertion timing and end-to-end overhead still incomplete | `npm.cmd run metrics` |
| Complete live performance coverage | Pending; retained Amazon baseline/CPU/crossover and queue evidence exists. Sampling, scroll-deferral and indexed-selector prototypes are not promoted; the latest public attempt did not reach the normal page. Shared/varied-color catalogue inputs retain local functional coverage. Local timing does not establish live loading/scroll/carousel acceptance | No complete live profiler implemented; evidence in PLAN.md |

This is the single current capability table; other plans/designs link here. Update it when implementation is verified. Never invoke a planned capability as though it exists.

For a new or reopened report, start with the [incident response decision flow](INCIDENT-RESPONSE-FLOW.md). It defines evidence gates, failure routing and independent handoff statuses.

## Repair sequence

1. **Establish scope.** Inspect branch/worktree and existing changes. Record case ID/URL, theme, border level, trigger, browser, zoom/scale and expected behavior. Separate developer test duration from website performance. Keep missing state/source evidence explicit.
2. **Collect evidence once.** Prefer accessible public/local CDP diagnostics. If console help is needed, collect all known independent cases for that page/state in one bounded read-only script and return one JSON object with case IDs, missing selectors and errors. Different pages require separate executions. Do not collect form values/private content or live labels without existing consent. Ask another batch only for a newly discovered dependency. Do not infer visible paint from a class name or hidden label.
3. **Validate the source baseline.** Record foreground/background, alpha through ancestors, generated layers, border weight, dimensions, clipping, resource delivery/crop, fonts and control state. Keep original styles separate from themed output. Confirm the local unthemed case matches supplied/public source evidence before treating its themed result as a live regression. Record reduced layout and inaccessible resources. A visually identical computed-style snapshot may destroy inheritance and trigger different heuristics.
4. **Retain the case.** Demonstrate the reported failure locally where evidence permits. Add the checked-in fixture, case registration, coverage entry and rendering-guide inventory; distinguish reported reproductions from synthetic probes. Keep unsupported/missing mechanisms pending rather than inventing an apparently equivalent source. Include a contrasting preservation control.
5. **Repair the mechanism.** Base production rules on semantics, accessibility state, layout or computed paint. Keep proprietary selectors/hostnames in fixtures and notes. Preserve useful colors, source geometry, disabled/selected state and delivery/inheritance context. Avoid compensating for a bad fixture with a broader renderer rule.
6. **Verify progressively.** Run the narrowest available affected groups with preservation controls and all affected custom themes. Recheck Off/stronger levels, hover/focus and resampling where relevant. Source classification/scheduling changes often need broader groups. Run complete verification at the appropriate integration/release boundary; do not rerun expensive browser checks for prose-only changes. Never cache a pass or weaken assertions to save time.

   For independently verified images, establish decoded/stable Off source and readiness of every positive before final pixel/contrast comparisons. One positive's readiness is not a proxy for its peers. Keep exact equality, thresholds and preservation negatives; record assertion-time paints for mismatches. Final-state readiness does not replace first-frame or publication-order checks.
7. **Review visually and temporally.** Computed thresholds prioritize candidates; inspect pixels when paint requires them. Match environment/state for comparisons. Startup/scroll flicker requires intermediate-frame evidence. A final screenshot or successful capture is not a temporal pass. Distinguish local automation, live checks and reporter acceptance.
8. **Close with evidence.** State what changed, tested scope/environment and remaining limitations. Keep a checklist of pending reports and artifact links. Inspect the diff and run `git diff --check`; commit/version/push only within the authorized scope. Update this procedure when tools change.

## Commands available now

```powershell
# Scoped public-page evidence, not authenticated-tab access or an automatic fixture
npm.cmd run diagnose -- --issue --url "https://example.org/page" --selector ".affected-control"

# Syntax and Node tests plus selected shared browser groups
npm.cmd run verify -- --focus icons,borders

# List case IDs and inseparable companions without opening a browser
npm.cmd run verify -- --list-cases

# Syntax/Node tests plus one named case and all of its existing controls
npm.cmd run verify -- --cases select-proxy-and-field-frames

# Syntax and Node tests only
npm.cmd run verify -- --quick

# Complete verification, including browser and launcher checks
npm.cmd run verify -- --browser

# Local append-only timing summary (no browser required)
npm.cmd run metrics

# Local gallery and report viewer: http://127.0.0.1:8787
npm.cmd run lab
```

Groups: icons, borders, images, surfaces, states, contact, cards. Select every affected group, not just the symptom's apparent category. Focused verification is not complete release verification. See the reporting guide for flags, consent, capture limits and evidence redaction.

## Evidence and timing conventions

- Keep transient captures, logs and phase metrics inside ignored `research-artifacts/`; keep portable fixtures/assets/tests in Git. Preserve source provenance and checksums.
- Every issue handoff should state: source evidence verified / reproduction verified / local repair verified / live confirmation, independently. A gap in one is not filled by a pass in another.
- Record test command/scope, outcome and measured duration. Distinguish manually estimated effort from measured subprocess/capture phases; repair effort and shared pixel assertions are not yet measured separately. No fabricated diagnosis/rework timings or performance guarantees.
- The visual archive retains metadata and explicit reference selection. Do not silently overwrite a baseline, mask the defect or treat dynamic page changes as renderer regressions.
- Use the next-session plan to implement missing tools. Keep these operational instructions short and grounded in actual capabilities as the plan is completed.

## Local timing history

Verification and diagnostic captures append start/end events to `research-artifacts/process-metrics/events.jsonl`. Starts are written before each operation; a missing end means running or interrupted, never a pass or a fabricated duration. Failures record status without copying error text. Malformed/partial lines are counted by the summary rather than erasing later valid evidence. There is no result cache or remote service.

Events contain session/run IDs, per-phase/case attempt number, scope, wall-clock timestamps, monotonic duration and SHA-256 hashes of extension/tool/test bytes and fixture bytes. Capture case IDs retain theme/level/zoom/default state; live cases use the fixed ID `live`, with no URL or selector in history. Navigation/resource/theme/stabilization/collection/screenshot/analysis/startup/cleanup are measured in the capture suite. Stabilization includes collection; parent verification stages include subprocess work. Summed/median/slowest phase times from `npm.cmd run metrics` must not be summed again as elapsed session time. The summary includes every retained code revision and scope; use raw IDs/hashes to compare equivalent runs.

Default artifact references stay inside `research-artifacts/`; capture reports also carry metrics session/run IDs. Custom output paths outside that tree are omitted from history. History excludes command arguments, page facts, labels, form values, URLs, selectors and exception messages. It does not time human diagnosis or record rework annotations.

`metricsWriteMs` measures synchronous history append/serialization work accumulated at that point, excluding its own final append. It is a partial instrumentation-cost measurement, not an end-to-end overhead benchmark: source hashing and wrapper costs are additional. Shared regression cases/pixel assertions still have stage-level timings only; named selection is available; visual archive/comparison and contextual extraction remain planned. A full-suite pass does not close these capability gaps or pending website reports.

## Shared-run failure evidence

Each shared rendering invocation now retains a unique ignored `research-artifacts/diagnostics/shared-<timestamp>-<id>/` directory, linked from journal category `shared`. `run.json` identifies scope, source hashes, environment, status and cleanup. Success retains `results.json`; failure retains `failure.json` and all completed combinations in `partial-results.json`. The existing top-level `shared-rendering-checks*.json` remains the latest successful report and can be older than a failed invocation. Use run IDs/history to distinguish them.

When the current page is an owned local fixture, failures also attempt bounded computed paint and a viewport PNG. Identified audit elements receive ancestor/generated context and a visible crop. These are later observations, not failed-frame proof. Browser disconnection, non-fixture documents and failed reads become explicit gaps. No live screenshots or page text export is enabled.

The active-selector pilot separately reports blue-ink, geometry and inward-emphasis assertions with element/theme/level/state and frozen expected/actual values. Other assertions retain generic evidence and may lack exact expected facts. The full browser command includes a deliberately failing tooling self-test that validates evidence and guards; it does not introduce or repair a renderer defect. See the [design and acceptance criteria](DIAGNOSTIC-RELIABILITY-DESIGN.md).

## Executing renderer identity

The existing capture/issue commands now record expected disk initializer fingerprints and a read-only response from the exact owned tab/frame. Reports distinguish `match`, `mismatch`, `unknown` and `unavailable`, initialized versus current dependencies, instance/start time and active preset/level. Canonical themed assertions additionally require matching code identity and settings. Shared failure packets attempt this metadata after failure; it is not failed-frame evidence.

Fingerprints cover LF-normalized initializer function source, not complete package bytes. On non-secure HTTP, a bounded internal worker request hashes only own extension source; no page content/resources or storage are read. Querying does not reinject/recover a missing renderer or enable a theme. Real runtime-reload testing in the owned Brave session yielded an unavailable context; fresh-process identity passed separately. Extensions-page reload recovery and stale observer cleanup remain pending. See [the design and limitations](DIAGNOSTIC-RELIABILITY-DESIGN.md#2-identify-the-executing-renderer).

## Named shared regression cases

`--list-cases` lists 48 result-case IDs mapped to 42 atomic execution units. `--cases ID[,ID...]` retains all source checks, preservation negatives, custom themes, levels, interaction/frame probes and ordering within each selected unit. Some cases share preparation/state and remain inseparable: selecting either includes its companions once, reported explicitly. Requested order does not reorder the original suite. This is conservative registered selection, not automatic inference of every renderer dependency. Shared classification/scheduling changes still need all affected cases/groups or full verification.

Each unit records a `shared/case` timing with its ID and checks its actual result variant inventory against checked-in expectations. This is elapsed execution-unit time, not separately timed pixel assertions or a count of every predicate. Scope manifests retain requested IDs, included IDs, companions, execution units and expected result count. Selection never skips work based on past passes. Unknown/empty/duplicate IDs and conflicting group/full flags fail before browser startup.

Named verification includes all syntax/Node tests and the selected shared units; it omits launchers, canonical capture smoke, lab UI and diagnostic self-tests, just like focused groups. `--focus` and complete `--browser` keep their existing coverage. The full suite retains 375 result combinations and validates every execution unit. A named pass is not release acceptance or proof that an earlier full-suite failure reproduces under isolated ordering. Explicit fresh-browser repetition is available as documented below; no retry-to-green policy is used.

## Controlled fresh-browser repetitions

Use `npm.cmd run verify -- --cases IDS --repeat 2` for an explicit experiment. Every attempt starts a fresh Node/browser/profile/server and retains the original selected units/companions/variants. Initial rule count and profile/browser identities are recorded; passed attempts require empty initial rules, unique identities and compatible source/fixture hashes and scope. OS caches remain outside the reset. No retained-profile or original-prerequisite-prefix replay mode exists yet.

Counts are 2–10. Optional `--attempt-timeout SECONDS` (1–300, default 120) and `--repeat-timeout SECONDS` (1–1800, default 600) bound work; cleanup can extend elapsed time. Each timeout requests cooperative owned-browser cleanup. Forced/unconfirmed cleanup stops further attempts and remains incomplete.

Unique ignored `repeat-.../summary.json` retains progress and every attempted outcome/log/reference to its `shared-.../` bundle. All requested passes are required for success. Mixed completed outcomes are unstable/nonzero; timeouts, missing attempts or compatibility/cleanup gaps are incomplete/nonzero. A final pass never erases a prior failure. Normal named/group/full commands never repeat automatically; repeats require `--cases` and cannot combine with `--focus` or `--browser`. See the [design](DIAGNOSTIC-RELIABILITY-DESIGN.md#3-repeat-unstable-cases-under-explicit-conditions) for exact reset, limits and tested boundaries.

The `Active selector edge` assertion recurred on 13 November in High contrast/Maximum. At 125% zoom its denied-resource control is below the viewport; a contrast-only readiness predicate could accept the previous neutral white border. An identity-checked local intervention that holds idle sampling after stable neutral paint reproduces that white state, and revealing the control restores blue/inward emphasis. Final-state readiness now requires the requested blue/contrast/inset state, within the unchanged deadline, before the original assertions. Timeout evidence includes paint, classes and viewport rectangles. This establishes a concrete oracle gap, not the cause of every older failure or a guarantee about first presented frames. Retain the historical failures and keep live performance acceptance separate.

Deferred hardening is evidence-triggered: revisit metrics concurrency after a corrupt journal line, PNG decoding/archive atomicity after a corrupt capture, and reference concurrency after an inconsistent reference. Do not build retained-profile modes, importers or profile sweepers without a concrete incident requiring them.

## Local visual archive

Local capture-suite screenshots are retained both in the existing diagnostic report and in ignored `research-artifacts/visual-regressions/<case-id>/<run-id>/<capture-key>/`. Each capture has `image.png` and `capture.json` with checksum/dimensions, local fixture provenance/path, source/theme, level, default state/action, browser/platform, viewport/DPR, root/body zoom, scroll, viewport crop, font status/readiness, renderer/fixture hashes and observation/creation timestamps. New captures never overwrite an existing candidate or promote a reference. Live/issue captures produce no archive PNGs.

```powershell
npm.cmd run visuals -- list subtle-frame
npm.cmd run visuals -- reference CASE RUN "CAPTURE_ID"
npm.cmd run visuals -- compare CASE RUN "CAPTURE_ID" OTHER_RUN "OTHER_CAPTURE_ID"
```

The listing shows selected references. Reference selection is an explicit command, one slot per theme/level/state/zoom/viewport/DPR; original images remain immutable and selection requests have local history. Selection refuses unknown/unsettled metadata and checksum corruption. Metadata comparison reports compatible/incompatible/unknown conditions; renderer code changes are noted separately, allowing same-condition revision comparison. Fixture, browser, geometry, state or readiness changes are conservative incompatibilities/gaps. Font status does not establish exact glyph/font-resource fidelity. A compatible result is not visual acceptance and compares no pixels.

This first slice archives only owned local steady-state captures. Supplied screenshot import with unknown metadata, live screenshots/consent handling, frame sequences and shared-run ad hoc screenshots remain pending; archive browsing/pixel review is available in the Visual comparison tab below. Source/local fidelity comparison must remain separate from cross-revision theme comparisons.

## Visual comparison in the lab

Start `npm.cmd run lab`, open the local lab and choose **Visual comparison**. Select an archived case and before/after captures (selected references are labeled), then **Compare images**. Side-by-side views share zoom and scroll coordinates for equal-sized images; opacity overlay and a magenta/black RGBA difference view retain original PNGs and reference selections. Channel tolerance is explicit, default zero; changed-pixel count, maximum raw channel delta and the enclosing bounds are reported separately. This is review evidence, not automatic defect detection or accessibility acceptance.

Metadata compatibility stays visible for every comparison, even when visually inspecting intentionally different themes/states. Different image sizes disable overlay/difference and show both originals at their own sizes; unknown/incompatible conditions never become a silent pass. Source/theme visual review is separate from validating source/local fidelity.

The server reads only validated local archive identifiers/checksummed PNGs through GET endpoints, with no path/file/URL uploads or reference writes. Raw pixel buffers come from a bounded Node/zlib decoder (non-interlaced 8-bit RGB/RGBA only, validated chunk checksums/filter/size limits). Canvas displays the evidence but is not the pixel-analysis source: isolated Brave testing observed one-channel readback perturbations that falsely increased tiny-image differences. The raw PNG path avoids this measurement artifact without changing browser privacy settings. Unsupported formats fail explicitly. Work is limited to four million pixels and 20 MiB PNG input per image, with no automatic resizing.

The UI reports client difference-computation time; this excludes server decoding, transfer and layout and is not an end-to-end benchmark. Full browser verification includes controlled identical/one-pixel-change/size-mismatch images, overlay/difference output, keyboard focus, large-text/narrow layout and an archived 1000×900 image with synchronized scrolling. The existing computed **Compare runs** view remains separate. Masks, supplied/live screenshot import and temporal/flicker sequences remain unimplemented; no changed region is excluded automatically.
