#!/bin/sh
set -eu
script_directory=$(CDPATH= cd "$(dirname "$0")" && pwd)
. "$script_directory/launcher-common.sh"
parse_arguments "$@"

desktop=''
if [ -z "$destination" ]; then
  data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
  case "$data_home" in /*) ;; *) fail 'XDG_DATA_HOME must be an absolute path.' ;; esac
  destination="$data_home/applications"
  desktop="$HOME/Desktop"
  if command -v xdg-user-dir >/dev/null 2>&1; then
    desktop=$(xdg-user-dir DESKTOP) || desktop=''
  fi
  case "$desktop" in "$HOME"|/) desktop='' ;; /*) ;; *) desktop='' ;; esac
fi

create_launcher() {
  case "$browser" in *=*) fail 'Desktop Entry executable paths cannot contain an equals sign.' ;; esac
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
  printf 'Created: %s\n' "$entry"
  if [ -n "$desktop" ] && [ -d "$desktop" ] && [ ! "$desktop" -ef "$destination" ]; then
    desktop_entry="$desktop/$launcher_id.desktop"
    cp "$entry" "$desktop_entry"
    chmod 755 "$desktop_entry"
    printf 'Created: %s\n' "$desktop_entry"
  fi
}

find_browser() {
  label=$1
  id=$2
  shift 2
  for name do
    if executable=$(command -v "$name") && [ -f "$executable" ] && [ -x "$executable" ]; then
      install_browser "$label" "$id" "$executable"
      return
    fi
  done
}

start_install
if [ -n "$browser" ]; then
  install_browser 'Chromium Browser' chromium-browser "$browser"
else
  find_browser 'Brave' brave brave-browser brave brave-browser-stable
  find_browser 'Google Chrome' google-chrome google-chrome google-chrome-stable
  find_browser 'Chromium' chromium chromium chromium-browser
  find_browser 'Microsoft Edge' microsoft-edge microsoft-edge microsoft-edge-stable
  find_browser 'Vivaldi' vivaldi vivaldi vivaldi-stable
  find_browser 'Opera' opera opera
fi
finish_install
