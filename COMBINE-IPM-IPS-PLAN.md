# แผนรวมห้องยา MED + SURG (เวรเช้า) — branch `Combi-IPM+IPS`

> สถานะ: **PLAN ONLY — ยังไม่แตะโค้ด** · ติดอยู่ที่ Phase 0 (รอข้อมูลตำแหน่ง/จำนวนคน/เดือน cutover)
> สร้างไว้เผื่อเปลี่ยน session — เปิดอ่านไฟล์นี้เพื่อ resume งานต่อ

## บริบท / ข้อสรุปที่ผู้ใช้ยืนยันแล้ว

- **เป้าหมาย:** รวมห้องยา MED (อายุรกรรม) + SURG (ศัลยกรรม) เป็น **ห้องเดียว = ห้องยาผู้ป่วยในอายุรกรรม** (ที่มาชื่อ branch IPM&IPS)
- **ขอบเขต:** **เฉพาะเวรเช้า** (ห้องจ่ายยา MED/SURG ตอนเช้า) เท่านั้น
  - เวรอื่นคงเดิมทั้งหมด: บ่าย MED, ER, ดึก, รุ่งอรุณ, SMC, โครงการ, Chemo, ส่งยา สอ.
- **ข้อกำหนดสำคัญ:** เริ่มใช้แบบใหม่ "เดือนหน้า" โดย **เดือนปัจจุบัน/ย้อนหลังต้องไม่กระทบ** (เหมือนเดิมเป๊ะ)

## ภาพรวมหลักการ (ทำไมถึง "ไม่กระทบเดือนปัจจุบัน")

ข่าวดี: **ข้อมูลเก่าปลอดภัยอยู่แล้วโดยอัตโนมัติ** — ทุกแถวใน `shifts` เก็บ `department_id` + `position`
ของตัวเอง เดือนเก่าจึงถือ MED/SURG ติดตัวไปตลอด → render และ export ออกมาเหมือนเดิม

จุดที่ "พัง" ไม่ใช่ข้อมูล แต่คือ **โค้ดที่ hardcode MED/SURG** ซึ่งรันกับ *ทุกเดือน*
(badge, layout ตาราง, import codes, ปุ่มเพิ่มเวรของ admin, validation, sheet ลงนาม, ใบ comp).
โค้ดพวกนี้ปัจจุบันสมมติว่า "เช้ามี 2 ห้องเสมอ"

### กลไกที่แนะนำ: structure config ผูกกับ "วันที่" (effective-dated) แหล่งเดียว

> **อัปเดต:** เปลี่ยนจาก key ด้วยเดือน → **key ด้วยวันที่** เพื่อรองรับ semi-cutover กลางเดือน
> (เริ่มกลางเดือนได้ เช่น 13 ก.ค. 2569 = `2026-07-13`)

- กำหนดค่าคงที่ `IPD_MERGE_FROM = '2026-07-13'` (วันเริ่มใช้แบบใหม่ — ค่าจริงรอยืนยัน)
- สร้างฟังก์ชันเดียว เช่น `getMorningRoomLayout(date)`:
  - คืน "แบบเก่า (MED + SURG แยก)" ถ้า `date < IPD_MERGE_FROM`
  - คืน "แบบรวม (MED ห้องเดียว)" ถ้า `date >= IPD_MERGE_FROM`
- ให้ grid / import / ปุ่มเพิ่มเวร / validation อ่านจาก config นี้ **ที่เดียว** แทนการแก้ ~20 จุดกระจัดกระจาย

**ทำไม semi-cutover ทำได้:** grid วาดทีละวัน (`WeekendGrid({ day })`), `getSlotsForDate(date)` รับวันที่อยู่แล้ว,
และทุกแถว `shifts` มี `date` → แต่ละวันเลือก layout ของตัวเองได้

**ต้นทุนเพิ่มของ semi-cutover (ต้องระวัง):**
- **มุมมองเดือน cutover ผสมกัน** — ก.ค. 2569 วันที่ 1–12 โชว์คอลัมน์ SURG+MED, วันที่ 13+ โชว์ MED รวม
  (ทำได้เพราะ grid ต่อวัน แต่มี visual state เพิ่มต้อง verify)
- **ไฟล์ Excel import ของเดือน cutover** มีทั้งรหัสเก่า (วัน 1–12) และรหัสใหม่ (วัน 13+) ในไฟล์เดียว
  → `mapShiftCode` ต้องรู้ "วันที่" เพื่อ gate โครงสร้าง/validation (ปัจจุบันรับ `dateContext` แล้ว เพิ่มวันที่เข้าไป)
- **Export เดือน cutover** (sign sheet / comp / ตารางเวร) คร่อม 2 โครงสร้างในเดือนเดียว
  → จุดเสี่ยงสุด: ใบลงนาม ก.ค. ต้องโชว์ SURG เฉพาะวัน 1–12 และไม่โชว์วัน 13+ (ต้อง verify ละเอียด)

