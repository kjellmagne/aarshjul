#!/bin/sh
set -eu

if [ "${AUTO_DB_PUSH:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "AUTO_DB_PUSH=true but DATABASE_URL is not set."
    exit 1
  fi

  retries="${DB_STARTUP_RETRIES:-20}"
  wait_seconds="${DB_STARTUP_WAIT_SECONDS:-2}"
  attempt=1

  while [ "$attempt" -le "$retries" ]; do
    echo "Applying database schema (attempt ${attempt}/${retries})..."
    if node ./node_modules/prisma/build/index.js db push \
      --config apps/web/prisma.config.ts \
      --schema apps/web/prisma/schema.prisma \
      --url "${DATABASE_URL}"; then
      echo "Database schema is in sync."
      break
    fi

    if [ "$attempt" -ge "$retries" ]; then
      echo "Failed to apply schema after ${retries} attempts."
      exit 1
    fi

    attempt=$((attempt + 1))
    sleep "$wait_seconds"
  done
fi

exec node apps/web/server.js
