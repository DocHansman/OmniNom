#!/bin/sh
set -e

# Format timestamp
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="/data/backups"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

# Ensure output directory exists
mkdir -p "${BACKUP_DIR}"

echo "Starting database backup at $(date)..."

# Perform pg_dump and compress
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${DB_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${BACKUP_FILE}"

# Get file size
FILE_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)

echo "Backup erfolgreich: $(basename ${BACKUP_FILE}) (${FILE_SIZE})"

# Delete backups older than 7 days
echo "Cleaning up backups older than 7 days..."
find "${BACKUP_DIR}" -name "backup_*.sql.gz" -mtime +7 -exec rm -f {} \;
echo "Backup cleanup completed."
