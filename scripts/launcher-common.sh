#!/bin/sh
# Shared POSIX shell utilities. No Python, PowerShell or external packages.
set -eu

fail() { printf '%s\n' "$*" >&2; exit 1; }

wait_for_enter() {
  if [ -t 0 ]; then
    printf '\nPress Enter to close...'
    IFS= read -r ignored || :
  fi
}

trap wait_for_enter EXIT

parse_arguments() {
  destination=''
  browser=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help) printf '%s\n' 'Options: --output-directory PATH --browser PATH'; exit 0 ;;
      --output-directory|--browser)
        option=$1
        [ "$#" -ge 2 ] || fail "Missing value for $option"
        case "$option" in
          --output-directory) destination=$2 ;;
          --browser)
            browser=$2
            ;;
        esac
        shift 2 ;;
      *) fail "Unknown argument: $1" ;;
    esac
  done
}

validate_browser() {
  [ -n "$browser" ] && [ -f "$browser" ] && [ -x "$browser" ] || fail 'The browser was not found or is not executable. Use --browser with its absolute executable path.'
  case "$browser" in /*) ;; *) fail 'The browser path must be absolute.' ;; esac
  newline='
'
  carriage_return=$(printf '\r')
  case "$browser" in *"$newline"*|*"$carriage_return"*) fail 'The browser path must not contain line breaks.' ;; esac
}

install_browser() {
  launcher_name="$1 - Native Dark Mode"
  launcher_id="$2-native-dark-mode"
  browser=$3
  validate_browser
  printf 'Creating shortcuts for %s (%s)\n' "$1" "$browser"
  create_launcher
  installed=$((installed + 1))
}

start_install() {
  installed=0
  printf '%s\n' 'Looking for Chromium-based browsers and creating shortcuts for native dark mode.'
}

finish_install() {
  [ "$installed" -gt 0 ] || fail 'No supported browser installation was found. Use --browser with its absolute executable path.'
  printf '%s\n' 'Fully exit the target browser before opening its shortcut.' \
    'If the browser honors the launch flag, it suppresses banners for all debugger extensions in that session.'
}
