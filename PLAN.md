# Validation plan — native dark mode in Chromium

Brave was the initial test browser. To verify another Chromium build, load the
extension, enable a rule on the local fixture, navigate within and outside its
scope, and reload the browser to confirm that the rule persists. Test optional
banner suppression separately with the launcher and record the browser version
and operating system.

## Objective

Enable the native filter per tab, then per website and path section, without global flags, manually opened DevTools, or an external daemon.

## Stages and acceptance criteria

1. **Prepare the per-tab prototype.** MV3 extension with `debugger`, popup, disable control and diagnostics. Check syntax and connection handling with a simulated API. This does not prove Brave compatibility.
2. **Validate the native filter in Brave.** Load `extension`, open the fixture and enable/disable. Inspect text, backgrounds, images, canvas, closed Shadow DOM and local iframe. Record browser version and actual results. If the command is unavailable or rejected, evaluate alternatives before extending automation.
3. **Validate the session lifecycle.** Reload, navigate, open DevTools, dismiss the debugging banner and close tabs. Never reconnect automatically after user cancellation. The prototype's manual setting belongs to the tab until disabled, closed or disconnected.
4. **Add website and section rules.** Both scopes are confirmed requirements. Default proposal: disabled unless a matching rule enables it; local storage; exact hostnames with optional subdomains. Test navigation between matching and nonmatching URLs and isolation between tabs. Rules will replace the prototype behavior that follows all navigation in an enabled tab.
5. **Expand compatibility checks.** Out-of-process iframes, websites with their own dark theme, restored tabs and browser restarts. Inspect flashes without promising their absence. Add child-target handling if necessary.
6. **Prepare delivery.** Document observed results, permissions, limits and installation. Store publication is outside the current scope.

## Website and section rules

- Confirmed scopes: entire websites and path sections.
- `/articles/` matches `/articles` and descendants, but not `/articles-extra`. Paths are case-sensitive. Do not decode escaped separators when determining boundaries.
- Rules can enable or exclude a scope. The most specific path wins. For equal paths, an exact hostname takes precedence over an inherited subdomain match. Reject duplicate scopes to avoid ambiguous precedence.
- Including subdomains must be explicit. `example.com` must not match `otherexample.com`. With subdomains enabled, a leading `www.` is an alias for its parent hostname. Existing rules with this setting use the new behavior, with an explicit parent rule winning collisions.
- Regional rules are opt-in and match a registrable name across recognized ICANN public suffixes, including compound suffixes. The list displays `name.*` or `*.name.*` according to the subdomain preference. Sections carry across the pattern. A single-domain rule wins at an equal path.
- Queries and fragments do not create separate scopes in the first version. Display the saved scope. HTTP and HTTPS share rules; a nonstandard port distinguishes a destination.
- Test trailing slashes, adjacent paths, subdomains, domain changes, same-document navigation and exclusions inside enabled websites.
- Acceptance example: enable `example.com`, exclude `example.com/photos/`, then enable `example.com/photos/articles/`.
- Rules are implemented in version 0.2.0 at the user's explicit request. Native visual regression testing remains pending.

## Image preference

- **Deferred at the user's request.** Version 0.2.2 removes image checkboxes and experimental CSS behavior. Retain the native engine and existing website/section management.
- `Emulation.setAutoDarkModeOverride` has no separate image parameter. No reliable dynamic native image toggle per website was established.
- Record `--enable-blink-features=AutoDarkModeSkipImages` as a future native launch-time option only. It is global per browser launch and remains visually unverified. Do not enable it in the current launchers.
- Preserve the investigation in `IMAGE-RESEARCH.md`. Revisit only if the user requests it or a suitable native per-website API becomes available.

Technical references:

- [CDP command](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setAutoDarkModeOverride)
- [Chromium filter](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/platform/graphics/dark_mode_filter.cc)

## Decisions and execution notes

- Initial browser: Brave, confirmed by the user.
- Loading the local prototype and testing with the debugging banner: authorized by the user's confirmation.
- Prototype is disabled by default, with explicit per-tab activation.
- Internal pages and protocols other than HTTP/HTTPS are excluded.
- No production dependencies or telemetry service. Since 0.9.0, custom themes can perform bounded reads of page-referenced image/SVG resources for contrast analysis; cross-origin reads use CORS without credentials.
- All project code, comments, UI text, tests and documentation are in English.
- Use local Git version control, as requested. No remote publication requested.
- Workspace was initially empty and had no Git repository.
- Windows Computer Use stopped before installation because it could not identify the browser URL confidently enough to enforce policy. No extension was loaded and no visual test was performed.

## Historical prototype test record

This table records the early prototype and is not the current 0.9.0 validation status. See the dated release record below.