**Trade-off:** ถ้าไม่ทำ config กลาง จะ gate ทีละจุดด้วย `if (date >= IPD_MERGE_FROM)` ก็ได้ — เร็วกว่าตอนเริ่ม
แต่เสี่ยงลืมจุดใดจุดหนึ่ง + ดูแลยากกว่า → **แนะนำ config กลาง**

---

## Phase 0 — ข้อมูลที่ยังต้องเคาะก่อนเริ่ม (BLOCKER)

แผนสถาปัตยกรรมพร้อม แต่ "รายละเอียด slot" ยังเติมไม่ได้ ต้องการคำตอบ 4 ข้อ:

1. **ตำแหน่งในห้องรวม** มีอะไรบ้าง?
   - ปัจจุบันเช้า: MED = `D/C`, `Cont`, `m1–m4`; SURG = `s`, `s1–s3`
   - รวมแล้วเหลือ position อะไร เช่น `D/C`, `Cont`, `1`, `2`, `3`…? หรือเลขรันอย่างเดียว?
2. **จำนวนคนต่อตำแหน่ง** แต่ละ role (เภสัชกร / จพง. / จนท.) ในห้องรวม กี่ slot
3. **ชื่อ/รหัสห้องรวมในระบบ**
   - แนะนำ **ใช้ dept `MED` เดิมเป็นห้องรวม** (เพราะบ่าย MED ใช้ชื่อนี้อยู่แล้ว และเช้า SURG แค่ "ไม่มี slot" ตั้งแต่ cutover) → churn น้อยสุด
   - ทางเลือก: สร้าง dept ใหม่ `IPD`
4. **เดือนเริ่มใช้ (cutover)** เช่น `2026-07` + ยืนยันว่าเดือนก่อนหน้าต้องเหมือนเดิมเป๊ะ

> ⚠️ **ห้ามเดา** ตัวเลข/ตำแหน่ง — ต้องได้จากผู้ใช้จริงก่อนลงมือ

### ความคืบหน้า Phase 0 (อัปเดต — ยัง tentative "อาจจะ")

**เภสัชกร (pharmacist) — ห้องรวมเวรเช้า:**
| ตำแหน่ง | จำนวน | เดิม |
|---|---|---|
| `D/C` | 2 คน | 1 คน |
| `Cont` | 2 คน | 1 คน |

**✅ ยืนยันแล้ว: เวร `SURG` ตอนเช้า "หายไปทั้งหมดทุก role" — ยุบคนมารวมไว้ที่ห้อง MED**
→ ห้องรวมเวรเช้า = ห้อง `MED` (ใช้ dept เดิม), ไม่มี slot SURG อีกตั้งแต่เดือน cutover

นัยที่ตามมา (เภสัชกร):
- ห้องรวม = `D/C` (2) + `Cont` (2) = 4 คน
- grid เภสัชกรเดิมแสดง: SURG (2 slot) + MED D/C (1) + MED Cont (1) → ใหม่ต้องแสดง D/C (2) + Cont (2)
- รหัส Excel `s` (SURG) ของเภสัชกร เลิกใช้ตั้งแต่ cutover

**จำนวนคนในห้องรวม MED เวรเช้า (อัปเดต):**
| Role | ห้องรวม MED | เดิม |
|---|---|---|
| เภสัชกร | D/C ×2 + Cont ×2 = **4 คน** | D/C 1 + Cont 1 + SURG (s) |
| จพง. (pharmacy_technician) | **4 คน** | m1–m2 + s1–s2 |
| จนท. (officer) | **6–7 คน** | m1–m4 + s1–s3 |

**ยังขาด (ก่อนลงมือ):**
- **รหัส/ชื่อ position** ของ จพง. 4 คน — จะใช้ `m1–m4` ไหม? (รหัส Excel + label badge)
- **รหัส/ชื่อ position** ของ จนท. 6–7 คน — `m1–m6`? `m1–m7`? และ **"6–7" แปรผันรายวันหรือคงที่** (ถ้าแปรผัน slot สุดท้ายเป็น optional)
- ยืนยันวัน cutover (ผู้ใช้เสนอ **13 ก.ค. 2569 = `2026-07-13`** — semi-cutover กลางเดือน)

---

## Phase 1 — แผนแก้ไข แบ่งตาม "รันทุกเดือน" vs "เฉพาะเดือนใหม่"

### กลุ่ม A — โค้ดที่รันกับ *ทุกเดือน* → ต้องรองรับทั้งแบบเก่า (แยก) และแบบรวม

อ่าน layout จาก config ตามเดือนของข้อมูลที่กำลัง render/export:

