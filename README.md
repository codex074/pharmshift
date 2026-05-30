# PharmShift / เวรดี๊ดี

Progressive Web App for managing pharmacy shift schedules for Uttaradit Hospital. The app is built around monthly schedule calendars for three staff role groups, with admin/sub-admin tools for uploading, editing, publishing, notifying, and exporting schedule data.

## Project Overview

PharmShift lets staff view published monthly schedules, track their own shifts, request swaps/transfers/cover, receive in-app and mobile push notifications, and export schedule or compensation documents. Admin users can manage users, holidays, schedules, backups, audit logs, and role-specific schedule publishing.

Key features shown in the code:

- Monthly calendar views for `pharmacist`, `pharmacy_technician`, and `officer` role groups.
- "All shifts" and "My shifts" views with mobile-specific navigation and swipe month changes.
- Admin and sub-admin schedule management, including Excel upload, edit mode, add/delete/reassign shifts, backup/delete utilities, and audit log viewing.
- Role-specific publish flags in `published_months`; regular users cannot view/request against unpublished role schedules.
- Swap, transfer, and cover requests with duplicate checks, overlap warnings, atomic accept handling, auto-rejection of competing pending requests, and notifications.
- In-app notifications and Web Push notifications for mobile devices.
- Excel exports for schedule tables, personal schedules, compensation/evidence sheets, and sign sheets.
- PWA manifest, service worker, install prompt, and static asset caching.
- Scheduled reminders and cleanup through GitHub Actions and Vercel cron configuration.

## Tech Stack

- Next.js `14.2.5` App Router
- React `18`
- TypeScript `5` with `strict: true`
- Tailwind CSS `3.4`
- Radix UI primitives
- Supabase PostgreSQL and Supabase Realtime
- Custom JWT session cookies via `jose`
- `@supabase/ssr` and `@supabase/supabase-js`
- Excel import/export via `xlsx`, `exceljs`, and `file-saver`
- Web Push via `web-push` and `public/sw.js`
- `date-fns` with Thai locale
- Sonner toasts, SweetAlert2 confirmations, Lucide icons
- Vercel deployment config and GitHub Actions cron workflow

## Requirements

- Node.js 18.17+ for Next.js 14.
- npm, using the committed `package-lock.json`.
- A Supabase project or local Supabase instance with the SQL schema/migrations applied.
- Web Push VAPID keys if push notifications are used.
- Vercel and GitHub repository secrets if the scheduled jobs are deployed.

## Installation

```bash
npm install
```

Create `.env.local` manually. There is no committed `.env.example` file; use this sample content:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Web Push VAPID
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:pharmacy@hospital.go.th

# Cron and internal app URL
CRON_SECRET=change-me
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Generate VAPID keys when needed:

```bash
npx web-push generate-vapid-keys
```

## Configuration

Environment variables used by the code:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: browser Supabase key and the signing secret for the custom `pharmshift_session` JWT cookie.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase key for trusted API routes, cron jobs, push sends, audit logs, and migrations/scripts.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: browser-visible VAPID public key for Push API subscription.
- `VAPID_PRIVATE_KEY`: server-only VAPID private key for push delivery.
- `VAPID_SUBJECT`: Web Push subject. Defaults to `mailto:pharmacy@hospital.go.th` if unset.
- `CRON_SECRET`: bearer token for deployed cron endpoints.
- `NEXT_PUBLIC_APP_URL`: used by `/api/cron/test-reminders` to call the real reminder endpoint.
- `NODE_ENV`: controls secure cookie behavior in production.

Important config files:

- `next.config.mjs`: enables React strict mode.
- `tailwind.config.ts`: Tailwind content paths, theme tokens, animations, and font family.
- `tsconfig.json`: strict TypeScript, App Router settings, `@/*` path alias, `allowJs: true`.
- `.eslintrc.json`: extends `next/core-web-vitals` and disables `react/no-unescaped-entities`.
- `vercel.json`: sets `maxDuration` for cron API routes and schedules `/api/cron/cleanup`.
- `.github/workflows/cron.yml`: scheduled GitHub Actions calls to reminder and cleanup endpoints.
- `supabase/config.toml`: local Supabase project configuration. It references `./seed.sql`, but no `supabase/seed.sql` is currently committed.

Secrets handling:

- `.env.local` is ignored by `.gitignore` via `*.local`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, or `CRON_SECRET` to browser code.
- Changing `NEXT_PUBLIC_SUPABASE_ANON_KEY` also changes the JWT signing secret and invalidates existing app sessions.

## Database Setup

Apply SQL from `supabase/schema.sql` and `supabase/migrations/` to the Supabase database. The code expects these main tables/functions:

