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
            result = subprocess.run([str(Path(os.environ['SystemRoot']) / 'System32/cscript.exe'), '//nologo', '//E:JScript', str(ROOT / 'scripts/install-launcher-windows.js'), '--browser', str(browser), '--output-directory', str(directory)], check=True, capture_output=True, text=True)
            self.assertIn('Created and verified', result.stdout)
            self.assertTrue((directory / 'Chromium Browser - Native Dark Mode.lnk').is_file())


if __name__ == '__main__':
    unittest.main()
