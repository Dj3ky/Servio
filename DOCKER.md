# Docker Deployment Guide

## Requirements

- Docker Engine 24+ and Docker Compose v2
- At least 2 GB RAM (Puppeteer + PostgreSQL)
- A valid `license.key` file **or** the token set as `LICENSE_KEY` env var

---

## Environment variables

Create a `.env` file in the project root before starting:

```env
JWT_SECRET=<64-char random hex>
ENCRYPTION_KEY=<64-char random hex>

# Paste the full JWT token from your license.key here (alternative to mounting the file)
LICENSE_KEY=
```

Generate the secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run twice — once for `JWT_SECRET`, once for `ENCRYPTION_KEY`.

---

## Option 1 — Synology NAS / any Linux host (SSH)

```bash
# Clone or copy project to the host
git clone https://github.com/dj3ky/servio.git /volume1/docker/servio
cd /volume1/docker/servio

# Create .env
cp .env.example .env
nano .env   # fill in JWT_SECRET, ENCRYPTION_KEY, LICENSE_KEY

# Build and start (COMMIT_SHA bakes the current version into the image)
COMMIT_SHA=$(git rev-parse HEAD) docker compose up -d --build
```

On first run the backend automatically runs database migrations and the
app is available at `http://<host-ip>:3000`.

Default login: `admin@servio.local` / `admin123`

### Updating (SSH)

```bash
cd /volume1/docker/servio
git pull
COMMIT_SHA=$(git rev-parse HEAD) docker compose up -d --build backend
```

---

## Option 2 — Portainer (Git repository stack)

1. Push your fork to GitHub (already at `https://github.com/dj3ky/servio`)
2. In Portainer → **Stacks → Add stack → Repository**
   - Repository URL: `https://github.com/dj3ky/servio`
   - Compose file path: `docker-compose.yml`
3. Under **Environment variables** add:
   - `JWT_SECRET` → your 64-char hex value
   - `ENCRYPTION_KEY` → your 64-char hex value
   - `LICENSE_KEY` → your license JWT token
   - `COMMIT_SHA` → output of `git rev-parse HEAD` on your machine
4. Click **Deploy the stack**

To update: go to the stack in Portainer → **Pull and redeploy**.

---

## Option 3 — Portainer (pre-built images)

Build images on your dev machine and push to Docker Hub, then deploy
with the compose file below — no build context needed on the NAS.

### Build and push (dev machine)

```bash
cd d:/GitHub/Servio

COMMIT_SHA=$(git rev-parse HEAD)

docker build \
  --build-arg COMMIT_SHA=$COMMIT_SHA \
  -f apps/backend/Dockerfile \
  -t dj3ky/servio-backend:latest \
  -t dj3ky/servio-backend:$COMMIT_SHA \
  .

docker build \
  -f apps/frontend/Dockerfile \
  -t dj3ky/servio-frontend:latest \
  -t dj3ky/servio-frontend:$COMMIT_SHA \
  .

docker push dj3ky/servio-backend:latest
docker push dj3ky/servio-frontend:latest
```

### Portainer compose (paste into Web editor)

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: servio
      POSTGRES_PASSWORD: servio_password
      POSTGRES_DB: servio
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U servio -d servio']
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: dj3ky/servio-backend:latest
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://servio:servio_password@postgres:5432/servio
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      FRONTEND_URL: http://localhost:3000
      LICENSE_KEY: ${LICENSE_KEY}
      COMMIT_SHA: ${COMMIT_SHA}
    ports:
      - '3001:3001'
    volumes:
      - uploads:/app/uploads
      - backups:/app/backups
    depends_on:
      postgres:
        condition: service_healthy

  frontend:
    image: dj3ky/servio-frontend:latest
    restart: unless-stopped
    ports:
      - '3000:80'
    depends_on:
      - backend

volumes:
  postgres_data:
  uploads:
  backups:
```

In Portainer → **Stacks → Add stack → Web editor**, paste the above,
then set `JWT_SECRET`, `ENCRYPTION_KEY`, `LICENSE_KEY`, and `COMMIT_SHA`
under **Environment variables**.

### Updating (pre-built images)

1. Build and push new images on your dev machine (same commands as above)
2. In Portainer → stack → **Pull and redeploy**

---

## License key

The license can be provided in two ways (checked in this order):

1. **`LICENSE_KEY` env var** — paste the JWT token directly into Portainer
   or your `.env` file. Recommended for Docker.
2. **`license.key` file** — place the file next to `docker-compose.yml`
   on the host and add this volume to the backend service:
   ```yaml
   - ./license.key:/app/apps/backend/license.key:ro
   ```

Once the app is running you can also upload the license file through
**Settings → License** in the Servio UI — it will be saved to the
database and survive container restarts.

---

## Reverse proxy (HTTPS)

### Synology DSM

Control Panel → Login Portal → Advanced → Reverse Proxy → Add:

| Field | Value |
|---|---|
| Source protocol | HTTPS |
| Source hostname | `servio.yourdomain.com` |
| Source port | 443 |
| Destination | HTTP `localhost:3000` |

Enable **WebSocket** support in the rule's Custom Header tab.

### nginx (standalone)

```nginx
server {
    listen 443 ssl;
    server_name servio.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Useful commands

```bash
# View logs
docker compose logs -f backend

# Open a shell in the backend container
docker compose exec backend sh

# Force re-seed (careful — resets admin password)
docker compose exec backend node dist/db/seed.js

# Backup database manually
docker compose exec postgres pg_dump -U servio servio > backup.sql
```
