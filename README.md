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

| Role | Contracts | Upload PDF | Invoices | Reports | Users | Settings |
|------|-----------|-----------|----------|---------|-------|----------|
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **manager** | ✅ | ✅ | ✅ | ✅ | ✅ view | ❌ |
| **accountant** | 👁 view | ❌ | ✅ | ✅ | ❌ | ❌ |
| **technician** | 👁 view | ✅ | ❌ | ❌ | ❌ | ❌ |

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

### Notification Center
Bell icon in the top navigation shows:
- SMB save failures
- Email send failures
- Backup failures
- Review completions
- Overdue reviews

### Reports
- Monthly report export as PDF (Puppeteer) or XLSX (ExcelJS)
- Includes review summary, invoice summary

### Bilingual Support
- Slovenian (default) and English
- Language preference stored per user in database
- Browser language detection before login
- All UI strings use translation keys — no hardcoded text
- Backend returns machine-readable error keys only

### Security
- Helmet security headers
- CORS restricted to frontend origin
- Rate limiting: 5 login attempts per 15 minutes, 300 API requests per minute
- JWT authentication (8-hour expiry)
- Role-based route protection
- SMTP and SMB passwords encrypted at rest with AES-256-GCM
- Full audit log for every mutating action
- File upload validation (PDF only for reports, PNG/JPG/SVG for logos)
- Max upload size: 50 MB

## API Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | /api/auth/login | public | Login |
| POST | /api/auth/logout | auth | Logout |
| GET | /api/auth/me | auth | Current user |
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
| POST | /api/smb/test | admin | Test SMB connection |
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
