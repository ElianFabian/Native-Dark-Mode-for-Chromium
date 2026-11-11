# Native Dark Mode for Chromium

<img src="extension/icons/icon128.png" width="72" alt="Native Dark Mode icon, a light paintbrush on an indigo background">

[Read in Spanish](README.es.md)

Use Chromium's built-in dark mode on the websites and sections you choose. Save a rule once and the extension applies it when you return.

**Version 0.9.0** adds Simulated Native, shared border emphasis, configurable rule defaults, and extensive contrast and performance improvements. [Release notes](docs/RELEASE-0.9.0.md)

This project was built with AI assistance using OpenAI Codex.

## Install the extension

You only need a desktop Chromium-based browser. Brave has been tested hands-on. The browser loads the extension directly from the downloaded folder. You can install it without Node.js, npm, Python, or a build step.

1. Download the project as a ZIP. On GitHub, choose **Code → Download ZIP**. Extract the ZIP to a folder you can keep.
2. In your browser's address bar, open `brave://extensions` (Brave), `chrome://extensions` (Chrome or Chromium), or `edge://extensions` (Edge).
3. Turn on **Developer mode**, click **Load unpacked**, and select the **`extension`** folder inside the extracted project. This is the folder that contains `manifest.json`.
4. Open **Native Dark Mode** from the browser's extensions menu. You can pin it to the toolbar.

To update, replace the files in the loaded folder with the new version and click **Reload** on the extension's card. Refresh any page you want to test again.

## Motivation

Many websites still have no dark theme. On others, dark mode starts off or the site forgets the preference between visits. General-purpose dark mode extensions can help, but in my experience their results vary from site to site. A page can look right in one extension and still have hard-to-read text, broken contrast, or unexpected colors in another.

This project started with a practical goal. Use the browser's own darkening engine where it renders a site well, then remember which sites and sections should use it. You can turn it on for an entire site and keep an exception for a particular hostname or section.

## Choose a website theme

| Theme | Purpose |
| --- | --- |
| **Native** | Chromium's own darkening through a debugger session. It remains the default; Chromium decides how the page and images are rendered. |
| **Simulated Native** | A custom renderer inspired by Chromium, with additional contrast and usability repairs. It requires no debugger session or banner-suppression launcher. |
| **Soft dark** | A charcoal palette with shared contrast, icon, image-overlay, and border repairs. |
| **High contrast** | A stronger palette with brighter text and controls, using the same shared repair mechanisms. |

**Simulated Native aims to improve the result, not produce an exact replica of Native.** Chromium's color transform is its starting point. The renderer also considers backgrounds, transparency, image pixels where readable, icon structure, and interaction state to repair problems that Native can leave behind. It aims to retain useful colors, original icon shapes, image content, and layout while improving readability. Differences from Native are intentional when they serve those goals; the name is not a promise of pixel-for-pixel parity or universally better rendering.

Website appearance is separate from the extension interface's light/dark theme, text size, and high-contrast setting. Try another website theme or create an exclusion if a page does not render well.

## Screenshots

Click either screenshot to open it at full resolution.

### Extension popup

<a href="docs/screenshots/popup.png"><img src="docs/screenshots/popup.png" width="640" style="max-width: 100%; height: auto;" alt="Extension popup showing an enabled Amazon rule, Simulated Native, separator levels, scope switches, and appearance controls"></a>

### Rule manager

<a href="docs/screenshots/rule-manager.png"><img src="docs/screenshots/rule-manager.png" width="1200" style="max-width: 100%; height: auto;" alt="Rule manager showing the editor, search and sorting controls, saved rule statuses, and JSON backups"></a>

## Use the extension

1. Visit an HTTP or HTTPS page and open the extension popup.
2. For a new rule, the popup uses your **Rule defaults** (initially **Entire website**) and shows the site's base address. Select **Path section** to use the current tab's path without its query string or fragment. You can edit the URL before saving.
3. Under **Website theme**, choose **Native**, **Simulated Native**, **Soft dark**, or **High contrast**, then click **Enable and save**. The extension remembers your choice for that website or section.
4. Use **Disable and save** to keep a rule as an exclusion, or open **Manage rules** to edit, search, or remove saved rules.

On protected extension stores, internal browser or extension pages, and detected PDF viewers, the popup shows a warning explaining why darkening is unavailable and disables the rule controls. You can still open **Manage rules**. Detection cannot identify every embedded viewer in advance.

**Simulated Native** softens bright decorative separators by default. Use **Emphasize separators** to choose Off, Very low, Low, Medium, High, or Maximum. Higher levels strengthen eligible separators, card edges, and compact icon controls without resizing them. Off adds no optional edge, but keeps the theme’s normal borders and contrast repairs. The rule shares this level across **Simulated Native**, **Soft dark**, and **High contrast** for the website or section it covers and includes it in backups.