| Check | Result |
| --- | --- |
| Syntax and extension tests | Passed `npm run check` and `npm test` with 29 tests. |
| Extension loaded in Brave | User screenshot shows the original prototype's debugger banner; version 0.2.0 has not been loaded by the agent. |
| Native command accepted and rendering changed | Pending. |
| Enable/disable and reload in Brave | Pending. |
| Banner cancellation and DevTools in Brave | Pending. |
| Images, canvas, Shadow DOM and iframes | Pending visual validation. |
| Website and section rules | Implemented; simulated matching, persistence, exclusions, navigation and cancellation tests pass. Brave UI tests pending. |
| Regional scope and www alias | Tests cover Amazon regional matching, section boundaries, explicit exclusions and existing www rules. |
| JSON backup | Tests cover round trips, validation, conflicts, failed writes and regional rules. Brave file chooser and download checks remain pending. |
| Popup languages | Nine catalogs with automatic and manual selection. Tests verify catalog completeness, interpolation and language fallback. Brave popup checks remain pending. |
| Image preference | Removed from the interface and execution path in version 0.2.2. Legacy image fields are ignored without losing website rules; regression tests pass. Native startup option documented and deferred. |
| Popup responsiveness | User screenshot shows disabled controls and inactive status alongside a debugger banner. Version 0.2.1 removes unnecessary CSS work for automatic images, decouples background tabs, and adds request timeout/progress. Simulated regressions pass; the actual Brave cause and fix remain unverified. |
| Debugging banner | Added an optional Windows launcher with `--silent-debugger-extension-api`. Executable discovery checked without launching or closing Brave. Actual suppression in Brave pending a manual restart. This affects all debugger extensions in that browser launch. |
| Regular Windows shortcut | Generated a local `.lnk` and installed a separate current-user Start Menu entry with the silent-debugger argument. Target and arguments verified. Browser restart and banner suppression remain unverified. No pre-existing browser shortcuts or associations changed. |
| Native launcher installers | Replaced the Python/PowerShell installers with Windows CMD + Windows Script Host JScript, Linux POSIX shell, and macOS shell. No Python/PowerShell dependency for end users. Three development tests execute native installers, verify artifacts and check generated macOS launcher argument forwarding with a mock browser. Linux/macOS desktop integration and actual Brave launch remain untested on those operating systems. |
| Native image research | Found source-backed `AutoDarkModeSkipImages` launch-time exclusion and confirmed its name in the installed Brave binary. Global per-launch preference, not a per-website CDP parameter. Headless baseline verification failed/timed out, so visual effectiveness is not confirmed. Details in `IMAGE-RESEARCH.md`. Existing launchers were not changed. |

## 0.9.0 release validation — 2026-11-11

Post-release developer tooling: `scripts/dev/audit-website.mjs` was exercised on the public Gradle plugin page in an isolated Brave profile across 18 cases (three custom themes, Off/Low/Maximum, scales 1 and 1.25). The tool verifies active paint before sampling and writes heuristic JSON/Markdown reports. It detects the reported transparent single-color logo candidates. Syntax checks, existing Node tests, CLI help, invalid-input rejection, and local documentation links were checked. These reports are not confirmed defects or a replacement for the planned regression gallery. The new tool does not recolor artwork or inspect the user's personal browser session.

- Development platform: Windows; automated browser checks used Brave reporting Chromium `157.0.8103.50` with an isolated profile and the unpacked extension. This is not verification of every Chromium browser.
- `npm.cmd run check` and `npm.cmd test`: 64 tests passed again after the version/documentation/help-text update. Tests cover rules and precedence, exclusions, backups, controller handoff, localization, and Chromium color vectors. They are not visual regression tests.
- Local browser checks cover the shared custom-theme repairs, repeated local resampling over the supplied decorative SVG, placeholders, monochrome/multicolor glyph controls, clipped and layered SVGs, own SVG CSS backgrounds, external share SVG shape preservation, and repeated idle/hover states.
- The public BOOTH page was checked for own-background pagination dots, selection changes, theme switches, and uniform notice surfaces. Generated dots and visible numbered pagination have separate negative controls.
- The public SEPE question page was checked for all six social/PDF controls at Off, Low, and Maximum in all three custom themes. Original CSS also reproduces the full-size pseudoelement backing, rounded corners, transparent border, and offscreen/transparent labels locally. Text buttons, authored edges, and a small decorative pseudoelement are negative controls.
- Manager checks cover independent website/path defaults, persistence, dialog dismissal without saving, individual Trash deletion and cancellation, action layout, and long URL tooltips in grouped/ungrouped lists and Trash. Layout checks include 100% and 200% text, narrow/wide windows, light/dark UI, and UI high contrast.
- The Google account menu was reproduced from anonymized supplied HTML. Some icon cases pass, but later user screenshots still show state-dependent text/surface problems. Do not report the whole authenticated menu as fixed.
- Website-specific selectors and branches are excluded from production theme repair policy. Source pages and class names belong in research reproductions and verification notes.
- Browser investigation scripts under `research-artifacts/` are ignored and not available in a fresh clone. The next planned task is a checked-in local regression gallery; it is not included in 0.9.0.
- New screenshots are owner-supplied originals, shared by both READMEs. They document the UI and do not establish compatibility with all pages.
- Broader Chrome/Edge, Linux/macOS desktop behavior, out-of-process-frame coverage, and native image controls remain pending as described in the README and roadmap.

Release preparation checks: `npm.cmd run check` passed; all 64 Node tests passed; all seven launcher artifact tests passed outside the filesystem sandbox (Git Bash/Windows Script Host could not start correctly inside it). UTF-8 validation, local documentation links, manifest version, exact screenshot hashes, and `git diff --check` passed. Launcher artifact tests still do not establish Linux/macOS desktop integration.


### 2026-11-11: authored edge and linked-artwork follow-up

- Corrected strongly contrasting neutral borders that stayed black after their backing darkened in Simulated Native; live SEPE navigation retains its fractional width.
- Shared the compact two-ink control/ring and breadcrumb glyph repairs, stronger small-glyph contrast, and authored notice-link accent policy across all custom themes. Live Junta course details were checked at 125%.
- Implemented contrast-driven channel lifts for verified static transparent single-color artwork in image-only links; both public Gradle header assets now change in all custom themes. Multicolor and animated resources remain negative controls. A previous audit finding alone had not applied this correction.
- Added the portable focused `fixtures/contrast-controls.html` and its generic SVG assets. The comprehensive gallery remains future work. Local checks at 125% and 150% cover all custom themes, Off/Maximum/Off, resampling, geometry preservation, and disable cleanup; Gradle's six-level/pointer/focus regression also passes.
- Checked in Brave/Chromium 157.0.8103.50 on Windows using an isolated headless profile and CDP. No personal browser tab or authenticated Google session was accessed. Node validation: syntax checks and all 64 tests pass.

