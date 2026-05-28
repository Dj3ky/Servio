#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/servio"

echo "==> Updating Servio..."
cd "$INSTALL_DIR"

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
npm ci

echo "==> Building..."
npm run build

echo "==> Running migrations..."
npm run db:migrate

echo "==> Restarting services..."
pm2 reload servio-backend

echo "==> Update complete!"
pm2 status
