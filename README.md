# Native Dark Mode for Brave

Use Chromium's built-in dark mode on the websites and sections you choose. Save a rule once and the extension applies it when you return.

## Motivation

Many websites still have no dark theme. On others, dark mode starts off or the site forgets the preference between visits. General-purpose dark mode extensions can help, but in my experience their results vary from site to site. A page can look right in one extension and still have hard-to-read text, broken contrast, or unexpected colors in another.

This project started with a practical goal. Use the browser's own darkening engine where it renders a site well, then remember which sites and sections should use it. You can turn it on for an entire site and keep an exception for a particular hostname or section.

<!-- Add screenshots after capturing them in Brave.
![The extension popup applying native dark mode to a website](docs/screenshots/popup.png)
![The rule manager with saved websites and sections](docs/screenshots/rule-manager.png)
-->

## Install in Brave

1. Download or clone this repository. If you downloaded a ZIP, extract it first.
2. Open `brave://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the [extension](extension/) folder. It contains `manifest.json`.
4. Open the **Extensions** menu and select **Native Dark Mode**. You can pin it to the toolbar for quick access.

Brave loads the extension directly from the folder. To update your local copy, update the files and click **Reload** on the extension card at `brave://extensions`. Refresh open pages if you want to retry them with the updated extension.

## Use the extension

1. Visit an HTTP or HTTPS page and open the extension popup.
2. Select **Entire website** or **Path section**. The URL field lets you adjust the scope before saving.
3. Click **Enable and save**. Brave applies its native darkening to the current page and remembers the rule for future visits.
4. Use **Disable and save** to keep a rule as an exclusion, or open **Manage rules** to edit, search, or remove saved rules.

| Option | What it covers |
| --- | --- |
| **Entire website** | The hostname in the URL field. |
| **Path section** | A path and its descendants, such as `/articles` and `/articles/guide`. |
| **Include subdomains** | Child hostnames. With this option enabled, `www.android.com` is treated as `android.com`, so the rule can also cover `developer.android.com`. |
| **Include regional domains** | The same registered name under recognized public suffixes. `amazon.es` becomes `amazon.*`, which can cover `amazon.com.au` and `amazon.co.uk`. Enable subdomains as well to get `*.amazon.*`. |

More specific paths take priority. At the same path, a rule for a single domain takes priority over a regional pattern. Regional patterns match names across suffixes. Use a single-domain rule when you want to limit the scope to one domain. When a page inherits an enabled rule, the popup can offer **Exclude this subdomain** or **Exclude this hostname** to save an exception for the current hostname and inherited path.

The popup shows a short list of saved rules. **Manage rules** opens a full tab with editing, sorting, grouping, and search. **Remove** moves a rule to **Trash**, where you can restore it with its settings. If a rule already occupies that scope, the deleted copy stays in Trash.

The manager also offers **Export JSON** and **Import JSON**. Import previews new and matching rules before saving. It keeps existing settings for matching rules by default, with an option to use the settings from the file. The JSON covers the main rule list. Trash and display preferences stay in local storage.

The interface follows the browser language by default. The **Language** selector in the manager lets you choose English, Spanish, French, European Portuguese, Italian, Simplified Chinese, Japanese, Korean, or German.

## How it works

The [Manifest V3 extension](extension/manifest.json) has a popup, a full-page rule manager, and a [background service worker](extension/background.js).

1. The worker checks the current URL against the rules saved in `chrome.storage.local` when tabs load or navigate. The rule matcher handles hosts, paths, subdomains, exclusions, and regional patterns. Regional matching uses a bundled snapshot of the ICANN section of the [Public Suffix List](https://publicsuffix.org/list/).
2. On a matching enabled tab, the [controller](extension/controller.js) attaches through `chrome.debugger` and sends `Emulation.setAutoDarkModeOverride` with `enabled: true`. Chromium renders the dark theme. The extension uses the browser's image handling too.
3. When a rule stops matching or is disabled, the controller clears its override and releases the connection. If the user cancels the debugging session, automatic activation pauses for that tab. Use **Enable and save** to resume it.

The extension uses `debugger` to send the native emulation command, HTTP and HTTPS site access to match URLs during navigation, and `storage` to keep rules on the device. The rules are stored locally. The extension makes no external network requests.

## Optional launcher for the debugging banner

Brave may show a debugging banner while the extension is attached. Closing the banner or opening DevTools can disconnect the session. The extension works through the browser's built-in debugging API. The optional launchers start Brave with `--silent-debugger-extension-api`, which suppresses banners for **all** debugger extensions in that browser session.

Run the installer for your system from the project folder. Keep the files in `scripts/` together because the installers use shared helpers.

| Platform | Installer | Where to open the launcher |
| --- | --- | --- |
| Windows | Double-click [install-launcher-windows.cmd](scripts/install-launcher-windows.cmd) | Search for **Brave - Native Dark Mode** in Start. |
| Linux | `sh scripts/install-launcher-linux.sh` | Look for **Brave - Native Dark Mode** in your application menu. The script creates a `.desktop` entry for your user. |
| macOS | `sh scripts/install-launcher-macos.command` | Open **Brave - Native Dark Mode.app** in `~/Applications` or add it to the Dock. |

Fully quit Brave before opening it from the new launcher so it starts with the argument. In `brave://version`, check **Command Line** for `--silent-debugger-extension-api`. The installers use tools included with the operating system. Windows uses Windows Script Host to create a `.lnk`. Linux and macOS use shell scripts. Each installer accepts `--browser PATH` and `--output-directory PATH` for custom installations. The Windows launcher has been confirmed with Brave. The Linux and macOS installers have artifact and argument tests, and their desktop integration and banner behavior still need testing on those systems.

## Current limits

- The extension targets Brave desktop and uses an experimental Chromium DevTools Protocol command. Rendering can vary by site and browser version.
- Rules apply to HTTP and HTTPS websites. Internal browser pages are outside the rule scope.
- Chromium controls image treatment. Per-site image preservation is deferred. See [IMAGE-RESEARCH.md](IMAGE-RESEARCH.md) for the experimental launch-time option and its limits.

## Development and screenshots

Run `npm run check` and `npm test` with Node.js. The extension runs directly from `extension/` with no build step. For launcher tests, run `python -m unittest discover -s test -p 'test_*.py' -v`. The launcher tests use temporary files and a mock browser where appropriate. See [PLAN.md](PLAN.md) for validation notes.

For a repeatable screenshot or visual check, serve the local fixture and open it in Brave. Enable a rule for that page, then capture the popup or the rule manager. Suggested screenshot files are `docs/screenshots/popup.png` and `docs/screenshots/rule-manager.png`. Use sample rules and a public or local test page so screenshots can be shared without exposing personal tabs or browsing history.

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory fixtures
```

Open `http://127.0.0.1:8765/test.html` to use the fixture. The screenshot links near the introduction are ready to enable after adding the image files.
