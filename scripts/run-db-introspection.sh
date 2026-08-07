#!/usr/bin/env bash
# Shell launcher only. This file is not SQL and must not be pasted into the
# Supabase SQL editor; run it from a terminal as documented in
# supabase/verification/README.md.
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -euo pipefail

if [[ "${RUN_DB_INTROSPECTION:-}" != "true" ]]; then
  echo "Database introspection is disabled. Set RUN_DB_INTROSPECTION=true for an explicit operator run." >&2
  exit 64
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: RUN_DB_INTROSPECTION=true $0 <verification-name>" >&2
  exit 64
fi

if [[ ! "$1" =~ ^[a-z0-9_]+$ ]]; then
  echo "Unknown verification: $1" >&2
  exit 66
fi

verification="$repository_root/supabase/verification/$1.sql"
if [[ ! -f "$verification" ]]; then
verification="supabase/verification/$1.sql"
if [[ ! -f "$verification" || "$verification" == *"/../"* ]]; then
  echo "Unknown verification: $1" >&2
  exit 66
fi

: "${DATABASE_URL:?DATABASE_URL is required for an operator introspection run}"
exec psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file="$verification"
