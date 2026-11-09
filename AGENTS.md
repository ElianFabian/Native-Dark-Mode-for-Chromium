# Working on Native Dark Mode for Chromium

## Project intent

Native Dark Mode is a Manifest V3 extension for desktop Chromium browsers. It defaults to Chromium's own rendering engine and also offers two custom themes for selected websites and URL sections. Users can opt in by hostname, path, subdomain, or regional domain and can save explicit exclusions.

Keep the source code, internal identifiers, and developer documentation in English. Translate user-facing extension strings into every supported language. Keep installation dependency-free for end users. The browser loads the unpacked `extension/` directory directly, and the optional launcher installers use tools shipped with the operating system.

Keep the English [README.md](README.md) and Spanish [README.es.md](README.es.md) aligned when changing user-facing workflows. Both use the same screenshots under `docs/screenshots/`. Put basic installation first. The user extracts the ZIP, enables developer mode on the browser's Extensions page, and loads the `extension/` folder containing `manifest.json`. Document the optional debugging-banner launcher separately.

## Repository map

| Location | Responsibility |
| --- | --- |
| [extension/manifest.json](extension/manifest.json) | MV3 entry points, permissions, and extension version. |
| [extension/icons/](extension/icons/) | Editable SVG source for the extension icon and the raster sizes referenced by the manifest. Keep the PNGs in sync with the SVG. |
| [extension/background.js](extension/background.js) | Service worker. Dispatches extension messages, responds to tab events, and returns snapshots for the UI. |
| [extension/controller.js](extension/controller.js) | Serialized per-tab theme reconciliation, debugger attachment, custom preset messaging, badge, and suspension. |
| [extension/website-theme.js](extension/website-theme.js) | Reversible style overrides for custom themes in each eligible document and frame. |
| [extension/rules.js](extension/rules.js) | Canonical rule IDs, matching and precedence, sorting, exclusions, and serialized writes for rules and trash. |
| [extension/domains.js](extension/domains.js) | Regional domain parsing using the bundled ICANN Public Suffix List snapshot in `icann-suffixes.js`. |
| [extension/backup.js](extension/backup.js) | Versioned JSON validation, export, import previews, and conflict policies. |
| [extension/popup.html](extension/popup.html), [extension/options.html](extension/options.html), [extension/popup.js](extension/popup.js) | Toolbar popup and full-page manager. Both use `popup.js`, which distinguishes the views using `data-page="options"`. |
| [extension/popup.css](extension/popup.css), [extension/options.css](extension/options.css) | Shared UI styling and manager layout overrides. |
| [extension/appearance.js](extension/appearance.js), [extension/choices.js](extension/choices.js), [extension/i18n.js](extension/i18n.js) | Appearance settings, native radio chip helpers, and translation loading. |
| [scripts/](scripts/) | User-facing launchers at the top level. Implementation helpers are in `internal/` and developer tools are in `dev/`. |
| [test/](test/), [fixtures/](fixtures/) | Automated tests and local pages for browser checks. |

## Behavior to preserve

