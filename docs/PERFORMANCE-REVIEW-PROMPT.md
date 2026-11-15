# Prompt for Fable 5.1

Copy the following into the review chat and provide the complete performance-review ZIP, or grant read access to this working tree including the selected ignored research evidence.

---

Please independently review this Chromium extension's performance and propose the best next improvement. I want a critical second opinion based on the code and raw measurements, not generic optimization suggestions or agreement with the existing analysis.

Start with `START-HERE.md` in the package, then `project/docs/PERFORMANCE-SECOND-OPINION.md`. The full current project is under `project/`; the performance evidence normally ignored by Git is included there too. Check `SNAPSHOT.json`, `MANIFEST.json` and `METRICS-INDEX.md`. This is a working-tree snapshot, including uncommitted/untracked files, not merely Git HEAD. If you have direct workspace access, read the corresponding files from the repository instead.

Read `AGENTS.md`, the renderer and dependencies, the rendering/performance documentation, the latest raw measurements and the rejected experiments. Do not stop at the handoff summary. First form an independent view of the implementation, then compare it with our interpretations. Say explicitly if you cannot open the archive, access required files or inspect an important artifact.

The objective is substantially less main-thread blocking, especially Simulated Native on Amazon. Native remains the default and is a different debugger-driven renderer. Amazon-specific visual adjustments are deferred. Retain source paint semantics, contrast/readability, imagery, geometry, interaction states, source restoration, frames/shadow roots and site independence. Existing regression cases and negative controls matter.

Pay particular attention to source-scheme exposure/restoration, temporary stylesheet disabling, computed-style reads, full/dirty/viewport scans, rule matching and mutation handling. Check whether expensive functions contain native style flushes rather than expensive arithmetic. The renderer already uses CSSStyleSheet/adoptedStyleSheets/insertRule and shares paint rules; moving from style elements is not an unimplemented optimization here.

Audit the measurements themselves: nested timings overlap; older profile/counter windows differ; the latest six-pair fixed-reference Amazon verdict is incomplete; five snapshot-matched pairs are a separately labeled exploratory analysis. Loading figures are DOM-readiness proxies, not full usability. Themed background work was still active after 45 seconds. Keep these limits visible and challenge any conclusion that exceeds them.

Please return:

1. A concise diagnosis, distinguishing facts, hypotheses and missing evidence, with file/line and artifact references.
2. Any important mistakes in the code analysis, measurement protocol, interpretation or preservation checks.
3. At most three ranked improvement approaches, with likely impact scope, complexity, risks and why each should help this implementation.
4. One concrete next experiment: exact change, baseline/control, measurements, retained-work and preservation checks, budget and acceptance/failure criteria.
5. Whether a larger architectural change is justified, including the case for or against worker/Wasm offloading based on measured worker-ready work and integration costs.

Review only initially: do not modify code, weaken tests, commit or publish anything. Do not claim to have run tests or read inaccessible files. Prefer a defensible, useful recommendation over an extensive tooling roadmap.
