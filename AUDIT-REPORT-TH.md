# รายงานตรวจสอบความเสี่ยง PharmShift บน Vercel Free + Supabase Free

วันที่ตรวจสอบ: 2026-05-23
อัปเดตสถานะล่าสุด: 2026-05-30
ขอบเขต: หาจุดล่ม / risk ทุกสถานการณ์การใช้งาน อ้างอิงข้อจำกัด free tier
อ้างอิงข้อจำกัด:
- **Vercel Hobby**: function timeout 10s (cron 60s), request body 4.5MB, compute 100 GB-hours/เดือน, bandwidth 100 GB/เดือน, build output 1 GB
- **Supabase Free**: DB 500 MB, egress 5 GB/เดือน, Realtime 200 concurrent connections / 2M messages/เดือน, Storage 1 GB

---

## 📋 สถานะการแก้ไข

Legend: ✅ แก้แล้ว · 🟡 แก้แล้วบางส่วน · ⬜ ยังไม่ได้แก้

### P0 (Critical)
| ID | ความเสี่ยง | สถานะ | Commit / Note |
|---|---|---|---|
| R1 | JWT ถูกปลอมได้ผ่าน anon key | 🟡 แก้แล้ว (migration window) | `d85da3e` (2026-05-23) — sign ด้วย `SESSION_JWT_SECRET` แล้ว; ยังยอมรับ legacy key เป็น verify-only fallback **ต้องลบออกหลังวันที่ 2026-06-22** |
| R2 | `/api/push/send` ไม่มี auth + ไม่จำกัดผู้รับ | ✅ แก้แล้ว | `4bab36a` (2026-05-30) — ต้องมี session, จำกัด payload/ผู้รับ, multi-recipient เฉพาะ admin/sub-admin |
| R3 | `/api/push/subscribe` POST + DELETE ไม่มี auth | ✅ แก้แล้ว | `4bab36a` (2026-05-30) — POST/DELETE ต้องมี session และผูกกับ `session.id` |
| R4 | Login ไม่มี rate limit + plain-text password | ✅ แก้แล้ว | `4bab36a` + this commit (2026-05-30) — rate limit ทำงานแล้ว, bcrypt-aware code พร้อมใช้, รัน hash migration แล้ว |

### P1 (High)
| ID | ความเสี่ยง | สถานะ | Commit / Note |
|---|---|---|---|
| R5 | Cron cleanup รัน 2 ครั้ง/วัน + SELECT ไม่มี LIMIT | ✅ แก้แล้ว | this commit (2026-05-30) — ถอด Vercel cron, เพิ่ม RPC bounded chain cleanup, รัน migration RPC แล้ว |
| R6 | Cron ลบ push subscription ที่ยังใช้งาน | ✅ แก้แล้ว | `951aaad` (2026-05-30) — เพิ่ม `last_used_at`, update เมื่อ send สำเร็จ, cleanup กรองบน `last_used_at` |
| R7 | Excel upload ไม่ guard ขนาดไฟล์ | ✅ แก้แล้ว | this commit (2026-05-30) — ตรวจ `file.size > 3MB` และ extension ก่อน `arrayBuffer()`, เพิ่ม `maxDuration=60` |
| R8 | Admin endpoint ดึงข้อมูลเกินจำเป็น | ✅ แก้แล้ว | this commit (2026-05-30) — เพิ่ม MAX_BATCH=500 ใน shifts/batch + shifts/owners, limit userIds ≤300 ใน notifications POST |
| R9 | Web push fan-out ไม่จำกัด concurrency | ✅ แก้แล้ว | `4bab36a` (2026-05-30) — จำกัด concurrency: users=20, subscriptions/user=10 |
| R10 | VAPID config error → ทุก route 500 | ✅ แก้แล้ว | `4bab36a` (2026-05-30) — lazy VAPID setup, config ผิดแล้วปิด push แบบ fail-soft |
| R11 | Cron secret loophole + Vercel-cron ไม่ส่ง Bearer | ✅ แก้แล้ว | working tree (2026-05-30) — cron routes fail-closed เมื่อไม่มี `CRON_SECRET`, ใช้ GitHub Actions เป็น runner เดียว |
| R12 | Realtime channel ไม่ filter server-side | ✅ แก้แล้ว | `95ab492` (2026-05-30) — แยก `.on()` 2 ครั้งด้วย server-side filter per userId |

### P2 (Medium/Low)
| ID | ความเสี่ยง | สถานะ | Commit / Note |
|---|---|---|---|
| R13 | Reset-password คืน password ใน JSON | ✅ แก้แล้ว | `4bab36a` (2026-05-30) — API ไม่คืน `defaultPassword`, UI ไม่อ่าน/โชว์ค่า password |
| R14 | Change-password ไม่ตรวจ old password | ✅ แก้แล้ว | `4bab36a` (2026-05-30) — API และ UI ต้องส่ง/ตรวจรหัสผ่านปัจจุบัน |
| R15 | sameSite=lax + ไม่มี CSRF token | 🟡 แก้แล้วบางส่วน | `4bab36a` (2026-05-30) — session cookie เป็น `sameSite=strict`; ยังไม่มี CSRF token เฉพาะ route |
| R16 | ไม่มี security header (CSP/HSTS/X-Frame) | 🟡 แก้แล้วบางส่วน | `4bab36a` (2026-05-30) — เพิ่ม HSTS/X-Frame/Content-Type/Referrer/Permissions; ยังไม่ได้เพิ่ม CSP เต็มรูปแบบ |
| R17 | Bangkok timezone math เปราะ | ✅ แก้แล้ว | `ceb2c9f` (2026-05-30) — fail-closed: return 400 ถ้า `run=` หาย, ลบ Bangkok-hour heuristic |
| R18 | `holidays.json` อ่านจาก local filesystem | ✅ แก้แล้ว | `ceb2c9f` (2026-05-30) — route อ่าน JSON จาก body แทน filesystem; UI เปลี่ยนเป็น file picker |
| R19 | `select('*')` ดึง password มาด้วย | ✅ แก้แล้ว | `4bab36a` + this commit (2026-05-30) — auth routes เลิกคืน password แล้ว และรัน hash migration ล้าง plain text ใน DB แล้ว |

