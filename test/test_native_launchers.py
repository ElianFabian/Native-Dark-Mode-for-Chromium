"""Development-only tests: installers themselves do not require Python."""

import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
GIT_BASH = Path('C:/Program Files/Git/bin/bash.exe')
BASH = str(GIT_BASH) if os.name == 'nt' and GIT_BASH.exists() else shutil.which('bash')


def shell_path(path):
    if os.name == 'nt':
        return subprocess.check_output([BASH, '-c', 'cygpath -u "$1"', 'path', str(path)], text=True).strip()
    return str(path)


class NativeLauncherTests(unittest.TestCase):
    @unittest.skipUnless(BASH, 'A shell is needed for shell-artifact checks.')
    def test_linux_detects_multiple_browsers_and_copies_entries_to_the_desktop(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            directory = Path(folder)
            desktop = directory / 'Test Desktop'
            desktop.mkdir()
            for name in ('brave-browser', 'google-chrome'):
                executable = directory / name
                executable.write_bytes(b'#!/bin/sh\nexit 99\n')
                executable.chmod(0o755)
            desktop_lookup = directory / 'xdg-user-dir'
            desktop_lookup.write_bytes(b'#!/bin/sh\nprintf "%s\\n" "$TEST_DESKTOP"\n')
            desktop_lookup.chmod(0o755)
            data = directory / 'data'
            environment = {
                **os.environ,
                'TEST_BROWSER_BIN': shell_path(directory),
                'TEST_DESKTOP': shell_path(desktop),
                'XDG_DATA_HOME': shell_path(data),
            }
            result = subprocess.run(
                [BASH, '-c', 'PATH="$TEST_BROWSER_BIN:$PATH" sh scripts/install-launcher-linux.sh'],
                cwd=ROOT, env=environment, stdin=subprocess.DEVNULL,
                check=True, capture_output=True, text=True,
            )
            for browser in ('brave', 'google-chrome'):
                name = f'{browser}-native-dark-mode.desktop'
                entry = data / 'applications' / name
                self.assertEqual((desktop / name).read_bytes(), entry.read_bytes())
                self.assertIn(f'Created: {shell_path(entry)}', result.stdout)
                self.assertIn(f'Created: {shell_path(desktop / name)}', result.stdout)

    @unittest.skipUnless(BASH, 'A shell is needed for shell-artifact checks.')
    def test_linux_installer_creates_an_application_entry(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            directory = Path(folder).resolve()
            self.assertTrue(directory.is_relative_to(ROOT))
            browser = directory / 'Google Chrome'
            browser.write_text('#!/bin/sh\nexit 99\n', encoding='utf-8', newline='\n')
            browser.chmod(0o755)
            subprocess.run([BASH, 'scripts/install-launcher-linux.sh', '--browser', shell_path(browser), '--output-directory', shell_path(directory)], cwd=ROOT, check=True, capture_output=True)
            entry = (directory / 'chromium-browser-native-dark-mode.desktop').read_text(encoding='utf-8')
            self.assertIn(f'Exec="{shell_path(browser)}" --silent-debugger-extension-api %U', entry)
            self.assertIn('Name=Chromium Browser - Native Dark Mode', entry)
            self.assertIn('Terminal=false', entry)

    @unittest.skipUnless(BASH, 'A shell is needed for shell-artifact checks.')
    def test_macos_bundle_forwards_arguments_without_evaluating_browser_path(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            directory = Path(folder).resolve()
            self.assertTrue(directory.is_relative_to(ROOT))
            browser = directory / "Chrome's $100% executable"
            browser.write_text('#!/bin/sh\nprintf \'%s\\n\' "$@" > "$LAUNCHER_TEST_ARGS"\n', encoding='utf-8', newline='\n')
            browser.chmod(0o755)
            subprocess.run([BASH, 'scripts/install-launcher-macos.command', '--browser', shell_path(browser), '--output-directory', shell_path(directory)], cwd=ROOT, check=True, capture_output=True)
            app = directory / 'Chromium Browser - Native Dark Mode.app'
            with (app / 'Contents/Info.plist').open('rb') as stream:
                info = plistlib.load(stream)
            self.assertEqual(info['CFBundleDisplayName'], 'Chromium Browser - Native Dark Mode')
            executable = app / 'Contents/MacOS' / info['CFBundleExecutable']
            self.assertNotIn(b'\r\n', executable.read_bytes())
            result = directory / 'arguments.txt'
            environment = {**os.environ, 'LAUNCHER_TEST_ARGS': shell_path(result)}
            subprocess.run([BASH, shell_path(executable), 'https://example.com/test?x=1&y=2'], env=environment, check=True, capture_output=True)
            self.assertEqual(result.read_text().splitlines(), ['--silent-debugger-extension-api', 'https://example.com/test?x=1&y=2'])

    @unittest.skipUnless(os.name == 'nt', 'Windows Script Host is required.')
    def test_windows_installer_creates_and_verifies_a_shortcut(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            directory = Path(folder).resolve()
            self.assertTrue(directory.is_relative_to(ROOT))
            browser = directory / 'msedge.exe'
            browser.write_bytes(b'not a real browser; never execute')
            result = subprocess.run(
                ['cmd.exe', '/d', '/c', r'scripts\install-launcher-windows.cmd',
                 '--browser', str(browser), '--output-directory', str(directory)],
                cwd=ROOT, input='\n', check=True, capture_output=True, text=True,
            )
            self.assertIn('Native Dark Mode | Shortcut installer', result.stdout)
            self.assertIn('Output directory', result.stdout)
            self.assertIn('Shortcuts ready for 1 browser.', result.stdout)
            self.assertIn('Press Enter to close...', result.stdout)
            shortcut = directory / 'Chromium Browser - Native Dark Mode.lnk'
            self.assertIn(f'    {shortcut}', result.stdout)
            self.assertTrue(shortcut.is_file())


if __name__ == '__main__':
    unittest.main()
