# Native image preservation research

Investigated on November 6, 2026. Requirement: retain the native browser darkening engine and optionally leave image colors untouched. CSS replacement engines and brightness filters are outside scope.

**Decision:** the user deferred this feature. Version 0.2.2 removes the experimental checkboxes and CSS behavior. The launch-time option below is recorded for future consideration only; existing launchers do not enable it.

## Findings

1. **The CDP switch has no image setting.** `Emulation.setAutoDarkModeOverride` accepts only the optional `enabled` boolean. Its implementation changes the page's force-dark setting. It does not expose Blink runtime-feature controls.
2. **A native image exclusion exists internally.** `AutoDarkModeSkipImages` is a Blink runtime feature. `DarkModeFilter::ApplyFilterToImage` returns without applying its image filter when that feature is active. This is an actual native exclusion, not a CSS inversion workaround.
3. **A launch-time route is supported by the source.** Chromium maps names passed through `--enable-blink-features` to runtime features. The candidate argument is `--enable-blink-features=AutoDarkModeSkipImages`. This does not itself enable dark mode. The extension could still choose the pages where native dark mode is enabled, while the image-exclusion preference would be global for that browser launch.
4. **The installed Brave contains the feature name.** A read-only search of `Application/157.1.99.55/chrome.dll` found the ASCII string `AutoDarkModeSkipImages`. This supports availability in that build, but is not proof of correct visual behavior.
5. **An independent native image toggle per website remains unverified.** No such parameter exists in the reviewed CDP command. The global Blink feature does not establish a per-tab API. Patching or rebuilding the browser would be a different project.
6. **The CSS experiment is inconclusive as a general technique.** Chromium documents element-level exclusion through `color-scheme: only light`. Earlier extension versions targeted image elements only, and the user reported no visible effect in Brave. That result does not establish whether the cause is image type, frame coverage, injection, or a browser rendering issue. The experiment was removed in version 0.2.2. Images of different types, inline SVG, backgrounds, canvas and video would need separate testing if revisited.

## Attempted runtime verification

An isolated headless Brave probe was prepared to compare baseline, native darkening, CSS opt-out and native image skipping on a local bitmap fixture. It uses separate profiles inside the ignored `research-artifacts` directory and never targets the normal profile.

The sandboxed attempt failed during crash-handler startup. An unsandboxed attempt timed out before the baseline screenshot was generated. Therefore **no pixel comparison succeeded** and no claim of visual success is made. The probe now creates a unique output/profile directory per run and records timeouts explicitly. No regular shortcut was changed and the normal browser session was not intentionally closed.

The next useful verification is a controlled fresh Brave launch with the candidate argument, then enabling native dark mode on a known problem page. Compare the same bitmap/logo with the argument absent and present. Do not alter the installed shortcut automatically as part of research. Restart is required to compare launch-time settings. Test image formats separately; do not claim all rendered graphics are covered by an image-filter hook.

## Practical conclusion

- Native dark mode with a global native image-exclusion setting: **a source-backed candidate exists and is present by name in the installed binary; visual confirmation pending**.
- Independent per-website image control through the existing extension/CDP command: **no reliable implementation established**.
- The removed experimental checkbox was not evidence of supported per-website image preservation.

## Primary sources

- [CDP Emulation definition](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Emulation.pdl)
- [Native dark-mode image filter](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/graphics/dark_mode_filter.cc)
- [Blink runtime feature definitions](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/runtime_enabled_features.json5)
- [Runtime feature command-line processing](https://github.com/chromium/chromium/blob/main/content/child/runtime_features.cc)
- [DevTools force-dark implementation](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/inspector/dev_tools_emulator.cc)
- [Documented CSS element opt-out](https://developer.chrome.com/blog/auto-dark-theme#per-element_opt_out)
