# Native Dark Mode 0.7.0

## New features

- Choose **Native**, **Soft dark**, or **High contrast** per website or path. Existing rules default to Native.
- Apply custom themes to eligible embedded frames and open shadow roots. Images, videos, and canvas pixels retain their original appearance.
- Switch website themes in open tabs without reloading. The popup opens independently of page repainting.
- Turn off **Include subpaths** to match only the selected path, including the home page. Existing path rules still include descendants.
- Keep a specific subdomain across regional suffixes, such as `fonts.google.*`, or use **Apply to all of google.com** to cover the base domain and its subdomains. Combine these options to cover regional domain families.
- Move a saved rule to Trash from the popup or rule editor after confirming its scope. Remove an entire domain group with one confirmation, including rules hidden by search.
- Use independent text sizes for the popup and rule manager. Both views share theme and high-contrast preferences.

## Fixes and interface improvements

- Improve custom theme coverage for light gradients, spread shadows, dynamic content, and surfaces about to scroll into view.
- Improve contrast on themed surfaces, blended backgrounds, headings, product badges, and promotional labels. Preserve image-backed backgrounds where possible.
- Keep theming dynamic content after elements are removed, restore original styling when switching away, and verify that the selected preset was applied.
- Suggest the base URL for new website rules and the current path for section rules. Remove query strings and fragments from suggestions, wrap long URLs automatically, and correctly replace a selected section when saving the entire website.
- Treat a base domain and its `www` alias as one rule, including exclusions. Preserve the explicit base rule when importing or normalizing older settings containing both forms.
- Make inherited scope clear with a labeled, locked switch. Show the scope of broad disable actions and distinguish them from local exclusions. Allow switching between existing parent and subdomain rules while preserving their settings.
- Show Enabled, Disabled, and No saved rule as distinct popup states. Use a separate color for re-enabling a saved rule. Keep the action row steady when saving, switching themes, or toggling a saved rule.
- Keep the trash action visible but disabled for inherited rules, with a tooltip pointing to the manager. Removing a local exclusion restores the applicable inherited rule.
- Combine the URL, scope chips, and scope switches in one card. Keep Include subpaths last and show unavailable regional options as disabled.
- Improve headings, switch alignment, and editor contrast. Reorganize the appearance controls and open the popup’s Appearance menu by activation.
- Give tooltips a distinct background and an 800 ms hover delay. Keep them readable under the pointer and allow dismissal by click or Escape. Keyboard focus shows them immediately.
- Keep the editor sticky beside the list and Trash on wide screens. Align Trash with the saved rules list and animate the card when emptying it, respecting reduced motion.
- Update backup button labels and icons. Backup version 3 preserves exact-only paths, version 2 supports custom themes, and version 1 remains compatible.
- Simplify the native controller code and store interface translations in flat catalogs. Keep Chromium manifest messages in their required format.
- Refresh both README screenshots and document AI assistance, rule behavior, backups, and removal.
