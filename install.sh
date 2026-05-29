#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/servio"
LOG_DIR="$INSTALL_DIR/logs"
UPLOADS_DIR="$INSTALL_DIR/uploads"
BACKUPS_DIR="$INSTALL_DIR/backups"

echo "==> Installing Servio"

# Node.js 20 LTS
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  echo "==> Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# PostgreSQL 16
if ! command -v psql &>/dev/null; then
  echo "==> Installing PostgreSQL 16..."
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-client
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
fi

# smbclient (required for SMB/NAS file storage)
if ! command -v smbclient &>/dev/null; then
  echo "==> Installing smbclient..."
  sudo apt-get install -y samba-client
fi

# Chromium dependencies (required for Puppeteer PDF generation)
echo "==> Installing Chromium dependencies..."
sudo apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2t64 libpango-1.0-0 libcairo2 \
  libgtk-3-0 fonts-liberation

# PM2
if ! command -v pm2 &>/dev/null; then
  echo "==> Installing PM2..."
  sudo npm install -g pm2
fi

# Create directories
echo "==> Creating directories..."
sudo mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$UPLOADS_DIR" "$BACKUPS_DIR"
sudo chown -R "$USER:$USER" "$INSTALL_DIR"

# Copy application files
echo "==> Copying application files..."
cp -r . "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# Environment configuration
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example..."
  cp .env.example .env

  JWT_SECRET=$(openssl rand -hex 64)
  ENCRYPTION_KEY=$(openssl rand -hex 32)

  sed -i "s|change_this_to_a_secure_random_string_at_least_64_chars|$JWT_SECRET|g" .env
  sed -i "s|change_this_to_a_32_byte_hex_string_64_chars_exactly_here|$ENCRYPTION_KEY|g" .env

  DB_PASS=$(openssl rand -hex 16)
  sed -i "s|servio_password|$DB_PASS|g" .env

  echo "==> Generated secure credentials in .env"
fi

# PostgreSQL setup
DB_PASS=$(grep DATABASE_URL .env | sed 's/.*:\(.*\)@.*/\1/')
DB_NAME=$(grep DATABASE_URL .env | sed 's/.*\/\([^?]*\).*/\1/')
DB_USER=$(grep DATABASE_URL .env | sed 's/.*:\/\/\([^:]*\):.*/\1/')

echo "==> Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

# Install dependencies
echo "==> Installing dependencies..."
npm ci

# Build
echo "==> Building application..."
npm run build

# Run migrations
echo "==> Running database migrations..."
npm run db:migrate

# Seed database
echo "==> Seeding database..."
npm run db:seed

# Build frontend
echo "==> Building frontend..."
npm run build --workspace=apps/frontend

# PM2 configuration
echo "==> Configuring PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | sudo bash

echo ""
echo "=========================================="
echo "  Servio installation complete!"
echo "=========================================="
echo "  Backend: http://localhost:3001"
echo "  Frontend: http://localhost:3000"
echo ""
echo "  Default admin credentials:"
echo "  Email: admin@servio.local"
echo "  Password: admin123"
echo ""
echo "  IMPORTANT: Change the admin password immediately!"
echo "=========================================="
