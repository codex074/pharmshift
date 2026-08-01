# แผนย้าย PharmShift ไปโฮสต์เองบน Hostinger VPS (แอป + DB + cron)

> สถานะ: **PLAN ONLY — ยังไม่แตะโค้ด/โครงสร้าง** · branch `migrate-to-hostinger`
> ยืนยันขอบเขตแล้ว (2026-07-29): **ย้ายทั้งแอป Next.js + ฐานข้อมูล (แทน Supabase) + cron (แทน GitHub Actions) ไปอยู่บน Hostinger VPS ทั้งหมด**
> โดยยังใช้ **domain เดิมที่ผูกกับ Vercel อยู่ตอนนี้** — เปลี่ยนแค่ DNS ให้ชี้มาที่ VPS แทน ไม่ต้องซื้อ/ย้ายโดเมนใหม่
> สร้างไว้เผื่อเปลี่ยน session — เปิดอ่านไฟล์นี้เพื่อ resume งานต่อ
>
> **อัปเดต 2026-07-29 (รอบ 2)** — ผ่านการ review แบบ `/scrutinize` แล้ว
> ⚠️ **ยังมี 3 gate ที่ยังไม่ผ่าน และอาจล้มแผนนี้ได้ — อ่าน §0.5 ก่อนลงมือทุกครั้ง** (P-1 `pg_dump` ต่อไม่ติด · P-2 R1 ค้าง · P-3 ค่า Realtime หาย)
> blocker ที่แก้ไปแล้วในรอบนี้ 2 ข้อ:
> (1) แผน delta sync เดิม **ทำไม่ได้จริง** เพราะตารางหลักไม่มี `updated_at` → เปลี่ยนเป็น freeze + dump รอบเดียว (ดู §5, §11)
> (2) การใช้ path-based URL (`/backend`) เป็นสมมติฐานที่ยังไม่ได้ทดสอบ → เปลี่ยนเป็น **exit criterion ของ Phase 1** (ดู §4)
> เพิ่ม §0.5 prerequisites 3 ข้อที่ต้องเคลียร์ก่อน · §0.7 ทางเลือกที่พิจารณาแล้วไม่เอา · §8 การแพคด้วย Docker (กับดัก 5 ข้อ)

---

## 0. สรุปสิ่งที่ตัดสินใจแล้ว vs ที่ยังต้องตัดสินใจ

**ตัดสินใจแล้ว:**
- ย้าย **ทั้ง 3 อย่าง**: hosting ของแอป (ปัจจุบัน Vercel) + ฐานข้อมูล/Realtime (ปัจจุบัน Supabase) + cron (ปัจจุบัน GitHub Actions) → รวมอยู่บน Hostinger VPS เครื่องเดียว
- **Domain เดิมที่ใช้อยู่ (ที่ผูกกับ Vercel ตอนนี้) ใช้ต่อ** — แค่เปลี่ยน DNS record ให้ชี้มาที่ IP ของ VPS แทนที่จะชี้ไป Vercel
- GitHub ยังใช้เป็น **git remote / CI trigger** ได้ตามปกติ (ข้อความผู้ใช้พูดถึงแค่ "cron job จาก GitHub" ไม่ได้บอกให้เลิกใช้ GitHub Actions ทั้งหมด) — สิ่งที่เอาออกคือ **schedule ของ cron** (`.github/workflows/cron.yml`) ไม่ใช่ repo หรือ Actions โดยรวม

- **แพคแอปด้วย Docker** (ยืนยัน 2026-07-29) — เหตุผล: `package.json` ไม่ได้ pin `engines` เลย Docker จึงเป็นวิธีเดียวที่ล็อค Node version ให้ตรงกันระหว่างเครื่อง dev กับ VPS ได้จริง · รายละเอียดกับดัก 5 ข้อ ดู §8

**ยังต้องตัดสินใจก่อนเริ่ม Phase 1** (ดูรายละเอียดแต่ละข้อในเนื้อหา):
1. ขนาด VPS (แนะนำ KVM 2 เป็นขั้นต่ำ — ดู §13)
2. จะรัน self-hosted Supabase stack แบบเต็ม (Kong + Postgres + PostgREST + Realtime + GoTrue + Storage + Studio) หรือ **ตัดส่วนที่ไม่ได้ใช้ออก** (แนะนำ — ดู §2)
3. ใครเป็นคนถือ private key / SSH access ของ VPS และจะเก็บ secret (`.env`) ยังไง
4. ระยะเวลา "grace period" ที่จะกัน Vercel project + Supabase project เดิมไว้เผื่อ rollback (แนะนำ 14 วัน)

---

## 0.5 ⚠️ Prerequisites — ต้องเคลียร์ให้จบก่อนเริ่ม Phase 1

ทั้ง 3 ข้อนี้ถ้าไม่ทำก่อน จะไปเจอปัญหาตอน cutover ซึ่งเป็นจังหวะที่แก้ยากที่สุด

**P-1. ทดสอบว่า `pg_dump` ต่อ Supabase เดิมได้จริง (ใช้เวลา 5 นาที — gate ของทั้งแผน)**
- Supabase **transaction-mode pooler ไม่รองรับ `pg_dump`** ต้องใช้ direct connection หรือ session-mode pooler เท่านั้น
- direct connection ของบางโปรเจกต์เป็น **IPv6-only** ขึ้นกับว่าโปรเจกต์นั้นได้ IPv4 มาหรือเปล่า — ถ้าเครื่องที่จะ dump ไม่มี IPv6 จะต่อไม่ติด
- **ทำเลยวันนี้**: รัน `pg_dump --schema-only` ทิ้งจากเครื่องที่จะใช้ dump จริง ถ้าไม่ผ่าน แผน cutover ทั้งหมดใช้ไม่ได้ ต้องหาทางอื่นก่อน

**P-2. ลบ R1 legacy fallback ออกก่อนย้าย (เลยกำหนดมาแล้ว 37 วัน)**
- `middleware.ts:11` และ `lib/session.ts:6` ยังอ่าน `NEXT_PUBLIC_SUPABASE_ANON_KEY` มาใช้เป็น **JWT verification secret** อยู่
- CLAUDE.md §20 กำหนดเส้นตายไว้ **2026-06-22** ซึ่งผ่านมาแล้ว
- ทำไมต้องทำก่อนย้าย: การย้ายครั้งนี้จะ**เปลี่ยนค่า** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (เป็น key ของ self-hosted stack) ถ้าไม่ลบโค้ดนี้ก่อน เท่ากับพาโค้ดที่เอา "ค่า public ที่ส่งไปทุกเบราว์เซอร์" มาใช้ verify auth เข้าไปอยู่ในระบบใหม่ต่ออีก — และมันจะถูกลืมต่อไปอีกนาน
- วิธีทำ: ทำตาม 3 ขั้นที่เขียนไว้แล้วใน CLAUDE.md §18 ("R1 migration cleanup")
- **หมายเหตุเรื่อง session**: แผนนี้บอกว่า `SESSION_JWT_SECRET` คงเดิม → session ไม่หลุด ซึ่งจริง **เฉพาะ cookie ที่ sign ด้วย secret ใหม่** ส่วนใครที่ยังถือ cookie legacy อยู่จะถูก logout ตอน cutover ไม่ว่าทางไหนก็ตาม