- `users`: staff accounts, roles, flags, names, password field, salary number.
- `departments`: schedule departments such as `ER`, `MED`, `SURG`, `SMC`, `Chemo`, `รุ่งอรุณ`.
- `shifts`: scheduled shifts with `user_id`, `original_user_id`, `user_snapshot`, `month_year`, `shift_type`, and `position`.
- `swap_requests`: swap, transfer, and cover request state.
- `published_months`: per-role publish flags.
- `holidays`: public holidays used by calendars/imports.
- `notifications`: in-app notification records.
- `push_subscriptions`: Web Push subscription endpoints.
- `audit_logs`: audit trail used by admin audit views.
- `shift_logs`: legacy/cleanup-supported shift log table.
- RPC functions such as `accept_swap_request_atomic`, `apply_shift_owner_edits_atomic`, and `apply_admin_shift_changes_atomic`.

The app uses custom app sessions instead of Supabase Auth for page authentication. Several database policies are permissive because the code enforces permissions in API routes and client logic; service-role API routes handle trusted writes.

## Running The App

```bash
npm run dev
```

Open `http://localhost:3000`. The root page redirects to `/calendar`; unauthenticated page requests redirect to `/login`.

Production build and start:

```bash
npm run build
npm start
```

## Usage

Common UI flow:

1. Log in at `/login` with a `pha_id` and password.
2. New admin-created users start with password `1234` and `must_change_password = true`.
3. Open `/calendar` to view the current month.
4. Switch between role group tabs and between "ทุกเวร" and "เวรของฉัน".
5. Click a shift to request a swap, transfer, or cover if the schedule is published and your account can perform requests.
6. Use the bell panel to accept/reject/cancel requests and manage mobile push notifications.
7. Admin/sub-admin users can upload schedules, enter edit mode, publish a role schedule, export Excel files, manage holidays/users, backup data, and review audit logs.

Useful API examples:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phaId":"pha001","password":"1234"}'

curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/shift-reminders?run=morning"

curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/cleanup"
```

Representative API routes:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`
- `GET|POST|PUT /api/admin/users`
- `POST /api/admin/users/reset-password`
- `GET|PUT|DELETE|PATCH /api/admin/shifts`
- `POST /api/admin/shifts/batch`
- `POST /api/admin/shifts/owners`
- `POST /api/shifts/upload`
- `POST /api/swap/accept`
- `GET|POST|PUT /api/notifications`
- `POST|DELETE /api/push/subscribe`
- `POST /api/push/send`
- `GET|POST /api/holidays`
- `PATCH|DELETE /api/holidays/[id]`
- `POST /api/holidays/import`
- `POST /api/user/profile`
- `GET /api/cron/shift-reminders`
- `POST /api/cron/test-reminders`
- `GET /api/cron/cleanup`

## Development Workflow

Available package scripts:

```bash
npm run dev     # start Next.js dev server
npm run build   # production build, including Next.js type/build checks
npm start       # start production server after build
npm run lint    # Next.js ESLint
```

Testing and formatting:

- No `test` script is configured in `package.json`.
- Playwright is installed as a dev dependency, but no Playwright config or tests are present.
- No formatter or Prettier script/config is present.

Useful one-off scripts:

- `node scripts/generate-sample-excel.mjs`
- `node scripts/create-users.mjs`
- `node scripts/upsert-users.mjs`
- `node scripts/create-admin.mjs`
- `npx ts-node scripts/seed.ts`
- `python3 scripts/parse-schedule.py`

Many scripts are migration/import utilities and some still reference legacy schema fields such as `name` or `fullname`. Inspect and adapt them before running against production data.

## Project Structure

