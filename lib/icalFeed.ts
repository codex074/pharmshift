import { createHmac, timingSafeEqual } from 'crypto';
import {
  SHIFT_CONFIG,
  deptDisplayLabelForRole,
  positionDisplayLabelForRole,
  type ShiftType,
} from '@/lib/types';

/**
 * Personal iCal feed (read-only subscription URL for Google/Apple Calendar).
 *
 * Calendar apps fetch without cookies, so the URL itself is the credential:
 *   token = `${userId}.${HMAC-SHA256(SESSION_JWT_SECRET, 'ical-feed:v1:' + userId)}`
 * Stateless — no DB table. Rotating SESSION_JWT_SECRET revokes every feed URL
 * (and every session) at once.
 */

const TOKEN_LABEL = 'ical-feed:v1:';
const SIG_LENGTH = 32;

function secret(): string {
  const s = process.env.SESSION_JWT_SECRET;
  if (!s) throw new Error('SESSION_JWT_SECRET is not set');
  return s;
}

function sign(userId: string): string {
  return createHmac('sha256', secret()).update(TOKEN_LABEL + userId).digest('base64url').slice(0, SIG_LENGTH);
}

export function createFeedToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Returns the user id when the token is valid, else null. Accepts an optional `.ics` suffix. */
export function verifyFeedToken(token: string): string | null {
  const clean = token.replace(/\.ics$/i, '');
  const dot = clean.lastIndexOf('.');
  if (dot <= 0) return null;
  const userId = clean.slice(0, dot);
  const given = Buffer.from(clean.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

// ─── Shift → clock time ─────────────────────────────

/** Department-specific times from getSlotsForDate(); everything else uses SHIFT_CONFIG. */
function shiftTimeRange(shiftType: ShiftType, dept: string | null): string {
  if (shiftType === 'เช้า' && dept === 'โครงการ') return '09:00-13:00';
  if (shiftType === 'เช้า' && dept === 'Chemo') return '08:30-12:30';
  if (shiftType === 'บ่าย' && (dept === 'โครงการ' || dept === 'SMC')) return '16:30-20:30';
  return SHIFT_CONFIG[shiftType]?.time ?? '08:30-16:30';
}

/**
 * UTC start/end for a shift. `date` is the schedule date (YYYY-MM-DD, Bangkok).
 * ดึก is recorded under the night it begins, so it runs 00:00–08:30 of the NEXT day
 * (see SHIFT_MINUTES in lib/utils.ts).
 */
export function shiftInterval(date: string, shiftType: ShiftType, dept: string | null): { start: Date; end: Date } {
  const [startHm, endHm] = shiftTimeRange(shiftType, dept).split('-');
  const dayOffset = shiftType === 'ดึก' ? 1 : 0;
  const at = (hm: string) => {
    const d = new Date(`${date}T${hm}:00+07:00`);
    d.setUTCDate(d.getUTCDate() + dayOffset);
    return d;
  };
  const start = at(startHm);
  const end = endHm === '23:59' ? new Date(at('00:00').getTime() + 24 * 3600 * 1000) : at(endHm);
  return { start, end };
}

// ─── iCalendar text ─────────────────────────────

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets (UTF-8 safe: never splits a multi-byte char). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface FeedShift {
  id: string;
  date: string;
  shift_type: ShiftType;
  position: string | null;
  department: { name: string } | null;
}

export function buildIcs(shifts: FeedShift[], opts: { role: string; calName: string }): string {
  const now = icsDate(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PharmShift//เวรดี๊ดี//TH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.calName)}`,
    'X-WR-TIMEZONE:Asia/Bangkok',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const s of shifts) {
    const deptRaw = s.department?.name ?? null;
    const dept = deptDisplayLabelForRole(opts.role, deptRaw);
    const pos = positionDisplayLabelForRole(opts.role, deptRaw, s.position);
    const cfg = SHIFT_CONFIG[s.shift_type];
    const { start, end } = shiftInterval(s.date, s.shift_type, deptRaw);
    const where = [dept, pos].filter(Boolean).join(' ');
    const summary = `${cfg?.icon ?? ''} เวร${cfg?.label ?? s.shift_type}${where ? ` · ${where}` : ''}`.trim();
    const when = s.shift_type === 'ดึก'
      ? `คืนวันที่ ${s.date} (00:00-08:30 ของวันถัดไป)`
      : `${s.date} ${shiftTimeRange(s.shift_type, deptRaw)}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@utth-shift`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(`เวรดี๊ดี — ${when}${where ? ` · ${where}` : ''}`)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