- Follow-up: fixed a contrast regression from Off to Very low on repaired neutral dark edges. Emphasis now builds on the actual repaired Off contrast rather than using a lower absolute target. Live SEPE checks at 125% verified all six levels increase visibility, preserve 0.8px widths and restore Off exactly. Syntax checks and all 64 Node tests pass.

- Scroll icon follow-up: keep a persistent measured private-use font-glyph repair for compact empty accessible controls. Live 200-frame scroll traces in all three themes now retain one readable color; the 160-frame local fixture also verifies decorative/disabled negative controls and disable cleanup. The change is shared and has no site-specific selector. Syntax checks, all 64 Node tests and `git diff --check` pass.

- Native select popup follow-up: shared explicit dark option/optgroup backing for otherwise unstyled single-row menus. Live SEPE language menus were opened and visually checked in all custom themes; native selected-item highlighting remains visible. Local tests cover keyboard selection, grouped/disabled options, repeated resampling, custom-color/listbox/disabled-select exclusions and cleanup. Brave/Windows at 125%; syntax checks, all 64 Node tests and diff validation pass.

- InfoJobs follow-up: shared compact non-semantic-pointer/definition-label SVG contexts, 7:1 independent-glyph target, actual fill/stroke adjustment and 4.5:1 thin saturated action-edge repair. Added credential-free CORS static-SVG silhouette analysis to the shared cached resource path, preserving original img URLs and rejecting denied/animated/multicolor cases. Live public login and local cross-origin fixtures pass all custom themes in Brave/Windows at 125%; no credentials entered. Added the optional standard-library fixture server for reproducible CORS allowed/denied cases.

### 2026-11-11: complete backups and selective import

- Full exports now use backup format v4 with rules, Trash and canonical Rule defaults. Legacy versions 1–3 remain readable. UI appearance/language/display settings stay local.
- The manager import dialog offers independent translated checkboxes, disables unavailable legacy sections, keeps defaults replacement opt-in and scopes merge/replace controls to Rules. Trash import is additive/idempotent and does not activate rules. Cancellation and validation failures leave configuration unchanged.
- Imports validate all supplied sections before one queued write of selected keys. Rule-default edits now share RuleManager serialization with imports/restores/deletions. File/list limits and stale-removal review are preserved.
- Added six backup tests covering section combinations, full round trips, failures and races. Browser checks in isolated Brave/Windows cover actual file selection, selective writes, export, old files, cancellation and 100–200% UI scale with translated dark/light/high-contrast dialogs. No release version/tag change was requested for this follow-up.

- Final import defaults: only Rules starts checked; Trash and Rule defaults start unchecked. All 70 Node tests pass, as do syntax/diff checks and isolated-browser file import/export checks, including 200% text and dynamic translations.

### 2026-11-11: release 0.10.0

- Bumped the extension manifest to 0.10.0 and aligned both README release summaries. Added the English release notes in `docs/RELEASE-0.10.0.md`, including complete/selective backups, shared rendering repairs, developer tooling, compatibility, resource-read policy, and remaining limitations.
- Updated the current Native-default version in the contributor guide and roadmap. Native is still the default; replacement and naming remain undecided. Preserved the historical 0.9.0 release record and screenshots.
- Release checks passed: `npm.cmd run check`, all 70 Node tests, UTF-8 and local Markdown links, nine interface catalog key sets, manifest version, and `git diff --check`.
- Repeated isolated Brave/Chromium 157.0.8103.50 checks on Windows after the version bump: full/selective backup import/export, legacy availability, close/backdrop/Escape/interior-click/focus behavior, translated and large-text dialogs; all three custom themes' focused SVG/CORS/control fixture with conservative negative controls. These do not confirm the authenticated Google account panel or all website states. Launchers were unchanged; their artifact tests were not repeated for this release.
- Prepared a local release commit and annotated `v0.10.0` tag. Remote publication requires a separate push request.


### 2026-11-11: diagnostics and local gallery, first working slice

- Added the isolated browser helper and shared capture, pure analysis, saved-run comparison and local server/viewer. `audit:website` now uses this same implementation instead of duplicating collection/analysis. Production rendering and permissions were not changed.
- `npm run lab` starts the gallery and report UI with a local capture button; `npm run verify -- --quick --browser` owns the fixture server and browser automatically. CLI capture also supports public URLs, targeted selectors, theme/level/zoom subsets and offline operations.
- Four canonical specimens produce 28 smoke snapshots and 19 required assertions. The expanded matrix passed 163 assertions across 228 snapshots (three custom themes, six levels, zoom 1/1.25/1.5). Real DOM border corruption is detected and its restoration is checked as resolved. Unknown paint is not accepted as a required measured assertion.
- Added six independent Node tests for diagnostics and inventory consistency. The gallery records all 44 rendering-guide mechanisms, with four partially mapped to the new canonical specimens and the rest pending; five existing manual fixtures are linked. This is not the full planned regression gallery.
- Verified UI capture initiation, status filtering, original/applied images, raw evidence, offline same-run comparison, narrow/large-text wrapping, keyboard focus, same-origin job guards and path containment in an isolated Brave/Chromium 157.0.8103.50 profile on Windows. Inspected gallery and report screenshots. The initial unsupported filtered SVG result led to an explicit constant-white CSS filter model, retaining raw fill alongside effective ink.
- Verified targeted capture of five public Gradle tags with source and Simulated Native, without account credentials or live-page screenshots. Live structural locators are intentionally marked best-effort for cross-run comparison. Interaction traces, nested SVG backing measurement, image pixels, closed roots, inspected frames and other browser/platform environments remain future work.


### 2026-11-11: eight public-page diagnostic audits

