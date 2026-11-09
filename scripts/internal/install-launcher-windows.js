// Windows Script Host JScript: run through the companion CMD, not Node.js.
// Uses only components included in Windows. Never launches or closes the browser.
var shell = new ActiveXObject('WScript.Shell');
var files = new ActiveXObject('Scripting.FileSystemObject');
var environment = shell.Environment('Process');
var useColor = Boolean(environment('WT_SESSION')) && !environment('NO_COLOR');
var destination = '';
var browser = '';
var shortcutToUpdate = '';
var scanDirectory = '';
var restoring = false;
var debuggerFlag = '--silent-debugger-extension-api';
var usage = 'Usage: install-launcher-windows.cmd [--browser PATH] [--create-shortcuts | --output-directory PATH | --update-shortcut PATH | --scan-directory PATH]';

var language = 'en';
var messages = {};

function displayLanguage() {
  try {
    return runPowerShell('$PSUICulture').replace(/^\s+|\s+$/g, '');
  } catch (unavailableLanguage) {
    return '';
  }
}

function runPowerShell(command) {
  var systemDirectory = files.GetParentFolderName(WScript.FullName);
  var powershell = files.BuildPath(systemDirectory, 'WindowsPowerShell\\v1.0\\powershell.exe');
  var process = shell.Exec('"' + powershell + '" -NoLogo -NoProfile -NonInteractive -Command "' + command + '"');
  var output = process.StdOut.ReadAll();
  if (process.ExitCode !== 0) throw new Error('Windows PowerShell failed.');
  return output;
}

function message(english) {
  var key = english.replace(/ +$/, '');
  return messages[key] ? messages[key] + english.slice(key.length) : english;
}

function setLanguage(locale) {
  var base = locale.toLowerCase().split(/[-_.@]/)[0];
  var catalogs = { es: 'es', fr: 'fr', pt: 'pt_PT', it: 'it', zh: 'zh_CN', ja: 'ja', ko: 'ko', de: 'de' };
  if (!Object.prototype.hasOwnProperty.call(catalogs, base)) return;
  try {
    messages = loadMessages(catalogs[base]);
    language = catalogs[base];
  } catch (error) {
    WScript.StdErr.WriteLine('Could not load launcher translations. Using English. ' + error.message);
  }
}

function loadMessages(language) {
  var catalog = {};
  var path = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), 'translations\\windows.' + language + '.json');
  var pathVariable = 'NATIVE_DARK_MODE_CATALOG_PATH';
  var previousPath = environment(pathVariable);
  environment(pathVariable) = path;
  try {
    // Encode the output so Windows Script Host can read it under any console code page.
    var output = runPowerShell("$ErrorActionPreference='Stop'; " +
      "$catalog = Get-Content -Raw -Encoding UTF8 -LiteralPath $env:NATIVE_DARK_MODE_CATALOG_PATH | ConvertFrom-Json; " +
      "$catalog.PSObject.Properties | ForEach-Object { [Uri]::EscapeDataString($_.Name) + '=' + [Uri]::EscapeDataString($_.Value) }");
    var lines = output.split(/\r?\n/);
    for (var index = 0; index < lines.length; index++) {
      var separator = lines[index].indexOf('=');
      if (separator > 0) {
        catalog[decodeURIComponent(lines[index].slice(0, separator))] = decodeURIComponent(lines[index].slice(separator + 1));
      }
    }
  } finally {
    if (previousPath) environment(pathVariable) = previousPath;
    else environment.Remove(pathVariable);
  }
  if (!catalog['Press Enter to close...'] || !/^[a-z]$/.test(catalog['Confirmation key'])) throw new Error(path);
  return catalog;
}

function print(line) {
  WScript.StdOut.WriteLine(line);
}

function finish(status) {
  WScript.StdOut.Write(message('Press Enter to close...'));
  try {
    WScript.StdIn.ReadLine();
  } catch (endOfInput) {
    // A non-interactive caller can close stdin.
  }
  WScript.Quit(status);
}

function color(message, code) {
  return useColor ? '\x1b[' + code + 'm' + message + '\x1b[0m' : message;
}

function fail(detail) {
  WScript.StdErr.WriteLine('\n' + color(message('Error'), '1;31') + '\n  ' + detail + '\n');
  finish(1);
}

