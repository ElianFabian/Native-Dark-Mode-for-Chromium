#!/bin/sh
# Shared POSIX shell utilities. No Python, PowerShell or external packages.
set -eu

installer_locale=${NATIVE_DARK_MODE_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-${installer_platform_locale:-en}}}}}

message() {
  case "$installer_locale" in
    es|es[-_.@]*) ;;
    *) printf '%s' "$1"; return ;;
  esac

  case "$1" in
    'Press Enter to close...') printf '%s' 'Pulsa Enter para cerrar...' ;;
    'Options: --output-directory PATH --browser PATH') printf '%s' 'Opciones: --output-directory PATH --browser PATH' ;;
    'Missing value for') printf '%s' 'Falta el valor de' ;;
    'Unknown argument:') printf '%s' 'Argumento desconocido:' ;;
    'The browser was not found or is not executable. Use --browser with its absolute executable path.') printf '%s' 'El navegador no existe o no se puede ejecutar. Usa --browser con la ruta absoluta del ejecutable.' ;;
    'The browser path must be absolute.') printf '%s' 'La ruta del navegador debe ser absoluta.' ;;
    'The browser path must not contain line breaks.') printf '%s' 'La ruta del navegador no puede contener saltos de línea.' ;;
    'Creating shortcuts for') printf '%s' 'Creando accesos directos para' ;;
    'Looking for Chromium-based browsers and creating shortcuts for native dark mode.') printf '%s' 'Buscando navegadores basados en Chromium para crear sus accesos directos.' ;;
    'No supported browser installation was found. Use --browser with its absolute executable path.') printf '%s' 'No se encontró ningún navegador compatible. Usa --browser con la ruta absoluta del ejecutable.' ;;
    'Fully exit the target browser before opening its shortcut.') printf '%s' 'Cierra el navegador por completo antes de abrir su acceso directo.' ;;
    'If the browser honors the launch flag, it suppresses banners for all debugger extensions in that session.') printf '%s' 'Si el navegador admite el parámetro, se ocultan todos los avisos de depuración de extensiones durante esa sesión.' ;;
    'XDG_DATA_HOME must be an absolute path.') printf '%s' 'XDG_DATA_HOME debe ser una ruta absoluta.' ;;
    'Desktop Entry executable paths cannot contain an equals sign.') printf '%s' 'La ruta del ejecutable no puede contener el signo igual.' ;;
    'Created:') printf '%s' 'Creado:' ;;
    'Already present:') printf '%s' 'Ya existe:' ;;
    'Desktop shortcut skipped because the path is occupied:') printf '%s' 'Se omitió el acceso de escritorio porque la ruta ya está ocupada:' ;;
    *) printf '%s' "$1" ;;
  esac
}

fail() { printf '%s\n' "$*" >&2; exit 1; }

wait_for_enter() {
  if [ -t 0 ]; then
    printf '\n%s' "$(message 'Press Enter to close...')"
    IFS= read -r ignored || :
  fi
}

trap wait_for_enter EXIT

parse_arguments() {
  destination=''
  browser=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --help) printf '%s\n' "$(message 'Options: --output-directory PATH --browser PATH')"; exit 0 ;;
      --output-directory|--browser)
        option=$1
        [ "$#" -ge 2 ] || fail "$(message 'Missing value for') $option"
        case "$option" in
          --output-directory) destination=$2 ;;
          --browser)
            browser=$2
            ;;
        esac
        shift 2 ;;
      *) fail "$(message 'Unknown argument:') $1" ;;
    esac
  done
}

validate_browser() {
  [ -n "$browser" ] && [ -f "$browser" ] && [ -x "$browser" ] || fail "$(message 'The browser was not found or is not executable. Use --browser with its absolute executable path.')"
  case "$browser" in /*) ;; *) fail "$(message 'The browser path must be absolute.')" ;; esac
  newline='
'
  carriage_return=$(printf '\r')
  case "$browser" in *"$newline"*|*"$carriage_return"*) fail "$(message 'The browser path must not contain line breaks.')" ;; esac
}

install_browser() {
  launcher_name="$1 - Native Dark Mode"
  launcher_id="$2-native-dark-mode"
  browser=$3
  validate_browser
  printf '%s %s (%s)\n' "$(message 'Creating shortcuts for')" "$1" "$browser"
  create_launcher
  installed=$((installed + 1))
}

start_install() {
  installed=0
  printf '%s\n' "$(message 'Looking for Chromium-based browsers and creating shortcuts for native dark mode.')"
}

finish_install() {
  [ "$installed" -gt 0 ] || fail "$(message 'No supported browser installation was found. Use --browser with its absolute executable path.')"
  printf '%s\n' "$(message 'Fully exit the target browser before opening its shortcut.')" \
    "$(message 'If the browser honors the launch flag, it suppresses banners for all debugger extensions in that session.')"
}