| จุด | ไฟล์ | สิ่งที่ทำ |
|---|---|---|
| Layout ตารางเภสัชกร (เช้า มี column SURG/MED) | `components/calendar/CalendarGrid.tsx` (~457–509) | เดือนเก่าแสดง 2 column เหมือนเดิม / เดือนใหม่แสดงห้องรวม |
| Layout ตาราง จพง. | `components/calendar/PharmacyTechCalendarGrid.tsx` | เช่นเดียวกัน |
| Layout ตาราง จนท. | `components/calendar/OfficeCalendarGrid.tsx` | เช่นเดียวกัน |
| ตารางส่วนตัว "เวรของฉัน" | `components/calendar/MyCalendarGrid.tsx`, `lib/myScheduleExport.ts` | badge เช้าของห้องรวม |
| Badge label (map `MED/SURG → label`) | จุด render badge ในตาราง | เพิ่ม label ห้องรวม |
| Sheet ลงนาม (hardcode m1/m2/m3, s1–s3) | `lib/signSheetExport.ts` | **เสี่ยงพังเงียบ** — เช็คว่าอ่าน position จากแถวจริงหรือ list ตายตัว |
| ใบ comp | `lib/excelExport.ts` | เดือนเก่าต้องยังออก MED/SURG ถูก |
| Export ตารางเวร | `lib/scheduleTableExport.ts` | สี/หัวคอลัมน์ตามเดือน |
| Validation slot เช้า | `lib/shiftSlotRules.ts` | กฎ slot ห้องรวม |
| SwapModal / NotificationsPanel | `components/swap/SwapModal.tsx`, `components/swap/NotificationsPanel.tsx` | badge/label ห้องรวม |

### กลุ่ม B — เฉพาะ *เดือนใหม่* → gate ด้วย cutover เท่านั้น

| จุด | ไฟล์ | สิ่งที่ทำ |
|---|---|---|
| รหัส import Excel เช้า (`d`,`c`,`s`,`m1–m4`,`s1–s3`) | `app/api/shifts/upload/route.ts` `mapShiftCode` | เพิ่มชุดรหัสห้องรวมเมื่อ `monthYear >= cutover` |
| Template Excel ที่ admin กรอก | `public/sample_shifts.xlsx` + `components/calendar/ShiftUploadModal.tsx` | อธิบายรหัสใหม่ |
| ปุ่ม "+ เพิ่มเวร" / modal เลือก slot | `components/calendar/AdminAddShiftModal.tsx`, `components/calendar/MobileEditDayModal.tsx` | เดือนใหม่ให้เลือก slot ห้องรวม |
| ค่า slot ที่คาดหวัง | `lib/types.ts` `getSlotsForDate` | เพิ่มสาขาห้องรวมตามเดือน |
| คู่มือ | `components/HelpGuideModal.tsx`, `public/guide.pdf` | อัปเดตคำอธิบาย (PDF ทำทีหลังได้) |

---

## Phase 2 — ตรวจสอบความปลอดภัย (สำคัญที่สุด)

1. **เดือนปัจจุบัน/ย้อนหลังต้องไม่เปลี่ยน** — เปิดเดือนนี้ดู layout, badge, swap ต้องเหมือนเดิมเป๊ะ
2. **Export ย้อนหลัง** — สร้าง sign sheet + ใบ comp + ตารางเวร ของเดือนเก่า เทียบกับก่อนแก้
   (advisor เตือนว่าเสี่ยงพังเงียบที่สุด เพราะ export hardcode position)
3. **เดือนใหม่** — import ไฟล์ทดสอบเดือน cutover → ตาราง/badge/validation/swap ของห้องรวมถูกต้อง
4. `npm run lint` + `npm run build` ผ่าน (โปรเจกต์ไม่มี test framework)

---

## ลำดับการทำงานที่แนะนำ

1. **เคาะ Phase 0** (ตำแหน่ง + จำนวน + ชื่อห้อง + เดือน cutover)
2. สร้าง config กลาง + ค่าคงที่ cutover
3. แก้กลุ่ม B (import + add) ให้ใส่ข้อมูลเดือนใหม่ได้ก่อน
4. แก้กลุ่ม A (display + export) ให้ render เดือนใหม่ถูก โดยเดือนเก่าไม่เปลี่ยน
5. Phase 2 verify ครบทุกข้อ

---

## บันทึกอ้างอิงโครงสร้างปัจจุบัน (ตอนวางแผน)

- `lib/types.ts` `getSlotsForDate()` — slot ที่คาดหวังต่อวัน (เช้า holiday: ER1, SURG3, โครงการ1, MED D/C 1, MED Cont 1, Chemo2)
- `app/api/shifts/upload/route.ts` `mapShiftCode()` — รหัส Excel → {dept, type, position} แยกตาม role:
  - เภสัชกร: `d`→MED D/C, `c`→MED Cont, `s`→SURG, `e`→ER เช้า
  - จพง.: `m1–m2`→MED, `s1–s2`→SURG
  - จนท.: `m1–m4`→MED, `s1–s3`→SURG, `ส1–ส4`→ส่งยา สอ.
- `components/calendar/CalendarGrid.tsx` — grid เช้า hardcode 2 column (SURG ซ้าย, MED ขวา; MED แยก D/C บน / Cont ล่าง)
- การ render badge filter จาก `getDeptName(shift)` ของแต่ละแถว → ข้อมูลเดือนเก่าปลอดภัยโดยธรรมชาติ
