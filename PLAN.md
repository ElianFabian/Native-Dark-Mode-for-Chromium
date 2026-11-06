# Validation plan — native dark mode in Brave

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
- Including subdomains must be explicit. `example.com` must not match `otherexample.com`.
- Queries and fragments do not create separate scopes in the first version. Display the saved scope. HTTP and HTTPS share rules; a nonstandard port distinguishes a destination.
- Test trailing slashes, adjacent paths, subdomains, domain changes, same-document navigation and exclusions inside enabled websites.
- Acceptance example: enable `example.com`, exclude `example.com/photos/`, then enable `example.com/photos/articles/`.
- Rules are implemented in version 0.2.0 at the user's explicit request. Native visual regression testing remains pending.

## Image preference

- Requested: choose whether dark mode affects images, ideally per website.
- `Emulation.setAutoDarkModeOverride` only exposes `enabled`; this command has no separate image parameter. Current Chromium source contains an internal `AutoDarkModeSkipImages` feature, which does not establish that extensions can configure it per tab.
- Version 0.2.0 exposes a clearly labeled experimental preservation preference using `color-scheme: only light` for image elements. Native mode uses heuristics; enabling it does not mean inverting every image. Visual effectiveness remains unverified.
- Investigate whether element-level exclusion works in the installed browser without global flags. Explain any CSS-based alternative and verify fidelity. Do not attempt to undo native transformations through indiscriminate CSS inversion.
- Extend fixtures with photographs, light/dark logos, transparency, background images and SVG. Record image, canvas and video results separately.
- Preservation must retain original image appearance; adaptation needs defined behavior. Independent image control remains unverified.

Technical references:

- [CDP command](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setAutoDarkModeOverride)
- [Chromium filter](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/platform/graphics/dark_mode_filter.cc)

## Decisions and execution notes

- Initial browser: Brave, confirmed by the user.
- Loading the local prototype and testing with the debugging banner: authorized by the user's confirmation.
- Prototype is disabled by default, with explicit per-tab activation.
- Internal pages and protocols other than HTTP/HTTPS are excluded.
- No production dependencies, telemetry or external network requests from the extension.
- All project code, comments, UI text, tests and documentation are in English.
- Use local Git version control, as requested. No remote publication requested.
- Workspace was initially empty and had no Git repository.
- Windows Computer Use stopped before installation because it could not identify the browser URL confidently enough to enforce policy. No extension was loaded and no visual test was performed.

## Test record

| Check | Result |
| --- | --- |
| Syntax and controller/rule tests | Passed: `npm run check` and `npm test`; 15 simulated tests. |
| Extension loaded in Brave | User screenshot shows the original prototype's debugger banner; version 0.2.0 has not been loaded by the agent. |
| Native command accepted and rendering changed | Pending. |
| Enable/disable and reload in Brave | Pending. |
| Banner cancellation and DevTools in Brave | Pending. |
| Images, canvas, Shadow DOM and iframes | Pending visual validation. |
| Website and section rules | Implemented; simulated matching, persistence, exclusions, navigation and cancellation tests pass. Brave UI tests pending. |
| Image preference | Implemented as experimental CSS preservation for image elements; simulated insertion/removal test passes. Visual validation pending. |
