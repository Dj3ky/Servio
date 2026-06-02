#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/servio"

echo "==> Updating Servio..."
cd "$INSTALL_DIR"

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 NODE_ENV=development npm ci

echo "==> Building..."
NODE_ENV=development npm run build

echo "==> Running migrations..."
npm run db:migrate

echo "==> Restarting services..."
pm2 reload servio-backend
pm2 save

echo "==> Update complete!"
pm2 status
