# Native Dark Mode — Brave prototype

A per-tab Manifest V3 extension that sends `Emulation.setAutoDarkModeOverride` through `chrome.debugger`. No external daemon, remote debugging port, or global dark mode flag is required. The extension does not rewrite page styles.

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
4. Open `http://127.0.0.1:8765/test.html`, open the extension popup, and click **Enable dark mode**.
5. Observe the result, then try disabling, reloading, navigating, and dismissing the debugging banner. Record results in `PLAN.md`.

The manual setting follows the tab across navigation. It uses `storage.session`, does not survive a browser restart, and does not sync to other devices. The extension does not reconnect automatically after disconnection. Internal browser pages are unsupported. Preserving every color, handling every iframe, and preventing flashes are not guaranteed.

Opening DevTools may disconnect the session. If another debugger is already attached, the prototype reports the error without trying to remove it.

## Code checks

Run `npm run check` and `npm test` with Node.js installed. No additional packages are required. Simulated tests check connection handling; they do not verify rendering in Brave.

## Planned features

After native rendering is validated, add persistent rules for entire websites and path sections, including exclusions and explicit subdomain handling. Independent image control is under investigation; the CDP command has no separate image parameter. These features are not implemented yet.
