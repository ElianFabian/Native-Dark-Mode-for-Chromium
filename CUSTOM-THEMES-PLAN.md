# Custom website themes — implementation plan

Native Chromium dark mode remains the default. Custom themes are opt-in per
website or path section. They affect web content and use separate settings from
the extension's own appearance controls.

## Feasibility and scope

The extension currently controls Blink through
[Emulation.setAutoDarkModeOverride](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setAutoDarkModeOverride).
The command exposes a single optional boolean. Custom palettes require a second
renderer that adjusts page styles. A whole-page CSS filter would recolor
photos and video along with the interface and would provide little control over
individual text and background pairs. Prototype targeted style overrides.

Start with **Soft dark**, using lighter charcoal surfaces and readable text, and
**High contrast**, using stronger separation between text, surfaces, borders,
and focus indicators. Use the [WCAG 2.2 contrast criteria](https://www.w3.org/TR/WCAG22/#contrast-minimum)
as measurable targets on known, solid backgrounds. Aim for at least 4.5:1 for
normal text and 3:1 for large text in Soft dark, and 7:1 and 4.5:1 respectively
in High contrast. Results on those fixtures establish what the renderer does
under controlled conditions. Compliance of arbitrary pages remains outside
the scope of this feature.

## Implementation stages

1. **Build fixtures and record the native baseline.** Use local pages with
   light and dark themes, links, forms, focus indicators, dialogs, transparent
   layers, gradients, and media. Include same-origin and cross-site frames,
   nested frames, frames added after load, frame reloads, and a large dynamic
   page. Use two distinct local hosts for the cross-site case and confirm that
   the fixture actually creates an out-of-process frame. Record visual results
   in Brave on Windows 11, including what the current native override does in
   each frame. Measure initial paint and rendering work during updates.

2. **Prototype a reversible renderer in one document.** Keep palette and color
   conversion logic separate from DOM processing. Start with text, solid
   surfaces, borders, and controls. Sample effective foreground and background
   colors where possible and write extension-owned overrides that can be removed
   immediately. Keep image, video, and canvas pixels intact on the fixtures.
   Detect inserted and restyled content, batch reads and writes, and tear down
   observers when disabled. Treat gradients, text over images, complex SVG,
   and closed shadow roots as compatibility cases to assess after the basic
   renderer works. Compare startup timing and flicker against the baseline.

3. **Apply the renderer independently in each eligible frame.** Use a
   lightweight isolated content script with
   [all-frame matching](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#specify-frames)
   and permission for the target origin. Start at document start and wait for
   the active rule before doing style work. The service worker resolves the
   rule against the top-level URL and gives each frame the same preset. If an
   embedded URL is opened in its own tab, resolve its rules normally.
   Use tab and document identities to avoid applying an old decision after a
   navigation. Verify cross-origin, nested, dynamically added, and reloaded
   frames, plus history navigation and service-worker restarts. Test
   about:blank, srcdoc, and sandboxed documents separately and document which
   cases are reachable. Keep browser-restricted pages outside the supported
   set. The renderer needs no network requests or access to another frame's DOM.

4. **Integrate rule storage and mode switching.** Add a validated preset
   field, with missing values interpreted as native. Preserve rule IDs,
   matching precedence, and disabled path exclusions. Define a versioned
   backup format that preserves custom presets and still accepts existing
   backups. Serialize transitions per tab and clear the old mode before
   applying the new one. Verify that native → custom, custom → native, and
   either mode → disabled leave no stale styles or debugger override. A tab
   using only the custom renderer should need no debugger session.

5. **Expose presets and validate before release.** Add a translated and
   keyboard-accessible website theme selector in the rule editor. Check
   existing site and section rules, popup status, save and restore, and backup
   round trips. Validate on Brave first, then Chrome and Edge. Release the
   presets only after eligible cross-site frames pass the same visual and
   cleanup checks as the main document, test media retain their colors,
   measured text pairs meet the preset targets, and dynamic pages show no
   persistent flicker or repeated full-page restyling. Record browser versions
   and unsupported cases in both READMEs.

Investigate native iframe gaps separately if the baseline exposes them.
[Flat debugger sessions](https://developer.chrome.com/docs/extensions/reference/api/debugger#work-with-frames)
are available starting with Chrome 125. Check the current minimum browser
version before relying on child sessions for native mode.
