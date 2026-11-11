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
