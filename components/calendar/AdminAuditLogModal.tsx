'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CalendarClock, ChevronDown, Database, FileText, Loader2, Monitor, RefreshCcw, Search, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

type AuditLog = {
  id: string;
  actor_user_id?: string | null;
  actor_snapshot?: {
    pha_id?: string;
    f_name?: string;
    l_name?: string;
    nickname?: string;
    role?: string;
  } | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
};

type UserLookup = {
  id: string;
  pha_id?: string;
  prefix?: string;
  f_name?: string;
  l_name?: string;
  nickname?: string;
  role?: string;
};

type UserMap = Record<string, UserLookup>;

const ACTION_OPTIONS = [
  { value: 'all', label: 'ทุก action' },
  { value: 'login_success', label: 'Login สำเร็จ' },
  { value: 'login_failed', label: 'Login ไม่สำเร็จ' },
  { value: 'login_blocked', label: 'Login ถูกบล็อก' },
  { value: 'logout', label: 'Logout' },
  { value: 'insert', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
];

const ENTITY_OPTIONS = [
  { value: 'all', label: 'ทุกข้อมูล' },
  { value: 'auth', label: 'Auth' },
  { value: 'users', label: 'Users' },
  { value: 'shifts', label: 'Shifts' },
  { value: 'swap_requests', label: 'Swap requests' },
  { value: 'published_months', label: 'Published months' },
  { value: 'holidays', label: 'Holidays' },
  { value: 'notifications', label: 'Notifications' },
];

const ENTITY_LABELS: Record<string, string> = {
  auth: 'การเข้าใช้งาน',
  users: 'ผู้ใช้',
  shifts: 'เวร',
  swap_requests: 'คำขอแลก/โอนเวร',
  published_months: 'การประกาศตาราง',
  holidays: 'วันหยุด',
  notifications: 'แจ้งเตือน',
  departments: 'หน่วยงาน',
  push_subscriptions: 'อุปกรณ์แจ้งเตือน',
  shift_logs: 'ประวัติแลกเวรเดิม',
};

const ACTION_LABELS: Record<string, string> = {
  insert: 'สร้าง',
  update: 'แก้ไข',
  delete: 'ลบ',
  login_success: 'เข้าสู่ระบบสำเร็จ',
  login_failed: 'เข้าสู่ระบบไม่สำเร็จ',
  login_blocked: 'เข้าสู่ระบบถูกบล็อก',
  logout: 'ออกจากระบบ',
};

const REASON_LABELS: Record<string, string> = {
  user_not_found: 'ไม่พบรหัสผู้ใช้',
  wrong_password: 'รหัสผ่านไม่ถูกต้อง',
  inactive_account: 'บัญชีถูกระงับ',
};

function displayUser(user?: UserLookup | null) {
  if (!user) return '';
  const base = user.nickname || [user.prefix, user.f_name, user.l_name].filter(Boolean).join(' ').trim() || user.pha_id || user.id;
  return user.pha_id ? `${base} (${user.pha_id})` : base;
}

function actorName(log: AuditLog, userMap: UserMap) {
  const actor = log.actor_snapshot;
  if (actor) return actor.nickname || actor.f_name || actor.pha_id || 'ไม่ทราบชื่อ';
  if (log.actor_user_id && userMap[log.actor_user_id]) return displayUser(userMap[log.actor_user_id]);
  if (log.metadata?.pha_id) return `ไม่ทราบผู้ใช้ (${String(log.metadata.pha_id)})`;
  return 'ระบบ';
}

function userName(userId: unknown, userMap: UserMap) {
  if (typeof userId !== 'string') return '-';
  return displayUser(userMap[userId]) || userId.slice(0, 8);
}

function formatDate(value: string) {
  try {
    return format(new Date(value), 'd MMM yyyy HH:mm:ss', { locale: th });
  } catch {
    return value;
  }
}

function formatShift(data?: Record<string, unknown> | null) {
  if (!data) return 'เวร';
  const date = data.date ? String(data.date) : '';
  const shiftType = data.shift_type ? `ผลัด${String(data.shift_type)}` : '';
  const position = data.position ? ` (${String(data.position)})` : '';
  return ['เวร', date, shiftType].filter(Boolean).join(' ') + position;
}

function changedFields(log: AuditLog) {
  const before = log.before_data || {};
  const after = log.after_data || {};
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function describeFieldChange(field: string, before: Record<string, unknown>, after: Record<string, unknown>, userMap: UserMap) {
  if (field === 'user_id') return `เปลี่ยนผู้รับเวรจาก ${userName(before[field], userMap)} เป็น ${userName(after[field], userMap)}`;
  if (field === 'original_user_id') return `บันทึกเจ้าของเวรเดิมเป็น ${userName(after[field], userMap)}`;
  if (field === 'published_by') return `ผู้ประกาศคือ ${userName(after[field], userMap)}`;
  if (field === 'status') return `สถานะ: ${String(before[field] || '-')} → ${String(after[field] || '-')}`;
  if (field === 'requester_read') return `สถานะอ่านผลลัพธ์: ${String(before[field])} → ${String(after[field])}`;
  if (field === 'user_snapshot') return 'บันทึก snapshot ข้อมูลผู้ใช้ ณ วันที่ประกาศ';
  if ((field.includes('user') || field === 'requester_id' || field === 'target_user_id' || field === 'published_by' || field === 'performed_by') && before[field] !== after[field]) {
    return `${field}: ${userName(before[field], userMap)} → ${userName(after[field], userMap)}`;
  }
  return `${field}: ${String(before[field] ?? '-')} → ${String(after[field] ?? '-')}`;
}

function summarizeChange(log: AuditLog, userMap: UserMap) {
  if (log.entity_type === 'auth') {
    const reason = log.metadata?.reason ? `: ${REASON_LABELS[String(log.metadata.reason)] || String(log.metadata.reason)}` : '';
    return `${ACTION_LABELS[log.action] || log.action}${reason}`;
  }

  if (log.entity_type === 'shifts') {
    if (log.action === 'insert') return `เพิ่ม${formatShift(log.after_data)} ให้ ${userName(log.after_data?.user_id, userMap)}`;
    if (log.action === 'delete') return `ลบ${formatShift(log.before_data)} ของ ${userName(log.before_data?.user_id, userMap)}`;
    const primary = changedFields(log).map((field) => describeFieldChange(field, log.before_data || {}, log.after_data || {}, userMap));
    return `${formatShift(log.after_data || log.before_data)}: ${primary.slice(0, 2).join(', ') || 'แก้ไขข้อมูลเวร'}`;
  }

  if (log.entity_type === 'swap_requests') {
    const data = log.after_data || log.before_data || {};
    const type = data.request_type === 'cover' ? 'อยู่เวรแทน' : data.request_type === 'transfer' ? 'โอนเวร' : 'แลกเวร';
    if (log.action === 'insert') {
      return `สร้างคำขอ${type} จาก ${userName(data.requester_id, userMap)} ถึง ${userName(data.target_user_id, userMap)}`;
    }
    if (log.action === 'update') {
      const status = log.after_data?.status ? `เป็น ${String(log.after_data.status)}` : '';
      return `อัปเดตคำขอ${type}${status ? ` ${status}` : ''}`;
    }
    return `${ACTION_LABELS[log.action] || log.action}คำขอ${type}`;
  }

  if (log.entity_type === 'notifications') {
    const data = log.after_data || log.before_data || {};
    const title = data.title ? ` "${String(data.title)}"` : '';
    const recipient = data.user_id ? `ถึง ${userName(data.user_id, userMap)}` : '';
    if (log.action === 'insert') return `สร้างแจ้งเตือน${recipient}${title}`;
    if (log.action === 'update') return `อัปเดตแจ้งเตือน${recipient}`;
    return `ลบแจ้งเตือน${recipient}${title}`;
  }

  if (log.entity_type === 'users') {
    const data = log.after_data || log.before_data || {};
    const person = displayUser(data as UserLookup) || userName(log.entity_id, userMap);
    if (log.action === 'insert') return `เพิ่มผู้ใช้ ${person}`;
    if (log.action === 'delete') return `ลบผู้ใช้ ${person}`;
    const fields = changedFields(log).filter((field) => field !== 'updated_at');
    return `แก้ไขผู้ใช้ ${person}: ${fields.slice(0, 4).join(', ') || 'ข้อมูลผู้ใช้'}`;
  }

  if (log.entity_type === 'published_months') {
    const data = log.after_data || log.before_data || {};
    const month = data.month_year ? `เดือน ${String(data.month_year)}` : '';
    return `${ACTION_LABELS[log.action] || log.action}สถานะประกาศตาราง${month ? ` ${month}` : ''}`;
  }

  if (log.entity_type === 'holidays') {
    const data = log.after_data || log.before_data || {};
    const name = data.name ? ` "${String(data.name)}"` : '';
    const date = data.date ? `วันที่ ${String(data.date)}` : '';
    return `${ACTION_LABELS[log.action] || log.action}วันหยุด${name}${date ? ` ${date}` : ''}`;
  }

  if (log.action === 'insert') return `สร้าง${ENTITY_LABELS[log.entity_type] || log.entity_type}`;
  if (log.action === 'delete') return `ลบ${ENTITY_LABELS[log.entity_type] || log.entity_type}`;
  if (log.action !== 'update') return ACTION_LABELS[log.action] || log.action;

  const changed = changedFields(log);
  if (!changed.length) return 'แก้ไขข้อมูล';
  return `แก้ไข ${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ` +${changed.length - 5}` : ''}`;
}

function buildNarrative(log: AuditLog, userMap: UserMap) {
  const who = actorName(log, userMap);
  const what = summarizeChange(log, userMap);
  const when = formatDate(log.created_at);
  const entityLabel = ENTITY_LABELS[log.entity_type] || log.entity_type;
  const actionLabel = ACTION_LABELS[log.action] || log.action;
  const source = log.ip_address || log.user_agent
    ? [`IP ${log.ip_address || '-'}`, log.user_agent ? 'มีข้อมูลอุปกรณ์' : ''].filter(Boolean).join(' · ')
    : 'ไม่มีข้อมูล IP/อุปกรณ์';

  return {
    who,
    what,
    when,
    entityLabel,
    actionLabel,
    source,
    sentence: `${who} ${what}`,
  };
}

function JsonPreview({ label, data }: { label: string; data?: Record<string, unknown> | null }) {
  const [open, setOpen] = useState(false);
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100"
      >
        <span>{label}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-gray-200 p-3 text-[11px] leading-relaxed text-gray-700 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function AdminAuditLogModal() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [search, setSearch] = useState('');

  async function fetchLogs(reset = false) {
    const cursor = reset ? null : nextCursor;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '50', action, entityType });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลด audit log ได้');

      setLogs((prev) => reset ? data.logs || [] : [...prev, ...(data.logs || [])]);
      setUserMap((prev) => ({ ...prev, ...(data.userMap || {}) }));
      setNextCursor(data.nextCursor || null);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลด audit log ได้');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, entityType]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const narrative = buildNarrative(log, userMap);
      const haystack = [
        narrative.who,
        narrative.what,
        narrative.entityLabel,
        narrative.actionLabel,
        log.action,
        log.entity_type,
        log.entity_id || '',
        log.ip_address || '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, search, userMap]);

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-white">
      <div className="border-b border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Audit Log</h3>
              <p className="text-xs text-gray-500">เฉพาะ admin เท่านั้นที่เรียกดูได้</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchLogs(true)}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCcw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_170px] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อ, action, table, IP..."
              className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            value={entityType}
            onChange={(event) => setEntityType(event.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {ENTITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
            <Database className="w-8 h-8" />
            <p className="text-sm font-medium">ยังไม่พบ audit log</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const narrative = buildNarrative(log, userMap);
            return (
            <div key={log.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-gray-900 px-2.5 py-1 uppercase tracking-wide text-white">
                      {narrative.actionLabel}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700">
                      {narrative.entityLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-bold text-gray-950 leading-snug">{narrative.sentence}</p>
                </div>
                <time className="text-xs font-semibold text-gray-500 whitespace-nowrap flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  {narrative.when}
                </time>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-700">
                  <UserRound className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium truncate">ใคร: {narrative.who}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-600 truncate">
                  <FileText className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">รายการ: {log.entity_id || '-'}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-600 truncate" title={log.user_agent || ''}>
                  <Monitor className="w-3.5 h-3.5 text-gray-400" />
                  <span className="truncate">{narrative.source}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1">
                <JsonPreview label="ข้อมูลก่อนเปลี่ยน (เทคนิค)" data={log.before_data} />
                <JsonPreview label="ข้อมูลหลังเปลี่ยน (เทคนิค)" data={log.after_data} />
              </div>
              <JsonPreview label="Metadata / รายละเอียดระบบ" data={log.metadata} />
            </div>
          );
          })
        )}
      </div>

      {!loading && nextCursor && !search.trim() && (
        <div className="border-t border-gray-100 p-3 flex justify-center">
          <button
            type="button"
            onClick={() => fetchLogs(false)}
            disabled={loadingMore}
            className="h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            โหลดเพิ่ม
          </button>
        </div>
      )}
    </div>
  );
}
