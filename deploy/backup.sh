#!/usr/bin/env bash
# Makes an encrypted backup of the database. Run every night by cron (see DEPLOY.md), and before
# each deploy. Backups are encrypted with a passphrase kept in a file only the app user can read,
# and backups older than 14 days are deleted.
#
# Settings (in the environment, or the defaults below):
#   BACKUP_DIR              where backups are kept
#   BACKUP_PASSPHRASE_FILE  file holding the passphrase (chmod 600)
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
BACKUP_PASSPHRASE_FILE="${BACKUP_PASSPHRASE_FILE:-$HOME/.backup-passphrase}"
KEEP_DAYS=14

if [ ! -f "$BACKUP_PASSPHRASE_FILE" ]; then
  echo "No backup passphrase file at $BACKUP_PASSPHRASE_FILE. See DEPLOY.md." >&2
  exit 1
fi

# Read DATABASE_URL from .env without printing it.
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2- | tr -d '"')"
# pg_dump does not understand Prisma's ?schema= option.
DATABASE_URL="${DATABASE_URL%%\?*}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(TZ=Europe/London date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/moca-crm_$STAMP.dump.gpg"

pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$BACKUP_PASSPHRASE_FILE" --output "$FILE"
chmod 600 "$FILE"
echo "Backup saved: $FILE ($(du -h "$FILE" | cut -f1))"

find "$BACKUP_DIR" -name 'moca-crm_*.dump.gpg' -mtime +"$KEEP_DAYS" -delete