function ensureDirectory(path) {
  if (files.FolderExists(path)) return;
  var parent = files.GetParentFolderName(path);
  if (!parent || parent === path) fail(message('Cannot create destination directory.'));
  ensureDirectory(parent);
  files.CreateFolder(path);
}

try {
  var firstArgument = WScript.Arguments.length ? WScript.Arguments(0) : '';
  restoring = firstArgument === '--restore' || firstArgument === '--retry-restore';
  if (firstArgument === '--retry-protected' || firstArgument === '--retry-restore') {
    finish(retryProtectedShortcuts());
  }
  setLanguage(environment('NATIVE_DARK_MODE_LANG') || displayLanguage());
  var createShortcuts = false;
  for (var index = restoring ? 1 : 0; index < WScript.Arguments.length; index++) {
    var argument = WScript.Arguments(index);
    if (argument === '--help') {
      print(message(restoring ? 'Usage: restore-launcher-windows.cmd [--scan-directory PATH] [--browser PATH]' : usage));
      finish(0);
    }
    if (argument === '--create-shortcuts') {
      createShortcuts = true;
      continue;
    }
    if (argument !== '--output-directory' && argument !== '--browser' &&
        argument !== '--update-shortcut' && argument !== '--scan-directory') {
      fail(message('Unknown argument: ') + argument);
    }
    index++;
    if (index >= WScript.Arguments.length || !WScript.Arguments(index)) fail(message('Missing value for ') + argument);
    if (argument === '--output-directory') destination = WScript.Arguments(index);
    else if (argument === '--browser') browser = WScript.Arguments(index);
    else if (argument === '--scan-directory') scanDirectory = WScript.Arguments(index);
    else shortcutToUpdate = WScript.Arguments(index);
  }

  print(color(message(restoring ? 'Native Dark Mode | Shortcut restorer' : 'Native Dark Mode | Shortcut installer'), '1;36'));
  if (restoring && (shortcutToUpdate || createShortcuts || destination)) {
    fail(message('Restore mode only accepts --scan-directory and --browser.'));
  }
  if ((shortcutToUpdate && scanDirectory) || ((shortcutToUpdate || scanDirectory) && (createShortcuts || destination))) {
    fail(message('Choose either an update mode or a shortcut creation mode.'));
  }
  var scanning = restoring || scanDirectory || (!createShortcuts && !destination && !browser);
  showShortcutPurpose(!shortcutToUpdate && !scanning);
  if (shortcutToUpdate) {
    finish(updateShortcut(files.GetAbsolutePathName(shortcutToUpdate)));
  }
  if (scanning) {
    if (scanDirectory && !files.FolderExists(scanDirectory)) fail(message('Folder not found: ') + scanDirectory);
    var directories = scanDirectory ? [[files.GetAbsolutePathName(scanDirectory), true]] : [
      [shell.SpecialFolders('Desktop'), false],
      [shell.SpecialFolders('AllUsersDesktop'), false],
      [shell.SpecialFolders('Programs'), true],
      [shell.SpecialFolders('AllUsersPrograms'), true],
      [shell.ExpandEnvironmentStrings('%APPDATA%\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'), false]
    ];
    finish(updateExistingShortcuts(directories));
  }

  var primaryLocation = destination ? message('Output directory') : message('Start menu');
  var desktop = destination ? '' : shell.SpecialFolders('Desktop');
  destination = files.GetAbsolutePathName(destination || shell.SpecialFolders('Programs'));
  print(browser ? message('Creating shortcuts for the selected browser.') :
    message('Looking for Chromium-based browsers and creating shortcuts for each one found.'));
  var installed = 0;
  if (browser) {
    if (!files.FileExists(browser)) fail(message('The browser executable was not found: ') + browser);
    installBrowser('Chromium Browser', browser, primaryLocation, desktop);
    installed++;
  } else {
    var browsers = [
      ['Brave', 'brave.exe', 'BraveSoftware/Brave-Browser/Application/brave.exe'],
      ['Google Chrome', 'chrome.exe', 'Google/Chrome/Application/chrome.exe'],
      ['Chromium', 'chromium.exe', 'Chromium/Application/chrome.exe'],
      ['Microsoft Edge', 'msedge.exe', 'Microsoft/Edge/Application/msedge.exe'],
      ['Vivaldi', 'vivaldi.exe', 'Vivaldi/Application/vivaldi.exe'],
      ['Opera', '', 'Programs/Opera/opera.exe', 'Programs/Opera/launcher.exe',
        'Opera/opera.exe', 'Opera/launcher.exe']
    ];
    for (var candidate = 0; candidate < browsers.length; candidate++) {
      var executable = findBrowser(browsers[candidate]);
      if (executable) {
        installBrowser(browsers[candidate][0], executable, primaryLocation, desktop);
        installed++;
      }
    }
  }
  if (!installed) fail(message('No supported browser installation was found. Use --browser with its executable path.'));
  print('');
  print(color(message('Done'), '1;32') + '  ' +
    message(installed === 1 ? 'Shortcuts ready for {count} browser.' : 'Shortcuts ready for {count} browsers.')
      .replace('{count}', installed));
  print(message('  Fully exit the browser before opening its new shortcut.'));
  print('');
  finish(0);
} catch (error) {
  fail(message('Launcher installation failed: ') + error.message);
}

