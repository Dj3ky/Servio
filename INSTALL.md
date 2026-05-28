# Servio — Installation Guide

This guide covers all installation methods:

- [Local Development](#local-development) — for development and testing
- [Production (Linux + PM2)](#production-linux--pm2) — recommended for bare-metal/VPS deployments
- [Docker Compose](#docker-compose) — containerized deployment
- [Post-Installation Setup](#post-installation-setup) — first-time configuration

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Node.js | 20 LTS | Use [nvm](https://github.com/nvm-sh/nvm) to manage versions |
| PostgreSQL | 15 or 16 | Local install or managed service |
| npm | 10+ | Comes with Node.js 20 |
| Git | any | For cloning the repository |

Optional (for full functionality):
- SMB-compatible network share (Windows share, NAS, Samba) for PDF storage
- SMTP server or mail relay for email delivery
- `pg_dump` in PATH for database backups

### Install prerequisites (Ubuntu / Debian)

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 16
sudo apt-get install -y postgresql postgresql-client
sudo systemctl enable --now postgresql

# Git
sudo apt-get install -y git
```

Verify installations:

```bash
node -v        # v20.x.x
npm -v         # 10.x.x
psql --version
git --version
```

---

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/your-org/servio.git
cd servio
```

### 2. Create environment file

```bash
cp .env.example .env
```

Edit `.env` and fill in your values. The minimum required for local development:

```env
DATABASE_URL=postgresql://servio:servio_password@localhost:5432/servio
JWT_SECRET=any_random_string_at_least_64_characters_long_change_this_now
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
```

> **Note:** The `ENCRYPTION_KEY` must be exactly 64 hex characters (32 bytes). Generate a real one for anything beyond local testing:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 3. Create the PostgreSQL database

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Inside psql:
CREATE USER servio WITH PASSWORD 'servio_password';
CREATE DATABASE servio OWNER servio;
GRANT ALL PRIVILEGES ON DATABASE servio TO servio;
\q
```

### 4. Install dependencies

```bash
npm install
```

This installs dependencies for all workspaces (`packages/shared`, `apps/backend`, `apps/frontend`) in one command.

### 5. Generate and run database migrations

```bash
# Generate migration SQL files from the schema
npm run db:generate

# Apply migrations to the database
npm run db:migrate
```

### 6. Seed initial data

```bash
npm run db:seed
```

This creates:
- Default admin account: `admin@servio.local` / `admin123`
- Application settings row (app name: "Servio")
- Default email templates in Slovenian and English

### 7. Start the development servers

```bash
npm run dev
```

This starts both servers concurrently:
- **Backend** → http://localhost:3001
- **Frontend** → http://localhost:3000 (proxied to backend via Vite)

The application is ready at **http://localhost:3000**.

---

## Production (Linux + PM2)

### Automated installation

The `install.sh` script performs a fully automated production installation on Ubuntu/Debian systems.

```bash
# Clone the repository to your server
git clone https://github.com/your-org/servio.git /tmp/servio
cd /tmp/servio

# Make the script executable and run it
chmod +x install.sh
./install.sh
```

The script will:
1. Install Node.js 20 LTS (if not present)
2. Install PostgreSQL 16 (if not present)
3. Install PM2 globally (if not present)
4. Create the application directory at `/opt/servio`
5. Generate secure random `JWT_SECRET` and `ENCRYPTION_KEY`
6. Create the PostgreSQL user and database
7. Install all dependencies
8. Build the shared package, backend, and frontend
9. Run database migrations
10. Seed the database with initial data
11. Configure and start PM2
12. Register PM2 for automatic startup on system reboot

### Manual production installation

If you prefer to control each step:

#### 1. Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # should print v20.x.x
```

#### 2. Install PostgreSQL

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-client
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### 3. Install PM2

```bash
sudo npm install -g pm2
```

#### 4. Create the database

```bash
# Generate a secure password
DB_PASS=$(openssl rand -hex 16)
echo "Database password: $DB_PASS"

sudo -u postgres psql <<EOF
CREATE USER servio WITH PASSWORD '$DB_PASS';
CREATE DATABASE servio OWNER servio;
GRANT ALL PRIVILEGES ON DATABASE servio TO servio;
EOF
```

#### 5. Set up the application directory

```bash
sudo mkdir -p /opt/servio/logs /opt/servio/uploads /opt/servio/backups
sudo chown -R $USER:$USER /opt/servio

# Copy project files
cp -r . /opt/servio/
cd /opt/servio
```

#### 6. Configure environment

```bash
cp .env.example .env
```

Edit `/opt/servio/.env`:

```env
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-domain.com

DATABASE_URL=postgresql://servio:YOUR_DB_PASSWORD@localhost:5432/servio

JWT_SECRET=YOUR_64_CHAR_RANDOM_STRING
ENCRYPTION_KEY=YOUR_64_CHAR_HEX_STRING
```

Generate secure values:

```bash
# JWT_SECRET (64+ random chars)
openssl rand -hex 64

# ENCRYPTION_KEY (exactly 64 hex chars = 32 bytes)
openssl rand -hex 32
```

#### 7. Install, build, migrate

```bash
npm install
npm run build
npm run db:migrate
npm run db:seed
```

#### 8. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save

# Register PM2 to start on system boot
pm2 startup
# Run the command it outputs (starts with "sudo env PATH=...")
```

#### 9. Verify

```bash
pm2 status          # should show servio-backend as "online"
pm2 logs servio-backend --lines 20
curl http://localhost:3001/health  # should return {"status":"ok"}
```

### Updating production

```bash
cd /opt/servio
chmod +x update.sh
./update.sh
```

The update script pulls latest changes, rebuilds, runs new migrations, and reloads PM2 with zero-downtime.

### Nginx reverse proxy (recommended)

Install Nginx and create a site configuration:

```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/servio
```

Paste this configuration (replace `your-domain.com`):

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL certificates (use certbot or your own)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Serve built frontend files
    root /opt/servio/apps/frontend/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }

    # Proxy WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy uploaded files (logos)
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 1000;
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/servio /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### SSL with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/your-org/servio.git
cd servio
cp .env.example .env
```

Edit `.env` — you must set at minimum:

```env
JWT_SECRET=your_64_char_random_string_here
ENCRYPTION_KEY=your_64_char_hex_string_here
```

### 2. Build and start

```bash
docker compose up -d
```

This starts:
- `postgres` — PostgreSQL 16 on port 5432
- `backend` — Node.js API on port 3001
- `frontend` — Nginx serving the React SPA on port 3000

### 3. Run migrations and seed

```bash
docker compose exec backend sh -c "cd /app/apps/backend && node dist/db/migrate.js"
docker compose exec backend sh -c "cd /app/apps/backend && node dist/db/seed.js"
```

### 4. Access the application

Open **http://localhost:3000** in your browser.

### Docker Compose with custom domain

Edit `docker-compose.yml` to change port bindings, or put an Nginx reverse proxy in front. For HTTPS in Docker, use [Traefik](https://traefik.io/) or a separate Nginx container with Certbot.

### Useful Docker commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart backend only
docker compose restart backend

# Stop everything
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v

# Rebuild after code changes
docker compose build
docker compose up -d
```

---

## Post-Installation Setup

Once the application is running, complete these steps through the web UI.

### 1. Change admin password

1. Log in with `admin@servio.local` / `admin123`
2. Go to **Users** → click the key icon next to the admin account
3. Set a strong password

### 2. Configure SMTP (email delivery)

1. Go to **Settings → SMTP**
2. Fill in your SMTP server details:
   - **Host:** e.g. `smtp.gmail.com` or your mail server
   - **Port:** `587` (STARTTLS) or `465` (SSL)
   - **User:** your email address or username
   - **Password:** your email password or app password
   - **From:** display address, e.g. `Servio <noreply@yourcompany.com>`
   - **SSL/TLS:** enable if using port 465
3. Click **Save**
4. Enter a recipient address and click **Test SMTP** to verify

**Gmail users:** Enable 2FA and create an [App Password](https://myaccount.google.com/apppasswords) instead of using your account password.

### 3. Configure SMB storage

PDF reports are stored to a network share. To configure:

1. Go to **Settings → SMB**
2. Fill in:
   - **Host:** IP address or hostname of the SMB server (e.g. `192.168.1.100`)
   - **Share:** share name (e.g. `reports`)
   - **Username / Password:** SMB credentials
   - **Base Path:** optional subdirectory within the share (leave blank to use the share root)
3. Click **Save**
4. Click **Test SMB** to verify the connection

PDF files will be stored at:
```
{share}/{base-path}/{year}/{contract-number}/{year-month}_{filename}.pdf
```
Example: `\\server\reports\2026\371-2005\2026-04_report.pdf`

**If SMB is not used:** reviews can still be completed — the system will log an error and create a notification, but the review will remain pending until SMB is working. Configure SMB before technicians begin uploading reports.

### 4. Configure application name and logo

1. Go to **Settings → General**
2. Set the **Application Name** (shown in the sidebar, login page, and emails)
3. Optionally upload a **Logo** (PNG, JPG, or SVG, shown on the login page and sidebar)

### 5. Create users

1. Go to **Users → Add User**
2. Fill in name, email, password, and role
3. Assign the appropriate role:
   - **Technician** — uploads PDF reviews
   - **Accountant** — processes invoices
   - **Manager** — monitors contracts and reports
   - **Administrator** — full access

### 6. Create your first contract

1. Go to **Contracts → Add Contract**
2. Fill in customer details, facility details, and contract information
3. Set the review schedule (monthly, biannual, quarterly, or custom months)
4. Assign a technician
5. Save — the scheduler will automatically create the first pending review on the 1st of the next matching month

To create pending reviews immediately (without waiting for the cron job), call the admin endpoint:

```bash
curl -X POST http://localhost:3001/api/scheduler/trigger-reviews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 7. Configure email templates (optional)

Two default templates are created during seeding (Slovenian and English). To customize:

1. Go to **Settings → Templates**
2. Edit or create templates using these variables:
   - `{{customer_name}}` — customer company name
   - `{{facility_name}}` — name of the facility/building
   - `{{month}}` — month name (e.g. "April")
   - `{{year}}` — four-digit year
   - `{{contract_number}}` — contract number
   - `{{app_name}}` — application name from settings

---

## Database Migrations

### Generate new migrations (after schema changes)

```bash
npm run db:generate
```

Review the generated SQL in `apps/backend/src/db/migrations/` before applying.

### Apply migrations

```bash
npm run db:migrate
```

### Explore the database (development only)

```bash
npm run db:studio --workspace=apps/backend
# Opens Drizzle Studio at http://localhost:4983
```

---

## Backup and Restore

### Manual backup

```bash
pg_dump -U servio -h localhost servio > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Automated backups

Configure in **Settings → Backups**:
- Enable automatic backups
- Set a cron schedule (e.g. `0 2 * * *` for daily at 02:00)
- Set the backup storage path

The backup uses `pg_dump` and requires `pg_dump` to be available in the system PATH on the server.

### Restore from backup

```bash
psql -U servio -h localhost servio < backup_20260101_020000.sql
```

---

## Troubleshooting

### Backend won't start

Check the logs:
```bash
pm2 logs servio-backend --lines 50   # production
# or in development:
npm run dev:backend
```

Common causes:
- Missing or incorrect `.env` values
- PostgreSQL not running or wrong credentials
- `ENCRYPTION_KEY` not exactly 64 hex characters

### Database connection failed

```bash
# Test the connection string directly
psql "postgresql://servio:password@localhost:5432/servio" -c "SELECT 1"
```

Ensure PostgreSQL is running:
```bash
sudo systemctl status postgresql
```

### Migrations fail

If you get `relation already exists` errors, the database may have been partially migrated. Check the `drizzle_migrations` table:
```sql
SELECT * FROM drizzle_migrations ORDER BY created_at;
```

### SMB connection fails

- Verify the host is reachable: `ping 192.168.1.100`
- Verify credentials by connecting from another machine
- Ensure SMB2 protocol is enabled on the server (SMB1 is not supported)
- Check firewall rules — SMB uses port 445

### Email test fails

- Verify SMTP credentials are correct
- For Gmail: use an [App Password](https://myaccount.google.com/apppasswords), not your account password
- Check if your server's outbound port 587 or 465 is blocked by a firewall
- Try setting `SMTP_SECURE=false` and port `587` first

### WebSocket disconnects immediately

- Verify the frontend `FRONTEND_URL` in `.env` matches the actual frontend origin
- In production with Nginx, ensure the WebSocket proxy configuration (`/ws` location) is correct
- Check that the JWT token is valid and not expired

### Reviews not being created automatically

The scheduler runs on the 1st of each month at 06:00 server time. To trigger manually:

```bash
curl -X POST http://localhost:3001/api/scheduler/trigger-reviews \
  -H "Authorization: Bearer YOUR_ADMIN_JWT"
```

Or check PM2 is running the backend process:
```bash
pm2 status
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `production` or `development` |
| `PORT` | No | `3001` | Backend HTTP port |
| `FRONTEND_URL` | Yes | — | Frontend URL for CORS (e.g. `https://servio.company.com`) |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for signing JWTs — minimum 64 characters |
| `JWT_EXPIRES_IN` | No | `8h` | JWT expiry duration |
| `ENCRYPTION_KEY` | Yes | — | 64 hex chars (32 bytes) for encrypting SMTP/SMB passwords |
| `SMTP_HOST` | No | — | Initial SMTP host (can be changed in Settings UI) |
| `SMTP_PORT` | No | `587` | Initial SMTP port |
| `SMTP_USER` | No | — | Initial SMTP username |
| `SMTP_PASS` | No | — | Initial SMTP password |
| `SMTP_FROM` | No | — | Initial SMTP from address |
| `SMTP_SECURE` | No | `false` | Use SSL/TLS for SMTP |
| `SMB_HOST` | No | — | Initial SMB host |
| `SMB_SHARE` | No | — | Initial SMB share name |
| `SMB_USERNAME` | No | — | Initial SMB username |
| `SMB_PASSWORD` | No | — | Initial SMB password |
| `SMB_BASE_PATH` | No | — | Initial SMB base path |
| `BACKUP_PATH` | No | `./backups` | Directory for database backups |

> SMTP and SMB settings defined in `.env` are used as initial values only. Once saved through the Settings UI, the UI values take precedence (stored encrypted in the database).

---

## System Requirements

### Minimum (small deployment, < 20 users)

| Resource | Minimum |
|----------|---------|
| CPU | 2 cores |
| RAM | 2 GB |
| Disk | 20 GB SSD |
| OS | Ubuntu 22.04 LTS |

### Recommended (production)

| Resource | Recommended |
|----------|-------------|
| CPU | 4 cores |
| RAM | 4 GB |
| Disk | 50 GB SSD |
| OS | Ubuntu 22.04 LTS |

For large PDF file volumes, ensure the SMB network share has sufficient capacity. The application server itself stores only uploaded logos locally (`/opt/servio/uploads`).
