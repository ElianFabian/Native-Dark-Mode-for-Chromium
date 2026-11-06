"""Install an optional per-user Brave launcher without debugger banners.

Does not launch or close Brave, change browser defaults, or modify its executable.
"""

import argparse
import os
from pathlib import Path
import plistlib
import shlex
import shutil
import subprocess
import sys

NAME = 'Brave - Native Dark Mode'
FLAG = '--silent-debugger-extension-api'


def current_platform():
    if sys.platform == 'win32':
        return 'windows'
    if sys.platform == 'darwin':
        return 'macos'
    return 'linux'


def desktop_quote(value):
    # Desktop Entry Exec has its own escaping rules, independent of shell quoting.
    escaped = value.replace('%', '%%')
    for char in ('\\', '"', '`', '$'):
        escaped = escaped.replace(char, '\\' + char)
    # Backslashes are escaped again by the Desktop Entry string-value parser.
    return '"' + escaped.replace('\\', '\\\\') + '"'


def linux_launcher(destination, browser):
    path = destination / 'brave-native-dark-mode.desktop'
    path.write_text(
        '[Desktop Entry]\n'
        'Version=1.0\nType=Application\n'
        f'Name={NAME}\n'
        'Comment=Brave with debugger-extension banners suppressed\n'
        f'Exec={desktop_quote(browser)} {FLAG} %U\n'
        'Icon=brave-browser\nTerminal=false\nCategories=Network;WebBrowser;\n',
        encoding='utf-8', newline='\n',
    )
    path.chmod(0o755)
    return path


def macos_launcher(destination, browser):
    app = destination / f'{NAME}.app'
    contents = app / 'Contents'
    executable = contents / 'MacOS' / 'launcher'
    executable.parent.mkdir(parents=True, exist_ok=True)
    executable.write_text(
        '#!/bin/sh\n'
        '# Fully quit Brave before using this launcher.\n'
        f'exec {shlex.quote(browser)} {FLAG} "$@"\n',
        encoding='utf-8', newline='\n',
    )
    executable.chmod(0o755)
    with (contents / 'Info.plist').open('wb') as stream:
        plistlib.dump({
            'CFBundleName': NAME,
            'CFBundleDisplayName': NAME,
            'CFBundleIdentifier': 'local.native-dark-mode.brave-launcher',
            'CFBundleVersion': '1',
            'CFBundlePackageType': 'APPL',
            'CFBundleExecutable': 'launcher',
        }, stream)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', choices=('windows', 'linux', 'macos'), default=current_platform())
    parser.add_argument('--output-directory', type=Path, help='Override the per-user applications directory.')
    parser.add_argument('--browser', help='Override the Brave executable path (Linux/macOS only).')
    args = parser.parse_args()
    if args.platform != current_platform() and args.output_directory is None:
        parser.error('Cross-platform generation requires --output-directory.')

    if args.platform == 'windows':
        if args.browser:
            parser.error('--browser is only supported for Linux/macOS.')
        command = ['powershell.exe', '-NoProfile', '-File', str(Path(__file__).with_name('New-BraveShortcut.ps1'))]
        if args.output_directory:
            args.output_directory.mkdir(parents=True, exist_ok=True)
            command += ['-OutputDirectory', str(args.output_directory.resolve())]
        else:
            command += ['-StartMenu']
        subprocess.run(command, check=True)
    else:
        if args.platform == 'linux':
            browser = args.browser or next((found for name in ('brave-browser', 'brave', 'brave-browser-stable') if (found := shutil.which(name))), None)
            if not browser:
                parser.error('Brave was not found. Supply --browser with its executable path.')
            data_home = os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local' / 'share'))
            destination = args.output_directory or Path(data_home) / 'applications'
            create = linux_launcher
        else:
            candidates = [Path('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'), Path.home() / 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
            browser = args.browser or next((str(path) for path in candidates if path.is_file()), None)
            if not browser:
                parser.error('Brave was not found. Supply --browser with its executable path.')
            destination = args.output_directory or Path.home() / 'Applications'
            create = macos_launcher
        if any(char in browser for char in ('\n', '\r', '\0')):
            parser.error('The browser path contains invalid characters.')
        destination.mkdir(parents=True, exist_ok=True)
        result = create(destination, browser)
        print(f'Created: {result}')

    print('Fully exit Brave before opening the launcher. All debugger-extension banners will be suppressed for that browser launch.')
    print('Brave has not been launched or closed. Existing shortcuts and browser defaults were not changed.')


if __name__ == '__main__':
    main()