In the rule manager, open **Rule defaults** to choose the theme, separator level, scope, and domain switches for new rules. Entire website and Path section keep separate domain settings. Path section also lets you choose whether to include subpaths. Existing rules keep their settings. The parent-domain and regional-domain switches apply where the address supports them.

For an existing scope, theme, separator level, and supported scope-switch changes save immediately. Editing the address or changing between website and path scope still requires a save action. **Save settings** saves the scope and theme without changing an existing rule's enabled state. A new rule saved this way starts disabled. In the popup, switching a saved section to **Entire website** and saving replaces that section with the website rule.

The trash icon beside **Save settings** shows the selected saved rule for the current host and asks for confirmation before moving it to **Trash**. For a regional rule, the icon is available on the host where the rule was saved, including its `www` alias. On other matching hosts, the popup offers a local exclusion. The trash icon is disabled for inherited rules, and its tooltip directs you to **Manage rules**.

**Native** is the default. **Soft dark** uses charcoal backgrounds, while **High contrast** emphasizes text, borders, and focus indicators. **Simulated Native** builds on Chromium-inspired color conversion and adds contextual repairs without a debugger session. These themes affect the website and its eligible embedded frames. Changing the theme of a saved rule saves it immediately. For a new rule, choose the theme before clicking **Enable and save**.

| Option | What it covers |
| --- | --- |
| **Entire website** | The hostname in the URL field. |
| **Path section** | A specific path, such as `/articles`. **Include subpaths** is on by default and also covers paths such as `/articles/guide`. Turn it off to match only `/articles`. |
| **Include subdomains** | Child hostnames such as `developer.android.com`. The base domain and its `www` alias share a rule regardless of this option. |
| **Include regional domains** | Vary the public suffix while keeping the registered name and any specific subdomain. For example, `amazon.es` becomes `amazon.*`, and `fonts.google.com` becomes `fonts.google.*`. |
| **Apply to all of …** | From a subdomain such as `fonts.google.com`, include the base domain `google.com` and all its subdomains. Combine with regional domains to cover the same family across recognized public suffixes. When the current page already inherits an enabled base-domain rule, the popup shows this switch checked and disabled. Use the exclusion action to exempt just the current subdomain. |

More specific paths take priority. At the same path, a rule for a single domain takes priority over a regional pattern. Regional patterns match names across suffixes. When a page inherits an enabled rule, the popup can offer an exclusion for the current hostname and inherited path. Excluding `amazon.es` also excludes `www.amazon.es`.

To exclude a path from an enabled site or section, enter the more specific URL, choose **Path section**, and use **Save settings** to create a disabled rule. For example, a disabled rule for `example.com/blog/private` excludes that path and its descendants from an enabled rule for `example.com/blog`. If a rule for the exact path is already enabled, disable it from the list.

**Manage rules** opens a full tab where you can search and sort by name or date added, in either direction. **Group by domain** shows collapsible groups with an **Expand all / Collapse all** button. Dates are shown for rules with a saved creation date.

**Remove** moves a rule to **Trash**, after the saved rules list. In a domain group, **Remove group** asks for confirmation before moving all its rules to Trash, including rules hidden by search. You can restore a rule with its settings, use **Delete permanently** on an individual entry, or choose **Empty trash**. Permanent deletion asks for confirmation. If a saved rule already occupies the same scope, the deleted copy stays in Trash when you try to restore it.

The manager also offers **Export rule settings** and **Import rule settings**. The import dialog previews new and matching rules. By default it adds only new rules. You can also update matching rules or replace the entire list. The replacement option shows a scrollable list of the current rules it will delete and asks for confirmation. The JSON covers the main rule list. Trash and display preferences stay in local storage.

The interface follows the browser language by default. The **Language** selector in the manager lets you choose English, Spanish, French, European Portuguese, Italian, Simplified Chinese, Japanese, Korean, or German.

