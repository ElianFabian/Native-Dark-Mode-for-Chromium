"""Development-only tests: installers themselves do not require Python."""

import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
GIT_BASH = Path('C:/Program Files/Git/bin/bash.exe')
BASH = str(GIT_BASH) if os.name == 'nt' and GIT_BASH.exists() else shutil.which('bash')


def shell_path(path):
    if os.name == 'nt':
        return subprocess.check_output([BASH, '-c', 'cygpath -u "$1"', 'path', str(path)], text=True).strip()
    return str(path)


class NativeLauncherTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows Script Host is required.')
    def test_windows_launcher_loads_supported_catalogs_and_falls_back_to_english(self):
        script = ROOT / 'scripts/internal/install-launcher-windows.js'
        locales = {
            'en-US': 'Usage:', 'es-MX': 'Uso:', 'fr-CA': 'Utilisation :', 'pt-PT': 'Utilização:',
            'it-IT': 'Uso:', 'zh-CN': '用法：', 'ja-JP': '使い方:', 'ko-KR': '사용법:',
            'de-DE': 'Verwendung:', 'nl-NL': 'Usage:',
        }
        catalogs = list((script.parent / 'translations').glob('windows.*.json'))
        self.assertEqual({path.stem.split('.')[-1] for path in catalogs},
                         {path.stem for path in (ROOT / 'extension/translations').glob('*.json')} - {'en'})
        expected_keys = set(json.loads(catalogs[0].read_text(encoding='utf-8')))
        for catalog in catalogs:
            self.assertEqual(set(json.loads(catalog.read_text(encoding='utf-8'))), expected_keys, catalog.name)
        for locale, prefix in locales.items():
            with self.subTest(locale=locale):
                result = subprocess.run(
                    ['cscript.exe', '//nologo', '//U', '//E:JScript', str(script), '--help'],
                    cwd=ROOT, env={**os.environ, 'NATIVE_DARK_MODE_LANG': locale},
                    input='\n', encoding='utf-16-le', capture_output=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
                self.assertTrue(result.stdout.lstrip('\ufeff').startswith(prefix), result.stdout)

    @unittest.skipUnless(os.name == 'nt', 'Windows Script Host is required.')
    def test_windows_detects_opera_installed_with_opera_exe(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            directory = Path(folder)
            local_data = directory / 'local'
            opera = local_data / 'Programs' / 'Opera' / 'opera.exe'
            opera.parent.mkdir(parents=True)
            opera.touch()
            output = directory / 'shortcuts'
            subprocess.run(
                ['cmd.exe', '/d', '/c', r'scripts\install-launcher-windows.cmd',
                 '--output-directory', str(output)],
                cwd=ROOT, env={**os.environ, 'LOCALAPPDATA': str(local_data)},
                input='\n', check=True, capture_output=True, text=True,
            )
            self.assertTrue((output / 'Opera - Native Dark Mode.lnk').is_file())

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
                'NATIVE_DARK_MODE_LANG': 'en',
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
                cwd=ROOT, env={**os.environ, 'NATIVE_DARK_MODE_LANG': 'en'},
                input='\n', check=True, capture_output=True, text=True,
            )
            self.assertIn('Native Dark Mode | Shortcut installer', result.stdout)
            self.assertIn('Output directory', result.stdout)
            self.assertIn('Shortcuts ready for 1 browser.', result.stdout)
            self.assertIn('Press Enter to close...', result.stdout)
            shortcut = directory / 'Chromium Browser - Native Dark Mode.lnk'
            self.assertIn(f'    {shortcut}', result.stdout)
            self.assertTrue(shortcut.is_file())

    @unittest.skipUnless(os.name == 'nt', 'Windows Script Host is required.')
    def test_windows_installer_updates_only_the_confirmed_shortcut(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as folder:
            directory = Path(folder)
            browser = directory / 'brave.exe'
            browser.touch()
            shortcut = directory / 'My browser.lnk'
            nested = directory / 'Start menu folder'
            nested.mkdir()
            other = nested / 'Another browser.lnk'
            edge = directory / 'msedge.exe'
            edge.touch()
            edge_shortcut = directory / 'Edge.lnk'
            unrelated = directory / 'editor.exe'
            unrelated.touch()
            unrelated_shortcut = directory / 'Editor.lnk'
            backup = directory / 'My browser.lnk.bak'
            helper = directory / 'shortcut.js'
            helper.write_text(
                "var link = new ActiveXObject('WScript.Shell').CreateShortcut(WScript.Arguments(0));\n"
                "if (WScript.Arguments.length === 2) {\n"
                "  link.TargetPath = WScript.Arguments(1);\n"
                "  link.Arguments = '--profile-directory=\"Profile 2\" -- https://example.com';\n"
                "  link.Save();\n"
                "} else { WScript.Echo(link.TargetPath); WScript.Echo(link.Arguments); }\n",
                encoding='ascii',
            )
            inspect = ['cscript.exe', '//nologo', str(helper)]
            for link, executable in [(shortcut, browser), (other, browser), (edge_shortcut, edge),
                                     (unrelated_shortcut, unrelated)]:
                subprocess.run([*inspect, str(link), str(executable)], check=True, capture_output=True)
            original = shortcut.read_bytes()
            other_original = other.read_bytes()
            original_target, original_arguments = subprocess.check_output(
                [*inspect, str(shortcut)], text=True,
            ).splitlines()
            install = ['cmd.exe', '/d', '/c', r'scripts\install-launcher-windows.cmd',
                       '--update-shortcut', str(shortcut)]
            options = dict(cwd=ROOT, env={**os.environ, 'NATIVE_DARK_MODE_LANG': 'en'},
                           capture_output=True, text=True)

            mismatch = subprocess.run([*install, '--browser', str(directory / 'chrome.exe')],
                                      input='y\n\n', **options)
            self.assertNotEqual(mismatch.returncode, 0)
            self.assertIn('does not point to the selected browser', mismatch.stderr)
            subprocess.run(install, input='n\n\n', check=True, **options)
            self.assertEqual(shortcut.read_bytes(), original)
            self.assertFalse(backup.exists())

            updated = subprocess.run(install, input='y\n\n', check=True, **options)
            self.assertIn('Shortcut updated and verified.', updated.stdout)
            self.assertEqual(backup.read_bytes(), original)
            self.assertEqual(other.read_bytes(), other_original)
            target, arguments = subprocess.check_output([*inspect, str(shortcut)], text=True).splitlines()
            self.assertEqual(target, original_target)
            self.assertEqual(arguments, '--silent-debugger-extension-api ' + original_arguments)

            repeated = subprocess.run(install, input='\n', check=True, **options)
            self.assertIn('already has the debugger flag', repeated.stdout)
            self.assertEqual(backup.read_bytes(), original)

            scan = [*install[:-2], '--scan-directory', str(directory)]
            cancelled = subprocess.run(scan, input='\n\n', check=True, **options)
            self.assertIn('No changes made.', cancelled.stdout)
            self.assertEqual(other.read_bytes(), other_original)
            unrelated_original = unrelated_shortcut.read_bytes()
            edge_original = edge_shortcut.read_bytes()
            batch = subprocess.run(scan, input='y\n\n', check=True, **options)
            self.assertEqual(batch.stdout.count('Update the shortcuts listed above?'), 1)
            self.assertLess(
                batch.stdout.index('This adds --silent-debugger-extension-api'),
                batch.stdout.index('Update the shortcuts listed above?'),
            )
            self.assertEqual(batch.stdout.count('Shortcut updated and verified.'), 2)
            self.assertEqual(other.with_suffix('.lnk.bak').read_bytes(), other_original)
            self.assertEqual(edge_shortcut.with_suffix('.lnk.bak').read_bytes(), edge_original)
            self.assertEqual(unrelated_shortcut.read_bytes(), unrelated_original)
            self.assertFalse(unrelated_shortcut.with_suffix('.lnk.bak').exists())
            repeated_scan = subprocess.run(scan, input='\n', check=True, **options)
            self.assertIn('No browser shortcuts need updating.', repeated_scan.stdout)

            retry_shortcut = directory / 'Pending shortcut.lnk'
            subprocess.run([*inspect, str(retry_shortcut), str(browser)], check=True, capture_output=True)
            retry_original = retry_shortcut.read_bytes()
            retry = [
                'cscript.exe', '//nologo', '//E:JScript',
                str(ROOT / 'scripts/internal/install-launcher-windows.js'), '--retry-protected', 'en',
                quote(str(retry_shortcut), safe=''), quote(original_target, safe=''),
                'args=' + quote(original_arguments, safe=''),
            ]
            declined = subprocess.run(retry, input='n\n\n', check=True, **options)
            self.assertIn('Update these shortcuts with administrator permissions?', declined.stdout)
            self.assertEqual(retry_shortcut.read_bytes(), retry_original)
            self.assertFalse(retry_shortcut.with_suffix('.lnk.bak').exists())
            approved = subprocess.run(retry, input='y\n\n', check=True, **options)
            self.assertIn('Shortcut updated and verified.', approved.stdout)
            self.assertEqual(retry_shortcut.with_suffix('.lnk.bak').read_bytes(), retry_original)

            restore = ['cmd.exe', '/d', '/c', r'scripts\restore-launcher-windows.cmd',
                       '--scan-directory', str(directory)]
            declined_restore = subprocess.run(restore, input='n\n\n', check=True, **options)
            self.assertIn('Restore the shortcuts listed above?', declined_restore.stdout)
            self.assertEqual(backup.read_bytes(), original)
            self.assertNotEqual(shortcut.read_bytes(), original)

            edge_backup = edge_shortcut.with_suffix('.lnk.bak')
            edge_updated = edge_shortcut.read_bytes()
            edge_backup.write_bytes(original)
            restored = subprocess.run(restore, input='y\n\n', **options)
            self.assertNotEqual(restored.returncode, 0)
            self.assertIn('The shortcut no longer matches its backup', restored.stderr)
            self.assertEqual(edge_shortcut.read_bytes(), edge_updated)
            for link, contents in [(shortcut, original), (other, other_original), (retry_shortcut, retry_original)]:
                self.assertEqual(link.read_bytes(), contents)
                self.assertFalse(link.with_suffix('.lnk.bak').exists())
            self.assertEqual(unrelated_shortcut.read_bytes(), unrelated_original)

            edge_backup.write_bytes(edge_original)
            spanish_options = {**options, 'env': {**options['env'], 'NATIVE_DARK_MODE_LANG': 'es'}}
            restored_spanish = subprocess.run(restore, input='s\n\n', check=True, **spanish_options)
            self.assertLess(
                restored_spanish.stdout.index('Restaurar significa sustituir cada acceso seleccionado por su copia original .lnk.bak.'),
                restored_spanish.stdout.index('Restaurar los accesos indicados arriba?'),
            )
            self.assertIn('Acceso directo restaurado y verificado.', restored_spanish.stdout)
            self.assertEqual(edge_shortcut.read_bytes(), edge_original)
            self.assertFalse(edge_backup.exists())
            repeated_restore = subprocess.run(restore, input='\n', check=True, **options)
            self.assertIn('No shortcuts with backups need restoring.', repeated_restore.stdout)


if __name__ == '__main__':
    unittest.main()
