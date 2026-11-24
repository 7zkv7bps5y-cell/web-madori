#!/usr/bin/env bash
# クラウド保存のデータベース設計（RLS・保存上限）を、使い捨てのローカル PostgreSQL で検証する。
# 使い方: PG_BIN=/usr/lib/postgresql/16/bin scripts/test-db.sh
# （root では initdb できないため、一般ユーザーで実行すること）
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-$(dirname "$(command -v postgres || echo /usr/lib/postgresql/16/bin/postgres)")}"
WORK="$(mktemp -d)"
PORT="${PG_PORT:-55433}"
cleanup() { "$PG_BIN/pg_ctl" -D "$WORK/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK" -l "$WORK/log" -w start >/dev/null
PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
for t in supabase/tests/cloud_storage_test.sql supabase/tests/share_links_test.sql; do "${PSQL[@]}" -f "$t"; done