The language selector uses bundled SVGs from [flag-icons](https://github.com/lipis/flag-icons), distributed under the [MIT license](extension/flags/LICENSE).

Use the text size controls at the top left of the popup or rule manager to adjust text from 75% to 200%. Each view saves its own text size. Open **Appearance** in the popup or use the controls directly in the rule manager toolbar to enable high contrast or choose a light or dark theme. Both views share the theme and contrast preferences. The theme follows your system by default. Website dark mode is controlled separately by your rules.

Turn on **Popup border** in **Appearance** to make the popup edges easier to see.

## How it works

The [Manifest V3 extension](extension/manifest.json) has a popup, a full-page rule manager, and a [background service worker](extension/background.js). It requires the [extension debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger) and Chromium's experimental [native darkening command](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setAutoDarkModeOverride).

1. The worker checks the current URL against the rules saved in `chrome.storage.local` when tabs load or navigate. The rule matcher handles hosts, paths, subdomains, exclusions, and regional patterns. Regional matching uses a bundled snapshot of the ICANN section of the [Public Suffix List](https://publicsuffix.org/list/).
2. For an enabled native rule, the [controller](extension/controller.js) attaches through `chrome.debugger` and sends `Emulation.setAutoDarkModeOverride` with `enabled: true`. Chromium handles rendering and images. The custom themes use a [content script](extension/website-theme.js) that applies reversible style overrides in each eligible frame and requires no debugger session.
3. When a rule stops matching or is disabled, the controller clears its override and releases the connection. If the user cancels the debugging session, automatic activation pauses for that tab. Use **Enable and save** to resume it.

The extension uses `debugger` for native emulation, HTTP and HTTPS site access to match URLs and apply custom themes, `scripting` to apply custom themes in tabs that were already open, and `storage` to keep rules on the device. There is no telemetry or analytics service. Custom themes may read image and SVG resources referenced by the page to analyze contrast. Cross-origin reads use CORS without credentials; same-origin reads can use the page’s existing session. Requests are bounded and results are cached. Resource servers can still observe those requests. Unreadable or unsupported resources keep conservative fallback behavior.

Custom themes share scheduling, contrast measurement, SVG and background-glyph repairs, image-overlay analysis, optional edges, and cleanup. They can style open shadow roots and closed roots exposed by Chromium's extension API; inaccessible roots and protected frames remain outside their control. They inspect solid and translucent surfaces, decorative gradients and SVGs, sprites, masks, placeholders, and interaction states. Photos, multicolor artwork, and original icon geometry are preserved where the classifier can distinguish them reliably. Some transparent or monochrome static artwork can receive a local backing or tint after bounded analysis; ambiguous or unreadable resources are skipped.

Simulated Native's color conversion is adapted from Chromium under its BSD-style license. Its additional contrast and rendering policies are extension behavior, not a complete port of Blink's paint pipeline. [Chromium license](extension/LICENSE.chromium) · [Rendering guide and fix inventory](docs/WEBSITE-THEME-RENDERING.md)

The extension imports backup versions 1, 2, and 3. Exports use version 3 when a rule matches an exact path only, version 2 when custom themes or separator preferences are present, and version 1 otherwise. Backups containing **Simulated Native** or its separator levels require a build that supports the saved settings.

## Optional launcher for the debugging banner

You can use the extension as soon as it is loaded. If the browser shows a debugging banner and you want to hide it, use the optional launcher below. It passes `--silent-debugger-extension-api`, which suppresses banners for **all** debugger extensions in that session when the browser supports it. Closing the banner or opening DevTools can disconnect the session.

Run the installer for your system from the project folder. The three installers are at the top level of `scripts/`, and their helpers stay in `scripts/internal/`. When creating shortcuts, the installers look for Brave, Google Chrome, Chromium, Microsoft Edge, Vivaldi, and Opera in the usual locations and use the name **Browser Name - Native Dark Mode**.

| Platform | Installer | Where to open the launcher |
| --- | --- | --- |
| Windows | Double-click [install-launcher-windows.cmd](scripts/install-launcher-windows.cmd) and confirm the list of shortcuts it finds. | Your existing shortcuts. |
| Linux | `sh scripts/install-launcher-linux.sh` | Your application menu and, when available, your configured desktop directory. Your desktop environment may require you to mark the desktop copy as trusted before opening it. |
| macOS | `sh scripts/install-launcher-macos.command` | Your `~/Applications` folder and a link on your Desktop, when the Desktop folder exists. |

The console explains what the installer is about to do and prints the path of each shortcut it creates. On Windows, the report groups shortcuts by browser and uses color in Windows Terminal. When you run the installer interactively, press Enter at the end to dismiss the prompt.

On Windows, the installer and restorer use the Windows display language and support the same nine languages as the extension. The Linux and macOS installers offer English and Spanish based on the shell locale, with the macOS regional preference as a fallback. If the detected language is unsupported or unavailable, messages appear in English. Set `NATIVE_DARK_MODE_LANG` to a supported language code to override detection.

For a browser in a custom location or outside the detection list, append `--browser "ABSOLUTE_PATH_TO_BROWSER_EXECUTABLE"` to the installer command. This selects just that executable and uses the name **Chromium Browser - Native Dark Mode**. With `--output-directory PATH`, the installer writes only to that directory, which is useful for testing or keeping shortcuts for multiple custom executables separate.

Fully quit the target browser before opening the updated or new launcher so the flag takes effect. Check **Command Line** on your browser's version page (for example, `chrome://version`, `edge://version`, or `brave://version`) for `--silent-debugger-extension-api`. The installers use tools included with the operating system. Windows uses Windows Script Host to manage `.lnk` files. Linux and macOS use shell scripts.

On Windows, the installer searches the Desktop, Start menu, and taskbar pins stored as `.lnk` files. It lists shortcuts to recognized browsers before asking for confirmation. It skips web app shortcuts and shortcuts that already have the flag. For each update it backs up the original as `.lnk.bak` and preserves the existing arguments. Shared shortcuts may require additional Windows permissions.

If Windows denies write access, the installer lists the pending shortcuts and offers to open a separate administrator console. If you accept the Windows permission prompt, that console asks you to confirm the pending updates before writing. You can decline either prompt and keep the updates already made with normal permissions.

To undo the changes, double-click [restore-launcher-windows.cmd](scripts/restore-launcher-windows.cmd) and confirm the list. It searches the same locations and restores each matching original from its `.lnk.bak`. If Windows denies write access, it offers the same administrator retry. For backups outside the usual locations, use `--scan-directory "PATH"`.

From the command line, use `--scan-directory "PATH"` to search a specific folder and its subfolders or `--update-shortcut "PATH"` to select one shortcut. Combine either option with `--browser "ABSOLUTE_PATH_TO_BROWSER_EXECUTABLE"` to require an exact target match. Use `--create-shortcuts` to create separate shortcuts in the Start menu and on the Desktop.

The installer was tested on Windows 11, where banner suppression was confirmed in Brave. The Linux and macOS installers have automated checks for generated files, but have yet to be tested on actual Linux or macOS systems. Banner suppression in other browsers still needs hands-on verification.

## Current limits

**This is not perfect.** We work to support as many websites as possible, but every theme can still fail on a particular page or state. Native depends on an experimental Chromium command; custom themes infer the page's intent from its structure and paint. Neither approach guarantees correct contrast everywhere. A site or browser update can change the result.

- Dynamic menus, nested graphics, transitions, sticky content, and complex image backgrounds can still show incorrect colors, delayed adaptation, or flashes. Some authenticated Google account-panel states remain under investigation; local icon fixes do not prove the whole panel is fixed.
- Contrast targets are engineering heuristics, not an accessibility certification. Small icons, anti-aliasing, font weight, transparency, and perception can affect readability beyond a single ratio.
- Cross-origin restrictions, complex or animated artwork, inaccessible Shadow DOM, protected frames, PDF viewers, and internal browser pages limit what the custom renderers can inspect or change. Unreadable resources are not forcibly recolored.
- Preloading and batching reduce visible work and improve responsiveness; very large or frequently changing pages can still be slower than Native.
- Brave on Windows has the most testing. Chrome, Edge, other Chromium builds, and Linux/macOS still need broader end-to-end verification.
- Native's image treatment is controlled by Chromium. Its per-site image-preservation option remains deferred; see [IMAGE-RESEARCH.md](IMAGE-RESEARCH.md). This is separate from custom-theme image repairs.

If a page breaks, try a different theme, reduce border emphasis, or save an exclusion. A useful report includes the URL, theme, border level, browser/version, triggering action, screenshot, and relevant HTML/computed styles with personal information removed.

The possible future replacement of Native, a product-name review, and a portable local regression gallery are planning items, not changes in this release. [Roadmap](docs/ROADMAP.md)

## Development and screenshots

See [AGENTS.md](AGENTS.md) for the repository map, behavior to preserve, and release workflow.

Maintenance tools for the public suffix list and image research live in `scripts/dev/`.

Run `npm run check` and `npm test` with Node.js. The extension runs directly from `extension/` with no build step. For launcher tests, run `python -m unittest discover -s test -p 'test_*.py' -v`. The launcher tests use temporary files and a mock browser where appropriate. See [PLAN.md](PLAN.md) for validation notes.

For a repeatable screenshot or visual check, serve the local fixture and open it in the Chromium-based browser you are testing. Enable a rule for that page, then capture the popup or the rule manager. Suggested screenshot files are `docs/screenshots/popup.png` and `docs/screenshots/rule-manager.png`. Use sample rules and a public or local test page so screenshots can be shared without exposing personal tabs or browsing history.

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory fixtures
```

Open `http://127.0.0.1:8765/test.html` to use the fixture.
