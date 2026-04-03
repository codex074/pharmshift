# CLAUDE.md — PharmShift (เวรดี๊ดี)

ระบบจัดตารางเวรเภสัชกรสำหรับโรงพยาบาลอุตรดิตถ์
Full-stack Next.js 14 app ใช้ TypeScript, Supabase, Tailwind CSS, Radix UI

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.2.5 |
| Language | TypeScript (strict mode) | 5 |
| Styling | Tailwind CSS + Radix UI | 3.4.1 + v1-v2 |
| Database | Supabase (PostgreSQL) | Latest |
| Auth | Custom JWT (jose) — NOT Supabase Auth | 6.1.3 |
| Real-time | Supabase Realtime (postgres_changes) | Built-in |
| Push Notifications | Web Push API + web-push library | 3.6.7 |
| PWA | Web App Manifest + Service Worker | Manual |
| Excel Export | ExcelJS | 4.4.0 |
| Excel Import | XLSX | 0.18.5 |
| Icons | Lucide React | 0.395.0 |
| Toast | Sonner | — |
| Alert dialogs | SweetAlert2 | 11.26.20 |
| Date handling | date-fns (Thai locale) | 3.6.0 |
| Deployment | Vercel + GitHub Actions (cron) | — |
| Testing | Playwright (installed, not yet configured) | 1.58.2 |

---

## Project Structure

```
pharmshift/
├── app/
│   ├── api/              # API routes (REST)
│   │   ├── auth/         # login, logout, me, change-password
│   │   ├── admin/        # shifts CRUD, user management
│   │   ├── shifts/       # Excel upload/import
│   │   ├── swap/         # swap/transfer acceptance
│   │   ├── push/         # Web Push subscribe/send
│   │   ├── notifications/# in-app notification CRUD
│   │   ├── holidays/     # holiday management
│   │   └── cron/         # reminders, cleanup jobs
│   ├── calendar/         # main calendar page (~1000+ LOC)
│   ├── login/
│   ├── change-password/
│   ├── layout.tsx        # root layout + PWA provider
│   └── page.tsx          # redirect → /calendar
├── components/
│   ├── calendar/         # 30+ calendar components & modals
│   ├── swap/             # SwapModal, NotificationsPanel
│   ├── layout/           # Header, MobileBottomNav, MobileAdminMenu
│   ├── pwa/              # PWAProvider
│   ├── ui/               # ripple, loading-overlay, icons3d
│   └── providers/        # Context providers
├── hooks/
│   ├── useShifts.ts      # shifts + realtime subscription
│   ├── useIsMobile.ts    # viewport detection
│   └── useSwipeGesture.ts# touch swipe for mobile
├── lib/
│   ├── types.ts          # domain types (User, Shift, SwapRequest, etc.)
│   ├── utils.ts          # calendar grid, Thai locale, overlap detection
│   ├── session.ts        # JWT session helpers
│   ├── supabase.ts       # client-side Supabase instance
│   ├── supabaseServer.ts # server-side Supabase (SSR)
│   ├── pushNotifications.ts  # client-side push (subscribe/unsubscribe)
│   ├── pushSender.ts     # server-side push (sendPushToUser/Users)
│   ├── swal.ts           # SweetAlert2 helpers (toastSuccess/Error)
│   ├── excelExport.ts    # 4 Excel report types
│   ├── scheduleTableExport.ts
│   ├── signSheetExport.ts
│   ├── calendarMonthGrid.ts
│   └── notifyUsers.ts
├── supabase/migrations/  # SQL schema definitions
├── public/
│   ├── manifest.json     # PWA manifest
│   ├── sw.js             # Service Worker
│   └── guide.pdf, sample_shifts.xlsx
├── .github/workflows/cron.yml  # GitHub Actions cron jobs
├── middleware.ts         # JWT auth + rolling refresh
├── tailwind.config.ts
├── next.config.mjs
└── .env.local            # (not committed — see below)
```

---

## Authentication

- **Custom JWT, not Supabase Auth**
- Cookie name: `pharmshift_session` (HttpOnly, 30-day expiry)
- JWT signed with HS256 using Supabase anon key as secret
- Payload: `{ id, pha_id, role, is_sub_admin, must_change_password }`
- **Rolling refresh**: middleware re-signs token if <15 days remaining
- Password stored **plain-text in DB** (known limitation)
- `must_change_password` flag → forces reset on first login

