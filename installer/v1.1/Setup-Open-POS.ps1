$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appSource = Join-Path $scriptRoot 'app'
$installRoot = 'C:\ImpartialPOS'
$appTarget = Join-Path $installRoot 'app'
$launchTarget = Join-Path $installRoot 'Launch-POS.cmd'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Impartial POS.lnk'

function Write-Step($msg) {
  Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Test-CommandAvailable($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Install-Node {
  if (Test-CommandAvailable 'node') {
    Write-Host "Node.js already installed: $(node --version)" -ForegroundColor Green
    return
  }

  Write-Step 'Installing Node.js LTS'
  $nodeMsi = Join-Path $scriptRoot 'prerequisites\node-lts.msi'

  if (Test-Path $nodeMsi) {
    Write-Host 'Using bundled node-lts.msi...' -ForegroundColor Yellow
    Start-Process msiexec.exe -ArgumentList '/i', $nodeMsi, '/qn', '/norestart' -Wait
  } elseif (Test-CommandAvailable 'winget') {
    Write-Host 'Using winget to install Node.js LTS...' -ForegroundColor Yellow
    & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  } else {
    Write-Host 'Node.js installer not found and winget unavailable.' -ForegroundColor Red
    Write-Host 'Opening Node.js download page...' -ForegroundColor Yellow
    Start-Process 'https://nodejs.org/en/download'
    throw 'Please install Node.js LTS, then run installer again.'
  }

  $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
  if (-not (Test-CommandAvailable 'node')) {
    throw 'Node.js installation did not complete correctly.'
  }

  Write-Host "Node.js installed: $(node --version)" -ForegroundColor Green
}

function Test-XamppInstalled {
  return (Test-Path 'C:\xampp\xampp-control.exe') -or (Test-Path 'C:\xampp\mysql\bin\mysqld.exe')
}

function Install-Xampp {
  if (Test-XamppInstalled) {
    Write-Host 'XAMPP already installed.' -ForegroundColor Green
    return
  }

  Write-Step 'Installing XAMPP'
  $xamppExe = Join-Path $scriptRoot 'prerequisites\xampp-installer.exe'

  if (Test-Path $xamppExe) {
    Write-Host 'Launching bundled XAMPP installer...' -ForegroundColor Yellow
    Start-Process $xamppExe -Wait
  } elseif (Test-CommandAvailable 'winget') {
    Write-Host 'Trying winget XAMPP install...' -ForegroundColor Yellow
    try {
      & winget install -e --id ApacheFriends.Xampp --accept-source-agreements --accept-package-agreements --silent
    } catch {
      Write-Host 'Winget XAMPP package not available on this machine.' -ForegroundColor Yellow
    }
  }

  if (-not (Test-XamppInstalled)) {
    Write-Host 'Opening XAMPP download page for manual install...' -ForegroundColor Yellow
    Start-Process 'https://www.apachefriends.org/download.html'
    throw 'Please install XAMPP, then run installer again.'
  }

  Write-Host 'XAMPP installation detected.' -ForegroundColor Green
}

function Deploy-App {
  if (-not (Test-Path $appSource)) {
    throw "App package folder not found: $appSource"
  }

  Write-Step 'Deploying application files'
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  if (Test-Path $appTarget) {
    Remove-Item -Path $appTarget -Recurse -Force
  }
  New-Item -ItemType Directory -Path $appTarget -Force | Out-Null

  Copy-Item -Path (Join-Path $appSource '*') -Destination $appTarget -Recurse -Force
  Write-Host "App deployed to $appTarget" -ForegroundColor Green
}

function Install-AppDependencies {
  Write-Step 'Installing application dependencies'
  Push-Location $appTarget
  try {
    & npm.cmd install --omit=dev
  } finally {
    Pop-Location
  }
}

function Write-Launcher {
  Write-Step 'Creating launcher'
  $launcher = @"
@echo off
setlocal
cd /d "$appTarget"
call "Launch-POS.cmd"
endlocal
"@
  Set-Content -Path $launchTarget -Value $launcher -Encoding ASCII
  Write-Host "Launcher created: $launchTarget" -ForegroundColor Green
}

function Create-DesktopShortcut {
  Write-Step 'Creating desktop shortcut'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  $shortcut.TargetPath = $launchTarget
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.IconLocation = "C:\Windows\System32\SHELL32.dll,13"
  $shortcut.Save()
  Write-Host "Desktop shortcut created: $desktopShortcut" -ForegroundColor Green
}

function Show-FinalSteps {
  Write-Step 'Installation finished'
  Write-Host '1) Start XAMPP Control Panel and run MySQL' -ForegroundColor White
  Write-Host '2) Double-click "Impartial POS" shortcut on desktop' -ForegroundColor White
  Write-Host '3) App opens in browser/PWA mode via local server' -ForegroundColor White
}

Write-Host 'Impartial POS v1.1 Installer' -ForegroundColor Magenta
Install-Node
Install-Xampp
Deploy-App
Install-AppDependencies
Write-Launcher
Create-DesktopShortcut
Show-FinalSteps
