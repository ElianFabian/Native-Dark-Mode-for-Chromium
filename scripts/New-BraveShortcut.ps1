[CmdletBinding()]
param(
    [string]$OutputDirectory = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$braveCandidates = @(
    (Join-Path $env:ProgramFiles 'BraveSoftware\Brave-Browser\Application\brave.exe')
    (Join-Path ${env:ProgramFiles(x86)} 'BraveSoftware\Brave-Browser\Application\brave.exe')
    (Join-Path $env:LOCALAPPDATA 'BraveSoftware\Brave-Browser\Application\brave.exe')
)
$braveExecutable = $braveCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $braveExecutable) {
    throw 'Brave was not found in a standard installation directory.'
}

$destination = (Resolve-Path -LiteralPath $OutputDirectory).Path
$shortcutPath = Join-Path $destination 'Brave - Native Dark Mode.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $braveExecutable
$shortcut.Arguments = '--silent-debugger-extension-api'
$shortcut.WorkingDirectory = Split-Path -Parent $braveExecutable
$shortcut.IconLocation = "$braveExecutable,0"
$shortcut.Description = 'Start Brave with native dark mode support and debugger-extension banners suppressed.'
$shortcut.WindowStyle = 1
$shortcut.Save()

# Read the saved shortcut back without launching the browser.
$savedShortcut = $shell.CreateShortcut($shortcutPath)
if ($savedShortcut.TargetPath -ne $braveExecutable -or $savedShortcut.Arguments -ne '--silent-debugger-extension-api') {
    throw 'The saved shortcut did not match the requested target and launch argument.'
}

[pscustomobject]@{
    Shortcut = $shortcutPath
    Target = $savedShortcut.TargetPath
    Arguments = $savedShortcut.Arguments
    Verified = $true
}
