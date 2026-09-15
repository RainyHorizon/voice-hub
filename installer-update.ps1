param(
  [Parameter(Mandatory=$true)][string]$InstallDirectory,
  [Parameter(Mandatory=$true)][int]$ParentProcessId,
  [Parameter(Mandatory=$true)][string]$SetupUrl,
  [Parameter(Mandatory=$true)][string]$ChecksumUrl,
  [Parameter(Mandatory=$true)][string]$Version,
  [Parameter(Mandatory=$true)][string]$ReadyFile
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = [IO.Path]::GetFullPath($InstallDirectory)
$downloadRoot = Split-Path -Parent $ReadyFile
$logFile = Join-Path $root 'data\logs\installer-update.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logFile) | Out-Null
try {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
  if (-not (Test-Path -LiteralPath (Join-Path $root 'voxnest-install.ini'))) { throw 'Not a VoxNest Setup installation.' }
  $prefix = 'https://github.com/RainyHorizon/voice-studio/releases/download/'
  foreach ($url in @($SetupUrl, $ChecksumUrl)) {
    if (-not $url.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Untrusted update URL.' }
  }
  $setup = Join-Path $downloadRoot 'VoxNest-Setup.exe'
  $checksum = Join-Path $downloadRoot 'setup.sha256'
  Invoke-WebRequest -UseBasicParsing -Uri $SetupUrl -OutFile $setup -TimeoutSec 600
  Invoke-WebRequest -UseBasicParsing -Uri $ChecksumUrl -OutFile $checksum -TimeoutSec 60
  $checksumText = Get-Content -LiteralPath $checksum -Raw
  if ($checksumText -notmatch '^\s*([0-9a-fA-F]{64})\s+') { throw 'Invalid SHA256 file.' }
  if ((Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash -ne $Matches[1]) { throw 'SHA256 mismatch.' }
  Set-Content -LiteralPath $ReadyFile -Value 'ready' -Encoding Ascii
  $deadline = (Get-Date).AddMinutes(5)
  while (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue) {
    if ((Get-Date) -gt $deadline) { throw 'VoxNest did not exit; update cancelled.' }
    Start-Sleep -Seconds 1
  }
  $arguments = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="' + $root + '" /LOG="' + (Join-Path $downloadRoot 'setup.log') + '"'
  $process = Start-Process -FilePath $setup -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
  Set-Content -LiteralPath $logFile -Value "Updated to $Version" -Encoding UTF8
  Start-Process -FilePath (Join-Path $root 'VoxNest.exe') -WorkingDirectory $root -WindowStyle Hidden
} catch {
  $_.Exception.Message | Set-Content -LiteralPath $logFile -Encoding UTF8
  Set-Content -LiteralPath $ReadyFile -Value ('error:' + $_.Exception.Message) -Encoding UTF8
  exit 1
}