### Session helpers (lib/session.ts)
```ts
getSession(request)   // decrypt cookie → payload
isAdmin(user)
isAdminLike(user)     // admin OR sub_admin
canManageRoleGroup(user, roleGroup)
```

---

## Database Schema (Supabase PostgreSQL)

| Table | Purpose |
|-------|---------|
| `users` | Staff accounts (pha_id, role, is_sub_admin, is_active, is_readonly) |
| `departments` | Work units: ER, MED, SURG, รุ่งอรุณ, SMC, Chemo |
| `shifts` | Assigned shifts (user_id, original_user_id, shift_type, position, date) |
| `swap_requests` | Shift exchanges (swap/transfer/cover, status: pending/accepted/rejected) |
| `holidays` | Public holidays |
| `published_months` | Month publication status per role |
| `push_subscriptions` | Device VAPID endpoints |
| `notifications` | In-app notification log |
| `shift_logs` | Audit trail for shift changes |

### Key field: `original_user_id`
Set immutably when shift is first assigned. Survives swaps. Used for compensation/evidence reporting.

---

## Domain Concepts

### Roles
```ts
type UserRole = 'admin' | 'pharmacist' | 'pharmacy_technician' | 'officer'
```
- Sub-admin (`is_sub_admin`): Non-admin that can manage their own role group

### Shift Types (5 kinds)
| Type | Thai | Time | Notes |
|------|------|------|-------|
| `เช้า` | Morning | 08:30–16:30 | Weekdays + holidays |
| `บ่าย` | Afternoon | 16:30–23:59 | All days |
| `ดึก` | Night | 00:00–08:30 | Modeled as 1440–1950 min for overlap logic |
| `รุ่งอรุณ` | Dawn | 07:00–08:30 | Weekdays only |
| `smc` | SMC Clinic | 16:30–20:30 | Mon–Thu only |

### Overlap Detection
- Time ranges stored as minutes from midnight
- `ดึก` modeled as 1440–1950 (next day) to avoid false collision
- Validates: no overlapping shifts, no `ดึก→เช้า` consecutive sequence
- Functions: `shiftsOverlap()`, `findConflictingShifts()` in `lib/utils.ts`

### Publication Workflow
- `published_months` table has per-role flags
- Swap requests only allowed on published months
- Cron reminders only sent for published months

---

## API Patterns

All API routes are under `app/api/`. Pattern: `NextResponse.json(data)` or `NextResponse.json({ error }, { status: N })`.

### Common routes
```
POST   /api/auth/login
GET    /api/auth/me
GET    /api/auth/logout
POST   /api/auth/change-password

GET    /api/admin/shifts?month=2026-03&role=pharmacist&page=0
PUT    /api/admin/shifts
DELETE /api/admin/shifts

POST   /api/shifts/upload          # Excel import
POST   /api/swap/accept            # Swap/transfer with overlap validation

GET    /api/notifications
POST   /api/notifications
PUT    /api/notifications          # mark all read

POST   /api/push/subscribe
DELETE /api/push/subscribe
POST   /api/push/send

GET    /api/cron/shift-reminders?run=morning|evening
GET    /api/cron/cleanup
```

---

## State Management

No Redux/Zustand. Uses React hooks + Supabase Realtime.

### Key hooks
| Hook | State |
|------|-------|
| `useShifts()` | shifts, holidays, publishStatus, loading; Realtime subscription |
| `useSwapRequests()` | incoming/outgoing requests, pending count |
| `useNotifications()` | notification list, mark-as-read |
| `useCurrentUser()` | calls `/api/auth/me` once on mount |
| `useIsMobile()` | viewport ≤768px |
| `useSwipeGesture()` | touch swipe for month navigation |

### Calendar page state
- `year`, `month`, `selectedDay`, `viewMode` ('all' | 'mine')
- `isEditMode`, `pendingEdits`, `pendingDeletes`, `pendingAdds`
- Individual `showXxxModal` booleans per modal

---

## Styling

