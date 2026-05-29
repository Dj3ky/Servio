#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
info() { echo -e "${YELLOW}==> ${NC}$*"; }

# ── .env ─────────────────────────────────────────────────────────────────────
if [ -f .env ]; then
  ok ".env already exists, skipping"
else
  info "Creating .env from .env.example..."
  cp .env.example .env

  JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

  sed -i "s|change_this_to_a_secure_random_string_at_least_64_chars|$JWT_SECRET|g" .env
  sed -i "s|change_this_to_a_32_byte_hex_string_64_chars_exactly_here|$ENCRYPTION_KEY|g" .env
  sed -i "s|NODE_ENV=production|NODE_ENV=development|g" .env

  ok ".env created with generated secrets"
fi

# ── Chromium (Puppeteer PDF generation) ──────────────────────────────────────
if ! command -v chromium-browser &>/dev/null && ! command -v chromium &>/dev/null; then
  info "Installing Chromium for PDF generation..."
  sudo apt-get install -y chromium-browser 2>/dev/null || sudo apt-get install -y chromium
  ok "Chromium installed"
else
  ok "Chromium already installed"
fi

CHROMIUM_PATH=$(command -v chromium-browser 2>/dev/null || command -v chromium 2>/dev/null || true)
if [ -n "$CHROMIUM_PATH" ] && ! grep -q "PUPPETEER_EXECUTABLE_PATH" .env; then
  echo "PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH" >> .env
  ok "PUPPETEER_EXECUTABLE_PATH set to $CHROMIUM_PATH"
fi

# ── PostgreSQL ────────────────────────────────────────────────────────────────
info "Setting up PostgreSQL database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='servio'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER servio WITH PASSWORD 'servio_password';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='servio'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE servio OWNER servio;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE servio TO servio;" > /dev/null
ok "Database ready"

# ── Dependencies ──────────────────────────────────────────────────────────────
info "Installing dependencies..."
npm install
ok "Dependencies installed"

# ── Shared package ───────────────────────────────────────────────────────────
info "Building shared package..."
npm run build --workspace=packages/shared
ok "Shared package built"

# ── Migrations ────────────────────────────────────────────────────────────────
info "Generating migrations..."
npm run db:generate

info "Applying migrations..."
npm run db:migrate

# ── Seed ─────────────────────────────────────────────────────────────────────
info "Seeding database..."
npm run db:seed

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  Dev setup complete!"
echo "=========================================="
echo "  Run:  npm run dev"
echo ""
echo "  Frontend → http://localhost:3000"
echo "  Backend  → http://localhost:3001"
echo ""
echo "  Login: admin@servio.local / admin123"
echo "  (change the password after first login)"
echo "=========================================="
