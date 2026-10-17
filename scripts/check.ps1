# scripts/check.ps1 - project check in one command: node, pnpm, install, typecheck, unit tests, build.
# ASCII only: Windows PowerShell 5.1 reads BOM-less files as ANSI. Works in PowerShell 5.1 (Windows) and 7+ (Windows/Linux/macOS).
#
# Run from any folder:
#   powershell -ExecutionPolicy Bypass -File scripts\check.ps1
#   pwsh scripts/check.ps1 -SkipBuild
# Parameters:
#   -SkipInstall  do not run pnpm install
#   -SkipTests    do not run vitest (it is also skipped automatically if vitest is not installed)
#   -SkipBuild    do not run next build
#   -LogFile      log path (default: check-log.txt in the project folder)
# Exit code: 0 - all steps OK, 1 - at least one step failed, 2 - environment problem (no node/pnpm).

[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$SkipTests,
  [switch]$SkipBuild,
  [string]$LogFile = ''
)

$ErrorActionPreference = 'Continue'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# UTF-8 for child processes output: otherwise pnpm/next symbols turn into mojibake in the log.
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$env:FORCE_COLOR = '0'
$env:NO_COLOR = '1'
$env:CI = '1'

$onWindows = ($PSVersionTable.PSVersion.Major -lt 6) -or $IsWindows
if (-not $LogFile) { $LogFile = Join-Path $projectRoot 'check-log.txt' }
[System.IO.File]::WriteAllText($LogFile, "=== check started $(Get-Date -Format s) in $projectRoot ===`r`n", $utf8)

function Write-Log([string]$text) {
  [System.IO.File]::AppendAllText($LogFile, "$text`r`n", $utf8)
}

function Write-Status([string]$name, [string]$status, [double]$seconds) {
  $color = 'Green'
  if ($status -like 'FAIL*') { $color = 'Red' } elseif ($status -eq 'SKIP') { $color = 'Yellow' }
  $line = '{0,-10} {1,-12} {2,7:N1}s' -f $name, $status, $seconds
  Write-Host $line -ForegroundColor $color
  Write-Log $line
}

# Runs a shell command, writes its full output to the log, returns the exit code.
function Invoke-Step([string]$title, [string]$cmd) {
  Write-Log ''
  Write-Log "--- $title :: $cmd ---"
  $started = Get-Date
  if ($onWindows) { $output = & cmd /c "$cmd 2>&1" } else { $output = & sh -c "$cmd 2>&1" }
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  foreach ($line in $output) { Write-Log ("$line") }
  $seconds = ((Get-Date) - $started).TotalSeconds
  Write-Log "exit code: $code"
  if ($code -ne 0) {
    # Last lines go to the console so the reason is visible without opening the log.
    $tail = @($output | Select-Object -Last 15)
    foreach ($line in $tail) { Write-Host "    $line" -ForegroundColor DarkGray }
  }
  return @{ code = [int]$code; seconds = $seconds }
}

$results = New-Object System.Collections.ArrayList
function Add-Result([string]$name, $res, [string]$skipReason = '') {
  if ($skipReason) {
    Write-Log ''
    Write-Log "--- $name skipped: $skipReason ---"
    Write-Status $name 'SKIP' 0
    [void]$results.Add(@{ name = $name; ok = $true; skipped = $true })
    return $true
  }
  $ok = ($res.code -eq 0)
  $status = 'OK'
  if (-not $ok) { $status = "FAIL ($($res.code))" }
  Write-Status $name $status $res.seconds
  [void]$results.Add(@{ name = $name; ok = $ok; skipped = $false })
  return $ok
}

Write-Host "Project check: $projectRoot"

$nodeOk = Add-Result 'node' (Invoke-Step 'node version' 'node -v')
$pnpmOk = Add-Result 'pnpm' (Invoke-Step 'pnpm version' 'pnpm -v')
if (-not ($nodeOk -and $pnpmOk)) {
  $hint = 'Install Node.js 24 (https://nodejs.org) and pnpm (npm i -g pnpm), then run again.'
  Write-Log $hint
  Write-Host $hint -ForegroundColor Red
  Write-Host "Log: $LogFile"
  exit 2
}

if ($SkipInstall) { [void](Add-Result 'install' $null '-SkipInstall') }
else { [void](Add-Result 'install' (Invoke-Step 'pnpm install' 'pnpm install --frozen-lockfile')) }

[void](Add-Result 'typecheck' (Invoke-Step 'pnpm typecheck' 'pnpm typecheck'))

$vitestBin = Join-Path $projectRoot 'node_modules/.bin/vitest'
$hasVitest = (Test-Path $vitestBin) -or (Test-Path "$vitestBin.cmd")
if ($SkipTests) { [void](Add-Result 'tests' $null '-SkipTests') }
elseif (-not $hasVitest) { [void](Add-Result 'tests' $null 'vitest is not installed (pnpm add -D vitest)') }
else { [void](Add-Result 'tests' (Invoke-Step 'vitest' 'pnpm exec vitest run lib')) }

if ($SkipBuild) { [void](Add-Result 'build' $null '-SkipBuild') }
else { [void](Add-Result 'build' (Invoke-Step 'pnpm build' 'pnpm build')) }

$failed = @($results | Where-Object { -not $_.ok })
Write-Log ''
Write-Log '=== summary ==='
foreach ($r in $results) {
  $s = 'OK'
  if ($r.skipped) { $s = 'SKIP' } elseif (-not $r.ok) { $s = 'FAIL' }
  Write-Log ('{0}: {1}' -f $r.name, $s)
}

if ($failed.Count -gt 0) {
  $names = ($failed | ForEach-Object { $_.name }) -join ', '
  Write-Log "RESULT: FAIL ($names)"
  Write-Host "RESULT: FAIL ($names). Log: $LogFile" -ForegroundColor Red
  exit 1
}
Write-Log 'RESULT: OK'
Write-Host "RESULT: OK. Log: $LogFile" -ForegroundColor Green
exit 0