**P-3. เก็บค่า config ของ Realtime จาก Supabase เดิมก่อนปิดโปรเจกต์**
- ค่าพวกนี้ **ไม่ได้อยู่ในไฟล์ migration เลย** (ตั้งผ่าน Studio UI) ถ้าปิดโปรเจกต์เดิมไปก่อนจะไม่มีทางรู้ย้อนหลัง
- ต้องจดไว้ 2 อย่าง: (ก) รายชื่อตารางใน publication `supabase_realtime` (ข) **`REPLICA IDENTITY` ของแต่ละตาราง**
- ดูที่ Supabase Studio → Database → Replication และ/หรือ query `pg_publication_tables` + `pg_class.relreplident`

---

## 0.7 ทางเลือกที่พิจารณาแล้ว — และเหตุผลที่ไม่เอา

บันทึกไว้เพื่อไม่ให้มีคนหยิบมาถามซ้ำใน session หน้า

**ทางเลือก: เลิกใช้ Supabase ทั้งหมด** — ใช้ Postgres เปล่า + `pg`/Drizzle ใน API routes และเปลี่ยน Realtime เป็น SSE ที่หนุนด้วย `LISTEN/NOTIFY`

- **ข้อดีจริง**: ตัด Kong + PostgREST + Realtime ออกได้หมด เหลือ container น้อยลง 3 ตัว ไม่ต้อง generate JWT key ไม่ต้องตั้ง tenant ของ Realtime งาน ops เบาลงมาก
- **เหตุผลที่ไม่เอา**: โค้ดฝั่ง server พึ่ง service-role client อยู่ **18 ไฟล์** และ hooks ฝั่ง client เรียก `supabase` ตรงๆ อีก การเปลี่ยนแบบนี้คือการ **rewrite ครั้งใหญ่ไปพร้อมกับการ cutover** — เอาความเสี่ยงด้าน ops ที่คุมได้ ไปแลกกับความเสี่ยงด้านโค้ดที่คุมยากกว่า ในจังหวะที่แย่ที่สุด
- **สรุป**: ไม่เอาในรอบนี้ แต่เป็นตัวเลือกที่สมเหตุสมผลถ้าจะทำ **หลัง** ย้ายเสร็จและระบบนิ่งแล้ว

**ทางเลือก: ย้ายเฉพาะ DB + cron แต่ทิ้งแอปไว้บน Vercel** — ผู้ใช้ตัดสินใจแล้วว่าเอาแบบย้ายทั้งหมด (2026-07-29) ไม่ต้องรื้อประเด็นนี้อีก

---

## 1. สถาปัตยกรรม: ก่อน → หลัง

**ตอนนี้ (Vercel + Supabase + GitHub Actions):**
```
ผู้ใช้ → domain → Vercel Edge/CDN → Next.js serverless functions
                                          │
                                          ├→ Supabase (Postgres + PostgREST + Realtime) [managed, free tier]
                                          └→ Web Push (VAPID, ตรงจาก function)

GitHub Actions (cron schedule) → curl → Vercel API routes (/api/cron/*)
```

**หลังย้าย (Hostinger VPS เครื่องเดียว):**
```
ผู้ใช้ → domain (DNS ชี้มาที่ VPS IP) → Caddy/Nginx (TLS + reverse proxy) 
                                          │
                                          ├→ Next.js (Docker container, restart: always)
                                          │      │
                                          │      └→ Web Push (VAPID, เหมือนเดิม — ไม่กระทบ)
                                          │
                                          └→ self-hosted Supabase stack (Docker Compose)
                                                 ├ postgres (ข้อมูลจริง)
                                                 ├ postgrest  → path /rest/v1/*
                                                 └ realtime   → path /realtime/v1/*

VPS system crontab → curl localhost → Next.js API routes (/api/cron/*)
```

จุดสำคัญ: แอปกับฐานข้อมูลอยู่เครื่องเดียวกันและ**โดเมนเดียวกัน** — ใช้ reverse proxy ตัวเดียวจัดเส้นทางแบบ path-based แทนที่จะแยก subdomain ให้ Supabase

**ข้อดีจริงของ path-based คือเป็น same-origin จึงไม่ต้องตั้ง CORS ที่ Kong/PostgREST เลย** (ไม่ใช่เรื่อง "ประหยัด cert/DNS record" อย่างที่เขียนไว้รอบแรก — Caddy ออก cert ให้ subdomain ฟรีอยู่แล้ว เหตุผลนั้นใช้ไม่ได้)

⚠️ แต่ **ยังเป็นสมมติฐานที่ต้องพิสูจน์ก่อน** — ดู exit criterion ใน §4 ถ้าไม่ผ่านให้ถอยไปใช้ `api.<domain>` แทน

---

## 2. Inventory: สิ่งที่โค้ดพึ่งพา Supabase อยู่ตอนนี้ (เช็คแล้วจากโค้ดจริง)

