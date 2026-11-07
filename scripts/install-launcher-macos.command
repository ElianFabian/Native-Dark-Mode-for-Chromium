#!/bin/sh
set -eu
script_directory=$(CDPATH= cd "$(dirname "$0")" && pwd)
. "$script_directory/launcher-common.sh"
parse_arguments "$@"

if [ -z "$browser" ]; then
  for candidate in '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' \
    "$HOME/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do
    if [ -x "$candidate" ]; then browser=$candidate; break; fi
  done
fi
validate_browser
destination=${destination:-"$HOME/Applications"}
app="$destination/$launcher_name.app"
bundle_id='local.native-dark-mode.brave-launcher'
if [ "$launcher_id" != 'brave-native-dark-mode' ]; then
  bundle_id='local.native-dark-mode.chromium-browser-launcher'
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
finish "$app"