- Compared original and all custom themes at Off/125% on Gradle, both Junta pages, SEPE, the training school, BOOTH, InfoJobs and Google Support: 32 settled captures and 4,380 element records. Recorded grouped findings and unsupported scope in `docs/LIVE-PAGE-AUDIT-2026-11-11.md`. No production renderer change.
- Real pages exposed offscreen lazy-image readiness waits and a navigation-away stall on SEPE. Readiness now waits only for visible resources with explicit bounds; each canonical capture uses a new owned target. The local readiness fixture verifies all four modes. Hidden zero-sized pagination text is now not applicable, with a pure reference test and a retained fixture.
- Unified quick/browser verification passes 77 Node tests and 19 local assertions. Authenticated panels, below-fold content, image-pixel contrast and temporal/performance scenarios were not verified by this audit.

### 2026-11-11: deterministic triage and extended visual specimens

- Added a pure source-aware review queue that groups border sides/repeated themes, distinguishes changed geometry or degraded contrast from threshold-only advisories, and retains unsupported counts/raw evidence. Visual acceptance is a separate report/fact-scoped annotation with export/import; it never changes renderer output or raw check status. Optional live labels improve location without exporting form values.
- Reprocessed the eight saved public audits without visiting the pages: 5,244 measurements and 99 themed review rows become 21 groups (one priority candidate, 20 advisories), in approximately 0.20 seconds including summary writes on this machine. BOOTH colored tiles remain advisories in accordance with the user's visual review. This is not a new live-page verification or a timing guarantee.
- Added six extended groups with documented historical provenance and synthetic local artwork: wrapped/clipped/nested SVG, generated/background/sprite icons, solid and mixed transparent PNG/SVG, actual static/animated transparent and multicolor/opaque GIFs, selectors/placeholders, purchase/deal labels, thin/fractional/transparent/generated edges, cards/social links, divider/tabs/spacer, gradients/picture text, hover/sticky/carousel/dots. No original website scripts, private content or third-party logos are bundled.
- Captured 42 stable original/custom-theme Off/Maximum snapshots on isolated Brave/Chromium 157.0.8103.50 on Windows. These groups are capture-only; the one deliberate fault assertion validates the pipeline. The original smoke remains 28 snapshots and 19/19 assertions. The inventory has 42 partial mappings and two pending mechanisms; automatic pixel contrast and interaction timing remain pending.
- Added source-aware grouping/acceptance/asset tests and portable lab UI verification to the existing unified browser command. Verified all local images decode and the animated GIF actually changes frames. Queue inspection/accept/reopen, request guards, focus and narrow large-text layouts passed after correcting a select-label overflow. Production renderer code and extension version were unchanged.
- Final unified quick/browser run passed 82 Node tests, 19 canonical assertions and the lab UI/asset checks: approximately 1.5s syntax, 9.7s Node tests, 15.7s canonical browser smoke and 5.4s UI/assets on this run. Launchers were unchanged and omitted by `--quick`.

### 2026-11-11: original website elements and reproduction fidelity

- Added five original-site groups beside the six generic groups, using 22 public/decoded assets with pinned SHA-256/byte counts and provenance: Gradle SVG/PNG, original Indeed inline logo/navigation/preference paths and decorative gradient, SEPE government branding and card icons, Junta logo/course/background glyphs, InfoJobs, school/funding artwork and the original formacion.cc GIF. Local fragments omit personal labels and live handlers. Extended capture produced 77 stable snapshots; assertions remain scoped, not an all-pixels pass.
- Made the gallery two columns above 900px, one below, and increased previews to 420–720px based on viewport height. Renamed the visible capture-only label to “Measured · review required”; supported raw measurements are already automatic. Known generic sprite/wordmark/GIF visual gaps stay visible on their cards. Indeed/Junta show narrower partially-checked status.
- The reporter identified discrepancies absent from the live pages. Indeed's local reduction had changed embedded SVG delivery to an external file and altered icon inheritance; restoring embedded delivery/logo context and source glyph paths fixes the modeled heading contrast. Junta's live 288×56px logo anchor preserved a white backing, while the reduced inline anchor was only 17px high; restoring block/flex/header geometry preserves the same light backing in all custom themes. These were fixture corrections, not production renderer fixes.
- Direct CDP comparison of the public Junta page and local fixture confirmed source/themed logo backgrounds in all three themes on isolated Brave/Chromium 157.0.8103.50 / Windows. Indeed source context comes from the reporter's HTML and embedded SVG, with local assertions; this is not a fresh authenticated live Indeed comparison.
- Added portable original-resource integrity/decoding checks, original embedded-gradient and six SVG path assertions, modeled Indeed heading contrast at both gradient endpoints, and Junta source-container/preserved-backing checks to unified browser verification. Final quick/browser verification passed 83 Node tests, 19 canonical assertions and UI/assets/fidelity checks (about 1.5s/10.0s/16.0s/6.5s on this run). Production renderer files, extension version and launcher artifacts were unchanged.


### 2026-11-11: shared repairs validated by the extended gallery

