# เวรดี๊ดี — PharmShift

> ระบบจัดตารางเวรสำหรับกลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com)

---

## สารบัญ

- [ภาพรวมระบบ](#ภาพรวมระบบ)
- [Tech Stack](#tech-stack)
- [ฟีเจอร์หลัก](#ฟีเจอร์หลัก)
- [สิทธิ์การใช้งาน (Roles)](#สิทธิ์การใช้งาน-roles)
- [ประเภทเวร](#ประเภทเวร)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [Database Schema](#database-schema)
- [API Routes](#api-routes)
- [Cron Jobs](#cron-jobs)
- [ระบบแจ้งเตือน](#ระบบแจ้งเตือน)
- [ฟีเจอร์ Export](#ฟีเจอร์-export)
- [Environment Variables](#environment-variables)
- [การติดตั้งและรัน](#การติดตั้งและรัน)
- [การ Deploy](#การ-deploy)
- [Database Migrations](#database-migrations)

---

## ภาพรวมระบบ

**เวรดี๊ดี (PharmShift)** คือระบบจัดการตารางเวรออนไลน์สำหรับบุคลากรกลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์ ประกอบด้วย:

- 📅 **ปฏิทินเวรรายเดือน** — แสดงตารางเวรแยกตามแผนกและประเภทเวร
- 🔄 **ระบบแลก/โอนเวร** — บุคลากรสามารถแลกเปลี่ยนเวรกันได้ พร้อม Collision Detection
- 📊 **ออกรายงาน Excel** — หลักฐานการจัดเวร, ค่าตอบแทน, ตารางเวร, ใบเซ็นชื่อ
- 🔔 **แจ้งเตือนล่วงหน้า** — Web Push + In-app notification ก่อนเวรประจำวัน
- 👥 **จัดการผู้ใช้** — สร้าง/แก้ไข/ปิดบัญชีบุคลากร
- 📱 **PWA รองรับมือถือ** — ติดตั้งเป็น App บนสมาร์ทโฟนได้

---

## Tech Stack

| Layer | เทคโนโลยี |
|-------|----------|
| **Frontend** | Next.js 14 (App Router) + React 18 |
| **Language** | TypeScript (strict mode) |
| **Styling** | Tailwind CSS + Radix UI |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Iron-session (JWT Cookie — ไม่ใช้ Supabase Auth) |
| **Realtime** | Supabase Realtime (postgres_changes) |
| **Push Notifications** | Web Push API + VAPID (`web-push` v3.6.7) |
| **PWA** | `@ducanh2912/next-pwa` |
| **Excel Export** | ExcelJS (v4.4.0) |
| **Excel Import** | xlsx (v0.18.5) |
| **Icons** | Lucide React |
| **Toast** | Sonner + SweetAlert2 |
| **Deployment** | Vercel (with Cron Jobs) |

---

## ฟีเจอร์หลัก

### 📅 ปฏิทินเวร (Calendar)

- แสดงตารางเวรรายเดือนแบบ Grid 6 สัปดาห์ (42 วัน)
- แท็บแยก **"ทุกเวร"** และ **"เวรของฉัน"**
- แยก Section ตาม Role: เภสัชกร / เจ้าพนักงานเภสัชกรรม / เจ้าหน้าที่
- รองรับ **Mobile** ด้วย List View + Swipe เปลี่ยนเดือน
- แสดงวันหยุดราชการในปฏิทิน

### 🔄 ระบบแลก/โอนเวร (Swap & Transfer)

- **Swap** — แลกเวรระหว่างกัน (2 ฝ่ายยืนยัน)
- **Transfer** — โอนเวรให้คนอื่น (เจ้าของเวรยืนยัน)
- ตรวจสอบ **Collision** — ป้องกันเวรซ้อนทับตามช่วงเวลา
- **ล็อกเดือนที่ยังไม่ประกาศ** — ไม่อนุญาตให้ขอแลก/โอนเวรในเดือนที่ยังไม่ได้ประกาศตาราง
- Realtime — อัปเดตสถานะทันทีผ่าน Supabase Realtime

### 🛠️ Admin — จัดการตาราง

| ฟีเจอร์ | รายละเอียด |
|---------|------------|
| **Upload Excel** | นำเข้าเวรทีละมากจาก Template Excel |
| **สร้าง/แก้ไขเวร** | เพิ่ม/ย้าย/ลบเวรทีละรายการ |
| **แทนเวร** | ย้ายเวรระหว่างบุคลากร |
| **ประกาศตาราง** | Publish ตารางแยกตาม Role พร้อม stamp `original_user_id` ทันที |
| **ตั้งค่าระบบ** | รวม: จัดการวันหยุด / จัดการผู้ใช้ / ทดสอบแจ้งเตือน ในหน้าต่างเดียว |

> ⚠️ **Admin สามารถเพิ่ม/แก้ไขเวรก่อนประกาศได้โดยไม่แจ้งเตือนใคร** — การแจ้งเตือนจะเริ่มทำงานหลังจาก Publish ตารางเดือนนั้นแล้วเท่านั้น

### 👤 Admin — จัดการผู้ใช้

- สร้าง/แก้ไขข้อมูลบุคลากร (ชื่อ, nickname, ตำแหน่ง, เลขที่รับเงินเดือน)
- กำหนด Role และ Sub-admin flag
- ปิด/เปิดบัญชี (`is_active`)
- โหมด Read-only (`is_readonly`)
- Reset รหัสผ่าน

### 📊 Export รายงาน

| รายงาน | ฟอร์แมต | รายละเอียด |
|--------|---------|-----------|
| **หลักฐานการจัดตารางเวร** | Excel (.xlsx) | แสดงผู้ปฏิบัติงาน Original (จาก `original_user_id`) ก่อน Swap, แยกแผ่นตามประเภทเวร |
| **หลักฐานค่าตอบแทน** | Excel (.xlsx) | คำนวณค่าตอบแทนรายบุคคล, แปลงเป็นตัวอักษรภาษาไทย |
| **ตารางเวร (ปฏิทิน)** | Excel (.xlsx) | Calendar Grid พร้อมสี, Nickname, Position |
| **ใบเซ็นชื่อ** | Excel (.xlsx) | Sign-in sheet รายเดือน |

### 🔔 ระบบแจ้งเตือน

- **In-App Bell** — Panel แจ้งเตือนในระบบ (สีส้ม Badge)
- **Web Push** — Native notification บน Browser/Mobile
- **อัตโนมัติ** — Cron ส่งแจ้งเตือนเวรล่วงหน้า 2 ครั้ง/วัน

---

## สิทธิ์การใช้งาน (Roles)

| Role | ชื่อ | เวร | แลกเวร | Admin |
|------|------|-----|--------|-------|
| `admin` | ผู้ดูแลระบบ | ✗ | ✗ | ✅ ทุกอย่าง |
| `pharmacist` | เภสัชกร | ✅ | ✅ | ✗ |
| `pharmacy_technician` | เจ้าพนักงานเภสัชกรรม | ✅ | ✅ | ✗ |
| `officer` | เจ้าหน้าที่ | ✅ | ✅ | ✗ |

### Sub-Admin (`is_sub_admin = true`)

บุคลากรที่มี `is_sub_admin = true` สามารถจัดการเวรทั้งหมดใน Role Group ของตัวเองได้ (เช่น เภสัชกรที่เป็น Sub-admin จัดการเวรเภสัชกรทุกคน)

### สถานะบัญชี

| Flag | ความหมาย |
|------|----------|
| `is_active = false` | ล็อกอินไม่ได้ |
| `is_readonly = true` | ดูได้อย่างเดียว ไม่รับเวร/แลกเวรไม่ได้ |
| `must_change_password = true` | ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน |

---

## ประเภทเวร

### Shift Types

| Type | ไทย | ช่วงเวลา | สี |
|------|-----|---------|-----|
| `เช้า` | เวรเช้า | 08:30–16:30 | 🟢 Emerald |
| `บ่าย` | เวรบ่าย | 16:30–23:59 | 🟠 Orange |
| `ดึก` | เวรดึก | 00:00–08:30 | 🔵 Indigo |
| `รุ่งอรุณ` | เวรรุ่งอรุณ | 07:00–08:30 | 🟡 Amber |
| `smc` | เวร SMC | 16:30–20:30 | 🔴 Rose |

### Departments & Positions

```
เช้า (วันธรรมดา)
 ├── SURG        ×3
 ├── MED D/C     ×1
 ├── MED Cont    ×1
 ├── ER          ×1
 └── โครงการ     ×1

บ่าย (วันธรรมดา)
 ├── โครงการ     ×1
 ├── MED         ×1
 ├── ER          ×1
 └── SMC         ×2  (จ–พฤ เท่านั้น)

ดึก (ทุกวัน)
 └── ER          ×1

รุ่งอรุณ (วันธรรมดา)
 ├── OPD         ×1  (ทุกวัน)
 ├── ER          ×1  (อ–ศ)
 └── HIV         ×1  (อ เท่านั้น)

เสาร์/อาทิตย์/วันหยุด — เพิ่ม Chemo ×2
```

---

## โครงสร้างโปรเจกต์

```
pharmshift/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/          POST — เข้าสู่ระบบ
│   │   │   ├── logout/         POST — ออกจากระบบ
│   │   │   ├── me/             GET  — ข้อมูลผู้ใช้ปัจจุบัน
│   │   │   └── change-password/ POST — เปลี่ยนรหัสผ่าน
│   │   ├── admin/
│   │   │   └── users/          GET/POST/PUT — จัดการผู้ใช้
│   │   ├── user/
│   │   │   └── profile/        PUT — อัปเดตโปรไฟล์ตัวเอง
│   │   ├── shifts/
│   │   │   └── upload/         POST — นำเข้าเวรจาก Excel
│   │   ├── holidays/
│   │   │   ├── route.ts        GET/POST — รายการวันหยุด
│   │   │   ├── [id]/           DELETE — ลบวันหยุด
│   │   │   └── import/         POST — นำเข้าวันหยุด
│   │   ├── notifications/      GET/POST/PUT — แจ้งเตือน In-app
│   │   ├── push/
│   │   │   ├── subscribe/      POST/DELETE — Web Push subscription
│   │   │   └── send/           POST — ส่ง Push notification
│   │   └── cron/
│   │       ├── shift-reminders/ GET — แจ้งเตือนเวรล่วงหน้า (Cron)
│   │       └── cleanup/        GET — ลบข้อมูลเก่า (Cron)
│   ├── calendar/
│   │   └── page.tsx            หน้าปฏิทินหลัก
│   ├── login/
│   │   └── page.tsx            หน้าล็อกอิน
│   ├── change-password/
│   │   └── page.tsx            หน้าเปลี่ยนรหัสผ่านครั้งแรก
│   └── layout.tsx              Root layout + PWA meta
│
├── components/
│   ├── calendar/
│   │   ├── CalendarGrid.tsx              Grid ปฏิทิน Desktop (เภสัชกร)
│   │   ├── MyCalendarGrid.tsx            Grid เวรของฉัน
│   │   ├── PharmacyTechCalendarGrid.tsx  Grid เจ้าพนักงานเภสัชกรรม
│   │   ├── OfficeCalendarGrid.tsx        Grid เจ้าหน้าที่
│   │   ├── MobileCalendarGrid.tsx        Grid มือถือ
│   │   ├── MobileCalendarList.tsx        List view มือถือ
│   │   ├── DayCell.tsx                   ช่องวันในปฏิทิน
│   │   ├── ShiftBadge.tsx                Badge แสดงเวร
│   │   ├── DayDetailModal.tsx            Modal รายละเอียดวัน
│   │   ├── AdminAddShiftModal.tsx        Modal เพิ่มเวร (Admin)
│   │   ├── AdminShiftSubstituteModal.tsx Modal แทนเวร (Admin)
│   │   ├── AdminConfirmModal.tsx         Modal ยืนยัน Batch Action (Admin)
│   │   ├── AdminExportModal.tsx          Modal เลือกประเภท Export
│   │   ├── AdminSettingsModal.tsx        Modal ตั้งค่าระบบ (วันหยุด / ผู้ใช้ / แจ้งเตือน)
│   │   ├── AdminUserManagementModal.tsx  Modal จัดการผู้ใช้
│   │   ├── ManageHolidaysModal.tsx       Modal จัดการวันหยุด
│   │   ├── DeployModal.tsx               Modal ประกาศตารางเวร
│   │   ├── ShiftUploadModal.tsx          Modal Upload Excel
│   │   ├── PersonalShiftsModal.tsx       Modal กรองเวรตัวเอง
│   │   ├── CompensationModal.tsx         Modal แบบฟอร์มค่าตอบแทน
│   │   ├── CompensationExportModal.tsx   Modal Export ค่าตอบแทน
│   │   └── ScheduleTableExportButton.tsx Export ตารางเวร Excel
│   ├── swap/
│   │   ├── SwapModal.tsx            Modal แลก/โอนเวร
│   │   └── NotificationsPanel.tsx   Panel แจ้งเตือน (Bell)
│   ├── layout/
│   │   ├── Header.tsx               Header + Navigation
│   │   ├── MobileBottomNav.tsx      Bottom Nav บนมือถือ
│   │   └── MobileAdminMenu.tsx      Admin Menu บนมือถือ
│   ├── ExcelExportButton.tsx        Export หลักฐาน/ค่าตอบแทน
│   ├── ExportButton.tsx             Generic export button
│   ├── HelpGuideModal.tsx           Modal คู่มือการใช้งาน
│   └── UserProfileModal.tsx         Modal โปรไฟล์ผู้ใช้
│
├── hooks/
│   ├── useShifts.ts            Fetch shifts + holidays + publish status + Realtime
│   ├── useIsMobile.ts          Responsive breakpoint detection
│   └── useSwipeGesture.ts      Touch swipe handler
│
├── lib/
│   ├── types.ts                TypeScript interfaces ทั้งหมด
│   ├── session.ts              JWT cookie (iron-session)
│   ├── supabase.ts             Supabase client (browser)
│   ├── supabaseServer.ts       Supabase client (server / service role)
│   ├── utils.ts                Date formatting, shift overlap detection
│   ├── excelExport.ts          Export หลักฐาน + ค่าตอบแทน (ใช้ original_user_id)
│   ├── scheduleTableExport.ts  Export ตารางเวร Calendar Grid
│   ├── signSheetExport.ts      Export ใบเซ็นชื่อ Excel (ใช้ original_user_id)
│   ├── pushNotifications.ts    Web Push API (client-side)
│   ├── pushSender.ts           Web Push sender (server-side, VAPID)
│   ├── notifyUsers.ts          Insert in-app notifications
│   └── swal.ts                 SweetAlert2 helpers
│
├── supabase/
│   ├── schema.sql              Schema หลัก (tables, views, RLS)
│   ├── migrations/             Migration scripts แยกตามฟีเจอร์
│   └── run_*.sql               Setup scripts
│
├── public/
│   ├── manifest.json           PWA Manifest
│   ├── worker.js               Service Worker (Push + Cache)
│   ├── icon.png
│   └── apple-touch-icon.png
│
├── middleware.ts               Auth guard — ป้องกัน route ที่ต้อง login
├── vercel.json                 Cron job schedule
├── next.config.mjs             Next.js config + PWA
├── tailwind.config.ts
└── tsconfig.json
```

---

## Database Schema

### ตารางหลัก (9 Tables + 1 View)

#### `users`
```sql
id              UUID PRIMARY KEY
pha_id          TEXT UNIQUE          -- รหัสประจำตัว เช่น "pha208"
prefix          TEXT                 -- "ภก." | "ภญ."
f_name          TEXT
l_name          TEXT
nickname        TEXT
role            TEXT                 -- pharmacist | pharmacy_technician | officer | admin
is_sub_admin    BOOLEAN DEFAULT false
is_active       BOOLEAN DEFAULT true
is_readonly     BOOLEAN DEFAULT false
must_change_password BOOLEAN DEFAULT true
password        TEXT                 -- plain-text (hash ยังไม่ implement)
salary_number   TEXT                 -- เลขที่รับเงินเดือน
profile_image   TEXT                 -- 'male' | 'female'
created_at      TIMESTAMPTZ
```

#### `shifts`
```sql
id               UUID PRIMARY KEY
date             DATE                  -- วันที่เวร
department_id    INTEGER → departments
shift_type       TEXT                  -- เช้า | บ่าย | ดึก | รุ่งอรุณ | smc
position         TEXT                  -- OPD | ER | HIV | Cont | D/C (optional)
user_id          UUID → users          -- ผู้ปฏิบัติงานปัจจุบัน
original_user_id UUID → users          -- ผู้ปฏิบัติงานตอนประกาศ (stamp ครั้งเดียวตอน Publish)
month_year       TEXT                  -- 'YYYY-MM' (สำหรับ batch query)
created_at       TIMESTAMPTZ
-- Index: date, user_id, month_year
-- Constraint: unique(user_id, date, shift_type, position)
```

> **หมายเหตุ `original_user_id`:** ถูก stamp ครั้งเดียวตอน Admin กด "ประกาศตาราง" (Publish) และไม่เปลี่ยนแปลงหลังจากนั้น ใช้สำหรับออกรายงานหลักฐานการจัดเวรก่อน Swap

#### `departments`
```sql
id    SERIAL PRIMARY KEY
name  TEXT UNIQUE   -- โครงการ | SURG | MED | ER | SMC | รุ่งอรุณ | Chemo | ส่งยา สอ.
```

#### `swap_requests`
```sql
id              UUID PRIMARY KEY
shift_id        UUID → shifts        -- เวรที่ขอแลก
requester_id    UUID → users         -- ผู้ขอ
target_user_id  UUID → users         -- เป้าหมาย
request_type    TEXT                 -- 'swap' | 'transfer'
target_shift_id UUID → shifts        -- เวรของเป้าหมาย (swap เท่านั้น)
status          TEXT                 -- 'pending' | 'accepted' | 'rejected'
message         TEXT
requester_read  BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ          -- auto-updated via trigger
```

#### `published_months`
```sql
month_year                    TEXT PRIMARY KEY   -- 'YYYY-MM'
is_published                  BOOLEAN            -- true เมื่อ 3 role ประกาศทั้งหมด
pharmacist_published          BOOLEAN
pharmacy_technician_published BOOLEAN
officer_published             BOOLEAN
published_at                  TIMESTAMPTZ
published_by                  UUID → users
```

#### `notifications`
```sql
id         UUID PRIMARY KEY
user_id    UUID → users
type       TEXT    -- shift_assigned | shift_changed | shift_removed
                  --   schedule_published | shift_reminder
title      TEXT
body       TEXT
is_read    BOOLEAN DEFAULT false
url        TEXT DEFAULT '/calendar'
created_at TIMESTAMPTZ
-- Index: (user_id, created_at DESC)
```

#### `push_subscriptions`
```sql
id         UUID PRIMARY KEY
user_id    UUID → users
endpoint   TEXT UNIQUE      -- Web Push endpoint URL
p256dh     TEXT             -- VAPID encryption key
auth       TEXT             -- VAPID auth secret
user_agent TEXT
created_at TIMESTAMPTZ
```

#### `holidays`
```sql
id         UUID PRIMARY KEY
date       DATE UNIQUE
name       TEXT
created_at TIMESTAMPTZ
```

#### `shifts_full` (VIEW)
```sql
-- Convenience view: shifts + departments + users (ใช้ใน Calendar)
SELECT s.*, d.name AS department_name,
       u.prefix, u.f_name, u.l_name, u.nickname, u.profile_image
FROM shifts s
LEFT JOIN departments d ON s.department_id = d.id
LEFT JOIN users u ON s.user_id = u.id
```

### Row Level Security (RLS)

ระบบใช้ iron-session JWT ไม่ใช่ Supabase Auth จึงตั้ง RLS เป็น `using(true)` และควบคุมสิทธิ์ที่ Application Layer แทน ยกเว้น operations ที่ต้องการ service role key (เช่น Insert notifications จาก Cron)

---

## API Routes

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login ด้วย pha_id + password, สร้าง JWT Cookie |
| POST | `/api/auth/logout` | ลบ Session Cookie |
| GET | `/api/auth/me` | ดึงข้อมูล User จาก Session |
| POST | `/api/auth/change-password` | เปลี่ยนรหัสผ่าน |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | ดึงแจ้งเตือนของตัวเอง (50 รายการล่าสุด) |
| POST | `/api/notifications` | Batch insert แจ้งเตือนให้ผู้ใช้หลายคน |
| PUT | `/api/notifications` | Mark all as read |

### Push Notifications

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/push/subscribe` | บันทึก Web Push subscription |
| DELETE | `/api/push/subscribe` | ยกเลิก subscription |
| POST | `/api/push/send` | ส่ง Push notification ทันที |

### Shifts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/shifts/upload` | Batch import เวรจาก Excel |

### Holidays

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/holidays` | รายการวันหยุดทั้งหมด |
| POST | `/api/holidays` | เพิ่มวันหยุด |
| DELETE | `/api/holidays/[id]` | ลบวันหยุด |
| POST | `/api/holidays/import` | Import วันหยุดจากไฟล์ |

### Admin — Users

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | รายชื่อบุคลากรทั้งหมด |
| POST | `/api/admin/users` | เพิ่มบุคลากรใหม่ |
| PUT | `/api/admin/users` | แก้ไขข้อมูลบุคลากร |
| POST | `/api/admin/users/reset-password` | Reset รหัสผ่าน |

### Cron Jobs (Vercel Auto-run)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cron/shift-reminders` | ส่ง Push + In-app แจ้งเตือนเวร |
| GET | `/api/cron/cleanup` | ลบ notifications เก่า |

---

## Cron Jobs

กำหนดค่าใน `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/cleanup",         "schedule": "0 21 * * *" },
    { "path": "/api/cron/shift-reminders", "schedule": "0 1  * * *" },
    { "path": "/api/cron/shift-reminders", "schedule": "0 11 * * *" }
  ]
}
```

| Cron | UTC | Bangkok | หน้าที่ |
|------|-----|---------|--------|
| cleanup | 21:00 | 04:00 | ลบ notifications เก่ากว่า 90 วัน |
| shift-reminders (เช้า) | 01:00 | 08:00 | แจ้งเตือน **วันนี้** (ยกเว้นรุ่งอรุณ) |
| shift-reminders (เย็น) | 11:00 | 18:00 | แจ้งเตือน **พรุ่งนี้** (ทุกประเภท) |

### Logic แจ้งเตือนเวร

```
ตรวจ published_months ก่อน:
  ├── ยังไม่ประกาศ → ไม่ส่งแจ้งเตือน
  └── ประกาศแล้ว → ดึง shifts ตามวันเป้าหมาย

  Morning run (08:00 BKK):
    targetDate = วันนี้
    ยกเว้น shift_type = 'รุ่งอรุณ'

  Evening run (18:00 BKK):
    targetDate = พรุ่งนี้
    ส่งทุก shift_type

  → Insert in-app notification (notifications table)
  → ส่ง Web Push ไปทุกอุปกรณ์ที่ subscribe ไว้
```

---

## ระบบแจ้งเตือน

### Web Push Notifications

ใช้ **VAPID** (Voluntary Application Server Identification) มาตรฐาน W3C

```
การทำงาน:
1. User เปิดปฏิทิน → auto-subscribe (ขอ permission browser)
2. Endpoint + keys บันทึกใน push_subscriptions table
3. Cron / Admin action → เรียก sendPushToUsers()
4. Service Worker รับ push event → แสดง Native Notification
5. User คลิก notification → navigate ไป /calendar
6. Endpoint หมดอายุ (404/410) → ลบอัตโนมัติ (cleanup)
```

### In-App Notifications (Bell)

- แสดงใน Panel "จากระบบ" (แท็บที่ 2)
- Realtime อัปเดตผ่าน Supabase postgres_changes
- Badge นับ unread
- คลิก → navigate ตาม `url` field

### เงื่อนไขการแจ้งเตือนจาก Admin

| สถานะตาราง | เพิ่ม/แก้ไข/ลบเวร | ผลที่ตามมา |
|-----------|------------------|----------|
| **ยังไม่ประกาศ** | ทำได้อิสระ | ไม่แจ้งเตือนบุคลากรใดๆ |
| **ประกาศแล้ว** | แก้ไขได้ | แจ้งเตือนบุคลากรที่ได้รับผลกระทบทันที |

### ประเภทแจ้งเตือน

| Type | เหตุการณ์ |
|------|----------|
| `shift_reminder` | แจ้งเตือนเวรล่วงหน้า (Cron อัตโนมัติ) |
| `schedule_published` | ประกาศตารางเวรใหม่ |
| `shift_assigned` | ถูกกำหนดเวร |
| `shift_changed` | เวรถูกเปลี่ยน |
| `shift_removed` | เวรถูกลบ |

---

## ฟีเจอร์ Export

### 1. ตารางเวร Excel (Schedule Table Export)

ทุก User สามารถ Export ได้

- Calendar Grid รายเดือน (7 คอลัมน์ = 7 วัน)
- แสดง Nickname ในช่องเวร
- สีแยกประเภทเวร (เช้า/บ่าย/ดึก/รุ่งอรุณ/SMC)
- Position codes (OPD, ER, HIV, D/C, Cont)
- Header วัน/เดือน (ปีพุทธศักราช)
- Merged cells + ขอบตาราง

### 2. หลักฐานการจัดตารางเวร (Evidence Export)

สำหรับ Admin

- แสดงผู้ปฏิบัติงาน **ตอนประกาศ** (ดึงจาก `original_user_id` ใน shifts table)
- แยก Worksheet ตามประเภทเวร:
  - รุ่งอรุณ | โครงการ | เช้า-บ่าย-ดึก | SMC | Chemo
- รูปแบบราชการ (ลายเซ็น, คำรับรอง)

### 3. หลักฐานค่าตอบแทน (Compensation Export)

สำหรับ Admin

- คำนวณค่าตอบแทนตาม Rate ของแต่ละ Role
- แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย (เช่น "สองร้อยบาทถ้วน")
- Multi-page รองรับหลายคน
- รูปแบบเบิกจ่ายราชการ

### 4. ใบเซ็นชื่อ (Sign Sheet Export)

- ตารางลงชื่อปฏิบัติงานรายเดือน (Excel .xlsx)
- แสดงผู้ปฏิบัติงาน Original ก่อน Swap (ดึงจาก `original_user_id`)

---

## Environment Variables

สร้างไฟล์ `.env.local` ตามนี้:

```bash
# ── Supabase ──────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...    # ใช้ใน Server-side / Cron เท่านั้น

# ── Iron Session (JWT Cookie) ─────────────────────────────
SESSION_SECRET=your-secret-at-least-32-chars-long

# ── Web Push (VAPID) ──────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BxxxxxxxxxxxxxxX   # Public key ใส่ client ได้
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxx            # Private key ห้ามเปิดเผย
VAPID_SUBJECT=mailto:pharmacy@your-hospital.go.th

# ── Vercel Cron ───────────────────────────────────────────
CRON_SECRET=your-cron-secret    # Vercel ตั้งให้อัตโนมัติ
```

> ⚠️ **อย่า commit `.env.local`** — เพิ่มไว้ใน `.gitignore` เรียบร้อยแล้ว

### สร้าง VAPID Keys

```bash
npx web-push generate-vapid-keys
```

---

## การติดตั้งและรัน

### ความต้องการเบื้องต้น

- Node.js 18+
- npm / yarn / pnpm
- Supabase project (สร้างฟรีได้ที่ supabase.com)

### ขั้นตอน

```bash
# 1. Clone repository
git clone https://github.com/codex074/utth-shift.git
cd utth-shift

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า environment variables
cp .env.example .env.local
# แก้ไข .env.local ด้วยค่าจริง

# 4. รัน database migrations (ใน Supabase SQL Editor)
# ดูที่ supabase/schema.sql และ supabase/migrations/

# 5. รัน Development Server
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

### Scripts

```bash
npm run dev      # รัน development server
npm run build    # Build production
npm run start    # รัน production server
npm run lint     # ตรวจ TypeScript / ESLint
```

---

## การ Deploy

### Vercel (แนะนำ)

1. Push code ขึ้น GitHub
2. Import project ใน [vercel.com](https://vercel.com)
3. ตั้ง Environment Variables ใน Vercel Dashboard
4. Vercel จะ Auto-deploy ทุกครั้งที่ push ไป `main`
5. Cron jobs จะทำงานตาม schedule ใน `vercel.json` อัตโนมัติ

> ⚠️ Cron jobs ต้องใช้ **Vercel Pro** หรือสูงกว่า

### ตรวจสอบ Cron Jobs

ใน Vercel Dashboard → Project → Cron Jobs
หรือทดสอบ endpoint ตรงๆ (development):

```bash
curl http://localhost:3000/api/cron/shift-reminders
```

---

## Database Migrations

สร้างตารางและ setup ตามลำดับ:

```sql
-- 1. Schema หลัก
supabase/schema.sql

-- 2. Migrations (ตามลำดับ)
supabase/migrations/20260318_create_push_subscriptions.sql
supabase/migrations/add_is_sub_admin_to_users.sql
supabase/migrations/add_salary_number_to_users.sql
supabase/migrations/create_holidays_table.sql
supabase/migrations/add_new_roles.sql

-- 3. Run scripts
supabase/run_add_notifications.sql
supabase/run_add_published_months.sql

-- 4. เพิ่ม original_user_id (ต้องรันใน Supabase SQL Editor)
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS original_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
```

> **หมายเหตุ:** ไม่จำเป็นต้อง backfill `original_user_id` สำหรับข้อมูลเก่า — ค่าจะถูก stamp ครั้งต่อไปที่ Admin กด "ประกาศตาราง"

### Realtime (Supabase Dashboard)

ใน Supabase Dashboard → Database → Replication เปิด Realtime สำหรับ:
- `shifts`
- `swap_requests`
- `notifications`
- `published_months`

---

## Custom Hooks

| Hook | หน้าที่ | Return |
|------|--------|--------|
| `useShifts(year, month)` | Fetch shifts + holidays + publish status + Realtime | `shifts[], holidays[], isPublished(), publishedRoles, loading, refetch()` |
| `useIsMobile()` | Detect viewport < 768px | `boolean` |
| `useSwipeGesture()` | Touch swipe detection | `onSwipeLeft, onSwipeRight` |

> **หมายเหตุ:** `useSwapRequests`, `useCurrentUser`, `useNotifications` รวมอยู่ใน `useShifts.ts` แล้ว

---

## ข้อมูลทางเทคนิค

### Shift Collision Detection

```typescript
// lib/utils.ts — shiftsOverlap()
// ตรวจสอบว่า 2 shift types ช่วงเวลาทับซ้อนกันไหม
const SHIFT_RANGES = {
  'เช้า':     { start: 8.5,  end: 16.5 },  // 08:30–16:30
  'บ่าย':     { start: 16.5, end: 24.0 },  // 16:30–24:00
  'ดึก':      { start: 0.0,  end: 8.5  },  // 00:00–08:30
  'รุ่งอรุณ': { start: 7.0,  end: 8.5  },  // 07:00–08:30
  'smc':      { start: 16.5, end: 20.5 },  // 16:30–20:30
}
```

### Session (iron-session JWT)

```typescript
// lib/session.ts
// Cookie: HttpOnly + Secure + SameSite=lax
// Duration: 30 วัน
// Payload: { id, pha_id, role, is_sub_admin, ... }
```

### Realtime Subscriptions

```typescript
// hooks/useShifts.ts
supabase
  .channel(`shifts-${monthYear}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'shifts',
    filter: `month_year=eq.${monthYear}`,
  }, () => fetchShifts())
  .subscribe()
```

### Original User Logic (Publish Flow)

```
ก่อน Publish:
  shifts.original_user_id = NULL
  Admin แก้ไขเวรได้อิสระ ไม่แจ้งเตือนใคร

ตอน Publish (DeployModal):
  shifts WHERE month_year = X AND original_user_id IS NULL
    → UPDATE original_user_id = user_id  (stamp ทีเดียวแบบ batch)

หลัง Publish:
  - เวรที่แลก/โอน: user_id เปลี่ยน แต่ original_user_id คงเดิม
  - Admin แก้ไขเวร: แจ้งเตือนบุคลากรที่ได้รับผลกระทบ
  - Export รายงาน: ใช้ original_user_id แสดงเวรตอนประกาศ
```

---

## Known Limitations & TODO

| รายการ | สถานะ |
|--------|-------|
| Password hashing (bcrypt) | ⚠️ ยังเป็น plain-text |
| Rate limiting บน /api/auth/login | ❌ ยังไม่มี |
| LINE Notify integration | ❌ ยังไม่มี (ใช้ Web Push แทน) |
| Dashboard สถิติการทำเวร | ❌ ยังไม่มี |
| SMS fallback notification | ❌ ยังไม่มี |
| ระบบแนบหลักฐานส่งกองบัญชี | 🔄 TODO |

---

## License

```
Copyright (c) 2026 Codex074

All rights reserved.

ซอฟต์แวร์นี้พัฒนาขึ้นเพื่อใช้งานภายในกลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์เท่านั้น
ห้ามทำซ้ำ แจกจ่าย ดัดแปลง หรือนำไปใช้เพื่อวัตถุประสงค์อื่นใด
โดยไม่ได้รับอนุญาตเป็นลายลักษณ์อักษรจากเจ้าของลิขสิทธิ์
```