| รายการ | จำนวน/รายละเอียด | ผลต่อการย้าย |
| --- | --- | --- |
| Migration files | 28 ไฟล์ ใน `supabase/migrations/` (มี.ค.–ก.ค. 2026) | **นี่คือ schema ที่ถูกต้องที่สุด** — รันไล่ตามลำดับ ไม่ dump schema จาก Supabase เดิม |
| RPC functions | 7 ไฟล์นิยามฟังก์ชัน: `accept_swap_request_atomic`, `apply_admin_shift_changes_atomic`, `apply_shift_owner_edits_atomic`, `cleanup_swap_request_chain_hops`, `record_access` (+ อีก 2 helper) | ต้อง verify ว่ารันได้ปกติหลัง replay migration บน Postgres เปล่า |
| RLS policies | อยู่ใน 7 ไฟล์ migration (ส่วนใหญ่ `using(true)` เพราะ auth เป็น custom JWT ไม่ใช่ Supabase Auth) | replay ตาม migration ก็ได้ครบ ไม่ต้องทำอะไรเพิ่ม |
| Extensions ที่ใช้ | `pgcrypto` — มี `create extension if not exists` ประกาศไว้ ✅<br>`uuid-ossp` — ใช้ `uuid_generate_v4()` ใน 2 migration แต่ **ไม่มีไฟล์ไหนสร้าง extension นี้เลย** ❌ | 🚨 **จุดที่จะทำให้ Phase 1 ล้มทันที** — Supabase managed เปิด `uuid-ossp` ให้อัตโนมัติ แต่ Postgres เปล่าไม่เปิด → replay migration จะ **error ตาย** ที่ `20260304153500_create_shift_logs_table.sql` และ `create_holidays_table.sql` · ต้อง `create extension if not exists "uuid-ossp";` **ก่อน** เริ่ม replay |
| Realtime channels | 3 channel: `shifts-${monthYear}`, `swaps-${userId}`, `notifs-${userId}` (ใน `hooks/useShifts.ts`) | ⚠️ **ไม่เจอ migration ที่ตั้งค่า `supabase_realtime` publication** — แปลว่าตารางถูกเพิ่มเข้า publication ผ่าน Supabase Studio UI ไม่ใช่ SQL → ต้องเก็บค่าก่อนปิดโปรเจกต์เดิม (ดู P-3) |
| Realtime `REPLICA IDENTITY` | ⚠️ **ไม่มี migration ไหนตั้งค่าเลย** = ใช้ค่า default (PK เท่านั้น) | ดูกล่องเตือนใต้ตาราง — มีผลต่อพฤติกรรม DELETE |
| Client ที่ยิงตรงจาก browser | `lib/supabase.ts` (anon key, ใช้ทั้งแอป) | ต้องให้ endpoint ใหม่ตอบ path/response แบบเดียวกับ Supabase (คือเหตุผลที่แนะนำใช้ PostgREST+Realtime จริง ไม่ใช่เขียน API เอง) |
| Server client | `lib/supabaseServer.ts` (SSR cookie adapter, ยังใช้ anon key — ไม่ผูกกับ Supabase Auth เพราะ auth เป็น JWT เอง) | เปลี่ยนแค่ env var URL |
| Service-role usage | 18 ไฟล์ (admin routes, cron, swap accept, notifications) | เปลี่ยนแค่ env var URL/key |
| Supabase Storage | **ไม่ได้ใช้** (ยืนยันจาก CLAUDE.md §19 และ grep ไม่เจอ `supabase.storage`) | ไม่ต้องย้าย ไม่ต้องรัน container storage/imgproxy |
| Supabase Auth (GoTrue) | **ไม่ได้ใช้** — auth เป็น custom JWT (`lib/session.ts`) ทั้งหมด | ไม่ต้องรัน container GoTrue |
| Edge Functions | ไม่พบการใช้งาน | ไม่เกี่ยวกับการย้ายนี้ |

### ⚠️ กับดัก: `REPLICA IDENTITY` กับพฤติกรรม DELETE ของ Realtime

โค้ดที่ `hooks/useShifts.ts:216` subscribe ด้วย `filter: month_year=eq.${monthYear}` และสาขา DELETE อ่าน `payload.old.id`

ตามเอกสาร Supabase: **filter จะมีผลกับ event DELETE ก็ต่อเมื่อตั้ง `REPLICA IDENTITY FULL`** เท่านั้น
ถ้าใช้ค่า default (PK อย่างเดียว) ตัว filter จะประเมินไม่ได้เพราะไม่มีคอลัมน์ `month_year` มาให้เทียบ

**แปลว่า**: ทุกวันนี้เวลา admin ลบเวร หน้าปฏิทินของคนอื่นน่าจะ**ไม่อัปเดตสด** ต้องกด refresh เอง (เป็น bug แฝงที่มีอยู่เดิม ไม่ได้เกิดจากการย้าย)

**ความเสี่ยงตอน cutover**: ถ้าคนเซ็ตอัพเครื่องใหม่เผลอตั้ง `REPLICA IDENTITY FULL` เพราะคิดว่า "ตั้งไว้ให้ realtime ทำงาน" → การลบเวรจะเริ่มเด้งสดขึ้นมาทันที เป็นการ**เปลี่ยนพฤติกรรมที่ไม่มีใครวางแผนไว้**

**สิ่งที่ต้องทำ**: คัดลอกค่า replica identity จากของเดิมมาตรงๆ (P-3) ห้ามตั้งใหม่ตามใจ
และควรทดสอบยืนยันพฤติกรรมปัจจุบันก่อน 2 นาที — ให้ admin ลบเวร 1 รายการ แล้วดูอีกเบราว์เซอร์ว่าหายเองไหม
จะได้รู้ว่ากำลัง "รักษาพฤติกรรมเดิม" หรือ "แอบแก้ bug" อยู่