- Corrected the real formacion.cc GIF and EFP school-logo reproductions after comparing original public/local computed context: source display dimensions, heading/label, block-image anchor geometry and light ancestors matter as well as identical asset bytes. Retained separate bare captioned-figure probes instead of silently replacing failing synthetic variants. A bounded semantic figure repair restores a necessary light backing, with tint only for verified static neutral silhouettes; animation and multicolor pixels remain intact.
- Shared renderer changes cover verified static compact background crops (single-ink versus multicolor sprites), consistent computer/contact glyphs, pale shallow SVG backgrounds, conservative flow-text backing over unknown picture pixels, distinct card/page surfaces and short raised-link emphasis. Neutral outer card shadows can become low-opacity light halos without changing their geometry. Source resources, image palettes, negative controls and Native remain separate from these custom-theme policies.
- Contact labels now use white for low-contrast neutral ink on dark backings. Background-only SVG adaptation also supports one short label beside child media without tinting that media. Local direct/nested/paragraph/mixed-content glyph contrast is 14.74:1 in Simulated Native, 11.94:1 in Soft dark and 18.28:1 in High contrast. Readable glyph, multicolor, repeated-pattern and large-illustration negatives remain unchanged and visibly identified as preservation checks.
- Added independent browser expectations for displayed glyph crop pixels, palette preservation, equivalent glyphs, repeated resampling, static/animated artwork, captioned-figure backings, modeled gradient/picture-label contrast, card surface separation and Off/Maximum slide emphasis/dimensions. Fixed only fixture layout for the overlapping generated arrow and touching hidden-label pagination dots.
- Final `npm run verify -- --quick --browser` passed: 83 Node tests, 19 canonical assertions, UI/assets/source-fidelity checks and 18 shared theme/case combinations on isolated Brave/Chromium 157.0.8103.50, Windows. Observed stage times: 1.40s syntax, 10.63s Node, 15.95s smoke, 7.12s UI/assets and 10.17s shared checks. Launchers were unchanged and omitted. The refreshed gallery produced 77 settled captures; its one pipeline self-test is not an all-pixels pass.
- Evidence is local unless explicitly marked as the public/source-fidelity comparison above. Picture-label bounds are modeled, not a new live-photo measurement. Native popup pixels, arbitrary complex images, closed roots and motion/performance scenarios still require dedicated verification. Updated the guide inventory, lab documentation and case labels accordingly; no version bump or commit was made.


### 2026-11-11: palette, border and state follow-up across all custom themes

- Replaced overbroad preservation of compact labeled two-ink SVGs and repeated labeled SVG tiles with per-ink contrast adaptation. Retain source geometry, repeat/position/size and readable inks; use the Chromium-derived foreground starting point for colored inks rather than washing everything toward white. Inline two-color drawings beside text also participate, while unlabeled, complex and oversized artwork remain controls. A small simple static SVG image beside a label can adapt each ink through reversible CSS content; src and path geometry stay unchanged.
- Extended single-ink SVG wordmark handling to bounded wide marks in accessible image-only links. Portable checks measure the original Indeed paths against their actual backing in every custom theme. No website selector or hostname was added to the renderer.
- Neutral frame repair now covers taller compact controls, transparent inherited backings and full-box generated frames. It uses content-box/border-box geometry with fractional rounding, preserves border widths, and increases all six emphasis levels relative to the repaired Off baseline. Compact accessible single-letter controls participate. Card classification takes precedence over the compact-control category and equivalent near-white source card levels normalize consistently; small neutral control fills retain separation from the canvas.
- Removed blanket rectangular backings from flow text over CSS images. Bounded static PNG/background-crop sampling reuses overlay region measurements to select ink; a glyph-sized halo may assist mixed regions, without asserting accessibility conformance. Unsupported flow-image pixels retain authored paint. Native-engine CDP reference screenshots for icons, borders and surfaces are saved separately from custom-theme evidence.
- Cached completed static-artwork verification is applied synchronously during resampling, preventing a verified icon's filter from temporarily dropping while an already-completed promise resolves. Original SEPE SVG probes cover 24 frames of steady-backing resampling plus 32 frames of deliberate backing/class/scroll changes per theme. The authored-style cache now includes display/shadow/border/radius context needed to classify a cached parent identically to a directly inspected card. A live trace exposed alternating filter strengths even after the filter no longer disappeared; the cache correction fixes that distinction. Public SEPE verification on isolated Brave/Chromium 157.0.8103.50 on Windows recorded four category icons over 90 scroll frames per custom theme: one constant filter per icon, no untinted frames and equal final card backgrounds, alternating scroll positions 0/400 CSS px. This is bounded evidence, not a guarantee for all timing/site states.
- Repaired 24 double-encoded UTF-8 sequences in the source-element HTML; the HTTP headers already specified UTF-8. Node and served-browser checks protect accented Spanish labels. Explicit SVG fixture IDs are no longer overwritten by generated IDs.
- Unified quick/browser verification passed 83 Node tests, 19 canonical assertions, UI/assets/fidelity checks and 24 shared theme/case combinations. Measured stages were 1.51s syntax, 7.64s Node, 16.22s canonical, 6.86s UI and 12.44s shared checks. The UI checks also verify the shared Chromium-derived wide-wordmark color starting point. The final refreshed extended gallery contains 77 settled snapshots and the separate pipeline self-test; this is not an all-pixels pass. Launcher artifacts were unchanged and omitted; no version bump or commit was made.


### 2026-11-11: remove artificial text/underline outlines over flow images

- The reporter identified a heavy/doubled appearance in all custom themes. The four-direction text halo added by the shared flow-image fallback also outlined the underline. Removed that manufactured halo; foreground sampling remains, while source shadows, underline thickness, stroke and dimensions stay unchanged. No site-specific selector or image filename policy was added.
- Added an authored soft-shadow control beside the plain picture label and strengthened portable assertions to compare source/applied decoration and geometry in Simulated Native, Soft dark and High contrast. Inspected the resulting Brave/Windows screenshot: normal letter edges and underlines, no added rectangular backing. A highly varied image may still lack a uniformly sufficient text/background contrast; this visual repair does not assert otherwise.
- Verification for this follow-up: syntax checks, 83 Node tests and 24 shared browser theme/case combinations passed. The wider canonical/UI suites were not rerun for this narrow deletion.


### 2026-11-11: align propagated image-link underlines with sampled text ink

