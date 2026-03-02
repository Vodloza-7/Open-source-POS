$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$installerRoot = Join-Path $root 'installer\v1.1'
$appOut = Join-Path $installerRoot 'app'
$zipOut = Join-Path $root 'dist\Impartial-POS-v1.1-Installer.zip'

$excludeTop = @('.git', 'node_modules', 'dist', 'installer')
$includeTop = @(
  'api',
  'config',
  'css',
  'db',
  'js',
  'public',
  'src',
  'docker-compose.yml',
  'dnpm.ps1',
  'Launch-POS.cmd',
  'Open-POS.url',
  'package.json',
  'server.js',
  'README.md',
  'QUICK_START.md'
)

Write-Host 'Preparing installer app payload...' -ForegroundColor Cyan
if (Test-Path $appOut) { Remove-Item $appOut -Recurse -Force }
New-Item -ItemType Directory -Path $appOut -Force | Out-Null

foreach ($item in $includeTop) {
  $source = Join-Path $root $item
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination $appOut -Recurse -Force
  }
}

Write-Host 'Creating installer zip...' -ForegroundColor Cyan
$dist = Join-Path $root 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
if (Test-Path $zipOut) { Remove-Item $zipOut -Force }

Compress-Archive -Path (Join-Path $installerRoot '*') -DestinationPath $zipOut -CompressionLevel Optimal

Write-Host "Done: $zipOut" -ForegroundColor Green
