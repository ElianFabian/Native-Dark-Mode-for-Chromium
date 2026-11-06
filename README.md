# Native Dark Mode — Brave prototype

A Manifest V3 extension that sends `Emulation.setAutoDarkModeOverride` through `chrome.debugger`, with persistent rules for websites and path sections. No external daemon, remote debugging port, or global dark mode flag is required. Experimental image preservation adds a narrow CSS override to image elements.

**Status:** prototype code. Visual compatibility with Brave has not been verified. The CDP command is experimental. See [PLAN.md](PLAN.md) for validation stages.

## Project files

- `extension/`: loadable extension, background worker, controller and popup.
- `fixtures/`: local rendering test page and image.
- `test/`: controller tests using a simulated browser API.

All project code, comments, interface text, tests and documentation must be written in English.

## Local trial

1. Open `brave://extensions`, enable developer mode if appropriate, and select **Load unpacked**.
2. Select this project's `extension` directory. The extension requests the powerful `debugger` permission; this implementation only sends the native dark mode emulation command.
3. From the project root, run `python -m http.server 8765 --bind 127.0.0.1 --directory fixtures`.
4. Open `http://127.0.0.1:8765/test.html`, open the extension popup, choose **Entire website** or **Path section**, and click **Enable and save**.
5. Observe the result, then try disabling, reloading, navigating, and dismissing the debugging banner. Record results in `PLAN.md`.

Rules are saved in `storage.local` and restored on future visits, including after browser restarts. Disabling retains an inactive rule, which also excludes its scope from a broader enabled rule. The most specific matching path wins. The popup lists saved entries with enable/disable, edit, image preference and remove controls. Choose **Edit**, adjust the fields, and use **Save settings** to update the same scope. Saving a different scope adds another entry; remove the original explicitly if no longer needed.

Queries and fragments are ignored. A section matches its path and descendants, not similarly named neighboring paths. Subdomains require explicit opt-in. HTTP and HTTPS share rules, while nonstandard ports are distinct. Rules do not sync to other devices.

The extension pauses automatic activation for a tab after debugger disconnection. Use **Enable and save** to resume an enabled rule manually. Internal browser pages are unsupported. Preserving every color, handling every iframe, and preventing flashes are not guaranteed.

Opening DevTools may disconnect the session. If another debugger is already attached, the prototype reports the error without trying to remove it.

## Code checks

Run `npm run check` and `npm test` with Node.js installed. No additional packages are required. Simulated tests check connection handling; they do not verify rendering in Brave.

## Image preference and permissions

**Apply dark mode to images (automatic)** leaves image decisions to Chromium. Unchecking it requests experimental preservation through `img { color-scheme: only light !important; }`, injected into accessible frames. It does not cover background images, closed Shadow DOM or all SVG cases. This has not been visually validated in Brave and cannot guarantee unchanged images. Native CDP has no independent image parameter. Injection failures appear in diagnostics.

Automatic rules require HTTP/HTTPS site access, and image preservation uses the `scripting` permission. The code only stores rules locally and makes no external network requests. Reload the extension in `brave://extensions` after updating and review any new permission prompt. Refresh test pages, then open the popup to test the new controls.

## Popup responsiveness

Version 0.2.1 avoids waiting for background tabs before replying to popup changes and skips CSS operations when first enabling automatic image mode. The popup displays progress and restores controls after ten seconds if the browser has not replied. A timeout does not cancel a browser operation or undo a saved rule; reopen the popup to inspect the latest state. A stalled experimental image operation may still require refreshing the page or reloading the extension.

## Install a launcher on Windows, Linux or macOS

With Python 3.10 or newer installed, run from the project root:

```sh
python scripts/install_launcher.py
```

On Linux and macOS, use `python3` if `python` is not available. The installer detects the current platform and creates a separate **Brave - Native Dark Mode** launcher for your user:

| Platform | Launcher | Default destination |
| --- | --- | --- |
| Windows | Regular `.lnk` shortcut | Current user's Start Menu / Programs |
| Linux | `.desktop` application entry | `$XDG_DATA_HOME/applications`, or `~/.local/share/applications` |
| macOS | `.app` launcher bundle | `~/Applications` |

Open the Windows Start menu and search for the launcher name. On Linux, look in your desktop environment's application menu; discovery may require the menu to refresh. On macOS, open the launcher in Finder under your user's Applications folder and optionally add it to the Dock. Menu discovery and actual launch behavior on Linux/macOS have not been tested on those operating systems.

Brave must already be installed. Linux detection supports `brave-browser`, `brave`, and `brave-browser-stable` on PATH; macOS detection checks the system and user Applications directories. Linux/macOS can override discovery with `--browser /absolute/path/to/brave`. Sandboxed package wrappers such as Flatpak are not automatically configured.

Use `--output-directory PATH` to generate launchers in a different existing or new directory. To inspect artifacts for another system without installing anything there:

```sh
python scripts/install_launcher.py --platform linux --browser /usr/bin/brave-browser --output-directory ./launcher-preview/linux
python scripts/install_launcher.py --platform macos --browser "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --output-directory ./launcher-preview/macos
```

Cross-platform generation requires an explicit output directory. Generated Linux/macOS text files always use Unix line endings. This is artifact generation, not proof of compatibility with the target OS.

The installer never opens or closes Brave and does not alter existing browser shortcuts, default-browser settings, or URL associations. Open Brave through the generated launcher after fully quitting existing instances. To undo installation, remove only the generated launcher. It suppresses debugger-extension banners for all extensions in that browser launch, not just this extension.

Launcher artifact checks: `python -m unittest discover -s test -p 'test_*.py' -v`. These tests create temporary artifacts inside the project and do not run a browser or install menu entries.

## Launching without the debugging banner on Windows

1. Save any pending work and fully exit Brave yourself.
2. Search for **Brave - Native Dark Mode** in the Start menu after running the installer. The previously generated project-root `.lnk` works too. Both open Brave directly without a console window.
3. Enable a saved rule and check whether the banner stays hidden.

The shortcut starts the installed Brave with `--silent-debugger-extension-api`. It uses the usual browser profile, does not enable a remote debugging port, and does not change the global dark mode flag or existing shortcuts. If Brave is already running, the new argument may not take effect; fully exit first. The switch suppresses debugger-extension banners for all extensions in that browser launch, not just this extension. It does not remove debugger access or its permissions. Fully exit Brave and launch it normally to restore the default behavior.

Generated shortcuts contain local installation paths and are not committed. The underlying Windows script also accepts `./scripts/New-BraveShortcut.ps1 -StartMenu` from PowerShell, or no arguments to create a shortcut in the project root. The generator verifies the saved target and argument without launching or closing Brave. It does not change the default browser, taskbar pins, desktop shortcuts or URL associations.

`Start Brave Without Debug Banner.cmd` remains an alternative launcher that refuses to start while a Brave process is running. It never terminates processes.

The extension cannot hide browser chrome itself. Chromium's [debugger implementation](https://github.com/chromium/chromium/blob/main/chrome/browser/extensions/api/debugger/debugger_api.cc) checks this launch switch before showing its warning. Its effect on the installed Brave version remains to be verified. Run the launcher with `/check` to validate executable discovery without launching Brave.
