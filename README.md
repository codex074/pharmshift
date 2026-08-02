<div align="center">

# 💊 PharmShift · เวรดี๊ดี

**ระบบจัดตารางเวรเภสัชกรรม โรงพยาบาลอุตรดิตถ์**

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)

Progressive Web App สำหรับจัดการตารางเวรเภสัชกรรม รองรับ 3 กลุ่มบุคลากร  
พร้อมระบบสลับเวร, แจ้งเตือน Push, และ Export Excel ครบครัน

</div>

---

## ✨ Features

| Feature | รายละเอียด |
|---|---|
| 📅 **ตารางเวรรายเดือน** | 3 กลุ่มบุคลากร: เภสัชกร, เจ้าพนักงานเภสัชกรรม, เจ้าหน้าที่ |
| 🔄 **สลับ / โอน / ขอคนแทน** | ตรวจเวรชน, atomic accept, auto-reject คำขอซ้ำ |
| 🔔 **Push Notifications** | แจ้งเตือนเช้า / เย็น / ก่อนเวรดึก + In-app notification panel |
| 📊 **Excel Export** | ตารางเวร, เวรของฉัน, หลักฐานการปฏิบัติงาน, ค่าตอบแทน, ใบลงชื่อ |
| 📤 **Excel Import** | อัปโหลดตารางเวรแบบ Bulk (≤ 3 MB) + overwrite mode (ยืนยันรหัสผ่าน admin) |
| 👤 **Admin Tools** | จัดการ User, วันหยุด, Publish/Unpublish, อัตราค่าตอบแทน, Backup |
| 📈 **Admin Monitoring** | Audit Log, Access Log (ผู้ใช้งานรายวัน), สถานะ Push รายคน, ประวัติที่มาของเวรรายเวร |
| 🔐 **Auth ปลอดภัย** | JWT + sliding refresh (มือถือคงสถานะ login ได้ยาว, เดสก์ท็อปหลุดเมื่อปิดหน้าต่าง), bcrypt hash, rate-limit login |
| 📱 **PWA** | ติดตั้งบน Android / iOS ได้ · swipe เปลี่ยนเดือน · แจ้งเตือน offline · auto-sync เมื่อกลับเข้าแอป |

---

## 🏗️ Architecture

```mermaid
graph TB
    subgraph Client["🌐 Client (Browser / PWA)"]
        UI[Next.js App Router<br/>React 18 + Tailwind CSS]
        SW[Service Worker<br/>sw.js]
        RT[Supabase Realtime<br/>3 channels per user]
    end

    subgraph Server["⚙️ Server (Vercel)"]
        API[API Routes<br/>/api/*]
        MW[Middleware<br/>JWT Auth + Rolling Refresh]
        CRON[Cron Routes<br/>/api/cron/*]
    end

    subgraph Data["🗄️ Data (self-hosted Supabase · Hostinger VPS)"]
        DB[(PostgreSQL<br/>RLS Enabled)]
        REALTIME[Realtime<br/>postgres_changes]
        KONG[Kong API Gateway]
        STUDIO[Studio + postgres-meta<br/>SSH-tunnel only, no public URL]
    end

    subgraph External["📡 External"]
        PUSH[Web Push API<br/>FCM / APNs]
        VCRON[VPS Crontab<br/>/etc/cron.d/pharmshift]
        GHA[GitHub Actions<br/>manual fallback only]
    end

    UI -->|JWT Cookie| MW
    MW --> API
    API --> KONG
    KONG --> DB
    CRON --> KONG
    CRON --> PUSH
    VCRON -->|Bearer CRON_SECRET| CRON
    GHA -.->|workflow_dispatch fallback| CRON
    DB --> REALTIME
    REALTIME --> RT
    STUDIO --> DB
    SW --> PUSH
```

App (Vercel) and database (self-hosted Supabase, Hostinger VPS) are on separate hosts.

> ℹ️ VPS infrastructure config (`deploy/` — docker-compose, Caddyfile, crontab, cron-runner, `VPS-INFRA.md`) is **kept local-only and is not part of this repository.** Ask the maintainer for access.

---

## 👥 User Roles & Permissions

```mermaid
graph LR
    subgraph Roles["บุคลากร"]
        A[👑 admin]
        SA[🔧 sub_admin]
        PH[💊 pharmacist]
        PT[🏥 pharmacy_technician]
        OF[📋 officer]
    end

    subgraph Permissions["สิทธิ์"]
        V[ดูตารางเวร]
        S[สลับ / โอน / ขอคนแทน]
        E[แก้ไข / เพิ่ม / ลบเวร]
        U[อัปโหลด Excel]
        M[จัดการ User & วันหยุด]
        AL[ดู Audit Log]
    end

    A --> V & S & E & U & M & AL
    SA --> V & S & E & U
    PH --> V & S
    PT --> V & S
    OF --> V & S
```

