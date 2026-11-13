#!/bin/bash
# Recria o banco "cand" num Postgres LOCAL descartável e aplica stubs + migrações do repo.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
export PGHOST="${PGHOST:-/tmp/pgtest}" PGPORT="${PGPORT:-5544}" PGUSER="${PGUSER:-postgres}"
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists cand" -c "create database cand"
$P -d cand -f "$HERE/stubs.sql"
for f in "$HERE"/../migrations/*.sql; do
  echo "== $(basename "$f")"; $P -d cand -f "$f"
done