- **Tailwind CSS v3** with `cn()` helper (`clsx` + `tailwind-merge`)
- **Dark mode**: class-based (`darkMode: ["class"]`)
- **Radix UI**: Dialog, Dropdown, Popover, Select, Tabs, Tooltip, Avatar, Separator
- Shift colors: เช้า=amber, บ่าย=sky, ดึก=indigo, รุ่งอรุณ=orange, smc=purple
- Department colors defined in `DEPT_COLORS` constant in `lib/types.ts`

---

## Coding Conventions

### Naming
- `camelCase` — functions, variables, props
- `PascalCase` — React components, interfaces, types
- `CONSTANT_CASE` — color maps, labels (e.g. `DEPT_COLORS`, `ROLE_LABELS`)
- Thai text used in all UI-facing strings

### File conventions
- API routes: `app/api/.../route.ts` (Next.js App Router convention)
- Components: default export, PascalCase filename
- Utilities: named exports from `lib/`
- Types: defined in `lib/types.ts`, not colocated

### Supabase usage
```ts
// Client-side (browser)
import { supabase } from '@/lib/supabase'
supabase.from('shifts').select('...').eq('user_id', id)

// Server-side (API routes / middleware)
import { createSupabaseServer } from '@/lib/supabaseServer'
const supabase = createSupabaseServer()

// Service role (bypass RLS)
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, serviceRoleKey)
```

### Error handling
- API: `return NextResponse.json({ error: 'message' }, { status: 400 })`
- Client: `toast.error()` (sonner) for transient errors, `Swal.fire()` for confirmations
- All async functions wrapped in try/catch

### Date/locale
```ts
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
format(date, 'd MMM yyyy', { locale: th })  // "15 มี.ค. 2569"
```
- Thai Buddhist era displayed in UI (พ.ศ. = ค.ศ. + 543)
- `formatThaiMonth()` in `lib/utils.ts` for month display

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Web Push VAPID
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:pharmacy@uttaradit-hospital.go.th

# Cron security
CRON_SECRET=
APP_URL=https://pharmshift.vercel.app
```

---

## Excel Import/Export

### Import (XLSX library)
- `POST /api/shifts/upload` — parse Excel, map shift codes per role, bulk insert
- Role-specific shift code mapping (e.g. pharmacist: `E`=ER/เช้า, `ด`=ER/ดึก, `SMC`=SMC/บ่าย)
- Overwrite mode: delete existing shifts for month before inserting

### Export (ExcelJS library)
4 report types in `lib/excelExport.ts`:
1. **Evidence sheet** — uses `original_user_id` (pre-swap)
2. **Compensation** — per-employee calculation, Thai Baht text
3. **Schedule table** — calendar grid with colors
4. **Sign-in sheet** — monthly attendance record

---

## PWA & Push Notifications

### Service Worker (`public/sw.js`)
- Handles `push` and `notificationclick` events
- Brings app to foreground on click
- No offline caching

### Cron Jobs (GitHub Actions)
- `06:00 BKK` (23:00 UTC): morning reminders → today's shifts
- `16:00 BKK` (09:00 UTC): evening reminders → tomorrow's shifts
- `04:00 BKK` (21:00 UTC): cleanup old notifications/logs
- Triggered via: `GET /api/cron/...` with `Authorization: Bearer CRON_SECRET`

---

## Scripts

```bash
npm run dev    # dev server with HMR
npm run build  # production build
npm start      # production server
npm run lint   # ESLint check
```

---

## Key Files Quick Reference

| File | What it does |
|------|-------------|
| `lib/types.ts` | All domain types + role helpers + shift time-slot rules + color configs |
| `lib/utils.ts` | `buildCalendarDays()`, `shiftsOverlap()`, `cn()`, Thai date helpers |
| `lib/session.ts` | JWT sign/verify, `getSession()` |
| `middleware.ts` | Route protection + rolling JWT refresh |
| `app/calendar/page.tsx` | Main page — all state, modal controls, role-based views |
| `hooks/useShifts.ts` | Core data hook with Realtime subscription |
| `app/api/swap/accept/route.ts` | Complex swap logic: overlap check + notify |
| `app/api/shifts/upload/route.ts` | Excel parse → DB insert with shift code mapping |
| `app/api/cron/shift-reminders/route.ts` | Scheduled push notification logic |
| `lib/excelExport.ts` | All 4 Excel export report generators |
