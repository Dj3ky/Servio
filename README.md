# Servio

Internal business platform for managing maintenance contracts, monthly service reviews, PDF reports, and invoice processing.

## Overview

Servio is a production-oriented full-stack web application used daily by:

- **Technicians** — perform maintenance reviews and upload PDF reports
- **Accountants** — process invoices from completed reviews
- **Managers** — monitor contracts, reports, statistics, and audit logs
- **Administrators** — manage users, settings, and system configuration

## Core Business Flow

```
Admin creates contract
        │
        ▼
Scheduler creates pending review (monthly/biannual/quarterly/custom)
        │
        ▼
Technician uploads PDF report
        │
        ▼
System saves PDF to SMB storage ──► sends email to customer
        │
        ▼
Review marked completed ──► pending invoice created
        │
        ▼
Accountant processes invoice (marks sent/completed)
        │
        ▼
Managers monitor reports and statistics
```

## Tech Stack

### Backend
| Package | Purpose |
|---------|---------|
| Node.js 20 LTS + Express | HTTP server |
| PostgreSQL 16 | Database |
| Drizzle ORM | Type-safe ORM + migrations |
| JWT + bcryptjs | Authentication |
| Zod | Schema validation |
| ws | WebSocket realtime events |
| Nodemailer | Email delivery |
| Multer | File upload handling |
| node-cron | Review scheduling |
| @marsaud/smb2 | SMB network storage |
| Puppeteer | PDF report generation |
| ExcelJS | XLSX report export |
| Helmet + CORS | Security headers |
| express-rate-limit | Rate limiting |

### Frontend
| Package | Purpose |
|---------|---------|
| React 18 + Vite | UI framework + build |
| React Router v6 | Client-side routing |
| TanStack Query v5 | Server state management |
| TanStack Table v8 | Data tables |
| Tailwind CSS + shadcn/ui | Styling + components |
| Zustand | Client state (auth, settings) |
| react-i18next | Bilingual UI (SL/EN) |
| react-hot-toast | Toast notifications |
| Recharts | Dashboard charts |
| react-dropzone | PDF drag-and-drop upload |
| Framer Motion | Animations |
| date-fns | Date formatting |

### Shared Package
- Zod schemas (source of truth for validation)
- TypeScript types derived from schemas
- WebSocket event type definitions

## Project Structure

```
servio/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/          # Environment config
│   │   │   ├── db/
│   │   │   │   ├── schema/      # Drizzle table definitions + relations
│   │   │   │   ├── migrations/  # Generated SQL migrations
│   │   │   │   ├── migrate.ts   # Migration runner
│   │   │   │   └── seed.ts      # Initial data seeder
│   │   │   ├── middleware/      # auth, role, upload
│   │   │   ├── routes/          # Express route handlers
│   │   │   ├── services/        # email, smb, pdf, backup, scheduler
│   │   │   ├── utils/           # crypto, audit logging
│   │   │   ├── ws/              # WebSocket server
│   │   │   ├── app.ts           # Express app setup
│   │   │   └── server.ts        # HTTP server entry point
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/          # shadcn/ui components
│       │   │   ├── layout/      # Sidebar, Topbar, NotificationCenter
│       │   │   └── auth/        # ProtectedRoute
│       │   ├── hooks/           # useWebSocket, useDebounce
│       │   ├── lib/             # api client, queryClient, utils
│       │   ├── locales/         # sl.json, en.json, i18n config
│       │   ├── pages/           # All application pages
│       │   ├── stores/          # Zustand stores (auth, settings, notifications)
│       │   ├── router.tsx       # Route definitions
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── package.json
└── packages/
    └── shared/
        └── src/
            ├── enums.ts         # Domain enums
            ├── schemas/         # Zod schemas for all entities
            ├── types/           # API + WebSocket types
            └── index.ts
```

## User Roles

Default permissions (overridable via the Permissions Editor in Settings):

| Role | Contracts | Upload PDF | Invoices | Reports | Users | Settings | Audit Log | Timeline | License/Backup |
|------|-----------|-----------|----------|---------|-------|----------|-----------|----------|----------------|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **manager** | ✅ | ✅ | ✅ | ✅ | 👁 view | 👁 view/templates | ✅ | ✅ | ❌ |
| **accountant** | 👁 view | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **technician** | 👁 view | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

## Features

### Review Workflow
1. Cron job runs on the 1st of each month at 06:00 — creates pending reviews for all active contracts matching their schedule
2. Technician opens a pending review and uploads a PDF report (drag & drop supported)
3. PDF is saved to SMB network share at path: `{base}/{year}/{contract_number}/{year-month}_{filename}.pdf`
4. Customer email is sent with PDF attachment using the configured email template
5. Review is marked completed and a pending invoice is created automatically
6. Dashboard and invoice queue update in realtime via WebSocket

**Failure handling:**
- If SMB save fails → review stays pending, invoice is NOT created, notification is created, error shown in UI
- If email fails → review is still completed (SMB saved), warning shown in UI

### Review Schedules
- **Monthly** — creates review every month
- **Biannual** — creates reviews in January and July
- **Quadannual** — creates reviews in January, April, July, October
- **Custom** — admin selects specific months (e.g. [3, 6, 9, 12])

### Password Reset
1. User clicks "Forgot password" on the login page and submits their email
2. If the account exists and is active, a reset link is sent via email (expires in 1 hour)
3. The link opens `/reset-password?token=...` where the user sets a new password
4. Token is invalidated after use — always returns success to avoid email enumeration

### Notification Center
Bell icon in the top navigation shows:
- SMB save failures
- Email send failures
- Backup failures
- Review completions
- Overdue reviews