function findBrowser(info) {
  var registryRoots = ['HKCU', 'HKLM'];
  if (info[1]) {
    for (var hive = 0; hive < registryRoots.length; hive++) {
      var registered;
      try {
        registered = shell.RegRead((registryRoots[hive] + '/Software/Microsoft/Windows/CurrentVersion/App Paths/').replace(/\//g, '\\') + info[1] + '\\');
      } catch (missingEntry) {
        continue;
      }
      if (files.FileExists(registered)) return registered;
    }
  }
  var locations = ['%LOCALAPPDATA%', '%ProgramFiles%', '%ProgramFiles(x86)%'];
  for (var location = 0; location < locations.length; location++) {
    var directory = shell.ExpandEnvironmentStrings(locations[location]);
    for (var index = 2; index < info.length; index++) {
      var path = files.BuildPath(directory, info[index].replace(/\//g, '\\'));
      if (files.FileExists(path)) return path;
    }
  }
  return '';
}

function installBrowser(name, executable, primaryLocation, desktop) {
  executable = files.GetAbsolutePathName(executable);
  print('');
  print(color(name, '1;36'));
  createShortcut(destination, primaryLocation, name, executable);
  if (desktop && files.FolderExists(desktop) && desktop.toLowerCase() !== destination.toLowerCase()) {
    createShortcut(desktop, message('Desktop'), name, executable);
  }
}

function isBrowserExecutable(executable) {
  if (browser) return files.GetAbsolutePathName(browser).toLowerCase() === executable.toLowerCase();
  return /^(brave|chrome|chromium|msedge|vivaldi|opera)\.exe$/i.test(files.GetFileName(executable)) ||
    /\\Opera\\launcher\.exe$/i.test(executable);
}

function describeShortcut(path, executable) {
  print(message('Shortcut: ') + path);
  print(message('Browser executable: ') + executable);
}

function confirmUpdate(prompt, declinedMessage) {
  WScript.StdOut.Write(message(prompt));
  var answer = WScript.StdIn.AtEndOfStream ? '' : WScript.StdIn.ReadLine();
  if (answer.replace(/^\s+|\s+$/g, '').toLowerCase() === (messages['Confirmation key'] || 'y')) return true;
  print(message(declinedMessage || 'No changes made.'));
  return false;
}

function updateShortcut(path) {
  if (!/\.lnk$/i.test(path) || !files.FileExists(path)) fail(message('Choose an existing .lnk shortcut: ') + path);
  var shortcut = shell.CreateShortcut(path);
  var executable = shortcut.TargetPath;
  if (!/\.exe$/i.test(executable) || !files.FileExists(executable)) {
    fail(message('The browser executable was not found: ') + executable);
  }
  if (!isBrowserExecutable(executable)) {
    fail(message(browser ? 'The shortcut does not point to the selected browser: ' :
      'Unrecognized browser target. Use --browser to confirm its executable path: ') + executable);
  }

  describeShortcut(path, executable);
  var originalArguments = shortcut.Arguments;
  if (hasSwitch(originalArguments, debuggerFlag)) {
    print(message('This shortcut already has the debugger flag.'));
    return 0;
  }
  if (!confirmUpdate('Update only this shortcut? [y/N] ')) return 0;
  return applyShortcutUpdates([{ path: path, executable: executable, args: originalArguments }], true);
}

function hasSwitch(argumentsText, name) {
  var tokens = argumentsText.match(/(?:[^\s"]|"(?:[^"\\]|\\.)*")+/g) || [];
  for (var index = 0; index < tokens.length; index++) {
    var token = tokens[index].replace(/^"|"$/g, '');
    if (token === '--') break;
    if (token === name || token.indexOf(name + '=') === 0) return true;
  }
  return false;
}

function readVerifiedShortcut(path, executable, originalArguments) {
  var shortcut = shell.CreateShortcut(path);
  if (!files.FileExists(path) || shortcut.TargetPath.toLowerCase() !== executable.toLowerCase() ||
      shortcut.Arguments !== originalArguments) {
    throw new Error(message('Shortcut verification failed: ') + path);
  }
  return shortcut;
}

function withDebuggerFlag(args) {
  return debuggerFlag + (args ? ' ' + args : '');
}

function writeShortcut(path, executable, originalArguments) {
  var shortcut = readVerifiedShortcut(path, executable, originalArguments);
  var backup = path + '.bak';
  if (files.FileExists(backup)) throw new Error(message('Backup already exists. Move it before trying again: ') + backup);

  files.CopyFile(path, backup, false);
  print('  ' + message('Original shortcut backup'));
  print('    ' + backup);
  var updatedArguments = withDebuggerFlag(originalArguments);
  try {
    shortcut.Arguments = updatedArguments;
    shortcut.Save();
    var saved = shell.CreateShortcut(path);
    if (saved.TargetPath.toLowerCase() !== executable.toLowerCase() || saved.Arguments !== updatedArguments) {
      throw new Error(message('Shortcut verification failed: ') + path);
    }
  } catch (error) {
    try {
      files.CopyFile(backup, path, true);
      files.DeleteFile(backup);
    } catch (restoreError) {
      throw new Error(error.message + ' (' + message('Original shortcut backup') + ' ' + backup + ')');
    }
    throw error;
  }
  print('  ' + color(message('Shortcut updated and verified.'), '32'));
}

function restoreShortcut(path, executable, args) {
  readVerifiedShortcut(path, executable, args);
  var backup = path + '.bak';
  // Windows Script Host needs a .lnk extension to inspect a shortcut.
  var temporaryLink = files.BuildPath(files.GetSpecialFolder(2).Path, files.GetTempName() + '.lnk');
  files.CopyFile(backup, temporaryLink, false);
  try {
    var original = shell.CreateShortcut(temporaryLink);
    var originalArgs = original.Arguments;
    if (original.TargetPath.toLowerCase() !== executable.toLowerCase() ||
        hasSwitch(originalArgs, debuggerFlag) || withDebuggerFlag(originalArgs) !== args) {
      throw new Error(message('The shortcut no longer matches its backup: ') + path);
    }
    // Restore the exact copy we inspected and keep the backup until verification passes.
    readVerifiedShortcut(path, executable, args);
    files.CopyFile(temporaryLink, path, true);
    readVerifiedShortcut(path, executable, originalArgs);
  } finally {
    files.DeleteFile(temporaryLink);
  }
  print('  ' + color(message('Shortcut restored and verified.'), '32'));
  try {
    files.DeleteFile(backup);
  } catch (error) {
    WScript.StdErr.WriteLine('  ' + message('The shortcut was restored, but the backup could not be removed: ') + backup);
  }
}

function showRestartInstructions() {
  print('');
  print(color(message('Next steps'), '1;36'));
  print('  ' + message('Fully exit the browser before reopening it from this shortcut.'));
}

function showShortcutPurpose(creating) {
  print('');
  if (restoring) {
    print(message('Restoring means replacing each selected shortcut with its original .lnk.bak copy.'));
    print(message('The original launch arguments are restored, removing {flag} from those shortcuts.').replace('{flag}', debuggerFlag));
    print(message('After restarting from a restored shortcut, the browser can show the debugger banner again when Native mode is used.'));
  } else {
    print(message(creating ? 'This creates separate browser shortcuts with {flag}.' :
      'This adds {flag} to the listed browser shortcuts.').replace('{flag}', debuggerFlag));
    if (!creating) print(message('The original shortcuts are backed up as .lnk.bak files and their existing arguments are kept.'));
    print(message('Native mode uses the browser debugger. This flag hides its banner for all debugger extensions in that session if the browser supports it.'));
  }
  print('');
}

function updateExistingShortcuts(directories) {
  var candidates = [];
  var seen = {};
  var failed = false;
  function report(prefix, path, error) {
    failed = true;
    WScript.StdErr.WriteLine(message(prefix) + path + ' (' + error.message + ')');
  }

  function scan(directory, recursive) {
    if (!directory || !files.FolderExists(directory)) return;
    try {
      var folder = files.GetFolder(directory);
      for (var entries = new Enumerator(folder.Files); !entries.atEnd(); entries.moveNext()) {
        var path = entries.item().Path;
        if (!/\.lnk$/i.test(path) || seen[path.toLowerCase()]) continue;
        seen[path.toLowerCase()] = true;
        try {
          var shortcut = shell.CreateShortcut(path);
          var executable = shortcut.TargetPath;
          if (!executable || !isBrowserExecutable(executable) || !files.FileExists(executable)) continue;
          var args = shortcut.Arguments;
          if (restoring) {
            if (!hasSwitch(args, debuggerFlag) || !files.FileExists(path + '.bak')) continue;
          } else if (hasSwitch(args, debuggerFlag) || hasSwitch(args, '--app') || hasSwitch(args, '--app-id')) continue;
          candidates.push({ path: path, executable: executable, args: args });
        } catch (error) {
          report('Could not inspect: ', path, error);
        }
      }
      if (recursive) {
        for (var subfolders = new Enumerator(folder.SubFolders); !subfolders.atEnd(); subfolders.moveNext()) {
          var child = subfolders.item();
          if (!(child.Attributes & 1024)) scan(child.Path, true); // Skip junctions and other reparse points.
        }
      }
    } catch (error) {
      report('Could not inspect: ', directory, error);
    }
  }

  print(message(restoring ? 'Looking for shortcuts with backups.' : 'Looking for existing browser shortcuts.'));
  for (var index = 0; index < directories.length; index++) scan(directories[index][0], directories[index][1]);
  if (!candidates.length) {
    print(message(restoring ? 'No shortcuts with backups need restoring.' : 'No browser shortcuts need updating.'));
    return failed ? 1 : 0;
  }
  showShortcutList(candidates, restoring ? 'Shortcuts to restore' : 'Shortcuts to update');
  if (!confirmUpdate(restoring ? 'Restore the shortcuts listed above? [y/N] ' :
                     'Update the shortcuts listed above? [y/N] ')) return failed ? 1 : 0;
  var status = applyShortcutUpdates(candidates, true);
  return failed ? 1 : status;
}

function showShortcutList(candidates, heading) {
  candidates.sort(function (left, right) {
    return left.executable.toLowerCase().localeCompare(right.executable.toLowerCase()) ||
      left.path.toLowerCase().localeCompare(right.path.toLowerCase());
  });
  print('');
  print(color(message(heading), '1;36'));
  var previousExecutable = '';
  for (var index = 0; index < candidates.length; index++) {
    var candidate = candidates[index];
    var executable = candidate.executable.toLowerCase();
    if (executable !== previousExecutable) {
      print('');
      print('  ' + color(files.GetFileName(candidate.executable), '1;36'));
      print('    ' + candidate.executable);
      previousExecutable = executable;
    }
    print('    - ' + candidate.path);
  }
  print('');
}

function applyShortcutUpdates(candidates, offerElevation) {
  print('');
  print(color(message(restoring ? 'Restore results' : 'Update results'), '1;36'));
  var updated = false;
  var failed = false;
  var pending = [];
  for (var index = 0; index < candidates.length; index++) {
    var candidate = candidates[index];
    print('');
    print(candidate.path);
    try {
      if (restoring) restoreShortcut(candidate.path, candidate.executable, candidate.args);
      else writeShortcut(candidate.path, candidate.executable, candidate.args);
      updated = true;
    } catch (error) {
      failed = true;
      WScript.StdErr.WriteLine('  ' + color(message(restoring ? 'Could not restore the shortcut.' :
        'Could not update the shortcut.'), '1;31'));
      var accessDenied = error.number === 70 || (error.number >>> 0) === 0x800A0046 ||
        (error.number >>> 0) === 0x80070005;
      if (accessDenied) pending.push(candidate);
      WScript.StdErr.WriteLine('    ' + (accessDenied ?
        message('Windows denied write access. Shared shortcuts may require administrator permissions.') : error.message));
    }
  }
  if (updated) showRestartInstructions();
  if (offerElevation && pending.length) offerProtectedRetry(pending);
  print('');
  return failed ? 1 : 0;
}

function offerProtectedRetry(pending) {
  showShortcutList(pending, 'Shortcuts pending because Windows denied write access');
  print(message(restoring ? 'The administrator console will ask you to confirm before restoring any shortcut.' :
    'The administrator console will ask you to confirm before updating any shortcut.'));
  if (!confirmUpdate('Open a separate administrator console for these shortcuts? [y/N] ',
                     'Pending shortcuts were left unchanged.')) return;
  // Call the script host directly, keeping shortcut paths and arguments out of cmd.exe.
  var command = '//nologo //E:JScript "' + WScript.ScriptFullName + '" ' +
    (restoring ? '--retry-restore ' : '--retry-protected ') + language;
  for (var index = 0; index < pending.length; index++) {
    var candidate = pending[index];
    command += ' ' + encodeURIComponent(candidate.path) + ' ' +
      encodeURIComponent(candidate.executable) + ' args=' + encodeURIComponent(candidate.args);
  }
  try {
    new ActiveXObject('Shell.Application').ShellExecute(WScript.FullName, command, '', 'runas', 1);
  } catch (error) {
    WScript.StdErr.WriteLine(message('Could not open the administrator console: ') + error.message);
  }
}

function retryProtectedShortcuts() {
  var args = WScript.Arguments;
  if (args.length > 1) setLanguage(args(1));
  if (args.length < 5 || (args.length - 2) % 3 !== 0) fail(message('Invalid shortcut retry request.'));
  var candidates = [];
  for (var index = 2; index < args.length; index += 3) {
    var path = decodeURIComponent(args(index));
    var executable = decodeURIComponent(args(index + 1));
    var argumentToken = args(index + 2);
    if (argumentToken.indexOf('args=') !== 0) fail(message('Invalid shortcut retry request.'));
    var originalArguments = decodeURIComponent(argumentToken.slice(5));
    if (!/\.lnk$/i.test(path) || !/\.exe$/i.test(executable) ||
        files.GetAbsolutePathName(path).toLowerCase() !== path.toLowerCase() ||
        !files.FileExists(path) || !files.FileExists(executable)) {
      fail(message('Invalid shortcut retry request.'));
    }
    candidates.push({ path: path, executable: executable, args: originalArguments });
  }
  print(color(message(restoring ? 'Native Dark Mode | Shortcut restorer' : 'Native Dark Mode | Shortcut installer'), '1;36'));
  showShortcutPurpose(false);
  showShortcutList(candidates, restoring ? 'Shortcuts to restore' : 'Shortcuts to update');
  if (!confirmUpdate(restoring ? 'Restore these shortcuts with administrator permissions? [y/N] ' :
                     'Update these shortcuts with administrator permissions? [y/N] ')) return 0;
  return applyShortcutUpdates(candidates, false);
}

function createShortcut(directory, location, name, executable) {
  ensureDirectory(directory);
  var path = files.BuildPath(directory, name + ' - Native Dark Mode.lnk');
  var shortcut = shell.CreateShortcut(path);
  shortcut.TargetPath = executable;
  shortcut.Arguments = debuggerFlag;
  shortcut.WorkingDirectory = files.GetParentFolderName(executable);
  shortcut.IconLocation = executable + ',0';
  shortcut.Description = 'Launch with debugger-extension banner suppression requested.';
  shortcut.WindowStyle = 1;
  shortcut.Save();
  var saved = shell.CreateShortcut(path);
  if (saved.TargetPath.toLowerCase() !== executable.toLowerCase() || saved.Arguments !== debuggerFlag) {
    fail(message('Shortcut verification failed: ') + path);
  }
  print('  ' + color(location, '32') + message('  (created and verified)'));
  print('    ' + path);
}
