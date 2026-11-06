"""Artifact checks only; these tests do not run a browser or install menu entries."""

import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('launchers', Path(__file__).resolve().parents[1] / 'scripts/install_launcher.py')
launchers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launchers)
PROJECT_ROOT = Path(__file__).resolve().parents[1]


class LauncherTests(unittest.TestCase):
    def test_linux_entry_uses_direct_exec_and_no_terminal(self):
        with tempfile.TemporaryDirectory(dir=PROJECT_ROOT) as folder:
            self.assertTrue(Path(folder).resolve().is_relative_to(PROJECT_ROOT))
            path = launchers.linux_launcher(Path(folder), '/opt/Brave Browser/brave')
            entry = path.read_text(encoding='utf-8')
            self.assertIn('Exec="/opt/Brave Browser/brave" --silent-debugger-extension-api %U', entry)
            self.assertIn('Terminal=false', entry)
            self.assertNotIn('sh -c', entry)

    def test_desktop_exec_escapes_field_codes_and_reserved_characters(self):
        self.assertEqual(launchers.desktop_quote('/opt/100%/brave'), '"/opt/100%%/brave"')
        self.assertIn('\\\\$', launchers.desktop_quote('/opt/$sample/brave'))

    def test_macos_bundle_matches_its_executable_and_quotes_paths(self):
        with tempfile.TemporaryDirectory(dir=PROJECT_ROOT) as folder:
            self.assertTrue(Path(folder).resolve().is_relative_to(PROJECT_ROOT))
            app = launchers.macos_launcher(Path(folder), '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')
            with (app / 'Contents/Info.plist').open('rb') as stream:
                info = plistlib.load(stream)
            executable = app / 'Contents/MacOS' / info['CFBundleExecutable']
            script = executable.read_text(encoding='utf-8')
            self.assertIn("exec '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'", script)
            self.assertIn('--silent-debugger-extension-api "$@"', script)
            self.assertNotIn(b'\r\n', executable.read_bytes())
            self.assertEqual(info['CFBundlePackageType'], 'APPL')


if __name__ == '__main__':
    unittest.main()
