# 🏥 เวรดี๊ดี

> ระบบจัดการตารางเวรกลุ่มงานเภสัชกรรม โรงพยาบาลอุตรดิตถ์

[![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)](https://vercel.com)

---

## ภาพรวม

PharmShift เป็น Progressive Web App (PWA) สำหรับจัดการตารางเวรฝ่ายเภสัชกรรม รองรับ 3 กลุ่มบุคลากร (เภสัชกร, เจ้าพนักงานเภสัชกรรม, เจ้าหน้าที่) พร้อมระบบแลกเวร, แจ้งเตือน Push, และส่งออก Excel หลายรูปแบบ

---

## 🛠 Tech Stack

| ส่วน | เทคโนโลยี | เวอร์ชัน |
| ---- | --------- | -------- |
| Framework | Next.js (App Router) | 14.2.5 |
| Language | TypeScript (strict) | 5 |
| Styling | Tailwind CSS + Radix UI | 3.4.1 |
| Database | Supabase (PostgreSQL) | Latest |
| Auth | Custom JWT (jose) — ไม่ใช้ Supabase Auth | 6.1.3 |
| Real-time | Supabase Realtime | Built-in |
| Push Notifications | Web Push API + web-push | 3.6.7 |
| PWA | Web App Manifest + Service Worker | Manual |
| Excel Export | ExcelJS | 4.4.0 |
| Excel Import | XLSX | 0.18.5 |
| Deployment | Vercel + GitHub Actions | — |

---

## ✨ Features

### 👤 สำหรับบุคลากรทั่วไป

- 📅 ดูตารางเวรแบบปฏิทิน (รายเดือน) — ทุกเวร หรือ เวรของตัวเอง
- 🔄 ขอแลกเวร / โอนเวร / อยู่เวรแทน พร้อม collision detection อัตโนมัติ
- 🔔 แจ้งเตือน Push Notification + In-App Notification แบบ Real-time พร้อมปุ่ม refresh ในแผงแจ้งเตือน
- 💰 ดูสรุปค่าตอบแทนรายเดือน
- 👤 แก้ไขข้อมูลส่วนตัว (ชื่อ, ชื่อเล่น, เลขที่เงินเดือน, รหัสผ่าน)
- 📱 รองรับ Mobile (Bottom Nav, Swipe gesture, Mobile Edit Day Modal)

### 🔧 สำหรับ Admin / Sub-Admin

- 📤 นำเข้าตารางเวรจาก Excel (รองรับ 3 role, หลาย sheet)
- ✏️ แก้ไข / ลบ / เพิ่มเวรโดยตรงบนปฏิทิน (Edit Mode)
- 📢 ประกาศตารางเวรรายเดือน (per-role publish flags)
- 🗓 จัดการวันหยุดนักขัตฤกษ์
- 👥 จัดการผู้ใช้งาน (เพิ่ม / แก้ไข / reset รหัสผ่าน / ตั้งค่า is_readonly, is_sub_admin)
- 📊 ส่งออก Excel 4 รูปแบบ:
  - ตารางเวรแบบปฏิทิน (schedule table) — ดาวน์โหลดได้ก่อนประกาศตาราง
  - ใบหลักฐานค่าตอบแทน (evidence — ใช้ original_user_id)
  - ใบเบิกค่าตอบแทน (compensation — 5 sheets, Thai Baht text)
  - ใบลงชื่อแลกเวร (sign sheet — 7 configs)
- 💾 Backup / Restore ข้อมูล (AdminBackupModal)
- 🧹 ส่ง push reminders แบบ manual (test cron endpoint)

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- Supabase project (PostgreSQL)
- VAPID keys สำหรับ Web Push

### 1. Clone และติดตั้ง

```bash
git clone <repo-url>
cd pharmshift
npm install
```

### 2. ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local`:

```bash
# Supabase (ANON_KEY ยังใช้เป็น JWT secret สำหรับ custom auth)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Web Push VAPID
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BF...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:pharmacy@uttaradit-hospital.go.th

# Cron security
CRON_SECRET=your-secret-here
NEXT_PUBLIC_APP_URL=https://pharmshift.vercel.app
```

สร้าง VAPID keys:

```bash
npx web-push generate-vapid-keys
```

### 3. ตั้งค่า Database

รัน migrations ใน `supabase/migrations/` ตามลำดับผ่าน Supabase dashboard หรือ CLI

หมายเหตุ:
- migration `20260407_make_swap_accept_atomic.sql` สำคัญสำหรับกันเคสกดรับคำขอเวรพร้อมกันหลายคน
- ถ้าไม่ได้ใช้ migration runner สามารถรัน SQL จาก `supabase/run_accept_swap_atomic.sql` ใน Supabase SQL Editor ได้

### 4. รัน Dev Server

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

---

## 🗄 Database Schema

```
users               — บัญชีผู้ใช้งาน (รวม profile_image: 'male'|'female', salary_number)
departments         — แผนก (ER, MED, SURG, SMC, Chemo, ...)
shifts              — ตารางเวรที่ถูกจัดสรร
  └─ original_user_id  — ผู้รับผิดชอบเวรดั้งเดิม (ไม่เปลี่ยนหลังแลก)
swap_requests       — คำขอแลก/โอน/อยู่แทน (pending/accepted/rejected)
holidays            — วันหยุดนักขัตฤกษ์
published_months    — สถานะประกาศตารางรายเดือน (per-role flags)
push_subscriptions  — VAPID endpoint ของแต่ละอุปกรณ์
notifications       — in-app notification log
shift_logs          — audit trail (swap, transfer, admin_edit, admin_delete)
```

---

## 🕐 ประเภทเวร

| ประเภท | เวลา | หมายเหตุ |
| ------ | ---- | -------- |
| ☀️ เช้า | 08:30–16:30 | วันทำการ + วันหยุดนักขัตฤกษ์ |
| 🌤 บ่าย | 16:30–23:59 | ทุกวัน |
| 🌙 ดึก | 00:00–08:30 | ทุกวัน (model เป็น 1440–1950 นาที) |
| 🌅 รุ่งอรุณ | 07:00–08:30 | วันทำการเท่านั้น |
| 🏥 smc | 16:30–20:30 | จันทร์–พฤหัสเท่านั้น |

---

## 🔐 Authentication

- JWT (HS256) เก็บใน HttpOnly cookie ชื่อ `pharmshift_session` (30 วัน)
- Rolling refresh: middleware ต่ออายุอัตโนมัติถ้าเหลือ < 15 วัน (ป้องกัน iOS 7-day purge)
- ไม่ใช้ Supabase Auth — custom JWT ด้วย `jose`
- รหัสผ่านเก็บ plain-text (ข้อจำกัดที่รู้อยู่แล้ว)
- รหัสผ่านเริ่มต้น: `1234` + flag `must_change_password = true` → บังคับเปลี่ยนรหัสผ่านในครั้งแรก

### Roles

| Role | สิทธิ์ |
| ---- | ------ |
| `admin` | ทุกอย่าง |
| `pharmacist` / `pharmacy_technician` / `officer` | ดูตาราง + แลกเวร |
| `is_sub_admin = true` | manage shifts สำหรับ role ตัวเอง (เหมือน admin เฉพาะกลุ่ม) |
| `is_readonly = true` | ดูได้อย่างเดียว — ไม่รับมอบหมายเวร / ไม่แลกเวรได้ |

---

## 🔄 Swap / Transfer / Cover Flow

```
1. กดที่เวร → SwapModal เปิด
2. เลือกประเภท:
   ├── 🔄 แลกเวร   → เลือกเวรตัวเองจาก mini calendar (badge สีตามประเภทเวร)
   ├── ➡️ โอนเวร   → เลือกผู้รับเวร
   └── 🙋 อยู่แทน → ยืนยันโดยตรง
3. กด "ส่งคำขอ"
4. Backend ตรวจสอบ:
   - ownership (fresh DB read)
   - collision: เวรทับกัน, บ่าย→ดึก, ดึก→เช้า
   - ถ้ามี collision → แจ้งเตือน (user กดยืนยันได้)
5. ถ้า accepted:
   - เรียก DB function แบบ atomic เพื่อ lock คำขอและ shift rows
   - เปลี่ยน user_id บน shifts
   - Push + in-app notify ผู้ขอ
   - Auto-reject คำขออื่นที่ค้างสำหรับ shift/target_shift เดียวกัน
```

### Realtime Flow (Optimized)

```
1. User ทำรายการสำเร็จ (send / accept / reject / cancel)
2. Client patch state เฉพาะ row ที่เกี่ยวข้องทันที
3. Server/DB เป็น source of truth และบันทึกผลจริง
4. Supabase Realtime ส่ง event กลับมา
5. Client patch เฉพาะ request / notification / shift row ที่เปลี่ยน
```

แนวทางนี้ช่วยให้:
- UI อัปเดตเร็วขึ้นโดยไม่ต้อง refetch ทั้งก้อนทุกครั้ง
- ลด read/query บน Supabase free tier
- ยังรักษา realtime ระหว่างหลายอุปกรณ์/หลายผู้ใช้ได้

### Manual Refresh

นอกจาก Realtime แล้ว ยังมีปุ่ม refresh สำหรับดึงข้อมูลใหม่ด้วยมือ:
- **ปุ่ม refresh บน Header** (สีฟ้า) — ดึงข้อมูลเวร + แจ้งเตือน + คำขอแลกเวร ทั้งหมดพร้อมกัน
- **ปุ่ม refresh ใน NotificationsPanel** (สีม่วง) — ดึงเฉพาะแจ้งเตือน + คำขอแลกเวร

---

## 📥 Excel Import

ไฟล์ตัวอย่าง: `public/sample_shifts.xlsx`

- รองรับ 3 role (แยก sheet)
- รหัสเวรแตกต่างตาม role และวัน (weekday vs. weekend)
- ตรวจ existing data → ถามก่อน overwrite (ต้องใส่รหัสผ่าน admin)
- Deduplicate ด้วย `(user_id, date, shift_type, position)`

---

## 🔔 Push Notifications & Cron

### Cron Schedule (GitHub Actions)

| เวลา Bangkok | Job |
| ------------ | --- |
| 🌅 06:00 | เตือนเวรวันนี้ (ยกเว้นรุ่งอรุณ) |
| 🌆 16:00 | เตือนเวรพรุ่งนี้ (ทุกประเภท) |
| 🧹 04:00 | ลบข้อมูลเก่า (swap_requests > 28 วัน, notifications เก่า) |

Cron ทำงานผ่าน `GET /api/cron/...` โดยใช้ `Authorization: Bearer CRON_SECRET`
ใช้ `Intl.DateTimeFormat` กับ `'Asia/Bangkok'` สำหรับ timezone

---

## 🚢 Deployment

### Vercel

1. Push โค้ดขึ้น GitHub
2. Connect repo กับ Vercel
3. ตั้งค่า Environment Variables ทั้งหมดใน Vercel dashboard
4. Deploy อัตโนมัติ

### GitHub Actions (Cron)

ตั้งค่า Secrets ใน repository:

- `APP_URL` — URL ของ Vercel deployment
- `CRON_SECRET` — ค่าเดียวกับ env var

---

## 📁 Project Structure

```
app/
  api/              — API routes (REST, dynamic)
  calendar/         — หน้าหลัก (state + modal orchestration ~830 LOC)
components/
  calendar/         — 28 components (grids, modals, export buttons)
  swap/             — SwapModal, NotificationsPanel
  layout/           — Header, Mobile nav
hooks/
  useShifts.ts      — useShifts + useSwapRequests + useNotifications + useCurrentUser
                     (realtime + targeted row patching)
  useIsMobile.ts    — viewport breakpoint
  useSwipeGesture.ts — touch swipe for month navigation
lib/
  types.ts          — Types + constants + role helpers
  utils.ts          — Calendar grid, overlap detection, Thai dates
  session.ts        — JWT helpers
  excelExport.ts    — Compensation Excel (evidence + payment)
  scheduleTableExport.ts — Schedule calendar Excel
  signSheetExport.ts     — Sign-off sheets Excel (7 configs)
middleware.ts       — JWT auth + rolling refresh
public/sw.js        — Service Worker (push notifications)
supabase/migrations/— SQL schema
```

---

## 💻 Scripts

```bash
npm run dev     # Dev server (http://localhost:3000)
npm run build   # Production build
npm start       # Production server
npm run lint    # ESLint
```

---

## 📄 License

Internal use — โรงพยาบาลอุตรดิตถ์ กลุ่มงานเภสัชกรรม
