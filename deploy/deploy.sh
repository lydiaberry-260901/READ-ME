#!/usr/bin/env bash
# Puts the newest version from GitHub live. Run on the server, as the app user, from the app folder:
#   bash deploy/deploy.sh
# Stops at the first problem, before anything live is changed where possible.
set -euo pipefail

cd "$(dirname "$0")/.."
echo "Getting the newest version from GitHub"
git pull --ff-only

echo "Installing packages"
# Includes the build and database tools, which are needed on the server.
npm ci --include=dev

echo "Checking the settings in .env"
NODE_ENV=production npm run check:env

echo "Backing up the database before any changes"
bash deploy/backup.sh

echo "Updating the database structure"
npx prisma migrate deploy

echo "Building the web app"
NODE_ENV=production npm run build

echo "Restarting the web app and the worker"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "Checking it is working"
sleep 5
curl --fail --silent http://127.0.0.1:3000/api/health && echo "" && echo "Done."
