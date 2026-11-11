# Public-page diagnostic audit — 2026-11-11

This is a viewport audit, not end-to-end validation or accessibility certification. Browser: isolated Brave/Chromium 157.0.8103.50 on Windows; viewport 1000 × 900 CSS px, CSS zoom 1.25, DPR 1. Original plus Simulated Native, Soft dark and High contrast, border emphasis Off. No personal profile, credentials, account menu, live screenshots or form submissions were used. All eight final four-capture sets settled; 32 captures contain 4,380 element records.

Counts below are **distinct elements marked for review**, grouped by category, not individual border sides. A stronger border is a heuristic candidate and may be intentional palette behavior. Unsupported measurements are not passes. Font-size-zero numeric labels were reclassified as not applicable; the same saved raw facts were re-analyzed without revisiting those pages.

| Page | Simulated Native | Soft dark | High contrast | Unsupported measurements per themed capture | Report directory |
| --- | --- | --- | --- | --- | --- |
| [gradle](https://plugins.gradle.org/plugin/io.github.elianfabian.kproxyable) | 1 border | 1 border | 1 border | 3 | `run-1794401041611-b7f8d7a0` |
| [junta-cursos](https://www.juntadeandalucia.es/empleoformacionytrabajoautonomo/formacion/web/buscador-de-cursos/2648) | No review candidates in measurable paint | 4 border | 4 border | 53 | `run-1794401177560-2524d3f0` |
| [junta-subvenciones](https://www.juntadeandalucia.es/organismos/empleoempresaytrabajoautonomo/areas/formacion-empleo/empresa-entidad-fpe/paginas/subvenciones-desempleados-programa-formativo-2026.html) | No review candidates in measurable paint | 2 border | 2 border | 5 | `run-1794401189231-d44671c6` |
| [sepe](https://www.sepe.es/HomeSepe/es/preguntas-frecuentes/detalle-pregunta?detail=/preguntas/prestaciones-por-desempleo/solicitud-de-prestaciones/como-solicito-la-tarjeta-de-demanda-de-empleo) | No review candidates in measurable paint | No review candidates in measurable paint | No review candidates in measurable paint | 40 | `run-1794401306637-919a8226` |
| [escuela](https://escueladeformacionprofesional.com/courses/ssce0110docencia-de-la-formacion-profesional-para-el-empleo-granada/) | No review candidates in measurable paint | 3 border | 3 border | 19 | `run-1794401099895-cdb49ee5` |
| [booth](https://booth.pm/ja) | 4 text, 1 border | 2 border | 2 border | 7 | `run-1794401110283-59b6c1da` |
| [infojobs](https://www.infojobs.net/candidate/candidate-login/candidate-login.xhtml?goesTo=/candidate/cv/view/index.xhtml) | No review candidates in measurable paint | 2 border | 2 border | 1 | `run-1794401127193-b982fa1b` |
| [google-support](https://support.google.com/googleplay/thread/302494278?hl=en) | No review candidates in measurable paint | 1 svg | No review candidates in measurable paint | 3 | `run-1794401133044-8e4fab48` |

## Findings worth reviewing

- Gradle: the search input border remained 0.8px, but measured contrast increased from 1.61:1 to 2.37:1 in all custom themes. The audit sampled the initial viewport; this is not a fresh check of every tag/logo further down the page.
- BOOTH location: the **注目のリンク** (featured links) row below the main banner carousel (and below recently viewed items when that section is present). The four labels are **COMIC CITY 東京 153** (green, about 2.46:1), **COMITIA158** (mustard, 3.07:1), **Vket 2026 Summer** (cyan, 3.33:1), and **VRChat** (turquoise, 2.45:1).
- BOOTH: four 13px white labels on colored link tiles measured approximately 2.45:1–3.33:1 in Simulated Native against the known solid/composited backings. The four labels were not flagged in Soft dark or High contrast. Hidden numeric pagination labels were false positives in the initial analyzer and are now not applicable as text; this does not itself verify the visible dots.
- Google Support: one blue SVG in the avatar region measured 2.49:1 against the Soft dark backing, below the diagnostic 3:1 target. This needs visual/semantic review before deciding to recolor avatar artwork. It does not verify the authenticated account picker or pencil badge.
- Soft dark and High contrast produced additional border-amplification candidates on the school page, both Junta pages and InfoJobs. These are evidence of stronger edges, not proof that the design is wrong. No border-width or element-size changes were flagged in any of the final custom captures.
- SEPE: no review candidates in the measurable initial viewport, but 40 measurements were unsupported. This does not establish that the cards, logos, generated icons or native language popup are correct. Those require targeted/scrolled/interaction checks.

## Tool issues uncovered and corrected

- Unbounded decoding of offscreen lazy images caused Runtime.evaluate timeouts on both Junta pages. Readiness now considers visible images, waits at most two seconds per readiness group, and marks incomplete readiness as unsettled. The local `offscreen-readiness.html` fixture records the case.
- Navigating away from the SEPE page repeatedly timed out. Each canonical capture now uses a new owned tab, forcibly closing the previous owned target. This completed the requested four-way comparison without altering site content or the renderer.
- Zero-sized numeric button labels in BOOTH were being measured as visible text. The analyzer now marks them not applicable and preserves a separate need to inspect marker paint. A pure test and `hidden-marker-labels.html` fixture cover the distinction.

## Accessing evidence and limits

Subsequent visual review accepted BOOTH's colored tiles as they stand. The new source-aware triage leaves these threshold-only observations advisory instead of reporting them as regressions. Offline processing of these eight saved reports groups 99 themed review measurements into 21 findings (one priority candidate, 20 advisories), in approximately 0.20 seconds including summary writes on the development machine. No pages were revisited for that grouping. This prioritization retains the original numeric evidence and unknown coverage; it does not establish that all other content is correct.

Run `npm run lab`, choose Inspect report and select one of the directories above. Raw capture.json and re-analyzed analysis.json remain under the ignored research-artifacts/diagnostics directory. The machine-readable batch index and summary there link page IDs to runs. Public-page reports deliberately have no screenshots. The tracked note preserves this result without embedding personalized content or depending on ignored files for basic testing.

Live reloads and positional locators can drift; cross-run identity remains best-effort. This audit did not scroll the whole document, open menus, measure text against image pixels, inspect closed roots/child frames, or trace animation performance. No production rendering change was made as part of this audit.
