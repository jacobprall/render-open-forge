#!/usr/bin/env bash
# Simple PostgreSQL backup script.
#
# Usage:
#   DATABASE_URL=postgres://forge:forge@localhost:5432/forge ./scripts/db-backup.sh
#
# Creates a timestamped pg_dump in ./backups/

set -euo pipefail

DB_URL="${DATABASE_URL:?Set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/forge_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "==> Backing up to ${BACKUP_FILE}…"
pg_dump "${DB_URL}" --no-owner --no-acl | gzip > "${BACKUP_FILE}"

echo "==> Backup complete: $(du -h "${BACKUP_FILE}" | cut -f1)"

# Retain last 30 backups
ls -1t "${BACKUP_DIR}"/forge_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -v
echo "==> Old backups pruned (keeping last 30)"
