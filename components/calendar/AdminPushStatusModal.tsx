'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellOff, Loader2, RefreshCcw, Search, Smartphone, UserRound } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type UserRole } from '@/lib/types';

type PushStatusRow = {
  id: string;
  phaId: string | null;
  name: string;
  role: UserRole;
  subscriptionCount: number;
  lastUsedAt: string | null;
};

const ROLE_OPTIONS: Array<{ value: UserRole | 'all'; label: string }> = [
  { value: 'all', label: 'ทุก role' },
  { value: 'pharmacist', label: ROLE_LABELS.pharmacist },
  { value: 'pharmacy_technician', label: ROLE_LABELS.pharmacy_technician },
  { value: 'officer', label: ROLE_LABELS.officer },
  { value: 'admin', label: ROLE_LABELS.admin },
];

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  pharmacist: { label: 'เภสัช', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  pharmacy_technician: { label: 'จพง.', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  officer: { label: 'จนท.', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  admin: { label: 'Admin', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export function AdminPushStatusModal() {
  const [rows, setRows] = useState<PushStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [search, setSearch] = useState('');

  async function fetchStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/push-status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลดสถานะการแจ้งเตือนได้');
      setRows(data.users || []);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถโหลดสถานะการแจ้งเตือนได้');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (role !== 'all' && row.role !== role) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || (row.phaId || '').toLowerCase().includes(q);
    });
  }, [rows, role, search]);

  const notSubscribedCount = useMemo(() => rows.filter((r) => r.subscriptionCount === 0).length, [rows]);

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-white">
      <div className="border-b border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <BellOff className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">สถานะการแจ้งเตือน</h3>
              <p className="text-xs text-gray-500">
                {loading ? 'กำลังโหลด...' : `${notSubscribedCount} จาก ${rows.length} คน ยังไม่เปิดการแจ้งเตือน`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="h-9 px-3 rounded-lg bg-gray-900 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCcw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อหรือ pha_id..."
              className="w-full h-10 rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-amber-200"
            />
          </div>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole | 'all')}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
          >
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
        ) : filteredRows.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
            <UserRound className="w-8 h-8" />
            <p className="text-sm font-medium">ไม่พบผู้ใช้</p>
          </div>
        ) : (
          filteredRows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex items-center gap-2">
                <UserRound className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-900 truncate">{row.name}</span>
                {row.phaId && (
                  <span className="shrink-0 text-xs font-mono text-gray-400">{row.phaId}</span>
                )}
                {ROLE_BADGES[row.role] && (
                  <span className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                    ROLE_BADGES[row.role].className,
                  )}>
                    {ROLE_BADGES[row.role].label}
                  </span>
                )}
              </div>

              {row.subscriptionCount === 0 ? (
                <span className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                  ยังไม่เปิด
                </span>
              ) : (
                <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  <Smartphone className="w-3 h-3" />
                  {row.subscriptionCount} เครื่อง
                  {row.lastUsedAt && (
                    <span className="font-normal text-emerald-600">
                      · {formatDistanceToNow(new Date(row.lastUsedAt), { locale: th, addSuffix: true })}
                    </span>
                  )}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
