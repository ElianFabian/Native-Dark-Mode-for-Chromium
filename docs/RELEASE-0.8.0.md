# Native Dark Mode 0.8.0

## New features

- Turn on **Popup border** in **Appearance** to make the popup easier to distinguish from the page behind it. The border follows the interface theme and becomes thicker when High contrast is enabled. The popup remembers your preference.
- On Windows, the optional installer finds existing browser shortcuts in the Desktop, Start menu, and taskbar pins stored as shortcut files. After confirmation, it adds the debugger banner suppression flag, keeps existing launch arguments, and saves a backup of each original shortcut.
- Use the Windows restorer to recover the original shortcuts from their backups. If Windows denies write access, both tools offer a separate administrator retry and ask for confirmation again before changing the pending shortcuts.
- The Windows installer and restorer follow the Windows display language and support all nine extension languages, with English as the fallback.

## Fixes and interface improvements

- Closing the popup’s Appearance menu with its close button or Escape returns focus to the menu trigger without jumping to the top.
- Turning on the popup border preserves the toolbar and menu layout.
- The Windows tools group shortcuts by browser and explain what will change before asking for confirmation. Results show which shortcuts were updated or restored and why any could not be changed.
