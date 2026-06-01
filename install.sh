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

# Chrome/Chromium (required for Puppeteer PDF generation)
# Google Chrome only ships amd64 binaries — ARM devices (Raspberry Pi) must use Chromium.
ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
if ! command -v google-chrome-stable &>/dev/null && ! command -v chromium &>/dev/null && ! command -v chromium-browser &>/dev/null; then
  if [ "$ARCH" = "amd64" ] || [ "$ARCH" = "x86_64" ]; then
    echo "==> Installing Google Chrome for PDF generation..."
    curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/google-chrome.deb
    # Ubuntu 24.04+ renamed libasound2 and others to *t64 (ABI transition).
    # Pre-install t64 shims so Chrome's .deb dependency check passes.
    sudo apt-get install -y libasound2t64 libcurl4 2>/dev/null || true
    sudo apt-get install -y /tmp/google-chrome.deb
    rm -f /tmp/google-chrome.deb
  else
    echo "==> Installing Chromium for PDF generation (ARM architecture: $ARCH)..."
    sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
  fi
fi

# PM2
if ! command -v pm2 &>/dev/null; then
  echo "==> Installing PM2..."
  sudo npm install -g pm2
fi

# Create directories
echo "==> Creating directories..."
sudo mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$UPLOADS_DIR" "$BACKUPS_DIR"

# Copy application files
# rsync handles re-runs cleanly; .git and node_modules are not needed in the install dir
echo "==> Copying application files..."
if ! command -v rsync &>/dev/null; then
  sudo apt-get install -y rsync
fi
sudo rsync -a --exclude='.git' --exclude='node_modules' . "$INSTALL_DIR/"
sudo chown -R "$USER:$USER" "$INSTALL_DIR"
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

# Write Chromium path into .env (now that we are in $INSTALL_DIR and .env is guaranteed to exist)
CHROME_PATH=$(command -v google-chrome-stable 2>/dev/null || command -v chromium-browser 2>/dev/null || command -v chromium 2>/dev/null || true)
if [ -n "$CHROME_PATH" ] && ! grep -q "PUPPETEER_EXECUTABLE_PATH" .env; then
  echo "PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH" >> .env
fi

# PostgreSQL setup
DB_LINE=$(grep DATABASE_URL .env || true)
if [ -z "$DB_LINE" ]; then
  echo "ERROR: DATABASE_URL not found in .env — delete /opt/servio/.env and re-run to regenerate it"
  exit 1
fi
DB_PASS=$(echo "$DB_LINE" | sed 's/.*:\(.*\)@.*/\1/')
DB_NAME=$(echo "$DB_LINE" | sed 's/.*\/\([^?]*\).*/\1/')
DB_USER=$(echo "$DB_LINE" | sed 's/.*:\/\/\([^:]*\):.*/\1/')

echo "==> Setting up PostgreSQL..."
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

# Install dependencies
echo "==> Installing dependencies..."
# Skip Puppeteer's bundled Chromium download — we use the system browser instead
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 npm ci

# Build
echo "==> Building application..."
npm run build

# Run migrations
echo "==> Running database migrations..."
npm run db:migrate

# Seed database (skip silently on re-runs — unique constraint will reject duplicates)
echo "==> Seeding database..."
npm run db:seed || true

# Build frontend
echo "==> Building frontend..."
npm run build --workspace=apps/frontend

# PM2 configuration
echo "==> Configuring PM2..."
pm2 startOrRestart ecosystem.config.js

# Register PM2 as a systemd service so it survives reboots (idempotent — safe to re-run).
PM2_STARTUP_CMD=$(pm2 startup 2>&1 | grep -o 'sudo .*$' | head -1)
if [ -n "$PM2_STARTUP_CMD" ]; then
  echo "==> Running: $PM2_STARTUP_CMD"
  eval "$PM2_STARTUP_CMD"
else
  echo "WARNING: Could not detect PM2 startup command — run 'pm2 startup' manually after install."
fi

# Save AFTER the startup hook is registered so systemd picks up the current process list
pm2 save

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
