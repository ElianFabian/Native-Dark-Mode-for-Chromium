# Native Dark Mode — Brave prototype

A Manifest V3 extension that sends `Emulation.setAutoDarkModeOverride` through `chrome.debugger`, with persistent rules for websites and path sections. No external daemon, remote debugging port, or global dark mode flag is required. Chromium handles image rendering automatically; the extension does not modify image styles.

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

Rules are saved in `storage.local` and restored on future visits, including after browser restarts. Disabling retains an inactive rule, which also excludes its scope from a broader enabled rule. The most specific matching path wins. The popup lists saved entries with enable/disable, edit and remove controls. Choose **Edit**, adjust the fields, and use **Save settings** to update the same scope. Saving a different scope adds another entry; remove the original explicitly if no longer needed.

Queries and fragments are ignored. A section matches its path and descendants, not similarly named neighboring paths. Subdomains require explicit opt-in. HTTP and HTTPS share rules, while nonstandard ports are distinct. Rules do not sync to other devices.

The extension pauses automatic activation for a tab after debugger disconnection. Use **Enable and save** to resume an enabled rule manually. Internal browser pages are unsupported. Preserving every color, handling every iframe, and preventing flashes are not guaranteed.

Opening DevTools may disconnect the session. If another debugger is already attached, the prototype reports the error without trying to remove it.

## Code checks

Run `npm run check` and `npm test` with Node.js installed. No additional packages are required. Simulated tests check connection handling; they do not verify rendering in Brave.

## Images: deferred feature

Version 0.2.2 removes the experimental image controls, CSS injection and the unused `scripting` permission. Existing website and section rules are retained; obsolete image preferences are ignored and removed when rules are next saved. Refresh previously open pages after reloading the extension to clear any styles injected by older versions. The native browser engine remains a requirement; a CSS replacement or brightness filter is not planned.

The native `AutoDarkModeSkipImages` launch-time candidate is documented in [IMAGE-RESEARCH.md](IMAGE-RESEARCH.md) for future consideration. It is deliberately deferred, not enabled in any launcher, and has no control in the extension. It is global per browser launch; a dynamic per-website native image toggle has not been established.

Automatic rules require HTTP/HTTPS site access. The code only stores rules locally and makes no external network requests. Reload the extension in `brave://extensions` after updating, then refresh open test pages.

## Popup responsiveness

The popup does not wait for background tabs before replying to changes. It displays progress and restores controls after ten seconds if the browser has not replied. A timeout does not cancel a browser operation or undo a saved rule; reopen the popup to inspect the latest state.

## Native launcher installers

Installers use the operating system's bundled scripting tools. End users do not need Python, PowerShell or Node.js to install a launcher. Keep the `scripts` directory together, because the Windows installer has a helper and the Unix installers share shell utilities.

| Platform | Installer | Default destination |
| --- | --- | --- |
| Windows | `scripts/install-launcher-windows.cmd` | Current user's Start Menu / Programs |
| Linux | `sh scripts/install-launcher-linux.sh` | `$XDG_DATA_HOME/applications`, or `~/.local/share/applications` |
| macOS | `sh scripts/install-launcher-macos.command` | `~/Applications` |

**Windows:** double-click the CMD installer. It invokes the bundled Windows Script Host through `cscript.exe` and a JScript helper to create and verify a regular `.lnk`. This JScript runs in Windows Script Host, not the browser or Node.js. Windows Script Host must be available; the installer does not change machine policy if an administrator has disabled it. Search the Start menu for **Brave - Native Dark Mode** after installation.

**Linux:** run the shell installer, then look in the desktop environment's application menu. Discovery may require a menu refresh. The installer uses standard shell utilities and detects `brave-browser`, `brave`, or `brave-browser-stable` on PATH. Sandboxed package wrappers such as Flatpak are not automatically configured.

**macOS:** run the shell installer (or open the executable `.command` file), then open **Brave - Native Dark Mode.app** in your user's Applications folder. You may add it to the Dock. It detects Brave in the system or user Applications directory. The generated app uses a shell executable, not Python or PowerShell, and keeps the browser path as data instead of interpolating it into executable shell code.

All installers accept `--browser PATH` and `--output-directory PATH`. The browser executable must already exist; Unix installers require an absolute executable path. For example:

```sh
sh scripts/install-launcher-linux.sh --browser /usr/bin/brave-browser --output-directory ./launcher-preview/linux
sh scripts/install-launcher-macos.command --browser "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" --output-directory ./launcher-preview/macos
```

Generated Linux/macOS text files use Unix line endings. The installers never open or close Brave, change existing shortcuts, change browser defaults, or change URL associations. To undo installation, remove only the generated launcher.

## Use the launcher without the debugging banner

1. Save pending work and fully exit Brave yourself.
2. Open **Brave - Native Dark Mode** from your Start menu, application menu, or Applications folder.
3. Enable a saved rule and check whether the debugging banner stays hidden.

Each launcher starts the installed Brave with `--silent-debugger-extension-api`, using the usual browser profile. If Brave is already running, the new argument may not take effect. The switch suppresses debugger-extension banners for all extensions in that browser launch, not just this extension. It does not remove debugger access or permissions. Fully exit Brave and launch it normally to restore the default behavior.

Generated launchers contain local installation paths and are not committed. `Start Brave Without Debug Banner.cmd` remains an alternative direct launcher that refuses to start while a Brave process is running.

The extension cannot hide browser chrome itself. Chromium's [debugger implementation](https://github.com/chromium/chromium/blob/main/chrome/browser/extensions/api/debugger/debugger_api.cc) checks this launch switch before showing its warning. Actual banner suppression after a Brave restart remains unverified.

## Launcher development checks

Developers can run `python -m unittest discover -s test -p 'test_*.py' -v`. Python is used only by the test harness. On Windows, shell-artifact checks use Git Bash if available. Tests execute the native installers in temporary project directories, verify the Windows shortcut and Linux application entry, parse the macOS bundle, and check argument forwarding using a mock browser. They do not launch a real browser or install menu entries. Linux/macOS desktop integration and actual Brave launch remain untested on those operating systems.
