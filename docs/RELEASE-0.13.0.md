# Native Dark Mode 0.13.0

This release makes the custom themes' sampling cheaper on large, busy pages and adds diagnostics that identify the executing renderer and retain failure evidence. Native remains the default. Rendering remains best-effort and can vary by website; passing local fixtures does not guarantee every live page renders correctly, and the performance figures below are anonymous public-page measurements on one Windows machine, not guarantees.

## Performance

- Idle whole-document rescans skip elements whose classification inputs are unchanged since their last sample. The inputs are recorded as a signature (computed paint properties, resolved text backdrop, state attributes, structure, size, picture decode state, an overlay label's picture and its card's pictures, pseudo-element content) and reset on every configuration change. This is a documented heuristic rather than an exact rewrite; the rendering guide records its known gap. Measured on an anonymous Amazon page: 16–30% fewer inspections during load and a quarter fewer in the rescans after a carousel click, with image-label re-sampling removed from those rescans.
- Image-label contrast loops reuse each sampled pixel's luminance and stop floor comparisons at the first failing pixel; exact, 3–4 times cheaper where a picture has many colors.
- Sampling batches invalidate style once instead of twice and no longer query animations per element; the per-element color-scheme fallback now reads the element's color rule.
- Script-only `head` changes coalesce into one bounded trailing refresh instead of a document-wide resample each, keeping authored `:has(head > script)` dependencies.
- A refresh that coalesces with a scroll resamples the visible set only; the lookahead region follows on the next frame through the local path.
- Each sampled element exposes the authored color scheme itself, so source sampling no longer toggles the root and pays a document-wide style invalidation.
- Classification helpers that gated on `textContent` walk text nodes and stop at the limit they test for, instead of concatenating the whole page for the top-level wrappers.

## Fixes

- Soft dark and High contrast sample user-agent control colors, system colors and `light-dark()` values under the page's own color scheme, so the synchronous visible pass and the idle rescan classify a control the same way; previously the rescan's tone could replace the visible pass's.
- The resize refresh flag is passed correctly to the coalesced refresh.
- Shared custom-theme repairs for semantic controls, glyphs, surfaces, image labels and state repainting, with the corresponding local fixtures and preservation controls.

## Developer workflow and diagnostics

- Renderer identity: captures and issue bundles record the expected on-disk renderer against the renderer actually initialized in the page, with checks for loaded/disk mismatch, dependency change, reinjection, reload, fresh documents, child frames and local-mapped HTTP.
- Failure evidence: a failed shared-run attempt retains expected and actual facts, ancestor and generated layers, viewport and element screenshots and partial results in a unique directory.
- Visual archive and viewer: capture PNGs enter an ignored per-case archive with checksums; the lab compares archived images side by side, as an overlay or as a difference, without claiming visual acceptance.
- Owned browser lifecycle and process metrics: the runner confirms browser exit before removing only its own profile and appends local timing evidence per verification keyed by source hashes.
- Complete verification seals the code and fixture scopes before and after the run and writes a sealed report; focused and quick modes remain.

## Verification and limits

Release verification uses `npm run verify -- --browser`: syntax checks, 140 Node tests, launcher artifact tests, 19 canonical rendering assertions, lab interface and resource checks, the shared theme/case matrix, issue-bundle, failure-evidence, renderer-identity, visual-viewer, parent-disconnect and source-scheme checks. The sealed report for the renderer shipped here (before the version bump) is `verification-9d33361a-89b9-485c-822b-4877c0ec9608.json` under the ignored `research-artifacts/diagnostics/`, all 12 stages passed with equal start and end seals; quick verification was repeated after the bump.

Browser verification is on Windows with an isolated headless Brave profile. Amazon measurements are anonymous public-page counts and timings in fresh profiles; the served content varies between loads, so figures are paired comparisons, not absolute promises. The parse-time scheduling experiment was measured and not shipped. Chrome/Edge end-to-end checks and Linux/macOS desktop integration remain pending. No rule/backup format, permissions, telemetry or Native-renderer behavior changes are introduced.
