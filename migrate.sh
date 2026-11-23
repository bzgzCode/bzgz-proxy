#!/usr/bin/env bash
# Upgrading an OLD database? Adds any missing columns. "duplicate column" errors are harmless.
DB=${1:-bzgz-proxy}
for q in \
 "ALTER TABLE users ADD COLUMN jchk INTEGER NOT NULL DEFAULT 0" \
 "ALTER TABLE users ADD COLUMN notify INTEGER NOT NULL DEFAULT 1" \
 "ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0" \
 "ALTER TABLE users ADD COLUMN extra TEXT" \
 "ALTER TABLE users ADD COLUMN lang TEXT" \
 "ALTER TABLE users ADD COLUMN state TEXT" \
 "ALTER TABLE users ADD COLUMN last INTEGER NOT NULL DEFAULT 0" \
 "ALTER TABLE proxies ADD COLUMN fail INTEGER NOT NULL DEFAULT 0" \
 "ALTER TABLE proxies ADD COLUMN seen INTEGER NOT NULL DEFAULT 0"; do
  npx wrangler d1 execute "$DB" --remote --command "$q" 2>&1 | grep -qi "duplicate" && echo "ok (exists): $q" || echo "ran: $q"
done
