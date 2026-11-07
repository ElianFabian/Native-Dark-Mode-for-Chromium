// Windows Script Host JScript: run through the companion CMD, not Node.js.
// Uses only components included in Windows. Never launches or closes the browser.
var shell = new ActiveXObject('WScript.Shell');
var files = new ActiveXObject('Scripting.FileSystemObject');
var environment = shell.Environment('Process');
var useColor = Boolean(environment('WT_SESSION')) && !environment('NO_COLOR');
var destination = '';
var browser = '';

var spanishMessages = {
  "Cannot create destination directory.": "No se puede crear la carpeta de destino.",
  "Usage: install-launcher-windows.cmd [--output-directory PATH] [--browser PATH]": "Uso: install-launcher-windows.cmd [--output-directory PATH] [--browser PATH]",
  "Unknown argument: ": "Argumento desconocido: ",
  "Missing value for ": "Falta el valor de ",
  "Output directory": "Carpeta de destino",
  "Start menu": "Men\u00fa Inicio",
  "Creating shortcuts for the selected browser.": "Creando accesos directos para el navegador seleccionado.",
  "Looking for Chromium-based browsers and creating shortcuts for each one found.": "Buscando navegadores basados en Chromium para crear sus accesos directos.",
  "The browser executable was not found: ": "No se encontr\u00f3 el ejecutable del navegador: ",
  "No supported browser installation was found. Use --browser with its executable path.": "No se encontr\u00f3 ning\u00fan navegador compatible. Usa --browser con la ruta del ejecutable.",
  "Done": "Listo",
  "  Fully exit the browser before opening its new shortcut.": "  Cierra el navegador por completo antes de abrir su nuevo acceso directo.",
  "  If supported, the flag hides all debugger-extension banners for that session.": "  Si el navegador admite el par\u00e1metro, se ocultan los avisos de depuraci\u00f3n de extensiones durante esa sesi\u00f3n.",
  "Launcher installation failed: ": "No se pudieron instalar los accesos directos: ",
  "Desktop": "Escritorio",
  "Shortcut verification failed: ": "No se pudo verificar el acceso directo: ",
  "  (created and verified)": "  (creado y verificado)",
  "Native Dark Mode | Shortcut installer": "Native Dark Mode | Instalador de accesos directos",
  "Shortcuts ready for {count} browser.": "Accesos directos listos para {count} navegador.",
  "Shortcuts ready for {count} browsers.": "Accesos directos listos para {count} navegadores.",
  "Press Enter to close...": "Pulsa Enter para cerrar..."
};
var locale = environment('NATIVE_DARK_MODE_LANG') || userLocale();
var useSpanish = /^es(?:[-_.@]|$)/i.test(locale);

function userLocale() {
  try {
    return shell.RegRead('HKCU\\Control Panel\\International\\LocaleName');
  } catch (missingLocale) {
    return 'en';
  }
}

function message(english) {
  return useSpanish && spanishMessages[english] || english;
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

function fail(message) {
  WScript.StdErr.WriteLine('\n' + color('Error', '1;31') + '\n  ' + message + '\n');
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
  for (var index = 0; index < WScript.Arguments.length; index++) {
    var argument = WScript.Arguments(index);
    if (argument === '--help') {
      WScript.Echo(message('Usage: install-launcher-windows.cmd [--output-directory PATH] [--browser PATH]'));
      finish(0);
    }
    if (argument !== '--output-directory' && argument !== '--browser') fail(message('Unknown argument: ') + argument);
    index++;
    if (index >= WScript.Arguments.length) fail(message('Missing value for ') + argument);
    if (argument === '--output-directory') destination = WScript.Arguments(index);
    else browser = WScript.Arguments(index);
  }

  var primaryLocation = destination ? message('Output directory') : message('Start menu');
  var desktop = destination ? '' : shell.SpecialFolders('Desktop');
  destination = files.GetAbsolutePathName(destination || shell.SpecialFolders('Programs'));
  WScript.Echo(color(message('Native Dark Mode | Shortcut installer'), '1;36'));
  WScript.Echo(browser ? message('Creating shortcuts for the selected browser.') :
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
  WScript.Echo('');
  WScript.Echo(color(message('Done'), '1;32') + '  ' +
    message(installed === 1 ? 'Shortcuts ready for {count} browser.' : 'Shortcuts ready for {count} browsers.')
      .replace('{count}', installed));
  WScript.Echo(message('  Fully exit the browser before opening its new shortcut.'));
  WScript.Echo(message('  If supported, the flag hides all debugger-extension banners for that session.'));
  WScript.Echo('');
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
  WScript.Echo('');
  WScript.Echo(color(name, '1;36'));
  createShortcut(destination, primaryLocation, name, executable);
  if (desktop && files.FolderExists(desktop) && desktop.toLowerCase() !== destination.toLowerCase()) {
    createShortcut(desktop, message('Desktop'), name, executable);
  }
}

function createShortcut(directory, location, name, executable) {
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
    fail(message('Shortcut verification failed: ') + path);
  }
  WScript.Echo('  ' + color(location, '32') + message('  (created and verified)'));
  WScript.Echo('    ' + path);
}
