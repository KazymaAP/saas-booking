# scripts/check.ps1 - project check in one command (ASCII only, works in Windows PowerShell 5 and 7).
# Run from project folder:  powershell -ExecutionPolicy Bypass -File scripts\check.ps1
# All output goes to check-log.txt in the project folder.

Set-Location (Split-Path -Parent $PSScriptRoot)
$log = Join-Path (Get-Location) 'check-log.txt'
"=== check started $(Get-Date -Format s) ===" | Out-File $log -Encoding utf8

function Write-Log([string]$text) {
  Add-Content -Path $log -Value $text -Encoding utf8
}

function Run-Step([string]$title, [string]$cmd) {
  Write-Log ""
  Write-Log "--- $title ---"
  $output = cmd /c "$cmd 2>&1"
  $code = $LASTEXITCODE
  foreach ($line in $output) { Write-Log ("$line") }
  Write-Log "exit code: $code"
  return [int]$code
}

$results = [ordered]@{}
$results['node'] = Run-Step 'node -v' 'node -v'
$results['pnpm'] = Run-Step 'pnpm -v' 'pnpm -v'
if ($results['pnpm'] -ne 0) {
  Write-Log 'pnpm not found. Install it with: npm i -g pnpm'
  Write-Host "Done. Log: $log"
  exit 1
}
$results['install'] = Run-Step 'pnpm install' 'pnpm install'
$results['typecheck'] = Run-Step 'pnpm typecheck' 'pnpm typecheck'
$results['build'] = Run-Step 'pnpm build' 'pnpm build'

Write-Log ""
Write-Log "=== summary ==="
foreach ($k in $results.Keys) {
  $status = if ($results[$k] -eq 0) { 'OK' } else { "FAIL (" + $results[$k] + ")" }
  Write-Log ($k + ": " + $status)
}
Write-Log ""
Write-Log "Done. Log: $log"
Write-Host "Done. Log: $log"
