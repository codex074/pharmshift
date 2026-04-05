# CLAUDE.md — PharmShift (เวรดี๊ดี)

ระบบจัดตารางเวรเภสัชกรโรงพยาบาลอุตรดิตถ์
Full-stack Next.js 14 · TypeScript · Supabase · Tailwind CSS · Radix UI

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 14.2.5 |
| Language | TypeScript (strict) | 5 |
| Styling | Tailwind CSS + Radix UI | 3.4.1 |
| Database | Supabase (PostgreSQL) | Latest |
| Auth | Custom JWT (jose) — NOT Supabase Auth | 6.1.3 |
| Real-time | Supabase Realtime (postgres_changes) | Built-in |
| Push | Web Push API + web-push | 3.6.7 |
| PWA | Manifest + Service Worker (manual) | — |
| Excel Export | ExcelJS | 4.4.0 |
| Excel Import | XLSX | 0.18.5 |
| Icons | Lucide React | 0.395.0 |
| Toast | Sonner | 1.5.0 |
| Alerts | SweetAlert2 | 11.26.20 |
| Dates | date-fns (Thai locale) | 3.6.0 |
| Deploy | Vercel + GitHub Actions (cron) | — |
| Testing | Playwright (installed, not configured) | 1.58.2 |

---

## Project Structure

```
pharmshift/
├── app/
│   ├── api/
│   │   ├── auth/           # login, logout, me, change-password
│   │   ├── admin/
│   │   │   ├── shifts/     # GET(paginated) PUT DELETE PATCH(fix-suspicious)
│   │   │   └── users/      # GET POST PUT + reset-password
│   │   ├── shifts/upload/  # Excel import → upsert
│   │   ├── swap/accept/    # swap/transfer/cover + collision check
│   │   ├── push/           # subscribe (POST/DELETE), send (POST)
│   │   ├── notifications/  # GET POST PUT(mark-read)
│   │   ├── holidays/       # GET POST DELETE/[id] + import
│   │   ├── user/profile/   # PUT (self-update)
│   │   └── cron/           # shift-reminders, test-reminders, cleanup
│   ├── calendar/page.tsx   # Main page — all state + modal orchestration (~1000 LOC)
│   ├── login/
│   ├── change-password/
│   ├── layout.tsx          # Root layout + PWAProvider
│   └── page.tsx            # redirect → /calendar
├── components/
│   ├── calendar/           # CalendarGrid, MyCalendarGrid, role-specific grids,
│   │                       # DayCell, ShiftBadge, DayDetailModal, ShiftDetailModal,
│   │                       # MobileCalendarGrid, MobileEditDayModal,
│   │                       # Admin*Modal (8 modals), ShiftUploadModal,
│   │                       # DeployModal, PersonalShiftsModal, CompensationModal,
│   │                       # ExportButtons (3 types), HelpGuideModal
│   ├── swap/               # SwapModal, NotificationsPanel
│   ├── layout/             # Header, MobileBottomNav, MobileAdminMenu
│   ├── pwa/                # PWAProvider
│   ├── ui/                 # ripple, loading-overlay, icons3d
│   └── providers/          # Context providers
├── hooks/
│   ├── useShifts.ts        # shifts + holidays + publishStatus + Realtime
│   ├── useSwapRequests.ts  # incoming/outgoing requests + actions
│   ├── useNotifications.ts # notification list + mark-as-read
│   ├── useCurrentUser.ts   # /api/auth/me on mount
│   ├── useIsMobile.ts      # viewport ≤ 767px
│   └── useSwipeGesture.ts  # touch swipe (month navigation)
├── lib/
│   ├── types.ts            # All domain types + constants + role helpers
│   ├── utils.ts            # buildCalendarDays, shiftsOverlap, cn(), Thai dates
│   ├── session.ts          # JWT sign/verify/cookie helpers
│   ├── supabase.ts         # Client-side Supabase (anon key)
│   ├── supabaseServer.ts   # Server-side Supabase (SSR cookie adapter)
│   ├── excelExport.ts      # Evidence + Compensation Excel (5 sheets, Thai font)
│   ├── scheduleTableExport.ts  # Schedule calendar Excel (week layout, colored)
│   ├── signSheetExport.ts  # Swap sign-off sheets Excel (7 sheet configs)
│   ├── calendarMonthGrid.ts    # buildCalendarWeeks/Days — 42-cell grid builder
│   ├── pushSender.ts       # Server-side Web Push (sendPushToUser/Users)
│   ├── pushNotifications.ts    # Client-side PWA (subscribe, permission)
│   ├── swal.ts             # SweetAlert2 helpers (toastSuccess/Error)
│   └── notifyUsers.ts      # Utility — send push + in-app to user list
├── supabase/migrations/    # SQL schema
├── public/
│   ├── manifest.json       # PWA (name: เวรดี๊ดี, theme: #8b5cf6, standalone)
│   ├── sw.js               # Service Worker (push + notificationclick)
│   └── guide.pdf, sample_shifts.xlsx
├── .github/workflows/cron.yml  # GitHub Actions cron (BKK time)
├── middleware.ts           # JWT auth + rolling refresh (<15 days → re-sign)
├── tailwind.config.ts
├── next.config.mjs         # { reactStrictMode: true }
└── .env.local              # not committed
```

