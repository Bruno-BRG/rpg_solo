# ─────────────────────────────────────────────────────────────
# RPG Solo — portable PostgreSQL 16 + pgvector (local dev)
#
# Manages a user-space Postgres instance (no admin rights, no
# Docker). Binaries live in %LOCALAPPDATA%\rpg_solo\pgsql and
# data in %LOCALAPPDATA%\rpg_solo\pgdata.
#
# Usage:
#   powershell -File scripts\dev-postgres.ps1 setup   # one-time: extract + initdb
#   powershell -File scripts\dev-postgres.ps1 start   # start server (port 5433)
#   powershell -File scripts\dev-postgres.ps1 stop    # stop server
#   powershell -File scripts\dev-postgres.ps1 status  # is it running?
# ─────────────────────────────────────────────────────────────
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("setup", "start", "stop", "status")]
  [string]$Action
)

$ErrorActionPreference = "Stop"

$Base = "$env:LOCALAPPDATA\rpg_solo"
$PgHome = "$Base\pgsql"      # extracted EDB binaries (postgresql-16.4-1-windows-x64-binaries.zip)
$PgData = "$Base\pgdata"     # data directory
$Port = 5433

$Bin = "$PgHome\bin"
$PgCtl = "$Bin\pg_ctl.exe"

function Test-PgRunning {
  & $PgCtl -D $PgData status *> $null
  return $LASTEXITCODE -eq 0
}

switch ($Action) {
  "setup" {
    if (Test-Path $PgData) {
      "pgdata already initialized at $PgData"
      exit 0
    }
    if (-not (Test-Path "$Bin\initdb.exe")) {
      throw "Postgres binaries not found at $PgHome. Extract postgresql-16.4-1-windows-x64-binaries.zip so that $PgHome\bin exists."
    }
    # Initialize cluster with UTF8 and trust auth for local-only use.
    & "$Bin\initdb.exe" -D $PgData -U postgres -E UTF8 -A trust --no-instructions
    "Initialized pgdata at $PgData (user: postgres, trust auth, localhost only)"
  }
  "start" {
    if (Test-PgRunning) { "already running"; exit 0 }
    & $PgCtl -D $PgData -l "$Base\postgres.log" -o "-p $Port -c listen_addresses=127.0.0.1" start
    "Postgres starting on 127.0.0.1:$Port (log: $Base\postgres.log)"
  }
  "stop" {
    & $PgCtl -D $PgData stop -m fast
    "stopped"
  }
  "status" {
    if (Test-PgRunning) { "running on port $Port" } else { "stopped" }
  }
}
