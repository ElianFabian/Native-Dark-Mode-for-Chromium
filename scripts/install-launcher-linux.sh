#!/bin/sh
set -eu
script_directory=$(CDPATH= cd "$(dirname "$0")" && pwd)
. "$script_directory/launcher-common.sh"
parse_arguments "$@"

if [ -z "$browser" ]; then
  for name in brave-browser brave brave-browser-stable; do
    if browser=$(command -v "$name"); then break; fi
  done
fi
validate_browser
case "$browser" in *=*) fail 'Desktop Entry executable paths cannot contain an equals sign.' ;; esac
if [ -z "$destination" ]; then
  data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
  case "$data_home" in /*) ;; *) fail 'XDG_DATA_HOME must be an absolute path.' ;; esac
  destination="$data_home/applications"
fi
mkdir -p "$destination"
entry="$destination/$launcher_id.desktop"

# Escape both Desktop Entry string values and Exec quoting, not shell syntax.
quoted_browser=$(printf '%s' "$browser" | awk '
  BEGIN { printf "\"" }
  { for (i = 1; i <= length($0); i++) {
      c = substr($0, i, 1)
      if (c == "%") printf "%%%%"
      else if (c == "\\") printf "%s", "\\\\\\\\"
      else if (c == "\"" || c == "$" || c == "`") printf "%s%s", "\\\\", c
      else printf "%s", c
  } }
  END { printf "\"" }
')
{
  printf '%s\n' '[Desktop Entry]' 'Version=1.0' 'Type=Application' \
    "Name=$launcher_name" 'Comment=Launch with debugger-extension banner suppression requested'
  printf 'Exec=%s --silent-debugger-extension-api %%U\n' "$quoted_browser"
  if [ "$launcher_id" = 'brave-native-dark-mode' ]; then
    printf '%s\n' 'Icon=brave-browser'
  fi
  printf '%s\n' 'Terminal=false' 'Categories=Network;WebBrowser;'
} > "$entry"
chmod 755 "$entry"
finish "$entry"
