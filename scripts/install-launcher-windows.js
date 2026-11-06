// Windows Script Host JScript: run through the companion CMD, not Node.js.
// Uses only components included in Windows. Never launches or closes Brave.
var shell = new ActiveXObject('WScript.Shell');
var files = new ActiveXObject('Scripting.FileSystemObject');
var destination = shell.SpecialFolders('Programs');
var browser = '';

function fail(message) {
  WScript.Echo(message);
  WScript.Quit(1);
}

function ensureDirectory(path) {
  if (files.FolderExists(path)) return;
  var parent = files.GetParentFolderName(path);
  if (!parent || parent === path) fail('Cannot create destination directory.');
  ensureDirectory(parent);
  files.CreateFolder(path);
}

try {
  for (var index = 0; index < WScript.Arguments.length; index++) {
    var argument = WScript.Arguments(index);
    if (argument === '--help') {
      WScript.Echo('Usage: install-launcher-windows.cmd [--output-directory PATH] [--browser PATH]');
      WScript.Quit(0);
    }
    if (argument !== '--output-directory' && argument !== '--browser') fail('Unknown argument: ' + argument);
    index++;
    if (index >= WScript.Arguments.length) fail('Missing value for ' + argument);
    if (argument === '--output-directory') destination = WScript.Arguments(index);
    else browser = WScript.Arguments(index);
  }

  if (!browser) {
    var candidates = [
      '%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '%ProgramFiles(x86)%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ];
    for (var candidate = 0; candidate < candidates.length; candidate++) {
      var expanded = shell.ExpandEnvironmentStrings(candidates[candidate]);
      if (files.FileExists(expanded)) { browser = expanded; break; }
    }
  }
  if (!browser || !files.FileExists(browser)) fail('Brave was not found. Use --browser with its executable path.');
  browser = files.GetAbsolutePathName(browser);
  destination = files.GetAbsolutePathName(destination);
  ensureDirectory(destination);
  var path = files.BuildPath(destination, 'Brave - Native Dark Mode.lnk');
  var shortcut = shell.CreateShortcut(path);
  shortcut.TargetPath = browser;
  shortcut.Arguments = '--silent-debugger-extension-api';
  shortcut.WorkingDirectory = files.GetParentFolderName(browser);
  shortcut.IconLocation = browser + ',0';
  shortcut.Description = 'Brave with debugger-extension banners suppressed.';
  shortcut.WindowStyle = 1;
  shortcut.Save();
  var saved = shell.CreateShortcut(path);
  if (saved.TargetPath.toLowerCase() !== browser.toLowerCase() || saved.Arguments !== '--silent-debugger-extension-api') {
    fail('Shortcut verification failed.');
  }
  WScript.Echo('Created and verified: ' + path);
  WScript.Echo('Fully exit Brave before opening the launcher. All debugger-extension banners are suppressed for that launch.');
  WScript.Echo('Brave has not been launched or closed. Existing shortcuts and browser defaults were not changed.');
} catch (error) {
  fail('Launcher installation failed: ' + error.message);
}
