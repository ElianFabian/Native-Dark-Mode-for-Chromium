#!/bin/sh
set -eu
script_directory=$(CDPATH= cd "$(dirname "$0")" && pwd)
installer_platform_locale=$(defaults read -g AppleLocale 2>/dev/null) || installer_platform_locale=''
. "$script_directory/internal/launcher-common.sh"
parse_arguments "$@"

desktop=''
if [ -z "$destination" ]; then
  destination="$HOME/Applications"
  desktop="$HOME/Desktop"
fi

create_launcher() {
  app="$destination/$launcher_name.app"
  bundle_id='local.native-dark-mode.brave-launcher'
  if [ "$launcher_id" != 'brave-native-dark-mode' ]; then
    bundle_id="local.native-dark-mode.$launcher_id"
  fi
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
  # Keep the executable path as data instead of interpolating it into shell code.
  printf '%s\n' "$browser" > "$app/Contents/Resources/browser-path"
  cat > "$app/Contents/MacOS/launcher" <<'LAUNCHER'
#!/bin/sh
set -eu
launcher_directory=$(CDPATH= cd "$(dirname "$0")" && pwd)
IFS= read -r browser < "$launcher_directory/../Resources/browser-path"
exec "$browser" --silent-debugger-extension-api "$@"
LAUNCHER
  chmod 755 "$app/Contents/MacOS/launcher"
  cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>$launcher_name</string>
<key>CFBundleDisplayName</key><string>$launcher_name</string>
<key>CFBundleIdentifier</key><string>$bundle_id</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>launcher</string>
</dict></plist>
PLIST
  printf '%s %s\n' "$(message 'Created:')" "$app"
  if [ -n "$desktop" ] && [ -d "$desktop" ]; then
    desktop_link="$desktop/$launcher_name.app"
    if [ -L "$desktop_link" ] && [ "$(readlink "$desktop_link")" = "$app" ]; then
      printf '%s %s\n' "$(message 'Already present:')" "$desktop_link"
    elif [ -e "$desktop_link" ] || [ -L "$desktop_link" ]; then
      printf '%s %s\n' "$(message 'Desktop shortcut skipped because the path is occupied:')" "$desktop_link" >&2
    else
      ln -s "$app" "$desktop_link"
      printf '%s %s\n' "$(message 'Created:')" "$desktop_link"
    fi
  fi
}

find_browser() {
  for applications in /Applications "$HOME/Applications"; do
    executable="$applications/$3.app/Contents/MacOS/$4"
    if [ -x "$executable" ]; then
      install_browser "$1" "$2" "$executable"
      return
    fi
  done
}

start_install
if [ -n "$browser" ]; then
  install_browser 'Chromium Browser' chromium-browser "$browser"
else
  find_browser 'Brave' brave 'Brave Browser' 'Brave Browser'
  find_browser 'Google Chrome' google-chrome 'Google Chrome' 'Google Chrome'
  find_browser 'Chromium' chromium 'Chromium' 'Chromium'
  find_browser 'Microsoft Edge' microsoft-edge 'Microsoft Edge' 'Microsoft Edge'
  find_browser 'Vivaldi' vivaldi 'Vivaldi' 'Vivaldi'
  find_browser 'Opera' opera 'Opera' 'Opera'
fi
finish_install
