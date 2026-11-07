// Windows Script Host JScript: run through the companion CMD, not Node.js.
// Uses only components included in Windows. Never launches or closes the browser.
var shell = new ActiveXObject('WScript.Shell');
var files = new ActiveXObject('Scripting.FileSystemObject');
var destination = '';
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

  var desktop = destination ? '' : shell.SpecialFolders('Desktop');
  destination = files.GetAbsolutePathName(destination || shell.SpecialFolders('Programs'));
  WScript.Echo('Looking for Chromium-based browsers and creating shortcuts for native dark mode.');
  var installed = 0;
  if (browser) {
    if (!files.FileExists(browser)) fail('The browser executable was not found: ' + browser);
    installBrowser('Chromium Browser', browser, desktop);
    installed++;
  } else {
    var browsers = [
      ['Brave', 'brave.exe', 'BraveSoftware/Brave-Browser/Application/brave.exe'],
      ['Google Chrome', 'chrome.exe', 'Google/Chrome/Application/chrome.exe'],
      ['Chromium', 'chromium.exe', 'Chromium/Application/chrome.exe'],
      ['Microsoft Edge', 'msedge.exe', 'Microsoft/Edge/Application/msedge.exe'],
      ['Vivaldi', 'vivaldi.exe', 'Vivaldi/Application/vivaldi.exe'],
      ['Opera', '', 'Programs/Opera/launcher.exe', 'Opera/launcher.exe']
    ];
    for (var candidate = 0; candidate < browsers.length; candidate++) {
      var executable = findBrowser(browsers[candidate]);
      if (executable) {
        installBrowser(browsers[candidate][0], executable, desktop);
        installed++;
      }
    }
  }
  if (!installed) fail('No supported browser installation was found. Use --browser with its executable path.');
  WScript.Echo('Fully exit the target browser before opening its shortcut.');
  WScript.Echo('If the browser honors the launch flag, it suppresses banners for all debugger extensions in that session.');
} catch (error) {
  fail('Launcher installation failed: ' + error.message);
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

function installBrowser(name, executable, desktop) {
  executable = files.GetAbsolutePathName(executable);
  WScript.Echo('Creating shortcuts for ' + name + ' (' + executable + ')');
  createShortcut(destination, name, executable);
  if (desktop && files.FolderExists(desktop) && desktop.toLowerCase() !== destination.toLowerCase()) {
    createShortcut(desktop, name, executable);
  }
}

function createShortcut(directory, name, executable) {
  ensureDirectory(directory);
  var path = files.BuildPath(directory, name + ' - Native Dark Mode.lnk');
  var shortcut = shell.CreateShortcut(path);
  shortcut.TargetPath = executable;
  shortcut.Arguments = '--silent-debugger-extension-api';
  shortcut.WorkingDirectory = files.GetParentFolderName(executable);
  shortcut.IconLocation = executable + ',0';
  shortcut.Description = 'Launch with debugger-extension banner suppression requested.';
  shortcut.WindowStyle = 1;
  shortcut.Save();
  var saved = shell.CreateShortcut(path);
  if (saved.TargetPath.toLowerCase() !== executable.toLowerCase() || saved.Arguments !== '--silent-debugger-extension-api') {
    fail('Shortcut verification failed: ' + path);
  }
  WScript.Echo('Created and verified: ' + path);
}