### งานติดตาม (TODO)
- [ ] **2026-06-22**: ลบ `LEGACY_SECRET` / `legacyKey` / try/catch ชั้น fallback ออกจาก `lib/session.ts` และ `middleware.ts` (ปิด R1 ให้เด็ดขาด)
- [x] รัน Supabase migration `20260530_hash_existing_user_passwords.sql` แล้ว เพื่อล้าง plain-text password เดิมใน `users.password`
- [x] หลัง deploy commit `4bab36a`: รัน Supabase migration `20260530_create_login_attempts.sql` แล้ว เพื่อให้ rate limit ทำงานจริง

---

## 1) สรุปความเสี่ยงเรียงตามความรุนแรง × โอกาสเกิด

### 🔴 P0 — ห้ามขึ้น production ก่อนแก้

#### R1. JWT ถูกปลอมได้ — auth ทั้งระบบพังหมด  🟡 แก้แล้ว (migration window)
- **ไฟล์**: `lib/session.ts:5`, `middleware.ts:10-12`
- **อาการ**: ใช้ `NEXT_PUBLIC_SUPABASE_ANON_KEY` มาเป็นความลับ sign JWT ตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` **ถูก bundle ส่งไปทุก browser** ใครก็ตามที่เปิด DevTools อ่าน key ออกได้ แล้วสร้าง JWT HS256 ที่มี payload `{ id, pha_id, role: "admin", is_sub_admin: true }` ใส่ลงใน cookie `pharmshift_session` → bypass auth ทุก route ได้ทันที
- **ซ้ำร้าย**: มี hardcoded fallback `'pharmshift-fallback-secret'` ใน source code หาก env ไม่ถูก set ก็ใช้ค่านี้
- **Symptom ใน log**: ไม่มี — เงียบสนิทจนกว่าจะเห็น write แปลก ๆ ใน `shift_logs` / `audit_logs`

**✅ การแก้ไข (commit `d85da3e`, 2026-05-23)**
- เพิ่ม env `SESSION_JWT_SECRET` (server-only, generate ด้วย `openssl rand -base64 64`) ตั้งบน Vercel ทั้ง 3 environments แล้ว
- `lib/session.ts` และ `middleware.ts` **sign ด้วย key ใหม่อย่างเดียว** — JWT ที่ออกใหม่ปลอมไม่ได้แล้ว
- ลบ hardcoded fallback `'pharmshift-fallback-secret'` ออก — env ไม่ถูก set จะ throw ทันทีตอน boot (fail-fast)
- **ยังเหลือ window**: ยังยอมรับ legacy anon key เป็น verify-only fallback เพื่อไม่ force logout user ทุกคน — middleware re-sign cookie ใหม่ silently เมื่อเจอ session เก่า
- **ความเสี่ยงที่เหลือระหว่าง window**: attacker ที่มี anon key ยังปลอม JWT ได้จนกว่าจะลบ legacy fallback (กำหนด 2026-06-22, +30 วัน)
- **ขั้นตอนปิดความเสี่ยงสมบูรณ์** (ทำหลัง 2026-06-22):
  1. ลบ `LEGACY_SECRET`, `legacyKey`, และ try/catch ชั้นใน `decrypt()` ใน `lib/session.ts`
  2. ลบ `LEGACY_SECRET`, `legacySecret`, และ legacy branch ใน `verifySession()` ใน `middleware.ts`
  3. เปลี่ยน destructure กลับเป็น `const payload = await verifySession(token)` และตัด `usedLegacy ||` ใน refresh condition

#### R2. `/api/push/send` ไม่มี auth + ไม่จำกัดจำนวนผู้รับ
- **ไฟล์**: `app/api/push/send/route.ts:6-37`
- **อาการ**: ไม่เช็ค session ไม่จำกัด `userIds.length` ใครก็ POST `{ userIds: [...พันคน...], title, body, url }` ได้ → server fan-out web push ไปทุก device, เผา Vercel compute, เผา Supabase egress, ทำลายชื่อเสียง VAPID (browser จะเริ่ม reject)
- **Symptom**: vercel function execution-time พุ่ง, `failed` count สูง, ผู้ใช้บ่นว่าได้ noti spam/phishing

**✅ การแก้ไข (commit `4bab36a`, 2026-05-30)**
- เพิ่ม `getSession()` guard ใน `/api/push/send`
- จำกัด title/body length และจำกัด multi-recipient สูงสุด 200 คน
- `userIds` แบบหลายผู้รับอนุญาตเฉพาะ admin/sub-admin; single `userId` ยังอนุญาตสำหรับ flow swap/request เดิมที่ผู้ใช้ทั่วไปเรียก
- route server-side `swap/accept` เปลี่ยนไปเรียก `sendPushToUser(s)` โดยตรง ไม่ยิงกลับเข้า `/api/push/send`

#### R3. `/api/push/subscribe` POST + DELETE ไม่มี auth
- **ไฟล์**: `app/api/push/subscribe/route.ts:14-53` และ `:56-75`
- **อาการ**:
  - POST รับ `userId` ใด ๆ ก็ได้ (ไม่เช็คว่าตรงกับ `getSession().id`) → attacker register device ตัวเองเป็นของคนอื่น แล้ว **รับ noti เวรของคนนั้น**
  - DELETE รับ endpoint ใด ๆ โดยไม่ต้อง auth → ลบ push subscription ของคนอื่นได้ทั้งฐาน
  - mobile UA-check (`isMobileUserAgent`) **ปลอม header ได้ง่าย** — ไม่ใช่ security boundary
- **Symptom**: หลังถูกโจมตี ผู้ใช้ทั้งระบบไม่ได้ noti, ตาราง `push_subscriptions` ว่างเปล่า

**✅ การแก้ไข (commit `4bab36a`, 2026-05-30)**
- POST ต้องมี session และ `session.id === userId`
- DELETE ต้องมี session และลบเฉพาะ row ที่ `endpoint` ตรงกับ `user_id=session.id`
- ยังเก็บ mobile UA-check เป็น UX gate เดิม แต่ไม่ได้ใช้เป็น security boundary แล้ว

#### R4. Login ไม่มี rate limit + เก็บรหัสผ่านแบบ plain text
- **ไฟล์**: `app/api/auth/login/route.ts:8-64`
- **อาการ**: `select('*')` (line 22) แล้วเทียบ string ตรง ๆ `user.password !== password` (line 31) ประกอบกับ default password `'1234'` (`/api/admin/users` line 68, `/api/admin/users/reset-password` line 22) attacker brute-force pha_id ได้หลายร้อย req/วินาที
- **Symptom**: burst 401 ที่ `/api/auth/login` แล้วตามด้วย 200 หนึ่งครั้ง แล้วเรียก route privileged ทันที

**🟡 การแก้ไขบางส่วน (commit `4bab36a`, 2026-05-30)**
- เพิ่ม rate limit login: 5 ครั้ง/pha_id และ 30 ครั้ง/IP ต่อ 15 นาที
- เพิ่ม migration `supabase/migrations/20260530_create_login_attempts.sql` พร้อม index สำหรับ `pha_id` และ `ip`
- เลิก `select('*')` ใน login route; select เฉพาะ column ที่ใช้

**🟡 การแก้ไขเพิ่มเติมใน working tree (2026-05-30)**
- เพิ่ม `lib/password.ts` ใช้ `bcryptjs` สำหรับ hash/verify และยังรองรับ legacy plain text ระหว่าง rollout
- login/change-password/reset-password/create-user/profile update/write password เป็น bcrypt hash แล้ว
- login และ password-confirm flow จะ rehash legacy plain-text password หลัง verify สำเร็จ
- เพิ่ม migration `supabase/migrations/20260530_hash_existing_user_passwords.sql` สำหรับ hash password เดิมใน production
- รัน migration `20260530_hash_existing_user_passwords.sql` บน production แล้ว

---

### 🟠 P1 — พังแน่ภายใต้โหลดจริงของ free tier

#### R5. Cron `cleanup` ทำงานวันละ 2 ครั้ง + SELECT ไม่มี LIMIT
- **ไฟล์**: `app/api/cron/cleanup/route.ts:50-86`, `vercel.json:7-12`, `.github/workflows/cron.yml`
- **อาการ**: Vercel cron schedule `0 3 * * *` (10:00 BKK) **และ** GitHub Actions `0 21 * * *` (04:00 BKK) → cleanup รัน 2 ครั้ง/วัน ที่เวลาต่างกัน นอกจากนั้นใน step 3 มี `SELECT id, shift_id, created_at FROM swap_requests WHERE status='accepted'` **ไม่มี LIMIT** แล้ว loop ใน JS memory พอตารางโตเป็นปี read นี้ระเบิด RAM และ timeout แน่นอน
- **Symptom**: 504 / timeout, partial delete, cleanup ตามไม่ทัน

**🟡 การแก้ไขบางส่วนใน working tree (2026-05-30)**
- ถอด `crons` ออกจาก `vercel.json` ให้เหลือ GitHub Actions เป็น cleanup runner เดียว
- เพิ่ม `maxDuration = 60` ให้ cleanup route และตั้ง `vercel.json` cron function duration เป็น 60 วินาที
- ย้าย chain-hop cleanup จาก JS unbounded select ไปเรียก RPC `cleanup_swap_request_chain_hops(p_limit: 1000)`
- เพิ่ม migration `supabase/migrations/20260530_cleanup_swap_request_chain_hops.sql`
- รัน migration `20260530_cleanup_swap_request_chain_hops.sql` บน production แล้ว

#### R6. Cron ลบ push subscription ที่ยังใช้งานอยู่
- **ไฟล์**: `app/api/cron/cleanup/route.ts:131-138`
- **อาการ**: ลบจาก `push_subscriptions` ที่ `created_at < now()-3 months` แต่ **ไม่มี `last_used_at`** → user ทุกคนที่ subscribe นานเกิน 3 เดือนถูกตัด noti เงียบ ๆ ทุกไตรมาส (ชื่อตัวแปรเขียน `cutoff60d` แต่จริง ๆ คือ 3 เดือน — bug ทั้ง code และ intent)
- **Symptom**: PWA user หยุดได้รับ reminder ทุก ๆ ไตรมาส, ticket "subscribe แล้วแต่ไม่ได้ noti"

**✅ การแก้ไข (commit `951aaad`, 2026-05-30)**
- Migration `20260530_push_subscriptions_last_used_at.sql`: เพิ่ม column `last_used_at timestamptz` + backfill ด้วย `created_at`
- `app/api/push/subscribe/route.ts`: set `last_used_at = now()` ใน upsert
- `lib/pushSender.ts`: collect `sentIds[]` แล้ว bulk-UPDATE `last_used_at = now()` หลัง send สำเร็จ
- `app/api/cron/cleanup/route.ts`: เปลี่ยน filter จาก `created_at` → `last_used_at`, เปลี่ยนชื่อตัวแปร `cutoff60d` → `cutoff3mPush`
- **ต้องรัน migration บน production ก่อน deploy** — cleanup route จะ error ถ้า column ยังไม่มี

#### R7. Excel upload ไม่ guard ขนาดไฟล์ก่อน parse
- **ไฟล์**: `app/api/shifts/upload/route.ts:104-109`
- **อาการ**: `file.arrayBuffer()` → `XLSX.read(buffer)` → `sheet_to_json(... { header: 1 })` แบบ sync ขนาด Vercel reject body >4.5MB อยู่แล้ว แต่ไฟล์ 4MB ที่มี 50 sheet/macro ทำ Lambda OOM ได้ + `xlsx@0.18.x` มี CVE หลายตัว (regex DoS, prototype pollution)
- **Symptom**: 413 ตอนไฟล์ใหญ่, 500 + "JavaScript heap out of memory" ตอนไฟล์แต่งให้ก่อกวน

**✅ การแก้ไขใน working tree (2026-05-30)**
- ตรวจ `file.size > 3MB` และ extension `.xlsx/.xls` ก่อนเรียก `file.arrayBuffer()` — คืน 413/400 ทันที
- เพิ่ม `export const maxDuration = 60` ที่หัวไฟล์ route
- เพิ่ม `app/api/shifts/upload/route` ใน `vercel.json` functions ด้วย `maxDuration: 60`
- หมายเหตุ: การ migrate `xlsx` → `exceljs` เพื่อแก้ CVE เป็น scope แยก (ไม่ทำในรอบนี้)

#### R8. Admin endpoint ดึงข้อมูลเกินจำเป็น
- **ไฟล์**: `/api/admin/users`, `/api/notifications` PUT, `/api/admin/shifts/batch`, `/api/admin/shifts/owners`, `/api/notifications` POST
- **อาการ**: `select('*')` users ทั้งตารางไม่มี pagination, PUT notification mark all as read ไม่มี LIMIT, bulk endpoint รับ array ไม่จำกัด → sub-admin มุ่งร้าย (หรือ script) ขอ response หลาย MB หรือสั่ง UPDATE แบบ unbounded ได้
- **Symptom**: response size พุ่ง, Supabase egress หมด (5 GB/เดือน), หน้า admin ค้าง

#### R9. Web push fan-out parallel ไม่จำกัด → saturate socket/CPU ของ Lambda
- **ไฟล์**: `lib/pushSender.ts:90-108`, `:51`
- **อาการ**: `Promise.allSettled(userIds.map(sendPushToUser))` และข้างใน `sendPushToUser` ก็ `Promise.allSettled(subscriptions.map(...))` อีกชั้น → 50 คน × 2 device = 100 TLS handshake พร้อมกัน หากเกิน 200 user งานจะชนเพดาน 30s ของ cron
- **Symptom**: `failed` count สูง, ECONNRESET / ETIMEDOUT ใน log, ผู้ใช้บางคนไม่ได้ reminder วันที่ใช้งานเยอะ

**✅ การแก้ไข (commit `4bab36a`, 2026-05-30)**
- เพิ่ม `limitedAllSettled()` ใน `lib/pushSender.ts`
- จำกัด fan-out ระดับ user ที่ 20 concurrent และ subscriptions ต่อ user ที่ 10 concurrent

#### R10. `webpush.setVapidDetails` ถูกเรียกตอน import พร้อม `|| ''`
- **ไฟล์**: `lib/pushSender.ts:9-13`
- **อาการ**: หาก `VAPID_PRIVATE_KEY` ตั้งผิดหรือลืม web-push library throw ทันทีตอน import → ทุก route ที่ import pushSender (cron, /api/push/send, /api/swap/accept) คืน 500 พร้อม error คลุมเครือ
- **Symptom**: cron หยุดทำงานทันทีหลัง rotate env บน Vercel, log ขึ้น "Vapid subject must be a url or a 'mailto:' address"

**✅ การแก้ไข (commit `4bab36a`, 2026-05-30)**
- ย้าย VAPID setup เป็น lazy function `ensureVapidConfigured()`
- หาก key หายหรือ config ผิด จะ log และ return `{ sent: 0, failed: 0 }` โดยไม่ทำให้ route import ล่ม

#### R11. Cron secret มี loophole + Vercel-cron ไม่ส่ง Bearer header
- **ไฟล์**: `app/api/cron/cleanup/route.ts:11`
- **อาการ**: `if (cronSecret && authHeader !== ...)` → หาก `CRON_SECRET` ไม่ถูก set หรือเป็น string ว่าง endpoint นี้ **เปิดสาธารณะ** Vercel cron ไม่ส่ง Bearer header โดย default ผลคือ Vercel cron run จะ 401 ทุกวันแต่ไม่มีใครรู้ หรือไม่ก็ใครก็ trigger ลบข้อมูลได้
- **Symptom**: Vercel cron history เป็น 401 ทุกเช้า หรือ endpoint โดน trigger จาก external

**✅ การแก้ไขใน working tree (2026-05-30)**
- `cleanup` route ตรวจ `CRON_SECRET` แบบ fail-closed: env หายคืน 500, bearer ไม่ตรงคืน 401
- `shift-reminders` route ตรวจ `CRON_SECRET` แบบ fail-closed ใน production
- ถอด Vercel Cron ออกจาก `vercel.json` เพื่อไม่ให้มี runner ที่ส่ง Bearer header ไม่ได้
- GitHub Actions ยังเป็น runner เดียวสำหรับ cleanup และ reminders

#### R12. Realtime channel `swaps-${userId}` ไม่กรอง server-side
- **ไฟล์**: `hooks/useShifts.ts` (channel setup)
- **อาการ**: client ทุกคน subscribe ทุก event ของ `swap_requests` แล้วกรอง JS-side → เกิน 75 user online concurrent (× 3 channel = 225 conn) จะชนเพดาน 200 connection ของ Supabase Free + กิน message budget ฟรี ๆ
- **Symptom**: Realtime quota หมด (Supabase dashboard "Realtime messages"), UI update flaky

**✅ การแก้ไข (commit `95ab492`, 2026-05-30)**
- แยก `.on()` 2 ครั้งบน channel เดียวกัน: filter `requester_id=eq.${userId}` และ `target_user_id=eq.${userId}`
- ลบ JS-side `isRelevant` guard ออก (server filter รับประกันความถูกต้องแล้ว)
- Callback สกัดออกเป็น `handleSwapChange` เพื่อไม่ต้องซ้ำ code

---

### 🟡 P2 — คุณภาพ / abuse / observability

#### R13. Reset-password คืน password ใหม่ใน JSON
- `app/api/admin/users/reset-password/route.ts:34` → leak `'1234'` กลับไปใน response, อาจถูก cache ใน HAR / Sentry / browser extension

**✅ การแก้ไข (commit `4bab36a`, 2026-05-30)**
- API คืนเฉพาะ `{ success: true }` ไม่คืน `defaultPassword`
- Admin UI ไม่อ่าน/โชว์ password ใน toast หรือ confirm แล้ว

#### R14. Change-password ไม่ตรวจ old password
- `app/api/auth/change-password/route.ts` ใช้แค่ session ใครยึด session ได้ (XSS, ลืม laptop, ยืมมือถือ) **เปลี่ยน password ทันทีโดยไม่ต้องรู้ของเดิม**

**✅ การแก้ไข (commit `4bab36a`, 2026-05-30)**
- หน้า `/change-password` เพิ่มช่องรหัสผ่านปัจจุบัน
- API ตรวจ `oldPassword` กับ password ปัจจุบันก่อน update
- API เลิก `select('*')` หลัง update และคืนเฉพาะ field session/user ที่จำเป็น

#### R15. `sameSite=lax` + ไม่มี CSRF token
- `lib/session.ts:46` ทุก POST/PUT/PATCH/DELETE route เป็น CSRF target ได้ ผ่าน form-POST จากเว็บอันตราย

**🟡 การแก้ไขบางส่วน (commit `4bab36a`, 2026-05-30)**
- เปลี่ยน session cookie ใน `lib/session.ts` และ `middleware.ts` จาก `sameSite=lax` เป็น `sameSite=strict`
- **ยังเหลือ**: ยังไม่มี per-request CSRF token สำหรับ mutation route

#### R16. ไม่มี security header
- `next.config.mjs` ว่าง → ไม่มี CSP / HSTS / X-Frame-Options / Referrer-Policy → PWA โดน clickjack ได้

**🟡 การแก้ไขบางส่วน (commit `4bab36a`, 2026-05-30)**
- เพิ่ม `headers()` ใน `next.config.mjs`: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **ยังเหลือ**: ยังไม่ได้เพิ่ม CSP แบบ nonce/hash เพราะต้องตรวจ inline/runtime ของ Next และ third-party scripts ให้ครบก่อน

#### R17. Bangkok timezone math ใน `shift-reminders` เปราะ
- `app/api/cron/shift-reminders/route.ts:82-98` หาก `run=` หาย จะ fallback เป็น "Bangkok hour" → retry ของ GitHub Actions หรือ Vercel cron อาจส่ง reminder ซ้ำหรือผิดวัน

**✅ การแก้ไข (commit `ceb2c9f`, 2026-05-30)**
- ลบ Bangkok-hour heuristic fallback ออก
- เพิ่ม fail-closed: `if (runParam !== 'morning' && runParam !== 'evening') return 400`
- ยืนยันแล้วว่า GitHub Actions ทุก schedule ส่ง `?run=morning|evening` ครบ และ test-reminders ส่ง `x-test-run` header

#### R18. `holidays.json` อ่านจาก local filesystem
- ต้อง redeploy ทุกครั้งที่อัปเดตวันหยุด — foot-gun ตอน hospital ประกาศวันหยุดเพิ่มกลางปี

**✅ การแก้ไข (commit `ceb2c9f`, 2026-05-30)**
- Route `POST /api/holidays/import` รับ JSON body แทน `fs.readFile` (ลบ `fs`/`path` import ออก)
- UI `ManageHolidaysModal`: เปลี่ยนปุ่มให้เปิด file picker → อ่านไฟล์ด้วย `File.text()` → ส่ง JSON ใน body
- ชื่อปุ่มเปลี่ยนเป็น "นำเข้าจากไฟล์ JSON"

#### R19. Plain-text password อยู่ใน `users.*` และถูก `select('*')`
- Cache/log/Sentry breadcrumb ใด ๆ ที่บังเอิญ serialize response นี้ = leak password ทุกคน รวมกับ R13 ยิ่งหนัก

**🟡 การแก้ไขบางส่วน (commit `4bab36a`, 2026-05-30)**
- login route เลิกใช้ `select('*')` แล้ว
- change-password route เลิกคืน row เต็มหลัง update แล้ว

**🟡 การแก้ไขเพิ่มเติมใน working tree (2026-05-30)**
- `/api/auth/me` เลิก `select('*')` แล้ว และคืนเฉพาะ field ที่ UI ใช้ โดยไม่รวม `password`
- `User` type เลิก expose `password`
- client flow ที่เคยเทียบ `currentUser.password` ย้ายไปเรียก `/api/auth/verify-password`
- รัน hash migration เพื่อล้าง plain-text password เดิมใน DB แล้ว

---

## 2) Fix ระดับโค้ด (copy-paste ได้)

### Fix R1 — แยก JWT secret ออกจาก anon key
```ts
// lib/session.ts
const secretKey = process.env.SESSION_JWT_SECRET; // server-only
if (!secretKey) throw new Error('SESSION_JWT_SECRET is required');
const key = new TextEncoder().encode(secretKey);
```
แก้ `middleware.ts:10` แบบเดียวกัน ลบ fallback string ออก ใน Vercel → Settings → Environment Variables เพิ่ม `SESSION_JWT_SECRET` (Production + Preview) ค่า = `openssl rand -base64 64`
**หลัง deploy: session ทุกใบที่ออกก่อนหน้าจะใช้ไม่ได้ (intended) เพราะของเก่าปลอมได้**

### Fix R2 / R3 — ใส่ auth ที่ push endpoint
```ts
// app/api/push/send/route.ts (ต้นฟังก์ชัน POST)
const session = await getSession();
if (!session || (session.role !== 'admin' && !session.is_sub_admin)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
if (Array.isArray(userIds) && userIds.length > 200) {
  return NextResponse.json({ error: 'Too many recipients' }, { status: 413 });
}
```

```ts
// /api/push/subscribe POST
const session = await getSession();
if (!session || session.id !== userId) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// /api/push/subscribe DELETE
const session = await getSession();
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
await supabase.from('push_subscriptions')
  .delete().eq('endpoint', endpoint).eq('user_id', session.id);
```
ลบ `isMobileUserAgent` check ออก (ไม่ใช่ security boundary)

### Fix R4 — Rate limit + bcrypt
Migration:
```sql
create table if not exists login_attempts (
  pha_id text not null,
  ip text not null,
  attempted_at timestamptz not null default now()
);
create index on login_attempts (pha_id, attempted_at desc);
create index on login_attempts (ip, attempted_at desc);
```
ใน `/api/auth/login`:
```ts
const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
const [{ count: byUser }, { count: byIp }] = await Promise.all([
  supabase.from('login_attempts').select('*', { head: true, count: 'exact' })
    .eq('pha_id', normalizedPhaId).gt('attempted_at', since),
  supabase.from('login_attempts').select('*', { head: true, count: 'exact' })
    .eq('ip', ip).gt('attempted_at', since),
]);
if ((byUser ?? 0) >= 5 || (byIp ?? 0) >= 30) {
  return NextResponse.json({ error: 'พยายามมากเกินไป กรุณารอ' }, { status: 429 });
}
// หลังเช็ค password ผิด:
await supabase.from('login_attempts').insert({ pha_id: normalizedPhaId, ip });
```
แล้วย้ายไป bcrypt แบบ progressive:
```ts
import bcrypt from 'bcryptjs';
const ok = user.password.startsWith('$2')
  ? await bcrypt.compare(password, user.password)
  : user.password === password; // legacy fallback ระหว่าง migrate
if (!ok) { /* 401 */ }
if (!user.password.startsWith('$2')) {
  await supabase.from('users')
    .update({ password: await bcrypt.hash(password, 12) })
    .eq('id', user.id);
}
```
**เลิก `select('*')`** → ระบุ column ที่ใช้, ไม่ include `password` ใน response

### Fix R5 / R6 — Cron cleanup
1. ใส่ `export const maxDuration = 60;` ที่หัวไฟล์ `app/api/cron/cleanup/route.ts`
2. **เลือก runner เดียว**: ลบ `crons` ออกจาก `vercel.json` หรือลบ cleanup job ออกจาก GitHub Actions (แนะนำเก็บ GH Actions เพราะ secret รวมศูนย์อยู่ที่นั่นแล้ว)
3. ย้ายงาน chain-hop cleanup ลง SQL function แทน loop ใน Lambda:
```sql
create or replace function cleanup_chain_hops() returns int language sql as $$
  with ranked as (
    select id, shift_id,
           row_number() over (partition by shift_id order by created_at asc) rn_asc,
           row_number() over (partition by shift_id order by created_at desc) rn_desc
    from swap_requests where status = 'accepted'
  ),
  to_delete as (select id from ranked where rn_asc > 1 and rn_desc > 1),
  d as (delete from swap_requests where id in (select id from to_delete) returning 1)
  select count(*)::int from d;
$$;
```
ใน route: `const { data } = await supabase.rpc('cleanup_chain_hops');`

4. Fix R6: เพิ่ม column `last_used_at timestamptz` ใน `push_subscriptions`, update เมื่อ send สำเร็จใน `sendPushToUser`, แล้ว gate การลบที่:
```sql
delete from push_subscriptions
where (last_used_at is not null and last_used_at < now() - interval '3 months')
   or (last_used_at is null and created_at < now() - interval '3 months');
```

### Fix R7 — Guard ขนาดไฟล์ Excel
```ts
const MAX = 2 * 1024 * 1024; // 2 MB
if ((file as any).size > MAX) {
  return NextResponse.json({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 2MB)' }, { status: 413 });
}
```
Pin `xlsx` เป็น fork ที่ maintain (เช่น `@e965/xlsx`) หรือใช้ `exceljs` แทน (มีอยู่แล้วในโปรเจกต์) แล้วใส่ `export const maxDuration = 60;`

### Fix R8 — Bound admin bulk operations
```ts
const MAX_BATCH = 500;
if ((deleteIds?.length ?? 0) + (ownerEdits?.length ?? 0) + (adds?.length ?? 0) > MAX_BATCH) {
  return NextResponse.json({ error: 'Batch too large' }, { status: 413 });
}
```
`/api/admin/users` GET → ใส่ `.range(offset, offset+24)` และ `.select('id, pha_id, prefix, f_name, l_name, role, is_sub_admin, is_active, is_readonly, profile_image, salary_number')` (**ห้ามใส่ `password`**)

### Fix R9 — จำกัด concurrency fan-out
```ts
// lib/pushSender.ts
async function pLimitMap<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(...await Promise.allSettled(items.slice(i, i+n).map(fn)));
  }
  return out;
}
export async function sendPushToUsers(userIds, payload) {
  const results = await pLimitMap(userIds, 20, (uid) => sendPushToUser(uid, payload));
  // ...สรุป sent / failed...
}
```

### Fix R10 — Fail fast เมื่อ VAPID config ผิด
```ts
const { VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY: PUB, VAPID_PRIVATE_KEY: PRIV } = process.env;
if (!PUB || !PRIV) {
  console.warn('[push] VAPID keys missing — push disabled');
} else {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:pharmacy@hospital.go.th', PUB, PRIV);
}
export async function sendPushToUser(userId, payload) {
  if (!PUB || !PRIV) return { sent: 0, failed: 0 };
  /* ... */
}
```

### Fix R11 — ตรวจ cron secret ทั้งสองทาง
- ตัด loophole: `if (authHeader !== \`Bearer ${cronSecret}\`) return 401;` (ไม่ใส่ `cronSecret &&`)
- สำหรับ Vercel-cron ใช้ header `x-vercel-cron` (Hobby ตั้ง custom header ไม่ได้):
```ts
const isVercelCron = req.headers.get('x-vercel-cron') === '1';
if (!isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Fix R12 — Filter Realtime ฝั่ง server
```ts
// useShifts.ts swap channel
.on('postgres_changes', { event: '*', schema: 'public', table: 'swap_requests',
    filter: `target_user_id=eq.${userId}` }, ...)
.on('postgres_changes', { event: '*', schema: 'public', table: 'swap_requests',
    filter: `requester_id=eq.${userId}` }, ...)
```

### Fix R13 / R14
- `reset-password`: ห้ามคืน password กลับไป, force `must_change_password=true` แล้วโชว์ UI hint
- `change-password`: รับ `{ oldPassword, newPassword }` แล้วเทียบ old ก่อน update

### Fix R15 / R16 — Security headers
```js
// next.config.mjs
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}
```
เปลี่ยน `sameSite: 'lax'` → `'strict'` ใน `lib/session.ts:46, :68` และ `middleware.ts:81`

---

## 3) Checklist Monitoring / Alerting

| Signal | แหล่ง | Alert เมื่อ |
|---|---|---|
| `vercel.functions.duration` ของ `/api/cron/*` | Vercel dashboard | p95 > 25s (cleanup) / > 20s (shift-reminders) |
| HTTP 5xx rate ของ `/api/auth/login` | Vercel logs | >2% ใน 5 นาที |
| 401 spike ของ `/api/auth/login` | Vercel logs | >50 ครั้งใน 5 นาที จาก IP เดียว = brute force |
| `failed` count จาก push cron response | JSON log + BetterStack | >10% ของที่พยายามส่ง |
| Supabase Realtime "Concurrent connections" | Supabase dashboard | > 150 (75% ของ 200) |
| Supabase "Database egress" | Supabase dashboard | > 3 GB/เดือน (60% ของ 5 GB) |
| Supabase DB size | Supabase dashboard | > 350 MB (70% ของ 500) |
| Vercel bandwidth | Vercel usage | > 70 GB/เดือน |
| Vercel function invocations | Vercel usage | > 75% ของ 100k/วัน |
| Cron status (GH Actions + Vercel cron) | Actions tab + Vercel "Cron Jobs" | non-2xx ใด ๆ |
| `push_subscriptions` row count | SQL รายวัน `SELECT count(*) FROM push_subscriptions` | ลดเกิน 20% โดยไม่ได้ตั้งใจ (สัญญาณ abuse จาก R3) |
| `audit_logs` `action='login'` ต่อ pha_id | SQL รายคืน | > 100/วัน ต่อ 1 pha_id |

Structured logging ที่ควรเพิ่ม:
```ts
console.error(JSON.stringify({
  route, method, code: 500, msg: err.message, stack: err.stack
}));
```
Sentry free tier (5k events/เดือน) เพียงพอ — wrap แต่ละ route ด้วย `withSentry(handler)`

---

## 4) สถานการณ์ Load / Abuse ที่ควรทดสอบ

ใช้ `k6`, `bombardier`, หรือ `hey` รัน

| # | สถานการณ์ | คำสั่งย่อ | เกณฑ์ผ่าน |
|---|---|---|---|
| L1 | Login brute force | `hey -n 5000 -c 50 -m POST -d '{"phaId":"admin","password":"x"}' /api/auth/login` | หลังพลาด ~5 ครั้ง คืน 429, ไม่มี 5xx |
| L2 | Push spam | `hey -n 1000 -c 20 -m POST -d '{"userIds":[...10000 ids...]...}' /api/push/send` | คืน 401 (หลัง fix); ก่อน fix = 500 + spam จริง |
| L3 | Subscribe spoof | POST `/api/push/subscribe` ด้วย userId ของคนอื่น | 401 (หลัง fix) |
| L4 | Excel ใหญ่ | upload .xlsx 4MB / 50 sheet | 413 ก่อน parse, ไม่ OOM |
| L5 | Bulk shift import | upload sheet จริง 31 วัน × 80 user | < 30s, ใส่เป็น transaction เดียว ไม่ insert บางส่วน |
| L6 | Cron concurrency | trigger `/api/cron/shift-reminders` 3 ตัวพร้อมกัน | ไม่มี DB deadlock, idempotent (ไม่ส่ง noti ซ้ำ) |
| L7 | Realtime fanout | เปิด 200 browser tab พร้อมกัน | concurrent conn < 200, messages/วินาที < 100 |
| L8 | Admin bulk | POST `/api/admin/shifts/batch` 5000 deletes | 413; ที่ ≤500 ทำเสร็จใน 30s |
| L9 | Cleanup tail | seed swap_requests 200k row, run cleanup | จบใน 60s ผ่าน RPC, ไม่อ่านเข้า Lambda RAM |
| L10 | Mark-all notif | user มี unread 10k → PUT `/api/notifications` | < 2s, UPDATE bounded |
| L11 | JWT forgery | สร้าง token ด้วย anon key เป็น secret แล้วเรียก `/api/admin/users` | 401 (หลัง fix); ก่อน fix = 200 |
| L12 | CSRF POST | สร้าง form-POST จากเว็บอื่นยิงไปที่ `/api/notifications` | reject (หลัง fix sameSite=strict) |

---

## 5) Checklist Deploy แบบ Free-Tier Safe

### Vercel Project
- [ ] **Env เป็น server-only**: `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SESSION_JWT_SECRET` — **ห้ามมี `NEXT_PUBLIC_` นำหน้า**
- [ ] Rotate `SESSION_JWT_SECRET` ทุกครั้งที่มี team member ออก
- [x] `next.config.mjs` มี `headers()` ที่ใส่ HSTS / X-Frame-Options / Referrer-Policy (commit `4bab36a`; ยังเหลือ CSP)
- [ ] `vercel.json` cron route ตรวจ `x-vercel-cron` header (Hobby ตั้ง custom Bearer header ไม่ได้)
- [ ] ใส่ `export const maxDuration = N` ทุก route ที่ parse Excel / cron (≤60 บน Hobby)
- [ ] เปิด Usage alert บน Vercel: bandwidth, invocations, function execution time
- [ ] ตรวจ build output ว่า `xlsx`/`exceljs` ไม่ได้ถูก bundle เข้า shared chunk

### Supabase Project
- [ ] **เปิด RLS บน `notifications`** ด้วย policy `user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub'` หรือยอม off เฉพาะกรณีทุก access ผ่าน server route ที่ใช้ service-role
- [ ] ตรวจว่า index จาก migration ทั้งหมดอยู่ใน production (รัน `\di` ใน SQL editor)
- [x] เพิ่ม index `login_attempts(pha_id, attempted_at)` และ `(ip, attempted_at)` (Fix R4) — รัน migration `20260530_create_login_attempts.sql` บน production แล้ว
- [x] รัน `20260530_hash_existing_user_passwords.sql` แล้ว (Fix R4/R19)
- [x] รัน `20260530_cleanup_swap_request_chain_hops.sql` แล้ว (Fix R5)
- [ ] เพิ่ม column `last_used_at` ใน `push_subscriptions` (Fix R6)
- [ ] ตั้ง scheduled SQL รายสัปดาห์ `SELECT pg_size_pretty(pg_database_size(current_database()));` alert ที่ 350 MB
- [ ] Realtime publication เปิดเฉพาะ `shifts`, `swap_requests`, `notifications`, `published_months`
- [ ] ปิด Supabase Auth (ไม่ได้ใช้) → ลด attack surface
- [ ] Storage bucket: ไม่ได้ใช้ — ปล่อยว่าง / disable
- [ ] ก่อน deploy รัน `EXPLAIN ANALYZE` กับ hot query ใน `useShifts.ts` ยืนยันว่า hit index

### Cron Discipline
- [x] **เลือก runner เดียวต่อ 1 job** — cleanup/reminders ใช้ GitHub Actions, ถอด Vercel Cron ออกจาก `vercel.json` แล้ว
- [ ] Cron route ทุกตัวคืน JSON `{ ok, durationMs, counts }` เพื่อให้ GH Actions fail ได้
- [ ] Cron route ทุกตัวมี `maxDuration` และ concurrency-bounded fan-out

### Code
- [x] ไม่มี `select('*')` ใน auth route หรือใน shape ที่ส่งกลับ client (มันจะ leak `password`) — login/change-password/auth-me แก้แล้ว
- [ ] ไม่มี `NEXT_PUBLIC_*` ใช้เป็น key สำหรับ sign/verify ที่ไหน
- [ ] Bulk endpoint มี `MAX_BATCH` ชัดเจน และคืน 413 เมื่อเกิน
- [ ] Mutation route ทุกตัวเรียก `getSession()` ผ่าน helper:
```ts
// lib/requireRole.ts
export async function requireRole(roles: UserRole[] = []) {
  const s = await getSession();
  if (!s) throw new Response('Unauthorized', { status: 401 });
  if (roles.length && !roles.includes(s.role)) throw new Response('Forbidden', { status: 403 });
  return s;
}
```

---

## 6) Top 5 ที่ต้องทำวันนี้

1. ✅ **เปลี่ยน JWT secret ออกจาก public anon key** (Fix R1) — 30 นาที, ปลดล็อกทุกอย่าง  →  **เสร็จแล้ว** commit `d85da3e` (2026-05-23) อยู่ใน migration window ถึง 2026-06-22
2. ✅ **ปิด `/api/push/*` ให้มี auth** (R2, R3) — เสร็จแล้ว commit `4bab36a` (2026-05-30)
3. ✅ **เพิ่ม rate limit + bcrypt-aware login** (R4) — เสร็จแล้ว และรัน `20260530_hash_existing_user_passwords.sql` แล้ว
4. ✅ **เลือก runner cron เดียว + ย้าย chain-hop ลง SQL** (R5) — เสร็จแล้ว และรัน `20260530_cleanup_swap_request_chain_hops.sql` แล้ว
5. ✅ **เลิกคืน password ใหม่จาก reset-password** (R13) — เสร็จแล้ว commit `4bab36a` (2026-05-30)

อย่างอื่นค่อย ๆ ทำหลัง 5 ข้อนี้ deploy แล้ว verify เสร็จ
