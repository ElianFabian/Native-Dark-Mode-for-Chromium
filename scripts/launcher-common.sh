#!/bin/sh
# Shared POSIX shell utilities. No Python, PowerShell or external packages.
set -eu

fail() { printf '%s\n' "$*" >&2; exit 1; }

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
          --browser) browser=$2 ;;
        esac
        shift 2 ;;
      *) fail "Unknown argument: $1" ;;
    esac
  done
}

validate_browser() {
  [ -n "$browser" ] && [ -f "$browser" ] && [ -x "$browser" ] || fail 'Brave was not found or is not executable. Use --browser with its absolute executable path.'
  case "$browser" in /*) ;; *) fail 'The browser path must be absolute.' ;; esac
  newline='
'
  carriage_return=$(printf '\r')
  case "$browser" in *"$newline"*|*"$carriage_return"*) fail 'The browser path must not contain line breaks.' ;; esac
}

finish() {
  printf '%s\n' "Created: $1" \
    'Fully exit Brave before opening the launcher. All debugger-extension banners are suppressed for that launch.' \
    'Brave has not been launched or closed. Existing shortcuts and browser defaults were not changed.'
}
