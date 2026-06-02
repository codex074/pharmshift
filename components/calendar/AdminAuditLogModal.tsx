'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CalendarClock, CheckCircle2, Clock, Database, Loader2, RefreshCcw, Search, UserRound, X, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type UserRole } from '@/lib/types';

const SWAP_ACTIONS = new Set(['request_swap', 'request_cover', 'request_transfer']);

type AuditLog = {
  id: string;
  actor_name?: string | null;
  actor_role?: UserRole | null;
  action: string;
  description: string;
  created_at: string;
  swap_status?: 'pending' | 'accepted' | 'rejected' | null;
};

const ACTION_OPTIONS = [
  { value: 'all', label: 'ทุก action' },
  { value: 'login', label: 'ล็อกอิน' },
  { value: 'publish_schedule', label: 'ประกาศตารางเวร' },
  { value: 'add_shift', label: 'เพิ่มเวร' },
  { value: 'edit_shift', label: 'แก้ไขเวร' },
  { value: 'delete_shift', label: 'ลบเวร' },
  { value: 'request_swap', label: 'ขอแลกเวร' },
  { value: 'request_cover', label: 'ขออยู่แทน' },
  { value: 'request_transfer', label: 'โอนเวร' },
  { value: 'export_report', label: 'ดึงรายงาน' },
];

const ROLE_OPTIONS: Array<{ value: UserRole | 'all'; label: string }> = [
  { value: 'all', label: 'ทุก role' },
  { value: 'pharmacist', label: ROLE_LABELS.pharmacist },
  { value: 'pharmacy_technician', label: ROLE_LABELS.pharmacy_technician },
  { value: 'officer', label: ROLE_LABELS.officer },
  { value: 'admin', label: ROLE_LABELS.admin },
];

const ACTION_LABELS: Record<string, string> = {
  login: 'ล็อกอิน',
  publish_schedule: 'ประกาศตารางเวร',
  add_shift: 'เพิ่มเวร',
  edit_shift: 'แก้ไขเวร',
  delete_shift: 'ลบเวร',
  request_swap: 'ขอแลกเวร',
  request_cover: 'ขออยู่แทน',
  request_transfer: 'โอนเวร',
  export_report: 'ดึงรายงาน',
};

function formatDate(value: string) {
  try {
    return format(new Date(value), 'd MMM yyyy HH:mm:ss', { locale: th });
  } catch {
    return value;
  }
}

function actionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

function localDateBoundaryIso(value: string, boundary: 'start' | 'end') {
  if (!value) return null;
  const date = new Date(`${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function logSentence(log: AuditLog) {
  const actor = log.actor_name || 'ระบบ';
  const detail = (log.description || actionLabel(log.action)).trim();
  if (!detail) return `${actor} ทำรายการ ${actionLabel(log.action)}`;

  if (detail.startsWith(actor)) return detail;
  return `${actor} ${detail}`;
}

type StatusInfo = { dot: string; strip: string; text: string; label: string; icon: React.ReactNode };

function getStatusInfo(log: AuditLog): StatusInfo {
  if (!SWAP_ACTIONS.has(log.action)) {
    return { dot: 'bg-emerald-400', strip: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', label: 'สำเร็จ', icon: <CheckCircle2 className="w-3 h-3" /> };
  }
  if (log.swap_status === 'accepted') {
    return { dot: 'bg-emerald-400', strip: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', label: 'ยืนยันแล้ว', icon: <CheckCircle2 className="w-3 h-3" /> };
  }
  if (log.swap_status === 'rejected') {
    return { dot: 'bg-red-400', strip: 'bg-red-50 border-red-100', text: 'text-red-700', label: 'ถูกปฏิเสธ', icon: <XCircle className="w-3 h-3" /> };
  }
  if (log.swap_status === 'pending') {
    return { dot: 'bg-amber-400', strip: 'bg-amber-50 border-amber-100', text: 'text-amber-700', label: 'รอดำเนินการ', icon: <Clock className="w-3 h-3" /> };
  }
  return { dot: 'bg-gray-300', strip: 'bg-gray-50 border-gray-200', text: 'text-gray-500', label: 'ส่งคำขอแล้ว', icon: null };
}

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  pharmacist: {
    label: 'เภสัช',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  pharmacy_technician: {
    label: 'จพง.',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  officer: {
    label: 'จนท.',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  admin: {
    label: 'Admin',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

export function AdminAuditLogModal() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [action, setAction] = useState('all');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  async function fetchLogs(reset = false) {
    const cursor = reset ? null : nextCursor;
    reset ? setLoading(true) : setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '50' });
      const fromIso = localDateBoundaryIso(dateFrom, 'start');
      const toIso = localDateBoundaryIso(dateTo, 'end');

      if (action !== 'all') params.set('action', action);
      if (role !== 'all') params.set('role', role);
      if (fromIso) params.set('from', fromIso);
      if (toIso) params.set('to', toIso);
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลด audit log ได้');

      setLogs((prev) => reset ? data.logs || [] : [...prev, ...(data.logs || [])]);
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
  }, [action, role, dateFrom, dateTo]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const haystack = [
        log.actor_name || '',
        log.description || '',
        logSentence(log),
        actionLabel(log.action),
        log.actor_role ? ROLE_LABELS[log.actor_role] : '',
        formatDate(log.created_at),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, search]);

  const hasActiveFilters = Boolean(action !== 'all' || role !== 'all' || dateFrom || dateTo || search.trim());

  function clearFilters() {
    setAction('all');
    setRole('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  }

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
              <p className="text-xs text-gray-500">แสดงเฉพาะ ใครทำอะไร เมื่อไหร่</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_180px] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อผู้ใช้หรือ action..."
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
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole | 'all')}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_180px_auto] gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-500">ตั้งแต่วันที่</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-gray-500">ถึงวันที่</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          {hasActiveFilters && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 flex items-center gap-2"
              >
                <X className="w-3.5 h-3.5" />
                ล้างตัวกรอง
              </button>
            </div>
          )}
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
            const status = getStatusInfo(log);
            return (
              <div key={log.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {actionLabel(log.action)}
                    </span>
                    {log.actor_role && ROLE_BADGES[log.actor_role] && (
                      <span className={cn(
                        'rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                        ROLE_BADGES[log.actor_role].className,
                      )}>
                        {ROLE_BADGES[log.actor_role].label}
                      </span>
                    )}
                    <time className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" />
                      {formatDate(log.created_at)}
                    </time>
                  </div>

                  <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-700 space-y-1.5">
                    <div className="flex items-center gap-2 font-semibold text-gray-900">
                      <UserRound className="w-4 h-4 text-gray-400" />
                      <span>{log.actor_name || 'ระบบ'}</span>
                    </div>
                    <p className="leading-relaxed">{logSentence(log)}</p>
                  </div>
                </div>

                {/* status strip */}
                <div className={cn('flex items-center gap-2 px-4 py-2 border-t', status.strip)}>
                  <div className={cn('w-2 h-2 rounded-full shrink-0', status.dot)} />
                  <span className={cn('text-[11px] font-semibold flex items-center gap-1', status.text)}>
                    {status.icon}
                    {status.label}
                  </span>
                </div>
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
