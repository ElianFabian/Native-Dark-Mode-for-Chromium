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

## Launching without the debugging banner on Windows

1. Save any pending work and fully exit Brave yourself.
2. Double-click `Brave - Native Dark Mode.lnk` in the project root. This is a regular Windows shortcut that opens Brave directly without a console window. You may copy it to your desktop or pin it manually.
3. Enable a saved rule and check whether the banner stays hidden.

The shortcut starts the installed Brave with `--silent-debugger-extension-api`. It uses the usual browser profile, does not enable a remote debugging port, and does not change the global dark mode flag or existing shortcuts. If Brave is already running, the new argument may not take effect; fully exit first. The switch suppresses debugger-extension banners for all extensions in that browser launch, not just this extension. It does not remove debugger access or its permissions. Fully exit Brave and launch it normally to restore the default behavior.

The generated shortcut contains the local installation path and is excluded from Git. Recreate it on another Windows computer by running `./scripts/New-BraveShortcut.ps1` from PowerShell. The generator verifies the saved target and argument without launching or closing Brave. It does not change the default browser, taskbar pins, desktop shortcuts or URL associations.

`Start Brave Without Debug Banner.cmd` remains an alternative launcher that refuses to start while a Brave process is running. It never terminates processes.

The extension cannot hide browser chrome itself. Chromium's [debugger implementation](https://github.com/chromium/chromium/blob/main/chrome/browser/extensions/api/debugger/debugger_api.cc) checks this launch switch before showing its warning. Its effect on the installed Brave version remains to be verified. Run the launcher with `/check` to validate executable discovery without launching Brave.