---

## Authentication

- **Custom JWT, not Supabase Auth**
- Cookie: `pharmshift_session` (HttpOnly, 30-day, secure prod, sameSite=lax)
- Algorithm: HS256 signed with Supabase anon key as secret
- Payload: `{ id, pha_id, role, is_sub_admin, must_change_password }`
- **Rolling refresh**: middleware re-signs if <15 days remaining (prevents 7-day iOS purge)
- Password stored **plain-text in DB** (known limitation; default '1234', must_change_password flag)
- Disabled accounts (`is_active=false`) blocked at login
- Read-only accounts (`is_readonly=true`) can view but not be assigned/swap

### Session helpers (`lib/session.ts`)
```ts
createSession(user)   // encrypt → set cookie
getSession()          // read cookie → decrypt payload
clearSession()        // delete cookie
decrypt(token)        // verify JWT → payload | null
```

---

## Database Schema

| Table | Key Columns |
|-------|------------|
| `users` | id, pha_id, prefix, f_name, l_name, nickname, role, is_sub_admin, is_active, is_readonly, password, must_change_password, salary_number |
| `departments` | id, name |
| `shifts` | id, date, user_id, **original_user_id** (immutable), department_id, shift_type, position, month_year |
| `swap_requests` | id, shift_id, requester_id, target_user_id, request_type, target_shift_id, status, message, requester_read |
| `holidays` | id, date (UNIQUE), name |
| `published_months` | month_year, pharmacist_published, pharmacy_technician_published, officer_published |
| `push_subscriptions` | user_id, endpoint (UNIQUE), p256dh, auth |
| `notifications` | user_id, type, title, body, is_read, url |
| `shift_logs` | audit trail |

### Key field: `original_user_id`
Set immutably when shift first assigned. Survives swaps. Used for evidence/compensation reporting.

---

## Domain Concepts

### Roles
```ts
type UserRole = 'admin' | 'pharmacist' | 'pharmacy_technician' | 'officer'
```
- `is_sub_admin`: non-admin who can manage shifts for their own role group
- `canManageRoleGroup(user, roleGroup)` — admin OR matching sub-admin

### Shift Types (5 kinds)
| Type | Time | Notes |
|------|------|-------|
| `เช้า` | 08:30–16:30 | Weekdays + holidays |
| `บ่าย` | 16:30–23:59 | All days |
| `ดึก` | 00:00–08:30 | Modeled as 1440–1950 min (next-day logic) |
| `รุ่งอรุณ` | 07:00–08:30 | Weekdays only |
| `smc` | 16:30–20:30 | Mon–Thu only |

### Shift Colors (UI)
| Type | Color |
|------|-------|
| เช้า | `bg-[#E8F9FA] border-[#9FDCE0] text-teal-900` |
| บ่าย | `bg-[#F3EDF8] border-[#9E76B4] text-purple-900` |
| ดึก | `bg-[#EEF0FF] border-[#99ABFF] text-indigo-900` |
| รุ่งอรุณ | `bg-[#FEF3DC] border-[#FFCA72] text-amber-900` |
| smc | `bg-violet-100 border-violet-300 text-violet-800` |

### Overlap Detection
```ts
// lib/utils.ts
const SHIFT_MINUTES = {
  เช้า: { start: 510, end: 990 },
  บ่าย: { start: 990, end: 1439 },
  ดึก:  { start: 1440, end: 1950 },   // next-day span
  รุ่งอรุณ: { start: 420, end: 510 },
}
shiftsOverlap(a, b)               // true if time ranges collide
findConflictingShifts(existing, newType, excludeId)
```
Also validates: no `ดึก → เช้า` consecutive, no `บ่าย → ดึก` consecutive.