> อ้างอิง: [Postgres Changes | Supabase Docs](https://supabase.com/docs/guides/realtime/postgres-changes) · [supabase/walrus#53](https://github.com/supabase/walrus/issues/53)

**ข้อแนะนำจากตาราง**: self-hosted Supabase stack แบบเต็ม (ที่ official repo แจกมา) มาพร้อม Kong, GoTrue, Storage, ImgProxy, Studio, Analytics/Logflare — ของพวกนี้แอปนี้ **ไม่ได้ใช้เลยสักตัว** ยกเว้น Postgres + PostgREST + Realtime ดังนั้นแนะนำ**ตัด container ที่ไม่ใช้ออกจาก docker-compose** (โดยเฉพาะ Analytics/Logflare ที่กิน RAM เยอะและ GoTrue ที่ไม่มีประโยชน์เพราะไม่ได้ใช้ Supabase Auth) — ประหยัด RAM ได้มากบน VPS เครื่องเล็ก และลดพื้นผิวโจมตี (attack surface) ไปด้วย

---

## 3. Phase 0 — เตรียม VPS

1. เช่า Hostinger VPS (ดูสเปคแนะนำ §7), ติดตั้ง Ubuntu LTS ล่าสุด
2. สร้าง non-root user + sudo, ปิด password login (ใช้ SSH key เท่านั้น), เปิด `ufw` อนุญาตแค่ 22 (จำกัด IP ถ้าทำได้), 80, 443
3. ติดตั้ง Docker + Docker Compose plugin
4. ติดตั้ง `fail2ban` กัน brute-force SSH
5. ตั้ง automatic security updates (`unattended-upgrades`)

6. **รัน P-1 (ทดสอบ `pg_dump`) ให้ผ่านก่อนไปต่อ** — ดู §0.5 ถ้าข้อนี้ไม่ผ่าน อย่าเพิ่งเสียเวลาทำ Phase 1

**Verify**: SSH เข้าด้วย key ได้, `docker run hello-world` ผ่าน, `ufw status` แสดงกฎถูกต้อง, `pg_dump --schema-only` จาก Supabase เดิมสำเร็จ

---

## 4. Phase 1 — Self-hosted Supabase stack

1. Clone `docker` folder จาก official `supabase/supabase` repo เป็นฐาน
2. ตัด service ที่ไม่ใช้ออกจาก `docker-compose.yml`: `auth` (GoTrue), `storage`, `imgproxy`, `studio`, `analytics`/`vector` (Logflare) — เหลือ `db` (postgres), `rest` (PostgREST), `realtime`, `kong`
   - **เก็บ Kong ไว้** เพราะจัดการ `apikey` header ให้ตรงกับที่ `supabase-js` คาดหวังโดยไม่ต้อง config เอง
   - ⚠️ **ดังนั้น Caddy ต้อง proxy ไปที่ Kong เท่านั้น ห้ามยิงตรงเข้า PostgREST/Realtime** — §7 ต้องอ่านคู่กับข้อนี้ ไม่งั้นจะได้ topology ที่ขัดกันเอง
3. Generate ชุด key ใหม่: `JWT secret`, `anon key`, `service_role key` (เป็น JWT ที่มี claim `role: anon` / `role: service_role` เซ็นด้วย JWT secret เดียวกัน — มีสคริปต์ generate ในเอกสาร Supabase self-hosting)
4. 🚨 **สร้าง extension ก่อน replay migration — ข้ามข้อนี้แล้ว Phase 1 ล้มแน่นอน**
   ```sql
   create extension if not exists "uuid-ossp";
   create extension if not exists "pgcrypto";
   ```
   เหตุผล: มี 2 migration ที่ใช้ `uuid_generate_v4()` แต่ไม่มีไฟล์ไหนสร้าง `uuid-ossp` เลย (Supabase managed เปิดให้อัตโนมัติ จึงไม่มีใครเคยต้องเขียน) — ดู §2 แถว Extensions
5. รัน migration ทั้ง 28 ไฟล์ตามลำดับ timestamp ผ่าน `psql` (ไม่ใช้ dump schema จาก Supabase เดิม — migration files คือ source of truth ตาม CLAUDE.md §7)
6. รัน RPC function ทั้งหมด (มาพร้อม migration แล้ว), verify ด้วย `\df` ใน psql
7. เปิด logical replication + สร้าง publication `supabase_realtime` เอง แล้ว `ALTER PUBLICATION supabase_realtime ADD TABLE shifts, swap_requests, notifications;` (ต้อง**ยืนยันรายชื่อตารางจาก Supabase Studio เดิมก่อนปิด/ย้ายโปรเจกต์เก่า** — ดู §2 คอลัมน์ realtime)
8. Verify: query ผ่าน PostgREST ได้ (`curl localhost:8000/rest/v1/shifts` พร้อม apikey header), realtime websocket connect ได้

### 🚧 Exit criterion ของ Phase 1 — ห้ามข้าม

สถาปัตยกรรมทั้งแผนตั้งอยู่บนสมมติฐานว่า `NEXT_PUBLIC_SUPABASE_URL = https://<domain>/backend` (path-based) ใช้งานได้
**สมมติฐานนี้ยังไม่เคยถูกทดสอบ** และมันถูก **ฝังลงใน client bundle ตอน build** (ดู §8 กับดักข้อ 1)
แปลว่าถ้าผิด จะไปรู้ตอน deploy เสร็จแล้ว และแก้ด้วยการ build ใหม่เท่านั้น ไม่ใช่แค่แก้ config

ก่อนสร้างอย่างอื่นทับลงไป ต้องพิสูจน์ให้ได้ทั้ง 2 ข้อ:
1. PostgREST query ผ่าน URL ที่มี path prefix ได้ (อันนี้แทบแน่ใจว่าผ่าน เพราะ supabase-js ต่อ string `${supabaseUrl}/rest/v1/...`)
2. **`postgres_changes` subscription ผ่าน websocket ที่มี path prefix ได้** ← อันนี้คือตัวเสี่ยง การประกอบ URL ของ websocket ยืดหยุ่นน้อยกว่า REST

**ถ้าข้อ 2 ไม่ผ่าน** → ถอยไปใช้ subdomain `api.<domain>` แทน (Caddy ออก cert ให้อัตโนมัติ ไม่มีค่าใช้จ่ายเพิ่ม)

> หมายเหตุ: เหตุผล "ใช้ cert ใบเดียว / DNS record เดียว" ที่เขียนไว้ตอนแรก **เป็นเหตุผลที่อ่อน** เพราะ Caddy จัดการให้ฟรีอยู่แล้ว
> ข้อดีจริงของ path-based คือ **ไม่ต้องตั้ง CORS ที่ Kong/PostgREST เลย** เพราะเป็น same-origin — ใช้ข้อนี้เป็นเหตุผลแทน

---

## 5. Phase 2 — ซ้อมย้ายข้อมูล (rehearsal — ข้อมูลชุดนี้ทิ้ง)

> **แก้จากแผนเดิม (blocker)**: แผนรอบแรกวางไว้เป็น "ย้ายข้อมูลรอบใหญ่ตอนนี้ แล้วค่อยตาม delta ตอน cutover"
> **วิธีนั้นทำไม่ได้จริง** เหตุผลอยู่ใน §11 — ตารางหลักไม่มี `updated_at` จึงคำนวณ delta ไม่ได้
> Phase นี้จึงเปลี่ยนเป็น **การซ้อม** ที่มีของส่งมอบคือ *"ตัวเลขเวลาที่ dump+restore ใช้จริง"* ซึ่งเป็นตัวกำหนดว่า maintenance window ต้องยาวแค่ไหน
> ข้อมูลที่ย้ายมาในรอบนี้ **ถือว่าเป็นของทิ้ง** ตอน cutover จริงจะ dump ใหม่ทั้งก้อนอยู่ดี

1. `pg_dump --data-only --disable-triggers --schema=public` จาก Supabase (ต้องใช้ direct connection / session-mode pooler ตาม P-1)
   - **`--disable-triggers` จำเป็น ไม่ใช่ทางเลือก**: schema นี้มี FK จริงหลายเส้น เช่น `shift_logs.shift_id → shifts.id`, `access_logs.user_id → users.id (NOT NULL)`, `push_subscriptions.user_id → users.id`, `audit_logs.actor_user_id → users.id` และ `pg_dump --data-only` **ไม่รับประกันลำดับ COPY ที่ปลอดภัยกับ FK** ถ้าไม่ปิด trigger ไว้ restore จะล้มกลางคัน
2. Restore เข้า self-hosted Postgres ที่ replay migration ไปแล้วใน Phase 1
   - **ต้อง restore ในฐานะ owner ของตารางหรือ superuser** เพราะทุกตารางเปิด RLS อยู่ ถ้าเป็น role อื่นอาจถูก policy บล็อก insert แบบเงียบๆ (บน VPS ตัวเองมี superuser อยู่แล้ว ไม่ใช่ปัญหา แค่ต้องระบุให้ชัด)
3. **จับเวลา** ตั้งแต่เริ่ม dump จนถึง restore เสร็จ → นี่คือของส่งมอบหลักของ Phase นี้
4. Verify (ใช้เป็น gate ผ่าน/ไม่ผ่าน ไม่ใช่แค่ "ลองดู"): เทียบ row count ทุกตารางให้ตรงกับต้นทาง — `users`, `shifts`, `swap_requests`, `holidays`, `notifications`, `audit_logs`, `push_subscriptions`, `access_logs`, `shift_logs`
5. Verify RPC ทำงานกับข้อมูลจริง — **ต้องห่อใน transaction แล้ว `ROLLBACK`** (เช่น `BEGIN; SELECT accept_swap_request_atomic(...); ROLLBACK;`) ไม่งั้นการทดสอบจะไปแก้ข้อมูลที่เพิ่ง restore มา
6. เก็บ SQL script ทั้งหมดที่ใช้ไว้ให้พร้อมรันซ้ำแบบไม่ต้องคิด — ตอน cutover จริงจะต้องรันชุดเดิมนี้ภายใต้ความกดดันเวลา

---

## 6. Phase 3 — Deploy แอป Next.js บน VPS

> **รายละเอียดการแพคด้วย Docker + กับดัก 5 ข้อ อยู่ใน §8** — อ่านก่อนเขียน Dockerfile

1. เตรียมโค้ดให้พร้อม dockerize (2 อย่างนี้ต้องแก้โค้ดจริง ไม่ใช่แค่ config ตอน deploy):
   - ตั้ง `output: 'standalone'` ใน `next.config.mjs`
   - เพิ่ม `sharp` เข้า `package.json`
2. Build เป็น Docker image (multi-stage) — ส่ง `NEXT_PUBLIC_*` ทั้ง 4 ตัวเป็น **build arg** ไม่ใช่ runtime env (ดู §8 ข้อ 1)
3. รันด้วย `docker compose` + restart policy `always` รวมอยู่ใน compose ไฟล์เดียวกับ Supabase stack
4. Env vars ที่ต้องเปลี่ยน — checklist เต็มใน §14
5. `SESSION_JWT_SECRET`, VAPID keys, `CRON_SECRET` — **ใช้ค่าเดิมได้เลย ไม่ต้อง generate ใหม่** (ไม่เกี่ยวกับ Supabase) เพื่อไม่ให้ user session เดิมหลุดตอน cutover

---

## 7. Phase 4 — Reverse proxy + TLS (same-origin, ไม่ต้องตั้ง CORS)

1. ติดตั้ง Caddy (auto-HTTPS ง่ายกว่า Nginx+certbot สำหรับ setup เดียว) หรือ Nginx + certbot
2. Route:
   - `/` → Next.js container (port ภายใน เช่น 3000)
   - `/rest/v1/*`, `/realtime/v1/*` → **Kong** (ไม่ใช่ยิงตรงเข้า PostgREST/Realtime — Kong เป็นตัวจัดการ `apikey` header ตาม §4 ข้อ 2)
3. **Cert: ใช้ DNS-01 challenge ไม่ใช่ HTTP-01** — HTTP-01 ต้องให้ DNS ชี้มาที่ VPS ก่อนถึงจะขอ cert ได้ ซึ่งแปลว่า**จะทดสอบ HTTPS ก่อน cutover ไม่ได้เลย** (ไก่กับไข่) DNS-01 ขอ cert ล่วงหน้าได้ตั้งแต่ DNS ยังชี้ไป Vercel อยู่ → ทดสอบ HTTPS ให้จบก่อนแล้วค่อยสลับ DNS
4. (แนะนำ) วาง Cloudflare (proxy mode) หน้า VPS อีกชั้น — ได้ CDN + DDoS mitigation คืนมาบางส่วน (Vercel เดิมให้ฟรีโดยไม่ต้องทำอะไร ตอนย้ายออกมาจะเสียของตรงนี้ไป ถ้าไม่เพิ่มเอง)

---

## 8. การแพคโปรเจคด้วย Docker — กับดัก 5 ข้อเฉพาะโปรเจคนี้

**สรุป: แพคขึ้น Hostinger ด้วย Docker ได้ และเป็นวิธีที่แนะนำ** เหตุผลหลักคือ `package.json` ไม่ได้ pin `engines` ไว้เลย Docker จึงเป็นวิธีเดียวที่ล็อค Node version ให้ตรงกันระหว่างเครื่อง dev กับ VPS ได้จริง

**รูปแบบที่ถูกต้อง**: `docker-compose.yml` ไฟล์เดียวบน VPS มี 5 service — `app` (Next.js), `db` (postgres), `rest` (PostgREST), `realtime`, `caddy`
**ไม่ใช่** image ก้อนเดียวที่ยัดทุกอย่างรวมกัน เพราะฐานข้อมูลต้องแยก volume ออกมาต่างหาก (ดูข้อ 5)

Hostinger VPS มี template ที่ลง Docker + Docker Compose มาให้ตั้งแต่ตอน provision เครื่อง เลือกได้เลยไม่ต้องลงเอง

---

### กับดัก 1 — `NEXT_PUBLIC_*` ถูกฝังตอน build ไม่ใช่ตอนรัน ⚠️ สำคัญสุด

โปรเจคนี้ใช้ตัวแปร `NEXT_PUBLIC_*` อยู่ **4 ตัว** (เช็คจากโค้ดจริงแล้ว):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
```

ทั้งสี่ตัวถูกคอมไพล์ฝังลงไปใน JavaScript ที่ส่งให้เบราว์เซอร์ตั้งแต่ตอน `next build`

**ผลที่ตามมา**: ถ้าส่งค่าพวกนี้ตอน `docker run -e` หรือใน `environment:` ของ compose แบบปกติ **จะไม่มีผลใดๆ กับฝั่ง client เลย** — เบราว์เซอร์จะได้ค่าที่ถูกฝังไว้ตอน build เท่านั้น (ซึ่งถ้าตอน build ไม่ได้ส่งค่าไป จะกลายเป็น `undefined` และแอปพังแบบงงๆ)

**วิธีทำที่ถูก**: ประกาศเป็น `ARG` ใน Dockerfile แล้วส่งด้วย `--build-arg` / `build.args` ใน compose
**และต้องยอมรับว่า**: ทุกครั้งที่เปลี่ยน URL ของ backend ต้อง **build image ใหม่** ไม่ใช่แค่ restart container

> เกี่ยวโยงกับ Exit criterion ของ Phase 1 (§5) โดยตรง — ถ้า path-based URL ใช้ไม่ได้ ต้อง build ใหม่ทั้ง image

### กับดัก 2 — ยังไม่มี `.dockerignore` และ build context จะบวม 500MB

ตอนนี้ในโฟลเดอร์โปรเจคมี `.next` = **383MB** และ `.git` = **119MB**
`docker build` จะลากทุกอย่างในโฟลเดอร์เข้า build context ถ้าไม่มี `.dockerignore` → build ช้ามากโดยไม่จำเป็น และเสี่ยง copy ของที่ไม่ควรเข้า image

**ต้องสร้าง `.dockerignore`** อย่างน้อยให้ครอบคลุม: `.next`, `.git`, `node_modules`, `.env*`, `*.md`

> `.env.local` สำคัญเป็นพิเศษ — ต้องไม่หลุดเข้า image เด็ดขาด

### กับดัก 3 — `output: 'standalone'` ยังไม่ได้ตั้ง

`next.config.mjs` ตอนนี้ยังไม่มี `output: 'standalone'` (เช็คแล้ว = 0 ครั้ง)
ถ้าไม่ตั้ง image จะต้องแบก `node_modules` ทั้งก้อนติดไปด้วย
ตั้งแล้ว Next.js จะ bundle เฉพาะไฟล์ที่ใช้จริงออกมาให้ ลดขนาด image ได้หลายเท่า — **ตั้งก่อนเขียน Dockerfile ไม่ใช่หลัง**

### กับดัก 4 — ต้องลง `sharp` เพิ่มเอง

โปรเจคใช้ `next/image` อยู่ 2 จุด: `app/login/page.tsx:5` และ `components/layout/Header.tsx:4`
ตอนอยู่บน Vercel เขาจัดการ image optimization ให้ฟรี แต่พอ self-host ใน Docker base image แบบ slim จะไม่มี `sharp` ติดมา และตอนนี้ `sharp` **ไม่ได้อยู่ใน `package.json`** ด้วย → รูปจะพังตอน production

### กับดัก 5 — `SESSION_JWT_SECRET` มี `throw` ที่ระดับ module

`lib/session.ts:8` โยน error ทันทีที่โมดูลถูก import ถ้าไม่มีค่านี้:

```ts
if (!NEW_SECRET) {
  throw new Error('SESSION_JWT_SECRET is required. ...');
}
```

**แนะนำให้ส่งค่า dummy เข้าไปตอน build ด้วย** (แล้วใส่ค่าจริงตอนรัน) เพราะถ้าจังหวะ `next build` ดันไปแตะโมดูลนี้เข้า build จะล้มพร้อม error ที่ debug ยาก — เป็นประกันที่ไม่มีต้นทุนอะไรเลย

### ⚠️ ข้อควรระวังที่สำคัญที่สุด — Postgres volume

**ห้ามเก็บ data directory ของ Postgres ไว้ใน container layer เด็ดขาด** ต้องผูกกับ named volume หรือ bind mount เสมอ
ไม่งั้น `docker compose down` ครั้งเดียว **ข้อมูลเวรทั้งหมดหาย** — และตามที่เขียนไว้ใน §11 ตอนนี้ไม่มี backup อัตโนมัติของ Supabase คอยรับแล้ว

### หมายเหตุ — การตัด container ไม่ได้ฟรี

ใน `docker-compose.yml` ของ official `supabase/docker` นั้น `analytics`/`vector` ถูกอ้างอยู่ใน `depends_on` ของ service อื่นด้วย
การตัดออกตาม §2 จึงต้องไล่แก้ block `depends_on` เหล่านั้นด้วย — **ต้องยืนยันว่า stack ที่ตัดแล้ว boot ขึ้นจริง** ก่อนจะนับว่าประหยัด RAM ได้

---

## 9. Phase 5 — Cron: ย้ายจาก GitHub Actions → VPS crontab

ตอนนี้แอปกับ cron อยู่เครื่องเดียวกัน เรียก localhost ได้เลย ไม่ต้องผ่านอินเทอร์เน็ต:

```cron
# /etc/cron.d/pharmshift
0 23 * * * root curl -s -X GET "http://localhost:3000/api/cron/shift-reminders?run=morning" -H "Authorization: Bearer $CRON_SECRET"
0 9  * * * root curl -s -X GET "http://localhost:3000/api/cron/shift-reminders?run=evening" -H "Authorization: Bearer $CRON_SECRET"
0 21 * * * root curl -s -X GET "http://localhost:3000/api/cron/cleanup" -H "Authorization: Bearer $CRON_SECRET"
```

(เวลาข้างบนคือ UTC เหมือนตอนตั้งใน GitHub Actions เดิม — ปรับ timezone ของ VPS หรือแปลงเป็น Bangkok time ในไฟล์ crontab แล้วแต่สะดวก, โค้ด `shift-reminders` เองยังคำนวณ Bangkok time ภายในอยู่แล้วไม่ต้องแก้)

- ลบ/ปิด schedule ใน `.github/workflows/cron.yml` (หรือลบไฟล์ทั้งไฟล์ถ้าไม่ใช้ `workflow_dispatch` manual trigger แล้ว — แต่เก็บไว้เป็น manual trigger สำรองก็ได้ ไม่มีผลเสีย)
- `CRON_SECRET` auth ที่ route เช็คอยู่แล้ว (R11 ที่แก้ไปแล้ว) **ยังใช้ต่อได้เลย ไม่ต้องแก้โค้ด** — เป็นการป้องกันชั้นที่สองแม้เรียกจาก localhost

---

## 10. Phase 6 — CI/CD (deploy pipeline แทน Vercel auto-deploy)

Vercel เดิม deploy อัตโนมัติทุก push โดยไม่ต้องตั้งอะไร — ของนี้หายไปตอนย้ายออก ต้องทำเอง:

- ตัวเลือกง่ายสุด: GitHub Actions workflow ใหม่ (`.github/workflows/deploy.yml`) ที่ SSH เข้า VPS แล้ว `git pull && docker compose build app && docker compose up -d app` ทุกครั้งที่ push เข้า `main`
  - **ต้องส่ง `NEXT_PUBLIC_*` ทั้ง 4 ตัวเข้าไปในขั้น build ด้วย** (เก็บเป็น GitHub secret) ไม่งั้น client bundle จะได้ค่า `undefined` — ดู §8 กับดักข้อ 1
- นี่ยังใช้ GitHub Actions อยู่ — **ไม่ขัดกับสิ่งที่ผู้ใช้ขอ** เพราะที่ขอคือเลิกใช้ GitHub Actions สำหรับ **cron schedule** เท่านั้น ไม่ใช่เลิกใช้ GitHub Actions ทั้งหมด
- ทางเลือกอื่นถ้าไม่อยากพึ่ง GitHub Actions เลย: deploy hook แบบ webhook (push ไป endpoint บน VPS ให้ pull เอง) หรือ manual `git pull` ทุกครั้ง (ไม่แนะนำสำหรับใช้งานจริงต่อเนื่อง)

---

## 11. Phase 7 — DNS Cutover

> **🚨 แก้จากแผนเดิม (blocker ที่ 1)** — ขั้นตอนเดิมข้อ 4 เขียนว่า *"Data migration รอบสุดท้าย (delta เล็กๆ)"* ซึ่ง **เขียนเป็นโค้ดจริงไม่ได้**
>
> การคำนวณ delta ต้องมีคอลัมน์บอกเวลาที่แถวถูกแก้ล่าสุด แต่ในสคีมานี้ **มีแค่ `compensation_rates` ตารางเดียว** ที่มี `updated_at`
> (`supabase/migrations/20260530_create_compensation_rates.sql:9`) ส่วนตารางที่มีการเปลี่ยนแปลงจริง — `shifts`, `swap_requests`, `users`, `notifications` — มีอย่างมากก็แค่ `created_at`
>
> delta ที่อิง `created_at` จะจับได้เฉพาะ **INSERT** และ **พลาด UPDATE กับ DELETE ทั้งหมด** ซึ่งคือ traffic หลักของแอปสลับเวรพอดี
> → ถ้าไปรู้ตอนอยู่ใน maintenance window จะไม่มีทางออกอื่นนอกจาก re-dump ใหม่ทั้งก้อนโดยที่ผู้ใช้ถูกล็อกไว้อยู่
>
> **วิธีที่ถูกต้อง: freeze การเขียน → dump ทั้งก้อนรอบเดียว → cutover** (ไม่มี delta) ข้อมูลชุดนี้เล็กมาก dump รอบเดียวใช้เวลาไม่กี่นาที — และ Phase 2 ได้ซ้อมจับเวลาไว้แล้วว่ากี่นาที

1. ลด TTL ของ DNS record ปัจจุบัน (ที่ชี้ไป Vercel) ล่วงหน้า 24–48 ชม. ก่อน cutover
2. Deploy ครบ + verify ผ่าน HTTPS ให้จบก่อน (ทำได้เพราะขอ cert ล่วงหน้าด้วย DNS-01 ตาม §7) — ทดสอบด้วย host entry ในเครื่องทดสอบ
3. **ประกาศ maintenance window** ตามเวลาที่วัดได้จากการซ้อมใน Phase 2 + เผื่อ buffer เท่าตัว แจ้ง staff ล่วงหน้า เลือกช่วงดึกที่คนใช้น้อย
4. **Freeze การเขียนที่ Supabase เดิม** (ปิดแอปเดิม / ตั้ง DB เป็น read-only)
5. **Dump + restore ทั้งก้อนรอบเดียว** ด้วยสคริปต์ชุดเดียวกับที่ซ้อมไว้ใน Phase 2 (`--data-only --disable-triggers`) — ไม่มีขั้น delta
6. เทียบ row count ทุกตารางอีกครั้งเป็น gate สุดท้ายก่อนสลับ DNS
7. เปลี่ยน DNS record → ชี้ไป VPS IP
8. Monitor: login ได้, ปฏิทินโหลดได้, realtime แจ้งเตือนทำงาน, push notification ส่งได้, Excel export/import ทำงาน, cron รันตรงเวลา

### Rollback — ราคาจริงไม่ใช่ "แค่เปลี่ยน DNS กลับ"

เก็บ Vercel project + Supabase project เดิมไว้ **แบบ paused ไม่ลบ** อย่างน้อย 14 วัน — แต่ต้องเข้าใจให้ตรงกันว่า rollback ราคาเท่าไหร่จริงๆ:

- **ก่อนเปิดให้ผู้ใช้เข้า**: rollback = เปลี่ยน DNS กลับ ราคาถูกจริง
- **หลังผู้ใช้เริ่มเขียนข้อมูลแล้ว**: การเปลี่ยน DNS กลับ **จะทิ้งทุก record ที่เขียนบน VPS ไป** และผู้ใช้จะเจอข้อมูลเก่าที่ Supabase ค้างอยู่ ณ จุด freeze
  → rollback จริงต้อง **dump ย้อนกลับจาก VPS เข้า Supabase** ซึ่งไม่ใช่งานที่ทำได้ในไม่กี่นาที

**แปลว่า**: rollback ถูกจริงแค่ประมาณ 1 ชั่วโมงแรกเท่านั้น ให้ใช้ข้อเท็จจริงนี้เป็นตัวกำหนดว่าต้อง verify หนักแค่ไหน**ก่อน**เปิดให้ staff เข้าใช้

---

## 12. Phase 8 — หลัง cutover (ops ที่ต้องทำเองแล้ว)

สิ่งที่ Vercel + Supabase managed เคยทำให้ฟรี แต่ตอนนี้ต้องทำเอง:

| เดิม (managed) | ตอนนี้ต้องทำเอง |
| --- | --- |
| Auto backup + point-in-time recovery (Supabase) | ตั้ง `pg_dump` cron รายวัน + ส่งไฟล์ backup ออกนอกเครื่อง (เช่น Hostinger object storage / S3 / rclone ไปที่อื่น) — **ห้ามเก็บ backup บนเครื่องเดียวกับ DB เท่านั้น** |
| Auto TLS renewal (Vercel) | Caddy ต่ออายุ Let's Encrypt อัตโนมัติอยู่แล้ว แต่ต้อง monitor ว่า renew สำเร็จจริง |
| Global CDN/edge caching (Vercel) | ถ้าใช้ Cloudflare proxy ตาม §7 ก็ได้คืนมาบางส่วน |
| Function logs + observability (Vercel dashboard) | ตั้ง log rotation (`journalctl`/Docker logs) + พิจารณา uptime monitor ภายนอก (เช่น UptimeRobot ฟรี) เพื่อรู้ทันทีถ้าเว็บล่ม |
| Preview deployments ต่อ PR (Vercel) | ไม่มีอัตโนมัติ — ถ้าต้องการต้องทำ staging environment แยกเอง (อาจไม่จำเป็นสำหรับทีมขนาดนี้) |
| Autoscaling (Vercel serverless) | VPS เป็น fixed capacity — ถ้าโหลดสูงขึ้นต้อง upgrade แผน VPS เอง (ทีม ~50–100 คนไม่น่าเป็นปัญหา) |
| Supabase Studio (ดู/แก้ข้อมูลผ่าน UI) | ถ้าต้องการ UI แบบเดิม ต้องรัน container `studio` เพิ่มเอง (อยู่ใน stack เต็มที่ตัดออกไปใน §2 — เพิ่มกลับได้ถ้าจำเป็น) |

---

## 13. ผลกระทบต่อ AUDIT-REPORT-TH.md และ free-tier limits (CLAUDE.md §19)

ตาราง free-tier limit ทั้งหมดใน CLAUDE.md §19 (Vercel Hobby + Supabase Free) **จะไม่เกี่ยวข้องอีกต่อไป** หลังย้ายเสร็จ — แทนที่ด้วยขีดจำกัดจริงของ VPS (CPU/RAM/disk/bandwidth ตามแผนที่เช่า) ควรอัปเดต CLAUDE.md ตอนย้ายเสร็จจริง (ไม่ทำตอนนี้เพราะยังเป็นแค่แผน)

รายการ risk ใน `AUDIT-REPORT-TH.md` ที่เปลี่ยนสถานะ/ความสำคัญ:
- **R7** (Excel upload ไม่ guard ขนาดไฟล์) — Vercel 4.5MB body limit หายไป (self-host ไม่มี limit นี้) แต่**ความเสี่ยง OOM ยังอยู่เหมือนเดิม** เพราะเป็นเรื่อง `XLSX.read()` ไม่ใช่เรื่อง platform — ต้องคง guard เดิมไว้ หรือเข้มขึ้นเพราะไม่มี Vercel มาช่วยตัดที่ 4.5MB ให้แล้ว
- **R5/R11** (cron เดิม) — แก้เรียบร้อยเมื่อย้ายมาใช้ VPS crontab เดี่ยว (ไม่มี dual-scheduler อีกต่อไป)
- **R1** (legacy JWT fallback) — **ยังไม่ปิด และเลยกำหนดมา 37 วันแล้ว** การย้ายครั้งนี้จะไปเปลี่ยนค่า `NEXT_PUBLIC_SUPABASE_ANON_KEY` ซึ่งเป็นตัวเดียวกับ legacy verification secret พอดี → **ต้องปิด R1 ก่อนย้าย** (ดู P-2 ใน §0.5) และอัปเดตตารางสถานะใน `AUDIT-REPORT-TH.md` + CLAUDE.md §18/§20 เมื่อทำเสร็จ
- Egress/DB size limit ของ Supabase Free (R8 บริบท) — ไม่มีเพดานแข็งอีกต่อไป แต่ต้อง monitor การใช้ disk ของ VPS เองแทน

---

## 14. สเปค VPS ที่แนะนำ

อ้างอิงสเปคปัจจุบันของ Hostinger (ก.ค. 2026): **KVM 2** = 2 vCPU, 8GB RAM, 100GB NVMe, 8TB bandwidth — เพียงพอสำหรับรัน Next.js + Postgres + PostgREST + Realtime + Kong + reverse proxy พร้อมกันบนทีมงาน ~50–100 คน ถ้าตัด container ที่ไม่ใช้ออกตาม §2

Sources:
- [Hostinger VPS Hosting](https://www.hostinger.com/vps-hosting)

ถ้างบไม่จำกัดหรืออยากมี headroom เผื่อโต แนะนำขยับเป็น KVM 4 แทน — แต่ KVM 2 คือขั้นต่ำที่ควรใช้ (KVM 1 เสี่ยง RAM ไม่พอเมื่อรันทุกอย่างพร้อมกัน)

---

## 15. Checklist — Environment variables ที่ต้องเปลี่ยน

คอลัมน์ "ต้องมีตอน build?" สำคัญมากเมื่อใช้ Docker — ตัวที่ขึ้นต้นด้วย `NEXT_PUBLIC_` **ต้องส่งเป็น build arg** ไม่ใช่ runtime env (ดู §8 กับดักข้อ 1)

| ตัวแปร | เปลี่ยนหรือไม่ | ต้องมีตอน build? | หมายเหตุ |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ เปลี่ยน | ✅ **build arg** | ชี้ไป path บนโดเมนเดียวกัน เช่น `https://<domain>/backend` (ยืนยันตาม exit criterion §4 ก่อน) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ เปลี่ยน | ✅ **build arg** | JWT key ใหม่จาก self-hosted stack · ⚠️ ค่านี้ยังถูกใช้เป็น legacy JWT verification secret อยู่ที่ `middleware.ts:11` + `lib/session.ts:6` — **ต้องลบโค้ดนั้นก่อนย้าย (P-2)** |
| `NEXT_PUBLIC_APP_URL` | ✅ เปลี่ยน (ถ้า URL รูปแบบเปลี่ยน) | ✅ **build arg** | ต้องตรงกับโดเมนจริงหลัง cutover |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ❌ คงเดิม | ✅ **build arg** | ไม่เกี่ยวกับ Supabase แต่เป็น `NEXT_PUBLIC_` จึงต้องส่งตอน build ด้วย |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ เปลี่ยน | ❌ runtime | JWT key ใหม่ (role: service_role) |
| `SESSION_JWT_SECRET` | ❌ คงเดิม | ⚠️ ใส่ค่า dummy ตอน build | ไม่เกี่ยวกับ Supabase — เปลี่ยนจะทำ session ผู้ใช้ทั้งหมดหลุด · มี `throw` ที่ module scope ดู §8 กับดักข้อ 5 |
| `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | ❌ คงเดิม | ❌ runtime | ไม่เกี่ยวกับ Supabase |
| `CRON_SECRET` | ❌ คงเดิม (หรือเปลี่ยนก็ได้เพราะ trigger ใหม่หมด) | ❌ runtime | ใช้กับ crontab ใหม่แทน GitHub Actions secret |

---

## 16. คำถามเปิดก่อนเริ่มลงมือจริง

1. ยืนยัน DNS provider ของโดเมนปัจจุบัน — จัดการที่ Vercel เอง หรือที่ registrar อื่นแล้วแค่ CNAME/A ไป Vercel? (มีผลทั้งเรื่องแก้ DNS ที่ไหน และเรื่องขอ cert แบบ DNS-01 ตาม §7)
2. มีสิทธิ์ SSH root เข้า Hostinger VPS หรือยัง / ใครดูแลระบบต่อจากนี้ (สำหรับ security patching ระยะยาว)
3. Backup ต้องการ retention กี่วัน / เก็บที่ไหน (S3-compatible ของ Hostinger เองมีไหม หรือใช้ผู้ให้บริการอื่น)

> ข้อ "รายชื่อตารางใน Realtime publication" ย้ายไปเป็น **P-3 ใน §0.5** แล้ว เพราะเป็น prerequisite ที่ต้องทำก่อน ไม่ใช่แค่คำถามค้าง

---

## 17. ลำดับงานที่ควรทำถัดไป (ถ้ากลับมาทำต่อ session หน้า)

1. **P-1** ทดสอบ `pg_dump` ต่อ Supabase เดิม ← ทำก่อนสุด ถ้าไม่ผ่านแผนต้องเปลี่ยน
2. **P-3** เก็บ publication + replica identity จาก Studio (ก่อนแตะอะไรกับโปรเจกต์เดิม)
3. **P-2** ลบ R1 legacy fallback (แก้โค้ด 3 จุดตาม CLAUDE.md §18)
4. เตรียมโค้ดให้ dockerize ได้: `output: 'standalone'` + เพิ่ม `sharp` + สร้าง `.dockerignore`
5. เช่า VPS + Phase 0
6. Phase 1 + **ผ่าน exit criterion เรื่อง path-based URL ให้ได้ก่อน** ค่อยไปต่อ