---

## 🔄 Swap / Transfer / Cover Flow

```mermaid
sequenceDiagram
    actor Staff as 👤 Staff
    participant App as 📱 App
    participant API as ⚙️ /api/swap/accept
    participant DB as 🗄️ Supabase RPC
    participant Notify as 🔔 Notifications

    Staff->>App: คลิกเวร → เลือก สลับ / โอน / ขอคนแทน
    App->>API: POST /api/swap/accept
    API->>DB: ตรวจ ownership (fresh DB check)
    DB-->>API: ผ่าน
    API->>DB: ตรวจเวรชน (overlap / ดึก→เช้า / บ่าย→ดึก)
    alt มีเวรชน
        DB-->>API: collision warning
        API-->>App: แจ้งเตือน → ผู้ใช้ยืนยัน force
    end
    API->>DB: RPC accept_swap_request_atomic
    DB-->>API: success (1 transaction)
    API->>Notify: Push + In-app notify
    API->>DB: Auto-reject pending requests ที่ซ้ำ
    API-->>App: ✅ สำเร็จ
```

---

## 🛠️ Tech Stack

```mermaid
mindmap
  root((PharmShift))
    Frontend
      Next.js 14 App Router
      React 18
      TypeScript 5 strict
      Tailwind CSS 3.4
      Radix UI Primitives
      Lucide Icons
      Sonner Toasts
      SweetAlert2
      Error Boundaries
      Auto-sync on focus/reconnect
    Backend
      Next.js API Routes
      Custom JWT Auth jose
      bcryptjs Password Hashing
      Login Rate Limiting
      web-push VAPID lazy init
    Database
      Self-hosted Supabase Postgres
      PostgREST + Kong + Realtime
      RLS Policies
      Atomic RPCs
      Studio + postgres-meta local dashboard
    Export
      ExcelJS
      xlsx
      file-saver
      date-fns Thai locale
    DevOps
      Vercel Deployment (app)
      Hostinger VPS + Docker Compose (DB)
      VPS Crontab (primary scheduler)
      GitHub Actions (manual fallback)
      PWA Service Worker
```

---

## 📁 Project Structure

```
pharmshift/
├── app/
│   ├── api/
│   │   ├── auth/           # login · logout · me · change-password · verify-password
│   │   ├── admin/
│   │   │   ├── shifts/     # GET · PUT · DELETE · PATCH · /batch · /owners · /history
│   │   │   ├── users/      # GET · POST · PUT · /reset-password
│   │   │   ├── compensation-rates/  # GET · PUT (admin only)
│   │   │   ├── access-logs/         # GET ผู้ใช้งานรายวัน
│   │   │   ├── push-status/         # GET สถานะ push รายคน (admin only)
│   │   │   └── audit-logs/ # GET cursor-paginated
│   │   ├── swap/accept/    # atomic swap/transfer/cover
│   │   ├── push/           # subscribe · send (auth + rate-limited)
│   │   ├── notifications/  # GET · POST · PUT(mark-read)
│   │   ├── holidays/       # CRUD · import (JSON body)
│   │   ├── shifts/upload/  # Excel import (≤ 3 MB)
│   │   ├── user/profile/   # self-update
│   │   ├── audit-log/      # POST (bulk client events)
│   │   └── cron/           # shift-reminders (morning/evening) · cleanup
│   ├── calendar/           # Main page — state + modal orchestration
│   ├── login/
│   ├── change-password/
│   └── error.tsx · global-error.tsx · not-found.tsx  # error boundaries (กันจอขาว)
├── components/
│   ├── calendar/           # Grids, modals, export buttons, ShiftHistoryModal, ShiftProvenance
│   ├── swap/               # SwapModal, NotificationsPanel
│   ├── layout/             # Header, MobileBottomNav, MobileAdminMenu
│   ├── pwa/                # PWAProvider, PushEnableNudge
│   └── ui/                 # OfflineBanner, loading-overlay, icons3d, ripple
├── hooks/
│   ├── useShifts.ts        # useShifts + useSwapRequests + useNotifications + useCurrentUser
│   ├── useAutoSync.ts      # re-sync on tab focus / network reconnect
│   ├── useIsMobile.ts
│   └── useSwipeGesture.ts
├── deploy/                 # 🔒 local-only, not in this repo — Hostinger VPS infra
├── lib/
│   ├── session.ts          # JWT sign/verify/cookie (sameSite=lax, sliding refresh)
│   ├── password.ts         # bcrypt hash/verify + auto-rehash helper
│   ├── pushSender.ts       # Server-side Web Push (lazy VAPID + concurrency cap)
│   ├── compensation.ts     # Rate categories + DB-backed rates loader
│   ├── accessLog.ts        # บันทึกผู้ใช้งานรายวัน (เรียกจาก GET /api/auth/me)
│   ├── excelExport.ts      # Evidence + Compensation (5 sheets)
│   ├── scheduleTableExport.ts
│   ├── myScheduleExport.ts # "เวรของฉัน" รายเดือน
│   ├── signSheetExport.ts  # 7 shift configs
│   ├── shiftSlotRules.ts   # Slot validation (เช่น MED บ่าย ห้ามซ้อน)
│   └── types.ts            # Domain types + role helpers
├── supabase/migrations/    # SQL schema + RPC functions
├── public/
│   ├── manifest.json       # PWA (เวรดี๊ดี · theme #8b5cf6)
│   └── sw.js               # Service Worker
└── .github/workflows/
    └── cron.yml            # workflow_dispatch manual fallback (schedule ปิดไว้)
```

