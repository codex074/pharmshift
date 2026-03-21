# 🏥 เวรดี๊ดี (PharmShift)

> ระบบจัดการตารางเวรเภสัชกรรม สำหรับบุคลากรโรงพยาบาล
> Built with **Next.js 14 · Supabase · TypeScript · Tailwind CSS**

---

## 📋 สารบัญ

- [ภาพรวมระบบ](#-ภาพรวมระบบ)
- [ฟีเจอร์หลัก (สำหรับผู้ใช้ทั่วไป)](#-ฟีเจอร์หลัก)
- [Flow การทำงาน](#-flow-การทำงาน)
- [โครงสร้างโปรเจกต์](#-โครงสร้างโปรเจกต์)
- [Database Schema](#-database-schema)
- [API Endpoints](#-api-endpoints)
- [Authentication & Session](#-authentication--session)
- [Roles & Permissions](#-roles--permissions)
- [ระบบแจ้งเตือน](#-ระบบแจ้งเตือน)
- [Cron Jobs](#-cron-jobs)
- [Custom Hooks](#-custom-hooks)
- [Utilities & Helpers](#-utilities--helpers)
- [Environment Variables](#-environment-variables)
- [การ Deploy](#-การ-deploy)
- [SQL Migrations](#-sql-migrations)

---

## 🗺 ภาพรวมระบบ

```
┌─────────────────────────────────────────────────────────────────┐
│                        เวรดี๊ดี                                  │
│              ระบบจัดการตารางเวรเภสัชกรรม                         │
└─────────────────────────────────────────────────────────────────┘

  ผู้ใช้งาน 3 ระดับ
  ┌──────────┐   ┌────────────┐   ┌──────────────┐
  │  Admin   │   │ Sub-Admin  │   │   User       │
  │ ดูแลระบบ  │   │ ผู้จัดเวร     │   │  ผู้ใช้ทั่วไป     │
  └──────────┘   └────────────┘   └──────────────┘
       │               │                 │
       └───────────────┴─────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │   Next.js 14 App Router  │
         │   (Server + Client)      │
         └─────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   ┌─────────────┐         ┌──────────────┐
   │  Supabase   │         │   Vercel     │
   │  Database   │         │   Hosting    │
   │  + Realtime │         │   + Cron     │
   └─────────────┘         └──────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + React 18 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS + Radix UI |
| Database | Supabase (PostgreSQL) |
| Auth | Iron-session (JWT cookie, ไม่ใช้ Supabase Auth) |
| Push Notifications | Web Push API + VAPID |
| Realtime | Supabase Realtime (postgres_changes) |
| Export | ExcelJS + jsPDF + html2canvas |
| Deployment | Vercel (with Cron Jobs) |

---

## ✨ ฟีเจอร์หลัก

### 1. 📅 ตารางเวร
```
วิธีดูตาราง:
┌─────────────────────────────┐
│  ทุกเวร  │  เวรของฉัน       │  ← สลับ Tab
│  (ดูได้ทุกคน) │ (ดูเฉพาะตัวเอง) │
└─────────────────────────────┘
   │
   ▼
  เลือกเดือนดูตารางแต่ละเดือน
  แสดงเป็น Grid 7 วัน × 6 สัปดาห์
  มีสี + ชื่อย่อแสดงตามตำแหน่ง
```

**ประเภทเวร:**
| เวร | เวลา | หมายเหตุ |
|-----|------|---------|
| เช้า | 08:30–16:30 | ทุกวัน |
| บ่าย | 16:30–23:59 | ทุกวัน |
| ดึก | 00:00–08:30 | ทุกวัน |
| รุ่งอรุณ | 07:00–08:30 | เฉพาะวันธรรมดา |
| SMC | 16:30–20:30 | จันทร์–พฤหัส |

---

### 2. 🔄 ขอแลก/โอนเวร

```
Flow แลกเวร (Swap)
─────────────────
  ฉัน คลิกเวรตัวเอง
       │
       ▼
  เลือก "แลกเวร"
       │
       ▼
  เลือกบุคลากรที่ต้องการแลก
       │
       ▼
  ส่งคำขอ ─────────► เพื่อน ได้รับการแจ้งเตือน
                           │
                    ┌──────┴──────┐
                    ▼             ▼
                 ยอมรับ         ปฏิเสธ
                    │             │
            เวรสลับกัน      แจ้งกลับฉัน
            อัตโนมัติ

Flow โอนเวร (Transfer)
──────────────────────
  ฉัน คลิกเวรของเพื่อน
       │
       ▼
  เลือก "รับเวร"
       │
       ▼
  ส่งคำขอ ──────────► เพื่อน ได้รับการแจ้งเตือน
                           │
                    ┌──────┴──────┐
                    ▼             ▼
                 ยอมรับ         ปฏิเสธ
                    │
               ฉัน ได้เวรนั้น
               เพื่อน ไม่มีเวร
```

**ระบบตรวจสอบชนเวร:** ก่อนยืนยันจะตรวจว่าเวรที่จะได้รับชนกับเวรที่มีอยู่แล้วหรือไม่ ถ้าชนจะแจ้งเตือนก่อน

---

### 3. 🔔 การแจ้งเตือน

```
กระดิ่ง 🔔  มีสองแท็บ:
┌────────────────────────────────────┐
│ แลก/โอนเวร  │  จากระบบ            │
│ (swap req)  │  (admin + reminder)  │
└────────────────────────────────────┘

แจ้งเตือนจากระบบ (จากระบบ):
  ▸ 📋 ได้รับมอบหมายเวรใหม่  → อยู่ 1 สัปดาห์
  ▸ 🔄 เวรถูกเปลี่ยนแปลง    → อยู่ 1 สัปดาห์
  ▸ 🗑️ เวรถูกลบ             → อยู่ 1 สัปดาห์
  ▸ 📋 ประกาศตารางเวร        → อยู่ 1 สัปดาห์
  ▸ ⏰ เตือนเวรล่วงหน้า      → ลบอัตโนมัติใน 12 ชม.
```

---

### 4. 👑 การจัดการโดย Admin

```
Admin Panel (ไอคอนดินสอ)
├── อัพโหลด Excel     → นำเข้าตารางเวรทั้งเดือน
├── Edit Mode         → คลิกแก้ไข/ลบ/เพิ่มเวรรายวัน
├── ประกาศตาราง       → เลือก role ที่จะประกาศ + ยืนยันด้วยรหัสผ่าน
├── จัดการวันหยุด     → เพิ่ม/ลบวันหยุดราชการ
├── จัดการผู้ใช้      → เพิ่ม/แก้ไข/ปิด account
└── ส่งออก Excel/PDF  → Export ตารางเวรและใบเซ็นชื่อ
```

---

### 5. 👤 สิทธิ์ผู้ใช้งาน

| สถานะ | คำอธิบาย |
|-------|---------|
| **Active** | ใช้งานได้ปกติ |
| **Inactive** | ออกจากองค์กร → Login ไม่ได้ |
| **Read-only** | Login ได้ ดูได้ แต่ไม่สามารถมอบหมาย/แลกเวรได้ |
| **must_change_password** | ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน |

---

## 🔁 Flow การทำงาน

### Flow การ Login

```
User กรอก pha_id + password
          │
          ▼
    POST /api/auth/login
          │
    ┌─────┴──────┐
    │ is_active? │
    └─────┬──────┘
    ✗ ──► แสดง error "บัญชีถูกระงับ"
    ✓
          │
    ┌─────┴──────────────────┐
    │ must_change_password?  │
    └─────┬──────────────────┘
    ✓ ──► redirect → /change-password
    ✗
          │
    สร้าง JWT cookie (30 วัน)
          │
    redirect → /calendar
```

### Flow ประกาศตาราง (Deploy)

```
Admin คลิก "ประกาศตาราง"
          │
          ▼
  เลือก ✅ checkbox แต่ละ role
  (เภสัช / เจ้าพนักงาน / เจ้าหน้าที่)
          │
          ▼
  กรอกรหัสผ่านยืนยัน
          ▼
  ถ้าเลือก role นอกเหนือจาก role ตัวเอง (Sub-admin)
  → แสดง ⚠️ คำเตือนก่อน
          │
          ▼
  บันทึก published_months ใน DB
          │
          ▼
  ส่ง in-app notification หาทุก user ใน role นั้น
  ✉️ "📋 ตารางเวรประกาศแล้ว — วันที่ X เวลา HH:mm น."
```

---

## 📁 โครงสร้างโปรเจกต์

```
pharmshift/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # redirect → /calendar
│   ├── login/page.tsx            # หน้า Login
│   ├── change-password/page.tsx  # เปลี่ยนรหัสผ่านครั้งแรก
│   ├── calendar/page.tsx         # หน้าหลัก (calendar + modals)
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts          # POST login
│       │   ├── logout/route.ts         # POST logout
│       │   ├── me/route.ts             # GET current user
│       │   └── change-password/route.ts # POST เปลี่ยนรหัสผ่าน
│       ├── admin/
│       │   └── users/
│       │       ├── route.ts            # GET/POST/PUT users
│       │       └── reset-password/route.ts # POST reset password
│       ├── user/
│       │   └── profile/route.ts        # PUT อัพเดตโปรไฟล์
│       ├── shifts/
│       │   └── upload/route.ts         # POST อัพโหลด Excel
│       ├── holidays/
│       │   ├── route.ts                # GET/POST holidays
│       │   ├── [id]/route.ts           # DELETE holiday
│       │   └── import/route.ts         # POST bulk import
│       ├── push/
│       │   ├── subscribe/route.ts      # POST/DELETE push subscription
│       │   └── send/route.ts           # POST send push
│       ├── notifications/
│       │   └── route.ts                # GET/POST/PUT in-app notifications
│       └── cron/
│           ├── shift-reminders/route.ts # cron แจ้งเตือนเวร
│           └── cleanup/route.ts         # cron ลบข้อมูลเก่า
│
├── components/
│   ├── calendar/                 # Calendar UI components
│   │   ├── CalendarGrid.tsx            # ตารางเภสัชกร (desktop)
│   │   ├── PharmacyTechCalendarGrid.tsx # ตารางเจ้าพนักงาน
│   │   ├── OfficeCalendarGrid.tsx      # ตารางเจ้าหน้าที่
│   │   ├── MyCalendarGrid.tsx          # ตารางส่วนตัว
│   │   ├── MobileCalendarGrid.tsx      # mobile grid
│   │   ├── MobileCalendarList.tsx      # mobile list
│   │   ├── DayDetailModal.tsx          # รายละเอียดวัน (mobile)
│   │   ├── AdminAddShiftModal.tsx      # เพิ่มเวร (admin)
│   │   ├── AdminConfirmModal.tsx       # ยืนยันแก้ไขเวร (admin)
│   │   ├── AdminShiftSubstituteModal.tsx # เปลี่ยนผู้รับเวร
│   │   ├── AdminExportModal.tsx        # ส่งออกตาราง
│   │   ├── AdminUserManagementModal.tsx # จัดการผู้ใช้
│   │   ├── ShiftUploadModal.tsx        # อัพโหลด Excel
│   │   ├── DeployModal.tsx             # ประกาศตาราง
│   │   ├── ManageHolidaysModal.tsx     # จัดการวันหยุด
│   │   ├── CompensationModal.tsx       # คำนวณค่าตอบแทน
│   │   ├── ShiftLogsModal.tsx          # ประวัติการแก้ไข
│   │   └── HelpGuideModal.tsx          # คู่มือการใช้งาน
│   ├── swap/
│   │   ├── SwapModal.tsx               # แลก/โอนเวร
│   │   └── NotificationsPanel.tsx      # แผงการแจ้งเตือน
│   ├── ui/                       # Radix UI wrappers
│   ├── Header.tsx                # Header + navigation
│   ├── MobileBottomNav.tsx       # Mobile bottom bar
│   └── UserProfileModal.tsx      # โปรไฟล์ผู้ใช้
│
├── hooks/
│   ├── useShifts.ts              # ดึงข้อมูลเวร + publish status
│   ├── useSwapRequests.ts        # จัดการคำขอแลกเวร
│   ├── useNotifications.ts       # in-app notifications
│   ├── useCurrentUser.ts         # ดึง current user
│   ├── useIsMobile.ts            # detect mobile viewport
│   └── useSwipeGesture.ts        # swipe gesture สำหรับ mobile
│
├── lib/
│   ├── types.ts                  # TypeScript types + helpers
│   ├── session.ts                # iron-session config
│   ├── supabase.ts               # Supabase client (browser)
│   ├── supabaseServer.ts         # Supabase client (server)
│   ├── pushNotifications.ts      # Web Push client helpers
│   ├── pushSender.ts             # Web Push server sender
│   ├── notifyUsers.ts            # Insert in-app notifications
│   ├── excelExport.ts            # Export Excel ตารางเวร
│   ├── signSheetExport.ts        # Export ใบเซ็นชื่อ
│   ├── swal.ts                   # SweetAlert2 wrappers
│   └── utils.ts                  # Calendar helpers + formatters
│
├── supabase/
│   ├── run_add_is_readonly.sql   # Migration: add is_readonly
│   └── run_add_notifications.sql # Migration: create notifications table
│
├── middleware.ts                 # JWT auth middleware
├── vercel.json                   # Cron schedule config
└── public/
    ├── sw.js                     # Service Worker (push notifications)
    └── manifest.json             # PWA manifest
```

---

## 🗄 Database Schema

### ตารางหลัก

```sql
-- ผู้ใช้งาน
users (
  id                UUID PRIMARY KEY,
  pha_id            TEXT UNIQUE,          -- รหัสเภสัชกร
  password          TEXT,                 -- hashed
  prefix            TEXT,                 -- นาย/นาง/นางสาว/ภก./ภญ.
  f_name            TEXT,
  l_name            TEXT,
  nickname          TEXT,
  salary_number     TEXT,
  role              TEXT,                 -- pharmacist|pharmacy_technician|officer|admin
  is_sub_admin      BOOLEAN DEFAULT false,
  is_active         BOOLEAN DEFAULT true, -- false = block login
  is_readonly       BOOLEAN DEFAULT false, -- true = view only
  profile_image     TEXT,
  must_change_password BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ
)

-- เวร
shifts (
  id            UUID PRIMARY KEY,
  date          DATE,
  department_id UUID REFERENCES departments(id),
  shift_type    TEXT,          -- เช้า|บ่าย|ดึก|รุ่งอรุณ|smc
  position      INT,           -- ลำดับที่ในเวรนั้น
  user_id       UUID REFERENCES users(id),
  month_year    TEXT,          -- "YYYY-MM"
  created_at    TIMESTAMPTZ,
  UNIQUE(user_id, date, shift_type, position)
)

-- แผนก
departments (
  id    UUID PRIMARY KEY,
  name  TEXT               -- ER, MED, SURG, SMC, OPD, HIV, Chemo, ...
)

-- คำขอแลก/โอนเวร
swap_requests (
  id             UUID PRIMARY KEY,
  shift_id       UUID REFERENCES shifts(id),
  requester_id   UUID REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  request_type   TEXT,    -- 'swap' | 'transfer'
  target_shift_id UUID,   -- เวรของ target (กรณี swap)
  status         TEXT,    -- 'pending' | 'accepted' | 'rejected'
  message        TEXT,
  requester_read BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ
)

-- ประวัติการแก้ไขเวร
shift_logs (
  id           UUID PRIMARY KEY,
  shift_id     UUID,
  action       TEXT,        -- 'swap'|'transfer'|'admin_edit'|'admin_delete'
  old_user_id  UUID,
  new_user_id  UUID,
  performed_by UUID,
  details      TEXT,
  created_at   TIMESTAMPTZ
)

-- การแจ้งเตือน push notification (subscriptions)
push_subscriptions (
  id         UUID PRIMARY KEY,
  user_id    UUID REFERENCES users(id),
  endpoint   TEXT UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  user_agent TEXT
)

-- การแจ้งเตือนในแอป
notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- shift_assigned|shift_changed|shift_removed|schedule_published|shift_reminder
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  url        TEXT DEFAULT '/calendar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)

-- วันหยุดราชการ
holidays (
  id         UUID PRIMARY KEY,
  date       DATE UNIQUE,
  name       TEXT,
  created_at TIMESTAMPTZ
)

-- สถานะการประกาศตารางเวร
published_months (
  month_year                      TEXT,
  is_published                    BOOLEAN,
  pharmacist_published            BOOLEAN,
  pharmacy_technician_published   BOOLEAN,
  officer_published               BOOLEAN,
  published_at                    TIMESTAMPTZ,
  published_by                    UUID
)

-- ประกาศแยกตาม role (ใช้ใน cron)
role_publish_flags (
  role        TEXT,     -- pharmacist|pharmacy_technician|officer
  month_year  TEXT,
  is_published BOOLEAN
)
```

### Indexes สำคัญ

```sql
-- notifications: query by user ล่าสุดก่อน
CREATE INDEX idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
```

### Realtime

```sql
-- เปิด Realtime สำหรับตาราง notifications (ใช้ Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

> ⚠️ **หมายเหตุสำคัญสำหรับ Dev:**
> แอปใช้ **iron-session** ไม่ใช่ Supabase Auth → `auth.uid()` จะ return `NULL` เสมอ
> ดังนั้น RLS (Row Level Security) ที่ใช้ `auth.uid()` จะไม่ทำงาน
> แก้โดย: ปิด RLS บนตาราง + ใช้ `SUPABASE_SERVICE_ROLE_KEY` ใน API routes ฝั่ง server

---

## 🔌 API Endpoints

### Authentication

| Method | Endpoint | Body | Response | หมายเหตุ |
|--------|----------|------|----------|---------|
| POST | `/api/auth/login` | `{ pha_id, password }` | `{ user, message }` | ตั้ง cookie `pharmshift_session` |
| POST | `/api/auth/logout` | — | `{ success }` | ล้าง cookie |
| GET | `/api/auth/me` | — | `{ user }` | อ่าน session |
| POST | `/api/auth/change-password` | `{ password }` | `{ success }` | อัพเดต DB + session |

### Users (Admin only)

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/admin/users` | — | `{ users[] }` |
| POST | `/api/admin/users` | `{ pha_id, prefix, f_name, l_name, nickname, salary_number, role, is_sub_admin }` | `{ user }` |
| PUT | `/api/admin/users` | `{ id, ...fields }` | `{ user }` |
| POST | `/api/admin/users/reset-password` | `{ userId }` | `{ success }` |
| PUT | `/api/user/profile` | `{ prefix, f_name, l_name, nickname, password?, salary_number }` | `{ success }` |

**PUT /api/admin/users** fields ที่แก้ไขได้:
`prefix, f_name, l_name, nickname, salary_number, role, is_sub_admin, is_active, is_readonly`

### Shifts

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/shifts/upload` | `FormData: { file, year, month, role, password }` | `{ imported, errors[] }` |

**Excel Upload Logic:**
- อ่าน code เวรแบบ role-specific (เภสัช / เจ้าพนักงาน / เจ้าหน้าที่)
- map code → shift_type + department
- ตรวจ unique constraint ก่อน insert
- ต้องกรอก admin password ถ้าเดือนนั้นมีข้อมูลอยู่แล้ว

### Holidays

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/holidays` | — | `{ holidays[] }` |
| POST | `/api/holidays` | `{ date, name }` | `{ holiday }` |
| DELETE | `/api/holidays/[id]` | — | `{ success }` |
| POST | `/api/holidays/import` | `{ holidays[] }` | `{ imported }` |

### In-App Notifications

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/api/notifications` | — | `{ notifications[] }` (max 50, newest first) |
| POST | `/api/notifications` | `{ userIds[], type, title, body, url }` | `{ success }` |
| PUT | `/api/notifications` | — | `{ success }` (mark all read) |

> POST ต้องมี session (ตรวจสอบผ่าน `getSession()`) — ใช้ service role key insert จริง

### Push Notifications

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| POST | `/api/push/subscribe` | `{ userId, subscription: { endpoint, p256dh, auth } }` | `{ success }` |
| DELETE | `/api/push/subscribe` | `{ endpoint }` | `{ success }` |
| POST | `/api/push/send` | `{ userId?, userIds?, title, body, url, tag }` | `{ sent, failed }` |

### Cron (ต้องส่ง `Authorization: Bearer CRON_SECRET`)

| Method | Endpoint | ทำงานเมื่อไหร่ |
|--------|----------|--------------|
| GET | `/api/cron/shift-reminders` | 01:00 UTC (08:00 BKK) · 11:00 UTC (18:00 BKK) |
| GET | `/api/cron/cleanup` | 21:00 UTC ทุกวัน |

---

## 🔐 Authentication & Session

```typescript
// lib/session.ts
const SESSION_OPTIONS = {
  cookieName: 'pharmshift_session',
  password: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, // fallback to 'pharmshift-fallback-secret'
  cookieOptions: { secure: true, maxAge: 30 * 24 * 60 * 60 }, // 30 วัน
};

// Session payload
interface SessionData {
  id: string;           // user UUID
  pha_id: string;
  role: UserRole;
  is_sub_admin: boolean;
  must_change_password: boolean;
}
```

**Middleware (`middleware.ts`):**
- ตรวจ JWT ทุก request ที่ไม่ใช่ `/login` หรือ `/change-password`
- ถ้า token หมดอายุหรือ invalid → redirect ไป `/login?reason=session_expired`
- ใช้ `jose` library verify JWT

```typescript
// Public routes (ไม่ต้อง auth)
const PUBLIC_ROUTES = ['/login', '/change-password'];
```

---

## 👥 Roles & Permissions

```typescript
type UserRole = 'pharmacist' | 'pharmacy_technician' | 'officer' | 'admin';

// lib/types.ts — helper functions
isAdmin(user)           // role === 'admin'
isAdminLike(user)       // role === 'admin' หรือ is_sub_admin === true
canManageRoleGroup(user, targetRole)
  // admin → จัดการได้ทุก role
  // sub_admin → จัดการได้เฉพาะ role ตัวเอง
```

### Permission Matrix

| ฟีเจอร์ | Admin | Sub-Admin | บุคลากร |
|---------|:-----:|:---------:|:-------:|
| ดูตารางเวร | ✅ | ✅ | ✅ |
| แลก/โอนเวร | ❌ | ✅ | ✅ |
| Upload Excel | ✅ | ✅ (role ตัวเอง) | ❌ |
| Edit Mode | ✅ | ✅ (role ตัวเอง) | ❌ |
| ประกาศตาราง | ✅ | ✅ (ทุก role + เตือน) | ❌ |
| จัดการวันหยุด | ✅ | ❌ | ❌ |
| จัดการผู้ใช้ | ✅ | ❌ | ❌ |
| Export Excel/PDF | ✅ | ✅ | ❌ |
| ดูประวัติการแก้ไข | ✅ | ✅ | ❌ |

---

## 🔔 ระบบแจ้งเตือน

### ภาพรวม

```
┌───────────────────────────────────────────────────────────┐
│                    ระบบแจ้งเตือน 2 ชั้น                    │
│                                                           │
│  In-App Notification         Push Notification            │
│  (กระดิ่ง ใน web)            (OS notification)            │
│                                                           │
│  ✓ ทุก device ที่ login      ✓ แม้ไม่ได้เปิดเว็บ          │
│  ✓ เก็บใน DB                 ✓ ต้องกด Allow browser       │
│  ✓ มี unread count           ✓ PWA ให้ประสบการณ์ดีกว่า   │
└───────────────────────────────────────────────────────────┘
```

### In-App Notification Types

| Type | เกิดเมื่อ | อายุ |
|------|---------|-----|
| `shift_assigned` | Admin เพิ่ม/แก้ไขเวรให้ user | 1 สัปดาห์ |
| `shift_changed` | เวรของ user ถูกเปลี่ยน | 1 สัปดาห์ |
| `shift_removed` | เวรของ user ถูกลบ | 1 สัปดาห์ |
| `schedule_published` | Admin ประกาศตารางเวร | 1 สัปดาห์ |
| `shift_reminder` | Cron แจ้งเตือนก่อนเวร | **12 ชั่วโมง** |

### lib/notifyUsers.ts — insertNotifications()

```typescript
/**
 * Fire-and-forget — ส่ง in-app notification ผ่าน POST /api/notifications
 * ไม่ block main flow, error จะแค่ log ไม่ throw
 */
export function insertNotifications(
  userIds: string[],          // UUID ผู้รับ
  type: AppNotificationType,
  title: string,
  body: string,
  url: string = '/calendar',
): void
```

**ตัวอย่างการเรียกใช้:**
```typescript
// หลัง admin เพิ่มเวร
insertNotifications(
  ownerIds,
  'shift_assigned',
  '📋 คุณได้รับมอบหมายเวรใหม่',
  `Admin เพิ่มเวรเช้า ER วันที่ 15/03/69 — 15 มี.ค. 14:30 น.`,
);

// หลังประกาศตาราง
insertNotifications(
  allStaffIds,
  'schedule_published',
  '📋 ตารางเวรประกาศแล้ว',
  `ภก.สมชาย ประกาศตารางเวรเดือน มีนาคม 69 แล้ว — 15 มี.ค. 09:00 น.`,
);
```

### Realtime Subscription

```typescript
// hooks/useShifts.ts — useNotifications()
// Subscribe ไปที่ Supabase Realtime
// เมื่อมี INSERT ใหม่ใน notifications table → fetch ใหม่อัตโนมัติ
supabase
  .channel('notifications-realtime')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
  }, () => fetchNotifications())
  .subscribe();
```

### Push Notification Flow

```
lib/pushNotifications.ts (client)         lib/pushSender.ts (server)
───────────────────────────────           ──────────────────────────
subscribeToPush(userId)                   sendPushToUsers(userIds, payload)
  │                                             │
  ├─ navigator.serviceWorker.register()         ├─ query push_subscriptions by user_id
  ├─ Notification.requestPermission()           ├─ webpush.sendNotification() ต่อ device
  ├─ registration.pushManager.subscribe()       └─ ลบ stale subscriptions (404/410 response)
  └─ POST /api/push/subscribe
       { userId, endpoint, p256dh, auth }
```

---

## ⏰ Cron Jobs

```
vercel.json
┌──────────────────────────────────────────────────────────────┐
│  Schedule              │  UTC    │  Bangkok  │  ทำงาน        │
├──────────────────────────────────────────────────────────────┤
│ shift-reminders (1)    │ 01:00   │ 08:00     │ เตือนวันนี้   │
│ shift-reminders (2)    │ 11:00   │ 18:00     │ เตือนพรุ่งนี้ │
│ cleanup                │ 21:00   │ 04:00+1   │ ลบข้อมูลเก่า  │
└──────────────────────────────────────────────────────────────┘
```

### shift-reminders — Logic

```
รัน 08:00 BKK → เตือนเวรวันนี้ (ยกเว้น รุ่งอรุณ)
รัน 18:00 BKK → เตือนเวรพรุ่งนี้ (รวม รุ่งอรุณ)

สำหรับแต่ละ user ที่มีเวรในวันนั้น:
  1. ตรวจว่าเดือนนั้น published แล้วหรือไม่
  2. รวม shift ของ user นั้นเป็น string "เวรเช้า (MED), เวรดึก (ER)"
  3. Insert notification: { type: 'shift_reminder', title: '⏰ วันนี้คุณมีเวร', body: '15/03/69 — เวรเช้า (MED)' }
  4. ส่ง push notification ด้วย
```

### cleanup — Logic

```
1. ลบ swap_requests อายุ > 2 เดือน
2. ลบ swap_requests ที่ rejected อายุ > 1 วัน
3. ลบ notifications type='shift_reminder' อายุ > 12 ชั่วโมง
4. ลบ notifications ประเภทอื่น อายุ > 7 วัน
```

---

## 🪝 Custom Hooks

### useShifts(year, month)

```typescript
// hooks/useShifts.ts
const {
  shifts,          // Shift[]
  holidays,        // Holiday[]
  isPublished,     // boolean (เดือนนี้ประกาศแล้ว?)
  publishedRoles,  // Set<string> (role ไหนประกาศแล้วบ้าง)
  loading,
  refetch,
} = useShifts(year, month);
```

- ดึงเวรจาก Supabase ทุกครั้งที่ month เปลี่ยน
- Subscribe Supabase Realtime → shifts/swap_requests changes → refetch อัตโนมัติ

### useSwapRequests(userId?)

```typescript
const {
  swapRequests,    // SwapRequest[]
  pendingCount,    // จำนวน pending ที่รอฉัน action
  acceptSwap,      // (req, force?) => Promise<void>
  rejectSwap,      // (swapId) => Promise<void>
  cancelSwap,      // (swapId) => Promise<void>
  markRequesterRead,
} = useSwapRequests(userId);
```

**acceptSwap logic:**
1. ตรวจ collision (เวรชน) ก่อน
2. ถ้าชน → throw error ให้ UI แสดง warning
3. ถ้า `force=true` → ข้าม collision check
4. อัพเดต `shifts.user_id` (สลับกัน)
5. Insert `shift_logs`
6. reject คำขออื่นที่ pending อยู่สำหรับ shift เดิม (auto-cancel)
7. ส่ง push notification ให้ requester

### useNotifications(userId?)

```typescript
// อยู่ใน hooks/useShifts.ts (exported separately)
const {
  notifications,   // AppNotification[]
  unreadCount,     // number
  markAllRead,     // () => Promise<void>
} = useNotifications(userId);
```

- Fetch จาก GET /api/notifications
- Subscribe Supabase Realtime INSERT → refetch
- markAllRead → PUT /api/notifications

---

## 🛠 Utilities & Helpers

### lib/types.ts — ฟังก์ชันสำคัญ

```typescript
// ชื่อแสดงผล
userFullName(user)        // "นาย สมชาย ใจดี"
userDisplayName(user)     // "ชาย" (nickname) หรือ f_name

// ตรวจสิทธิ์
isAdmin(user)             // boolean
isAdminLike(user)         // admin หรือ sub_admin
canManageRoleGroup(user, role)  // boolean

// Config เวร
SHIFT_CONFIG = {
  'เช้า':      { startHour: 8,  startMin: 30, endHour: 16, endMin: 30 },
  'บ่าย':      { startHour: 16, startMin: 30, endHour: 24, endMin: 0  },
  'ดึก':       { startHour: 0,  startMin: 0,  endHour: 8,  endMin: 30 },
  'รุ่งอรุณ': { startHour: 7,  startMin: 0,  endHour: 8,  endMin: 30 },
  'smc':       { startHour: 16, startMin: 30, endHour: 20, endMin: 30 },
}

// สีแผนก
DEPT_COLORS  // Record<string, string>
DEPT_STYLES  // Record<string, string>
```

### lib/utils.ts

```typescript
cn(...classes)                           // Tailwind class merging
buildCalendarDays(year, month, shifts)   // สร้าง array 42 วัน (6×7)
formatThaiMonth(year, month)             // "มีนาคม 2569"
toMonthYear(year, month)                 // "2026-03"
shiftsOverlap(typeA, typeB)              // boolean (เวรชนกันไหม)
findConflictingShifts(shifts, newType)   // Shift[] (เวรที่ชน)
getInitials(name)                        // "สช" (2 ตัวอักษรแรก)
THAI_MONTHS[]                            // ['มกราคม', ...]
THAI_DAYS[]                              // ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
```

### lib/supabase.ts / lib/supabaseServer.ts

```typescript
// Browser (client components)
import { supabase } from '@/lib/supabase';

// Server (API routes, Server Components)
import { createSupabaseServer } from '@/lib/supabaseServer';
const supabase = createSupabaseServer();

// Service Role (bypass RLS — ใช้ใน cron + notifications API)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
```

---

## 🌿 Environment Variables

```bash
# .env.local

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # ใช้เป็น JWT secret ด้วย
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # ใช้ใน API routes ฝั่ง server

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BNxx...        # ส่งให้ browser
VAPID_PRIVATE_KEY=xxxx                      # ใช้ server เท่านั้น
VAPID_SUBJECT=mailto:your@email.com         # contact email

# Cron security
CRON_SECRET=your-secret-here               # Vercel ใส่ใน header อัตโนมัติ

# Node
NODE_ENV=production
```

**สร้าง VAPID keys:**
```bash
npx web-push generate-vapid-keys
```

---

## 🚀 การ Deploy

### Vercel (แนะนำ)

```bash
# 1. ติดตั้ง dependencies
npm install

# 2. Build ทดสอบ
npm run build

# 3. Deploy
vercel --prod
```

**vercel.json — Cron Schedule:**
```json
{
  "crons": [
    { "path": "/api/cron/cleanup",         "schedule": "0 21 * * *"  },
    { "path": "/api/cron/shift-reminders", "schedule": "0 1 * * *"   },
    { "path": "/api/cron/shift-reminders", "schedule": "0 11 * * *"  }
  ]
}
```

### Development

```bash
npm run dev      # http://localhost:3000
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check
```

---

## 🗃 SQL Migrations

รัน SQL เหล่านี้ใน **Supabase SQL Editor** ตามลำดับ:

### 1. เพิ่ม is_readonly column

```sql
-- supabase/run_add_is_readonly.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_readonly BOOLEAN NOT NULL DEFAULT FALSE;
```

### 2. สร้างตาราง notifications

```sql
-- supabase/run_add_notifications.sql
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  url        TEXT        DEFAULT '/calendar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ปิด RLS (app ใช้ iron-session ไม่ใช่ Supabase Auth)
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- เปิด Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

> **ไม่ต้อง GRANT** เพราะ API ใช้ `SUPABASE_SERVICE_ROLE_KEY` โดยตรง

---

## 🏗 สถาปัตยกรรมหลักที่ Dev ต้องรู้

### 1. ทำไมไม่ใช้ Supabase Auth?

แอปใช้ **iron-session** (JWT cookie แบบ custom) เพราะต้องการ:
- ควบคุม session ได้เองอย่างสมบูรณ์
- ใช้ `pha_id` แทน email/password ของ Supabase
- ผลที่ตามมา: `auth.uid()` ใน RLS policy จะ return `NULL` เสมอ

### 2. วิธีเข้าถึง DB อย่างปลอดภัย

```
Client-side query    → supabase (anon key) + RLS ที่ไม่อิง auth.uid()
Server API routes    → createSupabaseServer() หรือ service role key
Cron jobs            → service role key เสมอ
Notification insert  → POST /api/notifications → service role key
```

### 3. Pattern การส่ง Notification

```typescript
// component (client) → lib/notifyUsers.ts → POST /api/notifications (server) → Supabase
// ไม่ insert ตรงจาก client เพราะ anon key อาจไม่มีสิทธิ์
```

### 4. Realtime Pattern

```typescript
// ทุก realtime subscription ต้องทำ cleanup ใน useEffect return
useEffect(() => {
  const channel = supabase.channel('...').on(...).subscribe();
  return () => { supabase.removeChannel(channel); };
}, [deps]);
```

---

## 👨‍💻 ผู้พัฒนา

ระบบนี้พัฒนาสำหรับงานจัดการตารางเวรกลุ่มงานเภสัชกรรม
หากมีคำถามหรือต้องการพัฒนาต่อ ติดต่อผ่าน GitHub Issues

---

*Last updated: มีนาคม 2569*