- Native darkening runs through `chrome.debugger` and CDP `Emulation.setAutoDarkModeOverride`. An empty parameter object clears the override before detaching. When a debugger session is canceled, keep automatic attachment paused for that tab until the user explicitly resumes it. Keep slow background tabs from blocking manager acknowledgments.
- Rules apply to HTTP and HTTPS. A path rule matches the exact path and, by default, its descendants at a segment boundary. An exact-only root rule has a distinct identity from an entire-website rule. Query strings and fragments do not contribute to rule identity. Preserve explicit ports and handle old stored rules through the existing normalizer.
- A longer matching path wins. At the same path, non-regional rules take precedence, followed by more specific host matches and exact rules ahead of subdomain rules. A disabled winning rule is an exclusion. The base domain and its `www` alias share an identity for ordinary rules, regardless of the subdomain setting. Prefer the explicit base rule when old settings contain both aliases. Regional rules match a registered name across recognized suffixes and retain any specific subdomain, with `www` treated as an alias of the base domain. A more specific regional subdomain wins over a broader regional rule. The base-domain switch saves a canonical rule for the base domain and its subdomains. Keep regional matching based on the bundled suffix data.
- `chrome.storage.local` contains `rules`, `trash`, `ruleListPreferences`, `uiLanguage`, `uiTheme`, `uiPopupTextScale`, `uiManagerTextScale`, and `uiHighContrast`. The legacy `uiTextScale` initializes either view until it saves its own setting. The controller keeps transient per-tab state in `chrome.storage.session` under `tab:<id>`. Route persistent rule changes through `RuleManager` so concurrent edits, imports, restores, and deletions stay ordered.
- Removing a rule moves it to Trash, below the saved rules list. The popup and rule editor confirm the saved scope before removing it. In the popup, inherited rules show a disabled trash action with an explanation, and local exclusions can be removed to restore inheritance. Group removal confirms the whole group, including rules hidden by search, and moves only the confirmed IDs in one storage write. Restoring preserves rule settings and fails safely if the scope already exists. Emptying Trash affects only confirmed entries.
- Domain grouping is a display feature in the full-page manager. Groups start collapsed and remember their state while the list is rebuilt. The bulk control applies to visible groups. Regional rules and their hostname exceptions can share a group without changing matching precedence. Display creation dates only when they are available.
- Backups use format `native-dark-mode-rules` and cover the rule list. Version `1` carries the original scopes, version `2` supports custom presets, and version `3` also supports exact-only paths. The import default adds new rules and keeps existing matches. Users can also update matches or replace the list. Full replacement lists the rules that would be deleted, requires confirmation, and rejects newly discovered removals until the user reviews them. Preserve the existing size and rule limits and validate before writing.
- A missing rule preset means native. Custom themes follow the winning rule for the top-level URL and are applied independently inside eligible frames. Clear the previous renderer before switching. Keep frame messages limited to the active preset and leave excluded documents free of style overrides and mutation observers.
- Appearance affects the extension UI. Website darkening is controlled separately by rules. The UI follows the system theme by default, supports 75% to 200% text scaling, and offers high contrast. Keep the text size controls steady in both toolbars. The popup puts theme and contrast in the Appearance menu, while the manager exposes them directly. Preserve native controls, keyboard focus, accessible names and descriptions, wrapping at large text sizes, and reduced-motion behavior.
- Keep the URL, scope chips, and scope switches in the same card in both views. Keep Include subpaths last. On wide layouts, the editor stays sticky beside the list and Trash without its own scrollbar. Tooltips open after 800 ms on hover, open immediately on keyboard focus, stay visible while hovered, and can be dismissed by click or Escape.
- The nine flat interface catalogs under `extension/translations/` are `en`, `es`, `fr`, `pt_PT`, `it`, `zh_CN`, `ja`, `ko`, and `de`. Keep manifest messages in Chromium's required format under `extension/_locales/`. Use `data-i18n` for visible text, `data-i18n-label` for accessible labels, and `t()` for dynamic strings. Keep interpolation variables consistent and synchronize the shared title across both catalogs. The launchers have separate English and Spanish messages.
- The launchers pass `--silent-debugger-extension-api` to the target browser. The flag applies to all debugger extensions in that session when supported. Keep the installers native to each platform, use `--output-directory` for temporary test artifacts, and preserve browser discovery, location reporting, and the interactive Enter prompt.
- Chromium currently decides how images are darkened. Per-site native image controls are deferred. See [IMAGE-RESEARCH.md](IMAGE-RESEARCH.md) for the experimental launch-time option and its limits.

## Development and verification

1. Check the current branch and worktree with `git status --short --branch`. Preserve existing user changes. Read [README.md](README.md) for the user workflow and [PLAN.md](PLAN.md) for validation history.
2. Run `npm run check` and `npm test` from the repository root. Node.js and npm are development tools. On Windows, use `npm.cmd` if the PowerShell execution policy blocks the npm wrapper.
3. For launcher changes, run `python -m unittest discover -s test -p 'test_*.py' -v`. The tests use temporary paths and can use Git Bash on Windows to inspect the shell-generated artifacts. Artifact tests do not verify desktop integration.
4. For browser behavior, load or reload `extension/` as an unpacked extension. Serve the fixtures using `python -m http.server 8765 --bind 127.0.0.1 --directory fixtures` and open `http://127.0.0.1:8765/test.html`. Check a matching URL, a URL outside the rule, and an exclusion. For UI changes, check both views at normal and large text sizes, with keyboard navigation and light, dark, and high-contrast themes.
5. Run `git diff --check` and review the patch before committing. Keep changes focused. State which browser, OS, and scenarios were actually checked.

Brave has been used for hands-on extension checks. The launcher was tested on Windows 11 and debugger banner suppression was confirmed in Brave there. Linux and macOS launcher artifacts have automated checks. Testing those installers on actual Linux and macOS desktops is still pending. Chrome, Edge, and other Chromium builds still need end-to-end extension verification.

## Releases

Use [extension/manifest.json](extension/manifest.json) as the extension version source. The npm manifest is private and provides development commands. For an intentional version bump, update the manifest and the release summary in both README files. Run the relevant checks, commit the release, and add an annotated `vX.Y.Z` tag to that commit. Check whether the tag already exists before creating it. Push commits and tags when requested.