- The subtitle keeps dark ink where it measures better against its image region. A separate defect left the title underline dark after the title changed to white: the ancestor link, rather than the text label, painted the propagated underline in its own color.
- For flat image-backed links with short leaf labels and default-color underlines, retain the ancestor's decoration geometry but make its propagated paint transparent and paint each label's underline in currentColor. Preserve source thickness/style/offset, shadows and explicitly colored decoration. Cache authored decoration state and resample the link and labels together on hover; no website-specific rule or forced white text was added.
- Added an explicitly colored underline control and compare effective source/applied decoration and geometry. Targeted browser verification passed 24 theme/case combinations on isolated Brave/Windows, including each custom theme, matching text/underline color, the authored soft-shadow control and independent underline-color preservation. Inspected the resulting screenshot.
- Additional verification: focus preserves decoration geometry; an authored hover rule removes/restores the underline on both link and labels in all three custom themes. Syntax and all 83 Node tests also passed.


### 2026-11-11: select image-text ink from weighted perceptual distributions

- The colorful source fixture itself has weak captions. Replaced the single-worst-pixel WCAG ratio as the foreground-selection policy with a shared, explicit engineering heuristic: weighted word-region samples, signed perceptual contrast, coarse font size/weight targets, capped mean plus lower-decile scoring, stable near ties and conditional source-color retention. Worst-region and target-coverage evidence remain available; uncertain mixed pictures are not called accessibility passes. This supersedes the earlier dark-subtitle selection recorded above.
- Added `extension/image-contrast.js` for the policy, loaded through both manifest and fallback injection. Reused the existing perceptual equations and prepared background/foreground luminance powers once per comparison; scalar and prepared results match, including translucent ink. The local Node probe improved warm medians from about 2.2/3.5ms to 1.0/1.5ms on 1,319/1,980 distinct colors. These are policy-only microbenchmarks, not browser latency guarantees.
- Sampling now preserves color frequency and excludes gaps between word ranges. Existing decoded-resource caches remain bounded; each label stops at 48 words/16,384 visits. Word bounds are a glyph-coverage approximation, not a spatial masking or exact font raster model. No site-specific rules, artificial flow-label backings, manufactured halos or strokes were added. Source soft shadows and explicitly colored underlines remain intact; the latter explains the remaining blue underline versus Native in the comparison.
- Added synthetic bright/dark picture negatives alongside the colorful source case, registered their scope/limits, and documented references and exact weights in `docs/IMAGE-TEXT-CONTRAST.md`. Candidate statistics flag the colorful subtitle as uncertain even though the preferred foreground is now white. The internal uncertainty is not yet a new lab UI badge.
- Verified in owned Brave on Windows: all three custom themes choose white for the colorful labels, retain dark text on the bright control and light text on the dark control, preserve decoration/shadow/stroke/geometry and keep stable ink over 24 scroll/class-resampling frames per theme. Source screenshots supplied by the reporter and generated local PNGs were reviewed; no renewed live-site confirmation is claimed.
- Final unified quick browser verification: syntax checks, 89 Node tests, 19/19 canonical smoke assertions, lab UI/source-asset checks and 24 shared rendering theme/case combinations passed. Renderer report hashes now include the color primitive, image-text policy and renderer together. No version change or commit was requested for this follow-up.


### 2026-11-11: adapt independent underline colors over pictures

- The reporter prefers Native's pale blue underline to the unchanged dark blue. Changed the earlier strict source-color preservation policy for supported flat image-backed links: preserve an independent decoration color relationship, but compare the original ink against its existing Chromium-derived chroma-retaining conversion using the shared weighted image score (reference target 45, improvement margin 0.02). No blue RGB value, site name or proprietary selector was added to renderer rules.
- Aggregate word samples from all short labels in the link so one source decoration retains one color across title, wrapped subtitle and adjacent lines. Keep source thickness, offset, shadow and hover removal. Preserve dark blue when a bright picture favors it, and retain an already readable pale blue on a dark picture. The image remains unchanged and uncertain mixed-picture evidence remains uncertain.
- Updated the local surface specimen, case registration, coverage inventory and rendering-policy documentation. The observed colorful case derives rgb(109,178,234) from rgb(0,102,153); preservation controls keep rgb(0,102,153) on the bright picture and rgb(177,209,244) on the dark one.
- Verification: syntax checks and 90 Node tests passed; 24 shared Brave/Windows theme/case combinations passed, including all three custom themes, source geometry, default and independent underline hover removal/restoration and stable text/decoration colors over 24 scroll/class-resampling frames. Inspected generated local screenshot. This is local synthetic confirmation, not renewed live-page verification. Broader canonical/UI suites were not rerun for this narrow decoration change.


### 2026-11-11: preserve authored dark-surface border weight

- Measured the actual lab card and badge in owned Brave/Windows rather than inferring stroke width from screenshots. The card retained 1px geometry but Simulated Native attenuated its already-dark source edge to 20% alpha: composited contrast fell from 3.2068 to 1.2388. This was an overbroad light-frame softening rule, not a missing font outline or a thinner CSS border.
- Source-aware separator handling now preserves border/ring ink on authored dark backings instead of attenuating it as a converted light-mode frame. Simulated Native emphasis uses that preserved edge as its baseline, so Very low cannot lower Off contrast. The actual lab card measured source/Off 3.2068, then 4.1166/5.1592/6.4170/7.8123/10.2758 over the stronger levels, always with 1px width and unchanged dimensions. Raw measurements are ignored artifacts `lab-edge-before.json` and `lab-edge-after.json`.
- Added generic already-dark muted-blue and deliberately strong frame controls to the border specimen; registered the case/inventory evidence and documented the root cause. Existing light frames, transparent reservations, generated frames, colored selections and focus behavior remain contrasting controls. Palette themes retain their own border palette policy; the erroneous source attenuation was specific to Simulated Native.
- Recorded the general perceived-weight preference in AGENTS and the rendering guide: preserve intended separation, prefer bounded color/contrast adjustments, retain original geometry and avoid universal font/border stroke multipliers. Material's primary dark-theme guidance supports deliberate tonal and hierarchy choices, not a blanket rule to outline or embolden text. Text still adapts its foreground without manufactured glyph outlines.
- Verification: syntax and 90 Node tests passed; 24 shared Brave/Windows rendering combinations passed, with all six border levels, preserved source dark-frame Off paint, monotonic emphasis, and unchanged widths/dimensions in all custom themes. Actual local lab UI before/after was measured; no remote-site confirmation is claimed. Broader canonical/UI suites were not rerun for this bounded separator repair.


