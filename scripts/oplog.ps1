<#
.SYNOPSIS
  Wrap a Windows scheduled task so its run is logged to ops-calendar/runs/.

.DESCRIPTION
  Runs the given command, captures exit code / duration / last stdout line,
  and records the result via scripts/oplog.py. The wrapped task does not
  need to know anything about logging.

  Outcome mapping:
    exit 0 + last stdout line "NOOP"  -> noop   (ran fine, nothing to do)
    exit 0 + last stdout line "SKIP"  -> skip   (gate said not yet)
    exit 0                            -> ok
    exit != 0                         -> fail

  With -Batch the run file is written but not pushed (for high-frequency
  tasks); push them once a day with: python3 scripts/oplog.py --flush
  or a plain git add/commit/push of ops-calendar/runs.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\oplog.ps1 `
    -TaskId brainwire-weekly-quality-audit -Repo C:\path\releasepilot-reports `
    -- node enqueue_quality_audit.js
#>
param(
  [Parameter(Mandatory = $true)][string]$TaskId,
  [Parameter(Mandatory = $true)][string]$Repo,
  [switch]$Batch,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Command
)

$ErrorActionPreference = 'Continue'

# Strip a leading literal "--" separator if present.
if ($Command.Count -gt 0 -and $Command[0] -eq '--') { $Command = $Command[1..($Command.Count - 1)] }
if ($Command.Count -eq 0) { Write-Error 'No command given after --'; exit 2 }

$exe  = $Command[0]
$rest = if ($Command.Count -gt 1) { $Command[1..($Command.Count - 1)] } else { @() }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$stdout = & $exe @rest 2>&1 | ForEach-Object { $_.ToString() }
$exitCode = $LASTEXITCODE
$sw.Stop()
if ($null -eq $exitCode) { $exitCode = 0 }

# Echo the wrapped command's own output so Task Scheduler history keeps it.
$stdout | ForEach-Object { Write-Output $_ }

$lastLine = ''
if ($stdout -and $stdout.Count -gt 0) { $lastLine = ($stdout[-1]).Trim() }

if ($exitCode -ne 0)          { $outcome = 'fail' }
elseif ($lastLine -eq 'NOOP') { $outcome = 'noop' }
elseif ($lastLine -eq 'SKIP') { $outcome = 'skip' }
else                          { $outcome = 'ok' }

$note = if ($lastLine.Length -gt 160) { $lastLine.Substring(0, 160) } else { $lastLine }

$logArgs = @(
  (Join-Path $Repo 'scripts\oplog.py'),
  '--task', $TaskId, '--host', 'windows', '--outcome', $outcome,
  '--repo', $Repo, '--duration-ms', $sw.ElapsedMilliseconds, '--exit-code', $exitCode
)
if ($note)   { $logArgs += @('--note', $note) }
if ($outcome -eq 'fail') { $logArgs += @('--error', $note) }
if (-not $Batch) { $logArgs += '--commit' }

& python @logArgs

exit $exitCode
