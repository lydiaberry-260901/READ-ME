#!/usr/bin/env bash
# Restores the database from an encrypted backup. This REPLACES everything in the database.
#   bash deploy/restore.sh /home/moca/backups/moca-crm_2026-09-29_0230.dump.gpg
# Stop the app first (pm2 stop all), and start it again afterwards (pm2 start all).
set -euo pipefail

cd "$(dirname "$0")/.."
FILE="${1:?Give the backup file to restore}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$HOME/.backup-passphrase}"
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2- | tr -d '"')"
DATABASE_URL="${DATABASE_URL%%\?*}"

read -r -p "This replaces everything in the database with the backup. Type RESTORE to continue: " answer
[ "$answer" = "RESTORE" ] || { echo "Stopped. Nothing was changed."; exit 1; }

gpg --batch --decrypt --passphrase-file "$BACKUP_PASSPHRASE_FILE" "$FILE" \
  | pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL"
echo "Restored from $FILE."
