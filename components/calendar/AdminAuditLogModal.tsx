'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, ChevronDown, Database, Loader2, RefreshCcw, Search, UserRound } from 'lucide-react';
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

function actorName(log: AuditLog) {
  const actor = log.actor_snapshot;
  if (!actor) return log.metadata?.pha_id ? String(log.metadata.pha_id) : 'System / ไม่ทราบผู้ใช้';
  return actor.nickname || actor.f_name || actor.pha_id || 'ไม่ทราบชื่อ';
}

function formatDate(value: string) {
  try {
    return format(new Date(value), 'd MMM yyyy HH:mm:ss', { locale: th });
  } catch {
    return value;
  }
}

function summarizeChange(log: AuditLog) {
  if (log.entity_type === 'auth') {
    const reason = log.metadata?.reason ? ` (${String(log.metadata.reason)})` : '';
    return `${log.action}${reason}`;
  }

  if (log.action === 'insert') return 'สร้างรายการใหม่';
  if (log.action === 'delete') return 'ลบรายการ';
  if (log.action !== 'update') return log.action;

  const before = log.before_data || {};
  const after = log.after_data || {};
  const changed = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (!changed.length) return 'แก้ไขข้อมูล';
  return `แก้ไข ${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ` +${changed.length - 5}` : ''}`;
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
      const haystack = [
        actorName(log),
        log.action,
        log.entity_type,
        log.entity_id || '',
        log.ip_address || '',
        summarizeChange(log),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [logs, search]);

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
          filteredLogs.map((log) => (
            <div key={log.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                      {log.action}
                    </span>
                    <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                      {log.entity_type}
                    </span>
                    {log.entity_id && <span className="truncate text-xs text-gray-400">{log.entity_id}</span>}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{summarizeChange(log)}</p>
                </div>
                <time className="text-xs font-medium text-gray-400 whitespace-nowrap">{formatDate(log.created_at)}</time>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-gray-700">
                  <UserRound className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium truncate">{actorName(log)}</span>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600 truncate">
                  IP: {log.ip_address || '-'}
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-gray-600 truncate" title={log.user_agent || ''}>
                  UA: {log.user_agent || '-'}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <JsonPreview label="Before" data={log.before_data} />
                <JsonPreview label="After" data={log.after_data} />
              </div>
              <JsonPreview label="Metadata" data={log.metadata} />
            </div>
          ))
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
