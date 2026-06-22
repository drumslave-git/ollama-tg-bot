# codegraph availability + freshness gate (UserPromptSubmit hook).
#
#   exit 0  -> codegraph is usable and the index is now up to date; allow prompt
#   exit 2  -> codegraph is unavailable; HARD-BLOCK the prompt (Claude never sees it)
#
# `codegraph sync -q` does double duty here:
#   1. Refreshes the index from on-disk changes (deterministic freshness without
#      relying on the background daemon's file watcher -- note the daemon is
#      spawned only by the MCP server, never by the CLI, so it can't be restarted
#      from a hook anyway).
#   2. Its exit code is a real availability check: 0 = healthy index,
#      non-zero = missing/broken index (genuinely unavailable).
#
# Default $ErrorActionPreference (Continue) is intentional: it keeps a native
# stderr write from throwing a NativeCommandError, so $LASTEXITCODE stays
# authoritative and our own `exit 2` is what blocks.

$proj = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Block($msg) {
    [Console]::Error.WriteLine("CODEGRAPH UNAVAILABLE - prompt blocked.`n$msg`nRebuild with:  codegraph index .   then resend.")
    exit 2
}

# 1. codegraph binary must be installed
if (-not (Get-Command codegraph -ErrorAction SilentlyContinue)) {
    Block "The 'codegraph' CLI is not on PATH."
}

# 2. Sync = refresh + validate in one shot
Push-Location $proj
$out  = & codegraph sync -q 2>&1
$code = $LASTEXITCODE
Pop-Location

if ($code -ne 0) {
    Block "codegraph sync failed (exit $code): $out"
}

# Healthy + fresh: allow, stay silent so nothing is injected into context.
exit 0