---

## 🗄️ Database Schema

```mermaid
erDiagram
    users {
        uuid id PK
        string pha_id
        string f_name
        string role
        boolean is_sub_admin
        boolean is_active
        boolean is_readonly
        string password "bcrypt-hashed"
    }
    shifts {
        uuid id PK
        uuid user_id FK
        uuid original_user_id
        jsonb user_snapshot
        uuid department_id FK
        date date
        string shift_type
        string month_year
    }
    swap_requests {
        uuid id PK
        uuid shift_id FK
        uuid requester_id FK
        uuid target_user_id FK
        string request_type
        string status
    }
    notifications {
        uuid id PK
        uuid user_id FK
        string type
        string title
        boolean is_read
    }
    push_subscriptions {
        uuid id PK
        uuid user_id FK
        string endpoint
        timestamptz last_used_at
    }
    audit_logs {
        uuid id PK
        uuid actor_user_id FK
        string action
        string description
        timestamptz created_at
    }
    login_attempts {
        uuid id PK
        string pha_id
        string ip
        timestamptz attempted_at
    }
    compensation_rates {
        string category PK
        string role PK
        numeric rate
    }
    access_logs {
        uuid id PK
        uuid user_id FK
        date day
        integer hit_count
    }
    push_delivery_log {
        uuid id PK
        uuid user_id FK
        boolean success
        integer status_code
        string error_message
        string tag
    }

    users ||--o{ shifts : "อยู่เวร"
    users ||--o{ swap_requests : "ขอสลับ"
    users ||--o{ notifications : "รับแจ้งเตือน"
    users ||--o{ push_subscriptions : "subscribe"
    users ||--o{ access_logs : "เปิดแอป"
    users ||--o{ push_delivery_log : "ผลส่ง push"
    shifts ||--o{ swap_requests : "เป็นเป้าหมาย"
```

---

## ⏰ Shift Types

| เวร | เวลา | สี |
|---|---|---|
| 🌅 เช้า | 08:30 – 16:30 | `bg-teal-50 border-teal-300` |
| 🌆 บ่าย | 16:30 – 23:59 | `bg-purple-50 border-purple-300` |
| 🌙 ดึก | 00:00 – 08:30 | `bg-indigo-50 border-indigo-300` |
| 🌄 รุ่งอรุณ | 07:00 – 08:30 | `bg-amber-50 border-amber-300` |
| 🏥 smc | 16:30 – 20:30 | `bg-violet-100 border-violet-300` |

---

## 🚀 Quick Start

### Requirements
- Node.js 18.17+
- Supabase project (หรือ local Supabase CLI)
- VAPID keys (สำหรับ Push Notifications)

### Installation

```bash
git clone https://github.com/codex074/pharmshift.git
cd pharmshift
npm install
```

### Environment Variables

สร้างไฟล์ `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Session JWT (server-only — ห้าม NEXT_PUBLIC_)
SESSION_JWT_SECRET=      # openssl rand -base64 64

# Web Push VAPID
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:pharmacy@hospital.go.th

# Cron
CRON_SECRET=change-me
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys
```

### Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
```

---

## 🌐 Deployment

### Vercel
1. Connect repository → Vercel
2. ตั้งค่า Environment Variables ทั้งหมด — โดยเฉพาะ `SESSION_JWT_SECRET` (generate ด้วย `openssl rand -base64 64`)
3. `vercel.json` ตั้ง `maxDuration: 60` สำหรับ cron routes (`app/api/cron/**`)
4. รัน Supabase migrations ทั้งหมดใน `supabase/migrations/` — โดยเฉพาะ
   - `20260530_create_login_attempts.sql` — เปิด rate-limit login
   - `20260530_hash_existing_user_passwords.sql` — hash plain-text passwords ที่ค้างอยู่
   - `20260530_create_compensation_rates.sql` — ตารางอัตราค่าตอบแทน
   - `20260530_push_subscriptions_last_used_at.sql` — กัน cleanup ลบ device ที่ยังใช้งาน

### Database — self-hosted Supabase (Hostinger VPS)

DB/PostgREST/Realtime/Kong run in Docker on a separate VPS (`db.codex074.tech`, fronted by Cloudflare), **not** on Vercel. The Vercel app connects to it exactly like it would connect to Supabase Cloud (same `NEXT_PUBLIC_SUPABASE_URL` / anon / service-role key shape), so no application code changes were needed.

A **Studio + postgres-meta** dashboard (Table Editor / SQL Editor) also runs there, bound to localhost on the VPS with no public URL — reachable over an SSH tunnel. Compose files, Caddy config, and access instructions are kept local-only (see the note under Architecture).

### Cron — VPS crontab (primary)

Schedule lives in `/etc/cron.d/pharmshift` on the VPS (installed from the local-only `deploy/` config), already in Bangkok local time — no UTC math needed:

| Bangkok | Job | Runs as |
|---|---|---|
| 07:00 | Morning reminders — เวรวันนี้ (ยกเว้นรุ่งอรุณ) | `docker run pharmshift-cron-runner morning` — **native on the VPS**, no Vercel call (2026-08-02) |
| 17:00 | Evening reminders — เวรพรุ่งนี้ (ทุกประเภท) | `docker run pharmshift-cron-runner evening` — same |
| 04:00 | Cleanup — notifications, audit_logs, push_subscriptions, push_delivery_log (12 h / 3 d / ≥ 3 mo / ≥ 3 mo) | `curl` → Vercel `/api/cron/cleanup` (unchanged) |

Shift reminders moved off Vercel entirely, onto a standalone runner on the VPS — a hand-ported copy of `lib/pushSender.ts` + the shift-reminders route logic (**if you change one, port the change to the other**; the runner lives in the local-only `deploy/` config). The Vercel route `/api/cron/shift-reminders` is still live and unchanged — it's what the admin "ทดสอบแจ้งเตือน" manual trigger (`/api/cron/test-reminders`) calls.

`cleanup` **no longer deletes `swap_requests` or `shift_logs`** (2026-08-01) — kept permanently as shift history, read by `ShiftProvenance` and the admin shift-history view (`GET /api/admin/shifts/history`).

### Monitoring push delivery

`push_delivery_log` (migration `20260802_create_push_delivery_log.sql`) records one row per push-send attempt from `lib/pushSender.ts` — `user_id`, `subscription_id`, `endpoint_host`, `success`, `status_code`, `error_message`, `tag` (e.g. `reminder-morning-2026-08-02`). Query it via the VPS Studio SQL editor to see who wasn't notified and why, e.g.:

```sql
select u.f_name, u.l_name, p.endpoint_host, p.status_code, p.error_message, p.created_at
from push_delivery_log p
join users u on u.id = p.user_id
where p.success = false
order by p.created_at desc
limit 50;
```

Aggregate `sent`/`failed` counts per cron run are also visible in `/var/log/pharmshift-cron.log` — each run's JSON result (from `curl`'s response body or the `docker run` script's stdout) is appended there via the crontab's `>>` redirect.

`.github/workflows/cron.yml` still exists as a `workflow_dispatch` **manual fallback only** — it is not the scheduled runner anymore. Secrets it needs if triggered manually:
- `APP_URL` — deployed app URL
- `CRON_SECRET` — same as env variable (fail-closed: ถ้าไม่ตั้ง cron route ตอบ 500)

---

## 📜 License & Credits

© 2026 **Ph.D. Teeradet Wichai**  
Pharmacy Department, Uttaradit Hospital

All rights reserved. This software is developed for internal use by the Pharmacy Department, Uttaradit Hospital. Unauthorized reproduction or distribution is prohibited.

Built with the assistance of [Claude](https://claude.ai) (Anthropic) and [Codex](https://openai.com/codex) (OpenAI).
