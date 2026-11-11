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
