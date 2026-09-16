param(
  [ValidateRange(1, 65535)]
  [int]$Port = 0,
  [switch]$PauseOnExit
)

$ErrorActionPreference = "Stop"
$ports = if ($Port -gt 0) { @($Port) } else { 8765..8790 }
$targets = @{}

function Write-Step([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Cyan) {
  Write-Host "[VoxNest] $Message" -ForegroundColor $Color
}

try {
  foreach ($candidate in $ports) {
    $listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
      try {
        $summary = Invoke-RestMethod -Uri "http://127.0.0.1:$candidate/api/summary" -TimeoutSec 2
      } catch {
        continue
      }
      if ($summary.application -ne "voice-studio") {
        continue
      }

      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
      $commandLine = [string]$process.CommandLine
      $executablePath = [string]$process.ExecutablePath
      $isVoxNest = $commandLine -match '(?i)voice-studio|portable_main\.py|app\.main:app' -or
        $executablePath -match '(?i)VoxNest\.exe'
      if ($isVoxNest) {
        $targets[([int]$listener.OwningProcess)] = [pscustomobject]@{
          Port = $candidate
          ProcessId = [int]$listener.OwningProcess
          CommandLine = $commandLine
        }
      }
    }
  }

  if ($targets.Count -eq 0) {
    Write-Step "VoxNest is not running." Yellow
    exit 0
  }

  foreach ($target in $targets.Values) {
    Write-Step "Stopping VoxNest on port $($target.Port) (PID $($target.ProcessId))..."
    Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
  }
  Start-Sleep -Milliseconds 500
  Write-Step "VoxNest stopped." Green
} catch {
  Write-Host ""
  Write-Step "Could not stop VoxNest: $($_.Exception.Message)" Red
  exit 1
} finally {
  if ($PauseOnExit) {
    Write-Host ""
    Read-Host "Press Enter to close this window" | Out-Null
  }
}

