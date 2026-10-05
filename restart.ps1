$ErrorActionPreference = 'Continue'

# Resolve the project root from this script's own location instead of a
# hardcoded per-machine path, so the repo can live anywhere.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root 'server'
$clientDir = Join-Path $root 'client'

$apiPort = 5000
$webPort = 5173

function Get-ListenerPid([int]$Port) {
  $lines = & netstat -ano -p tcp 2>$null | Select-String ":$Port\s+.*LISTENING"
  $pids = @()
  foreach ($l in $lines) {
    $pidPart = ($l.ToString() -split '\s+') | Where-Object { $_ } | Select-Object -Last 1
    if ($pidPart -and [int]::TryParse($pidPart, [ref]$null)) { $pids += [int]$pidPart }
  }
  return $pids | Select-Object -Unique
}

function Stop-Port([int]$Port, [string]$Label) {
  $pids = @(Get-ListenerPid $Port)
  if ($pids.Count -eq 0) { Write-Output "  $Label : nothing listening on $Port"; return }
  foreach ($id in $pids) {
    $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    # Only ever stop a process from THIS project. Never a blanket
    # "kill all node", which takes down unrelated servers on the machine.
    $cmd = ''
    try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $id").CommandLine } catch { }
    $looksLikeOurs = $cmd -and ($cmd -like "*$root*" -or $cmd -like '*src/server.js*' -or $cmd -like '*vite*')
    if (-not $looksLikeOurs) {
      Write-Output "  $Label : port $Port held by PID $id from another project - leaving it alone"
      continue
    }
    Write-Output "  $Label : stopping PID $id on port $Port"
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

Write-Output '== Restarting Gsky servers =='
Write-Output "Project root: $root"

Write-Output 'Stopping previous Gsky processes...'
Stop-Port $apiPort 'Backend'
Stop-Port $webPort 'Client'
Start-Sleep -Seconds 2

Remove-Item (Join-Path $serverDir 'server.log'), (Join-Path $serverDir 'server.err.log') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $clientDir 'vite.log'), (Join-Path $clientDir 'vite.err.log') -ErrorAction SilentlyContinue

Write-Output 'Starting backend...'
Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory $serverDir `
  -RedirectStandardOutput (Join-Path $serverDir 'server.log') `
  -RedirectStandardError (Join-Path $serverDir 'server.err.log') `
  -WindowStyle Hidden

$backendOk = $false
for ($i = 1; $i -le 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:$apiPort/api/health" -TimeoutSec 2
    if ($r.status -eq 'ok') { $backendOk = $true; Write-Output "Backend UP after ${i}s"; break }
  } catch { }
}
if (-not $backendOk) {
  Write-Output 'Backend FAILED to start:'
  if (Test-Path (Join-Path $serverDir 'server.err.log')) { Get-Content (Join-Path $serverDir 'server.err.log') | Select-Object -Last 15 }
  exit 1
}

Write-Output 'Starting client (Vite)...'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--port',"$webPort" -WorkingDirectory $clientDir `
  -RedirectStandardOutput (Join-Path $clientDir 'vite.log') `
  -RedirectStandardError (Join-Path $clientDir 'vite.err.log') `
  -WindowStyle Hidden

$clientOk = $false
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$webPort" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $clientOk = $true; Write-Output "Client UP after ${i}s"; break }
  } catch { }
}
if (-not $clientOk) {
  Write-Output 'Client FAILED to start:'
  if (Test-Path (Join-Path $clientDir 'vite.err.log')) { Get-Content (Join-Path $clientDir 'vite.err.log') | Select-Object -Last 15 }
  exit 1
}

Write-Output 'Both servers are running.'
Write-Output "  API  : http://localhost:$apiPort/api"
Write-Output "  Web  : http://localhost:$webPort"
