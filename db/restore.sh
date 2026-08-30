#!/usr/bin/env bash
# Restore a public-schema dump onto a stock postgres:17 container.
#
#   ./db/restore.sh <dump-file> [--fresh]
#
# --fresh drops and recreates the database first. Always safe to re-run.
set -euo pipefail

DUMP=${1:?usage: restore.sh <dump-file> [--fresh]}
FRESH=${2:-}
CONTAINER=${DB_CONTAINER:-pharmshift-db}
DB=${DB_NAME:-pharmshift}
APP_PASSWORD=${APP_PASSWORD:?set APP_PASSWORD}
HERE=$(cd "$(dirname "$0")" && pwd)

psql_su() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

if [ "$FRESH" = "--fresh" ]; then
  echo "==> dropping $DB"
  psql_su -d postgres -c "drop database if exists $DB with (force);"
fi

if ! docker exec "$CONTAINER" psql -U postgres -Atc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
  echo "==> creating $DB (ICU en-US, matching the source cluster)"
  psql_su -d postgres -c "create database $DB template template0 locale_provider icu icu_locale 'en_US.UTF-8' encoding 'UTF8';"
fi

echo "==> 01-pre-restore"
psql_su -d "$DB" -v app_password="$APP_PASSWORD" < "$HERE/01-pre-restore.sql"
psql_su -d postgres -c "alter database $DB owner to pharmshift;"

echo "==> pg_restore"
docker cp "$DUMP" "$CONTAINER:/tmp/restore.dump"
set +e
docker exec "$CONTAINER" pg_restore -U pharmshift -d "$DB" --no-owner --no-acl \
  /tmp/restore.dump 2> /tmp/pg_restore.err
set -e
docker exec "$CONTAINER" rm -f /tmp/restore.dump
ERRS=$(grep -c '^pg_restore: error' /tmp/pg_restore.err || true)
echo "    pg_restore errors: $ERRS"
if [ "$ERRS" != "0" ]; then grep '^pg_restore: error' /tmp/pg_restore.err | head -20; fi

echo "==> 02-post-restore"
psql_su -d "$DB" < "$HERE/02-post-restore.sql"

echo "==> done"