### 2026-11-11: prepare release 0.11.0

- Bumped the manifest from 0.10.0 to 0.11.0 for the local diagnostics/regression lab and accumulated shared rendering improvements, including the follow-up commit after 0.10.0. Updated both README release summaries, current Native-default references, roadmap implementation status and detailed English release notes. Historical release documents remain historical. Native remains the default; no naming or renderer retirement decision was made.
- Standard release verification passed on Windows/owned Brave: syntax, 90 Node tests, seven launcher artifact tests, 19 canonical smoke assertions, lab UI/source-asset checks and 24 shared rendering combinations. Timings: 1.74s/7.20s/7.41s/16.05s/6.75s/13.29s respectively. Full output is an ignored local artifact at research-artifacts/diagnostics/release-0.11.0-verification.log.
- The release includes checked-in developer tooling, local generic/original-resource fixtures, source-aware analysis and explicit partial coverage. Generated reports and scratch research remain ignored. Reviewed the patch and whitespace before the release commit; annotated v0.11.0 tag reserved after confirming it did not already exist. No push or hosted release publication was requested.


### 2026-11-11: shorten the evidence-to-fix workflow

- Started from clean release 0.11.0. Added a selector-scoped `diagnose --issue` bundle: original plus custom themes, 100% zoom/Off defaults, bounded visible rows, four ancestor/generated-layer contexts, compact deterministic property differences and complete raw capture facts. Default live labels, HTML, screenshots and form values remain excluded. Missing selectors/empty inspectable results fail; isolated login/state and structural-matching limits remain explicit. The CLI was exercised end to end on the local image-text specimen across source/all three themes (four stable captures). Automated browser checks verify context/pseudos, differences, redaction and missing-selector failure/cleanup.
- Added `verify --focus GROUPS` with explicit groups icons/borders/images/surfaces/states/contact/cards. It keeps syntax and every unit test plus the selected group's full browser expectations and negative controls. Full `verify --browser` remains the release command and adds issue-bundle checks. Latest verification scope, outcomes and timings are saved under ignored last-verification.json; no previous pass is cached or used to skip current work.
- Diagnosed repository-wide Node test discovery as avoidable overhead. The same 90 original tests took around 10.42s with broad discovery versus 0.34s with explicit test-tree discovery in the local comparison. New `.test.js/.test.mjs/.test.cjs` files are discovered recursively within test/; unrelated ignored research/report trees are no longer scanned. Final 92 tests passed in 0.43s wall-clock through verification. The focused border path fell from approximately 16.64s to 6.96s (syntax/all units plus three themes/six levels). It is intentionally less broad than the approximately 52s complete verification, not an equal-coverage benchmark.
- Complete verification exposed an existing frame-count race in the changed-backing scroll probe. It now waits for four actual backing transitions with bounded per-phase frame sampling and checks every intermediate glyph treatment. Missing transitions and unadapted frames still fail; no threshold was relaxed to claim speed.
- Verification: full standard command passed syntax, 91 then-current unit tests, seven launcher tests, 19 canonical assertions, lab UI/assets, 24 shared rendering combinations and new issue-bundle checks (about 51.5s total). A final focused run passed all 92 units, CLI rejection guards and border-group expectations. End-to-end issue CLI default matrix passed four stable captures. No production renderer/UI behavior was changed. README translations, AGENTS, browser/lab guidance and a dedicated reporting/fast-testing guide describe the measured scope and remaining opportunities. No commit/version bump was requested for this work.


### 2026-11-11: selected result-card borders and dimensionless carousel SVGs

- Indeed: the public home/search requests in owned Brave were blocked. The reporter supplied the actual outer result-container structure: nested table, h3 anchor/button with aria-pressed=true, frame owned by a noninteractive outer div. Extended the shared colored-control border repair to meaningful uniform thin chromatic card/option frames on distinct neutral backings, including containers around heading links. Preserve width, source hue and focus; matching colored fills retain their preset's existing behavior. Generic selected-option and nested-heading reproductions pass 4.5:1 sampled border/backing checks across all themes and all six levels. Source CSS color #2557a7 is representative, not live-confirmed for the personalized card; no site/framework selectors were added to the renderer.
- Amazon: inspected the real public next-page control, whose inline CSS SVG uses viewBox 6 2 12 20 with no explicit width/height. The simple background parser previously required both dimensions. Bounded viewBox inference now requires absent dimension attributes and an explicit bounded CSS background size or bounded contain/cover placement, retaining all existing shape/paint/size restrictions. It preserves the original SVG path and viewport origin instead of substituting a new icon.
- Added the actual public CSS SVG to the icon gallery with provenance/pinned decoded drawing checksum, hidden accessible-label context, normal 48x100 and compact 40x40 controls plus a rotated preservation variant. Pixel checks cover the glyph's ink, unchanged path, dimensions and transform alongside existing flag/multicolor negatives. Live public Amazon pixel confirmation measured about 18.73:1 in Simulated Native, 11.94:1 in Soft dark and 18.28:1 in High contrast, with the original 12x20 glyph and translation retained. Personalized carousel variants remain only mechanism-level reproductions until observed directly.
- Broader verification exposed an over-specific artwork test: a logo's light backing may move from an unpadded link to the image itself during resampling. Measure both to establish the same visible backing; independently retain the stricter padded-container assertion. Make the image visible and await its backing before sampling. No renderer artwork behavior changed for this adjustment.
- Verification: complete quick browser run passed syntax, 92 then-current unit tests, 19 canonical assertions, lab UI/source-asset checks, 24 shared rendering combinations and issue-bundle checks. Final icons/borders focus passed all local variants after adding the compact control. Final 93 Node tests passed after pinning the original arrow bytes. Updated the fixture registry, coverage evidence, rendering guide and provenance. No version change or commit requested.