```text
app/
  layout.tsx                  Root layout, metadata, fonts, toaster, PWA provider
  page.tsx                    Redirects to /calendar
  login/page.tsx              Login UI
  change-password/page.tsx    First-login password change UI
  calendar/page.tsx           Main calendar, role/view state, admin actions, modals
  api/                        Next.js route handlers

components/
  calendar/                   Calendar grids, admin modals, export/upload/publish tools
  swap/                       SwapModal and NotificationsPanel
  layout/                     Header, mobile bottom nav, mobile admin menu
  pwa/                        Service worker registration and install prompt
  ui/                         Shared UI helpers/icons/loading/ripple
  UserProfileModal.tsx        User profile editor
  HelpGuideModal.tsx          In-app user guide

hooks/
  useShifts.ts                useShifts, useSwapRequests, useNotifications, useCurrentUser
  useIsMobile.ts              Mobile breakpoint hook
  useSwipeGesture.ts          Touch swipe hook for month navigation

lib/
  types.ts                    Domain types, role helpers, shift config/constants
  utils.ts                    cn(), Thai month helpers, shift overlap helpers
  session.ts                  Custom JWT cookie helpers
  supabase.ts                 Browser Supabase client
  supabaseServer.ts           Server Supabase SSR client
  auditLog*.ts                Audit log writers
  push*.ts                    Push subscribe/send helpers
  *Export.ts                  Excel export builders
  calendarMonthGrid.ts        Calendar week/day builders

supabase/
  schema.sql                  Main schema
  migrations/                 SQL migrations and RPC functions
  run_*.sql                   Manual SQL editor scripts
  config.toml                 Local Supabase CLI config

public/
  manifest.json               PWA manifest
  sw.js                       Service worker and push click handler
  guide.*                     User guide files
  sample_shifts.*             Sample import data
  icons                       PWA and favicon assets

.github/workflows/cron.yml    GitHub Actions scheduled jobs
vercel.json                   Vercel function and cron config
middleware.ts                 Page auth and rolling session refresh
```

## Deployment Notes

Vercel:

- Connect the repository to Vercel.
- Configure all required environment variables in the Vercel project.
- `vercel.json` sets `app/api/cron/**` max duration to 30 seconds.
- `vercel.json` also schedules `GET /api/cron/cleanup` at `0 3 * * *` UTC.

GitHub Actions:

- `.github/workflows/cron.yml` runs scheduled jobs and can be triggered manually.
- Required repository secrets:
  - `APP_URL`: deployed app base URL.
  - `CRON_SECRET`: same value as the deployed app environment variable.
- Scheduled workflow entries call:
  - `GET /api/cron/shift-reminders?run=morning`
  - `GET /api/cron/shift-reminders?run=evening`
  - `GET /api/cron/cleanup`

Cron behavior:

- Morning reminders target today's shifts and exclude `รุ่งอรุณ`.
- Evening reminders target tomorrow's shifts and include all shift types.
- Reminder jobs only notify users whose role schedule is published for that month.
- Cleanup deletes old swap requests, notifications, shift logs, audit logs, and stale push subscriptions.

## Known Limitations And Design Decisions

- Authentication is custom JWT cookie auth, not Supabase Auth.
- User passwords are stored and compared as plain text in the `users.password` column.
- The Supabase anon key is used as the JWT signing secret. Do not rely on the fallback secret in production.
- `POST /api/push/send` does not perform an explicit session or cron-secret check in the route code; treat it as an internal endpoint or add authorization before broader exposure.
- Push subscription is intentionally limited to mobile user agents; iOS Safari push requires installing the app to the home screen.
- No automated tests or formatter are configured.
- Local Supabase config references `./seed.sql`, but that file is not present.
- Some root files and scripts are debugging/import artifacts (`dump.js`, `layout_dump.txt`, `parse_layout.js`, Excel samples). Verify relevance before using them as app entry points.
- Business rules for overlap detection exist in both `lib/utils.ts` and `/api/swap/accept/route.ts`; update both when changing shift timing semantics.

## Troubleshooting

- Redirect loop to login: check `NEXT_PUBLIC_SUPABASE_ANON_KEY`, the `pharmshift_session` cookie, and middleware session verification.
- `MONTH_HAS_DATA` from Excel upload: the target role/month already has shifts; overwrite requires the current admin/sub-admin password.
- "function does not exist" for `accept_swap_request_atomic`, `apply_shift_owner_edits_atomic`, or `apply_admin_shift_changes_atomic`: apply the latest Supabase migrations.
- Duplicate shift errors: check the `unique_user_date_shifttype` constraint and same-date/same-shift assignments.
- Push says `NO_VAPID_KEY`: set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the client environment and `VAPID_PRIVATE_KEY` on the server.
- Push not available on iPhone/iPad: install the PWA from Safari first.
- Cron returns `401`: set `CRON_SECRET` in the app and send `Authorization: Bearer <secret>`.
- Reminders send zero notifications: verify the month is published for the role and that shifts exist on the target Bangkok date.
- Local `supabase db reset` fails on seed: remove/adjust the `sql_paths = ["./seed.sql"]` reference or add the missing seed file.

## License And Credits

© 2026 Ph.D. Teeradet Wichai  
Pharmacy Department, Uttaradit Hospital

All rights reserved. This software is developed for internal use by the Pharmacy Department, Uttaradit Hospital. Unauthorized reproduction or distribution is prohibited.

Built with the assistance of [Claude](https://claude.ai) (Anthropic) and [Codex](https://openai.com/codex) (OpenAI).
