# Extension interface

## Views and structure

The [toolbar popup](../extension/popup.html) works on the active tab. It shows the site and rule status, then the scope, website theme, and save actions. The [rule manager](../extension/options.html) has a persistent editor beside the saved rules and Trash. It owns rule defaults, sorting, domain groups, and backup import and export. [popup.js](../extension/popup.js) drives both views. [popup.css](../extension/popup.css) provides shared styles and [options.css](../extension/options.css) handles the manager layout.

Keep the address, scope chips, and switches together. Show Include subpaths last for path rules. The manager editor stays sticky on wide layouts and scrolls with the page. Keep appearance controls separate from website settings. The popup groups appearance in a menu, while the manager exposes its controls in the toolbar.

Place Rule defaults beside the Rule editor heading. The manager uses a wider desktop workspace with space for all theme chips. The editor's activation and save actions share a row when space allows. While editing, Save settings and Cancel share that row. In Trash, stack Restore above Delete permanently and align both actions to the right.

Keep the popup compact by grouping the site and rule status with the title and placing theme descriptions on their chips as tooltips. Preserve control sizes and allow wrapping and scrolling at larger text scales.

Shorten the hostname in the middle only when its label runs out of room. Prefer keeping the registered domain and allow two lines with enlarged text. A shortened label exposes the full hostname by hover, keyboard focus, or activation and uses the full hostname as its accessible name.

In saved rule and Trash rows, give the address its own line above the state and theme metadata. Ellipsize an overflowing address at the end and expose the complete scope in a selectable tooltip on hover, keyboard focus, or activation. Keep the full address as the control's accessible text. Short addresses remain plain text, and truncation updates with the available width and UI text scale.

## Components

- Use fieldsets and legends for groups of radio chips. Keep the native radio input and its keyboard behavior. Read and write the selected value through [choices.js](../extension/choices.js).
- Use labeled native checkboxes styled as switches for independent boolean settings. Disable unavailable controls and retain a clear explanation when the action is relevant.
- Use native dialogs for confirmation and rule defaults. Give dialogs an accessible title and explicit dismissal controls. In Rule defaults, use the same rounded `rule-field` cards as the editor. Show website and path switches in separate, persistent groups, with Include subpaths last in the path group. Scope chips choose which scope new rules start with.
- Associate tooltips with controls using `aria-describedby`. Tooltips open after 800 ms on hover and immediately on keyboard focus. They remain visible while hovered and can be dismissed by click or Escape.
- Keep focus visible, respect reduced motion, and check wrapping from 75% to 200% text size. Localize visible text and accessible names in all nine interface catalogs. Use `data-i18n`, `data-i18n-label`, and `t()` for static labels, accessible names, and dynamic text respectively.

## Rule workflows

The popup opens the matching saved rule or drafts a new one using Rule defaults. Defaults prefill new rules in both views and never change a saved rule on their own. Website and path defaults keep separate domain switches that can be edited together, and path defaults can include or exclude subpaths.

The scope identifies a hostname or a path. Subdomains, regional domains, and parent-domain scope broaden matching when the address supports them. [rules.js](../extension/rules.js) owns normalization and precedence. A more specific enabled rule can override a broader rule, and a disabled winning rule excludes the page.

**Save settings** keeps the current enabled state. **Enable and save** and **Disable and save** change it. Theme, separator, and supported scope-switch changes on an existing scope save immediately. Editing the URL or choosing another website/path scope remains a draft until a save action. Save settings currently remains available even when there is no pending draft; do not document a dirty-state-only button as implemented. Route rule writes through `RuleManager` so editing, importing, removing, and restoring remain ordered. The popup explains browser-protected pages and disables rule controls there. Each Trash entry supports restoration and confirmed permanent deletion. A single-entry deletion passes only its confirmed Trash ID to the same serialized operation used by Empty trash. Removal, restoration, and destructive import previews follow the confirmation rules in [AGENTS.md](../AGENTS.md).

Check new and existing rules in both views, including inherited rules, exclusions, keyboard operation, and large text. See [Website theme rendering](WEBSITE-THEME-RENDERING.md) for applying a saved theme to the page.

## Theme naming and help

Present the themes in this order: Native, Simulated Native, Soft dark, High contrast. Describe Simulated Native as Chromium-inspired with additional contrast repairs, rather than an exact recreation. Native remains the default. Changing or removing either name requires a separate product and migration decision.

The close button in Rule defaults uses a centered SVG with a minimum 44px target. Backdrop dismissal discards unsaved defaults; saving updates defaults for future rules, not the current saved rule. Tooltip and dialog behavior must retain keyboard access and scale with the interface.