### Contract Timeline
- Calendar-style view showing all reviews for a selected month across all contracts
- Displays review status, email delivery, SMB save state, and linked invoice per contract
- Accessible at `/contract-timeline` (role-restricted by `contractTimeline.access` permission)

### Reports
- Monthly report export as PDF (Puppeteer) or XLSX (ExcelJS)
- Includes review summary, invoice summary

### Bilingual Support
- Slovenian (default) and English
- Language preference stored per user in database
- Browser language detection before login
- All UI strings use translation keys — no hardcoded text
- Backend returns machine-readable error keys only

### Backup & Restore
- On-demand backup triggered from the Settings page (admin only)
- Scheduled automatic backup via configurable cron expression
- Backup bundle = `pg_dump` SQL + `uploads/` directory archived as `.tar.gz`
- Optional automatic copy of each backup to SMB/NAS after creation
- Download the latest backup SQL directly from the UI
- Restore by uploading a `.sql` file via the Settings page — runs `psql` against the configured database
- Backup failures create a notification and broadcast a WebSocket event

### License
- RSA-signed JWT license file verified against a built-in public key
- License payload: `customer`, `seats`, `features[]`, `domain`, `perpetual`, `expiresAt`
- Supplied via `LICENSE_KEY` env var, `license.key` file, or uploaded through the Settings page (stored in DB)
- Uploaded license is validated before persisting — invalid/expired files are rejected
- When no public key is configured (development), license enforcement is skipped

### Permissions Editor
- All per-action role assignments are defined in `packages/shared/src/permissions.ts` as the default
- Admins can override the defaults from the Settings page — changes are persisted in the database
- Backend loads the active permissions map at startup and uses it for all route guards
- `ProtectedRoute` on the frontend reads the same permissions to show/hide UI elements

### Security
- Helmet security headers
- CORS restricted to frontend origin
- Rate limiting: 5 login attempts per 15 minutes, 3 password reset requests per 15 minutes, 300 API requests per minute
- JWT authentication (8-hour expiry)
- Role-based and permission-based route protection
- SMTP and SMB passwords encrypted at rest with AES-256-GCM
- Full audit log for every mutating action
- File upload validation (PDF only for reports, PNG/JPG/SVG for logos, `.key` for license, `.sql` for restore)
- Max upload size: 50 MB

## API Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | /api/auth/login | public | Login |
| POST | /api/auth/logout | auth | Logout |
| GET | /api/auth/me | auth | Current user |
| POST | /api/auth/forgot-password | public | Request password reset email |
| POST | /api/auth/reset-password | public | Reset password via token |
| GET | /api/settings/public | public | App name, logo, language |
| GET | /api/dashboard | auth | Dashboard stats |
| GET/POST | /api/contracts | auth | List / create contracts |
| PATCH | /api/contracts/:id | manager+ | Update contract |
| GET/POST | /api/facilities | auth | List / create facilities |
| GET | /api/facilities/:id | auth | Facility detail with contracts |
| GET | /api/reviews | auth | List reviews |
| POST | /api/reviews/:id/upload | technician+ | Upload PDF + complete review |
| GET | /api/invoices/pending | accountant+ | Pending invoice queue |
| PATCH | /api/invoices/:id | accountant+ | Update invoice status |
| GET | /api/reports/monthly/pdf | accountant+ | Download PDF report |
| GET | /api/reports/monthly/xlsx | accountant+ | Download XLSX report |
| GET/PATCH | /api/settings | admin | View / update settings |
| POST | /api/settings/smtp/test | admin | Test SMTP connection |
| POST | /api/settings/backup | admin | Trigger on-demand backup |
| GET | /api/settings/backup/download | admin | Download latest backup SQL |
| POST | /api/settings/restore | admin | Restore from uploaded .sql file |
| POST | /api/smb/test | admin | Test SMB connection |
| GET | /api/license/status | auth | Current license status |
| POST | /api/license/upload | admin | Upload license key file |
| GET | /api/notifications | auth | List notifications |
| GET | /api/audit-logs | manager+ | Audit log (paginated) |
| GET/POST | /api/users | admin | Manage users |

## WebSocket Events

Connect to `ws://{host}/ws?token={jwt}` after authentication.

| Event | Payload | Triggered by |
|-------|---------|-------------|
| `review_completed` | reviewId, contractId, facilityName | Review upload |
| `invoice_created` | invoiceId, contractId, facilityName | Review completion |
| `invoice_updated` | invoiceId, status | Invoice status change |
| `facility_updated` | facilityId | Facility edit |
| `notification_created` | id, type, title, message | Any system error/event |
| `dashboard_refresh` | — | Review or invoice change |

## Environment Variables

See [`.env.example`](.env.example) for the full list. Critical variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Min 64 characters, random |
| `ENCRYPTION_KEY` | 32-byte hex string (64 chars) for password encryption |
| `FRONTEND_URL` | CORS origin for the frontend |
| `PORT` | Backend port (default: 3001) |
| `LICENSE_KEY` | License JWT string (optional — alternative to `license.key` file) |
| `LICENSE_KEY_PATH` | Path to license key file (default: `./license.key`) |

## Development

See [INSTALL.md](INSTALL.md) for full setup instructions.

```bash
# Quick start
cp .env.example .env        # configure environment
npm install                  # install all workspace dependencies
npm run db:generate          # generate migration files
npm run db:migrate           # apply migrations
npm run db:seed              # create admin user + default data
npm run dev                  # start backend (:3001) + frontend (:3000)
```

Default admin account after seeding:
- **Email:** `admin@servio.local`
- **Password:** `admin123`

> Change the admin password immediately after first login.

## License

Proprietary — internal use only.