### 2026-11-11 — Tiny carousel sprite and selected-border emphasis

- Selected chromatic frames were repaired to a fixed Off ink, inadvertently overriding stronger levels. Shared source-derived color now increases with the selected opacity and retains hue at Maximum without widening geometry. All six levels in all three custom themes assert increasing contrast.
- The later small Amazon arrow uses a PNG sprite, unlike the earlier viewBox SVG. Public CSS/resource inspection confirms a 400x900 sheet, -105px -7px crop, 11x15 icon and clipped accessible child. Child rejection and the sixteen-opaque-pixel floor both excluded it (only twelve near-opaque pixels). Permit wholly hidden children and scale only bounded compact crops to an 8–16 pixel evidence floor, retaining single-ink/transparency/static/CORS restrictions. No production site selectors or replacement drawing.
- Added original pinned sprite, matching nested local structure, visible-child preservation negative, pixel contrast and dimension/hidden-label checks. Updated fixture registry, coverage, provenance and rendering guide. Indeed remains blocked live; its supplied DOM is locally reconstructed, source color representative. The small Amazon control uses real public CSS/resource with supplied HTML, not an authenticated live carousel.
- Windows/owned headless Brave: focused icons/borders passed; full quick verification passed syntax, 93 Node tests, 19 canonical assertions, lab interface/assets, 24 shared rendering combinations and issue-bundle checks. Launcher tests omitted (no launcher changes). No version bump or commit requested.


### 2026-11-11 — Preserve selected-border identity at stronger emphasis

- User-supplied computed layers locate the Indeed blue edge on the slider container's own 0.8px border, with a soft shadow and no painted outline or pseudoborder in that measured state. The initially considered duplicate-wrapper hypothesis was not established for this page and no ancestor-suppression heuristic was retained.
- The prior 85% white blend washed out the selected blue at stronger levels. Bound emphasis to a 50% blend, mathematically retaining at least half the repaired Off RGB channel spread while progressively increasing contrast. Shared across all three custom themes; no site selectors, no new frame or width changes.
- Selected/nested-heading local fixtures now include a soft authored shadow. Assertions cover all six levels, increasing contrast, retained chroma, geometry and absence of added outline/inset ring. Update fixture/coverage/rendering evidence accordingly; live Indeed remains blocked.

- Verification: Windows/owned headless Brave passed focused borders across three themes/six levels, syntax, 93 Node tests and the full quick browser suite (canonical assertions, lab UI/assets, 24 shared rendering combinations and issue-bundle checks). `git diff --check` passed. No release/version or commit requested.


### 2026-11-11 — Selected-frame emphasis preserves exact blue

- User clarified that Maximum still pales the blue. Owned local measurements confirmed that the previous 50% blend changed rgb(145,178,255) to rgb(200,217,255) and kept the CSS stroke at 1px. Retaining half the RGB chroma was not an adequate visual acceptance criterion.
- Removed emphasis whitening for uniformly repaired chromatic borders. Keep the repaired Off ink exactly; extend its visual stroke inward using a same-color inset shadow whose spread follows shared level opacity × edge width. Append the authored soft shadow. CSS border widths, box geometry and focus exclusions remain intact. Mixed sides are excluded from the uniform extension; no proprietary selectors.
- Updated all six-level/three-theme selected-card checks to require constant ink, increasing spread, source shadow retention, absence of a neutral outline and unchanged layout/border widths. Added screenshot-strip pixel verification that Maximum visibly covers more pixels in the original blue than Off. Matching-fill and transparent-border controls remain. Updated the fixture registry, coverage and rendering guide. Supplied live computed layers corroborate source structure; authenticated Indeed itself remains unavailable.

- Verification: Windows/owned headless Brave passed focused border/pixel checks, all syntax checks, 93 Node tests and the full quick browser suite (19 canonical assertions, lab interface/assets, 24 shared rendering combinations, issue-bundle checks). `git diff --check` passed; no version bump or commit requested.


### Release 0.12.0 preparation — 2026-11-11

- Bump the extension manifest from 0.11.0 to 0.12.0 for the diagnostic/workflow additions and shared rendering repairs. Synchronize English/Spanish README release summaries and current agent guidance. Record copy-ready features, fixes and verification limits in docs/RELEASE-0.12.0.md. Native remains the default; no rule/backup/permission changes.
- Reporter confirmed the selected-border fix on Indeed: constant repaired Off ink plus same-color inward stroke extension resolves the unwanted whitening. Live isolated Indeed requests remain blocked; do not confuse reporter confirmation with owned-browser verification.

- Final standard release verification passed: syntax, 93 Node tests, seven launcher artifact tests, 19 canonical assertions, lab UI/resource checks, 24 shared rendering combinations and issue-bundle checks. Windows/owned headless Brave. Stage timings: 1.83s / 0.45s / 7.77s / 16.42s / 6.94s / 13.36s / 5.35s. Log: research-artifacts/diagnostics/release-0.12.0-verification.log (ignored). Patch/whitespace reviewed; generated reports and research remain excluded. Reporter confirmed the final Indeed appearance. Prepare the release commit and annotated v0.12.0 tag after verifying absence; no push or hosted publication requested.
