# Hard-stop gate: block the prompt if codegraph is unavailable.
# Wired as a UserPromptSubmit hook. Exit 2 = block prompt + show stderr to Claude.
# Rationale: the codegraph MCP tools talk to a background daemon over the named
# pipe recorded in .codegraph/daemon.pid. If that daemon is dead, MCP calls fail,
# so we verify the daemon process is actually alive (not just that the DB exists).

$ErrorActionPreference = 'Stop'

function Block($msg) {
    [Console]::Error.WriteLine("CODEGRAPH UNAVAILABLE - prompt blocked.`n$msg`nStart it with:  codegraph index .   (or restart the daemon), then resend.")
    exit 2
}

# 1. codegraph binary must be installed
if (-not (Get-Command codegraph -ErrorAction SilentlyContinue)) {
    Block "The 'codegraph' CLI is not on PATH."
}

# 2. .codegraph/daemon.pid must exist
$pidFile = Join-Path $PSScriptRoot '..\..\.codegraph\daemon.pid'
if (-not (Test-Path $pidFile)) {
    Block "No .codegraph/daemon.pid found (daemon never started or index missing)."
}

# 3. The recorded daemon PID must be a live process
try {
    $info = Get-Content $pidFile -Raw | ConvertFrom-Json
} catch {
    Block "Could not parse .codegraph/daemon.pid."
}
$dpid = $info.pid
if (-not $dpid) { Block "daemon.pid has no pid field." }
if (-not (Get-Process -Id $dpid -ErrorAction SilentlyContinue)) {
    Block "codegraph daemon (pid $dpid) is not running."
}

# Alive: allow the prompt through. Stay silent so nothing is injected into context.
exit 0