### Shift Badge Labels
```ts
// Determined by (shift_type, deptName, position)
'เช้า' + 'MED' + position → `MED ${position}`   // e.g. "MED D/C"
'เช้า' + 'SURG'           → 'SURG'
'บ่าย' + 'SMC'            → 'SMC'
'ดึก'                     → 'ดึก'
'รุ่งอรุณ' + position     → `รุ่ง${position}`    // e.g. "รุ่งOPD"
'โครงการ'                 → 'Ext'
deptName fallback         → deptName
```

---

## API Patterns

All under `app/api/`. Returns `NextResponse.json(data)` or `NextResponse.json({ error }, { status: N })`.

### Routes
```
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/logout
POST   /api/auth/change-password

GET    /api/admin/shifts?month=2026-04&role=pharmacist&page=0   # 25/page
PUT    /api/admin/shifts          # update shift_type/dept/position
DELETE /api/admin/shifts          # delete by id
PATCH  /api/admin/shifts/fix-suspicious   # bulk fix holiday shifts

GET    /api/admin/users
POST   /api/admin/users
PUT    /api/admin/users
POST   /api/admin/users/reset-password

POST   /api/shifts/upload         # Excel import → upsert (with overwrite confirm)

POST   /api/swap/accept           # swap/transfer/cover + collision + notify

PUT    /api/user/profile          # self-update

GET    /api/notifications         # 50 most recent
POST   /api/notifications         # insert for userIds[]
PUT    /api/notifications         # mark all read

POST   /api/push/subscribe
DELETE /api/push/subscribe
POST   /api/push/send

GET    /api/holidays
POST   /api/holidays
DELETE /api/holidays/[id]
POST   /api/holidays/import       # from holidays.json, upsert on date

GET    /api/cron/shift-reminders?run=morning|evening
POST   /api/cron/test-reminders   # admin manual trigger
GET    /api/cron/cleanup
```

---

## State Management

No Redux/Zustand. React hooks + Supabase Realtime.

### Hooks
| Hook | Returns |
|------|---------|
| `useShifts(year, month)` | shifts, holidays, publishedRoles, loading, refetch |
| `useSwapRequests(userId)` | requests, pendingCount, accept/reject/cancel/markRead |
| `useNotifications(userId)` | notifications, unreadCount, markAllRead |
| `useCurrentUser()` | user, loading |
| `useIsMobile()` | boolean (≤767px) |
| `useSwipeGesture(config)` | ref to attach to element |

### Calendar page state (app/calendar/page.tsx)
```ts
// Temporal
year, month

// Selection
selectedDay, detailShift, selectedShift
mobileDaySelected, mobileEditDaySelected

// Admin edit mode
isEditMode
pendingDeletes: Set<string>           // shift ids to delete
pendingEdits: Record<string, User>   // shiftId → substitute user
pendingAdds: PendingAdd[]
editingSubsShift, addingShiftContext

// Modals (individual booleans)
showNotifications, showUploadModal, showDeployModal,
showPersonalShiftsModal, showCompensationModal,
showAdminExportModal, showAdminSettings

// View
viewMode: 'all' | 'mine'
viewRoleGroup: UserRole
```

---

## Excel Features

### Import (`POST /api/shifts/upload`)
- Role-specific shift code mapping via regex (pharmacist, pharmacy_technician, officer)
- Overwrite mode: delete existing month → re-insert (requires admin password confirmation)
- Deduplicates on `(user_id, date, shift_type, position)`
- Returns success count + error list

### Export (4 types)
| File | Function | Description |
|------|----------|-------------|
| `excelExport.ts` | `exportEvidenceExcel` | 5 sheets, uses `original_user_id`, Thai Baht text |
| `excelExport.ts` | `exportCompensationExcel` | Per-role rate tables, 39 columns, TH SarabunPSK font |
| `scheduleTableExport.ts` | `exportScheduleTable` | Week-grid calendar, colored cells, landscape |
| `signSheetExport.ts` | `exportSignSheet` | 7 shift configs, 3-party sign-off columns |

---

## Swap / Transfer / Cover Flow

```
1. Click shift → SwapModal
2. Choose: swap | transfer | cover
3. Swap   → pick own shift from mini calendar (shift badges shown)
   Transfer → pick recipient user
   Cover   → confirm directly
4. POST /api/swap/accept
   ├── Validate ownership (fresh DB check)
   ├── Collision check (overlap, ดึก→เช้า, บ่าย→ดึก)
   ├── If collision → return warning (user can force)
   ├── Update swap_requests status = 'accepted'
   ├── Exchange user_id on shifts
   ├── Push + in-app notify requester
   └── Auto-reject other pending requests for same shifts
```

---

## PWA & Push Notifications

### Service Worker (`public/sw.js`)
- Handles `push` event → show notification
- Handles `notificationclick` → focus/open app
- No offline caching

### Push flow
```ts
// Client
subscribeToPush(userId)           // lib/pushNotifications.ts
POST /api/push/subscribe          // saves endpoint + keys

// Server
sendPushToUser(userId, payload)   // lib/pushSender.ts
sendPushToUsers(ids[], payload)
```

### Cron Jobs (`.github/workflows/cron.yml`)
| Schedule (UTC) | Bangkok | Job |
|----------------|---------|-----|
| 23:00 | 06:00 | Morning reminders — today's shifts (ยกเว้นรุ่งอรุณ) |
| 09:00 | 16:00 | Evening reminders — tomorrow's all shifts |
| 21:00 | 04:00 | Cleanup — old swap_requests, notifications, chain-hops |

---

## Supabase Usage

```ts
// Client-side (browser)
import { supabase } from '@/lib/supabase'
supabase.from('shifts').select('*, department:departments(name)').eq('user_id', id)

// Server-side (API routes)
import { createSupabaseServer } from '@/lib/supabaseServer'
const supabase = createSupabaseServer()

// Service role (bypass RLS)
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```

---

## Coding Conventions

### Naming
- `camelCase` — functions, variables, props
- `PascalCase` — components, interfaces, types
- `CONSTANT_CASE` — maps/labels (`DEPT_COLORS`, `ROLE_LABELS`, `SHIFT_MINUTES`)
- Thai text for all UI-facing strings

### Component conventions
- Default export, PascalCase filename
- Types defined in `lib/types.ts`, not colocated
- API routes: `app/api/.../route.ts` (Next.js App Router)

### Error handling
```ts
// API
return NextResponse.json({ error: 'message' }, { status: 400 })

// Client
toast.error()          // transient errors (sonner)
Swal.fire()            // confirmations (sweetalert2)
```

### Dates
```ts
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
format(date, 'd MMMM yyyy', { locale: th })  // "15 เมษายน 2569"
// Thai Buddhist era: พ.ศ. = ค.ศ. + 543
formatThaiMonth(year, month)  // "เมษายน 2569"
```

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:pharmacy@uttaradit-hospital.go.th

CRON_SECRET=
APP_URL=https://pharmshift.vercel.app
```

---

## Scripts

```bash
npm run dev    # Next.js dev server (HMR)
npm run build  # Production build
npm start      # Production server
npm run lint   # ESLint
```

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `lib/types.ts` | All types, constants, role helpers, shift config, colors |
| `lib/utils.ts` | Calendar grid, overlap detection, `cn()`, Thai date helpers |
| `lib/session.ts` | JWT sign/verify, cookie management |
| `middleware.ts` | Route protection + rolling JWT refresh |
| `app/calendar/page.tsx` | Main page — all state, modal orchestration |
| `hooks/useShifts.ts` | Core data hook + Realtime subscription |
| `hooks/useSwapRequests.ts` | Swap state + accept/reject/cancel |
| `app/api/swap/accept/route.ts` | Swap logic: collision check + notify + exchange |
| `app/api/shifts/upload/route.ts` | Excel parse + shift code mapping + upsert |
| `app/api/cron/shift-reminders/route.ts` | Scheduled push notification logic |
| `lib/excelExport.ts` | Evidence + compensation exports (5 sheets each) |
| `lib/scheduleTableExport.ts` | Schedule table Excel (week-grid) |
| `lib/signSheetExport.ts` | Swap sign-off sheets (7 configs) |
| `components/calendar/MyCalendarGrid.tsx` | "เวรของฉัน" calendar — pill badge rendering |
| `components/swap/SwapModal.tsx` | Swap/transfer/cover modal with mini calendar |
