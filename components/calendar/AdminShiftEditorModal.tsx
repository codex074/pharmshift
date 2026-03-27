'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search, Pencil, Trash2, Check, X, Loader2,
  ChevronLeft, ChevronRight, AlertTriangle, Filter, RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ShiftRow {
  id: string;
  date: string;
  shift_type: string;
  position: string | null;
  month_year: string;
  user: { id: string; nickname: string | null; pha_id: string | null };
  department: { id: number; name: string };
}
interface Dept { id: number; name: string }

const SHIFT_TYPES = ['เช้า', 'บ่าย', 'ดึก', 'รุ่งอรุณ'];
const ROLES = [
  { value: '', label: 'ทุก role' },
  { value: 'pharmacist', label: 'เภสัชกร' },
  { value: 'pharmacy_technician', label: 'เจ้าพนักงานเภสัชกรรม' },
  { value: 'officer', label: 'เจ้าหน้าที่' },
];
const PAGE_SIZE = 25;
const SHIFT_BADGE: Record<string, string> = {
  'เช้า':     'bg-amber-100  text-amber-800  border-amber-200',
  'บ่าย':     'bg-sky-100    text-sky-800    border-sky-200',
  'ดึก':      'bg-indigo-100 text-indigo-800 border-indigo-200',
  'รุ่งอรุณ': 'bg-orange-100 text-orange-800 border-orange-200',
};

export function AdminShiftEditorModal() {
  const [filterMonth, setFilterMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [filterRole,  setFilterRole]  = useState('');
  const [filterDept,  setFilterDept]  = useState('');
  const [search,      setSearch]      = useState('');
  const [showSuspicious, setShowSuspicious] = useState(false);
  const [page, setPage] = useState(0);

  const [shifts,   setShifts]   = useState<ShiftRow[]>([]);
  const [depts,    setDepts]    = useState<Dept[]>([]);
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editValues,  setEditValues]  = useState({ shift_type: '', department_id: 0, position: '' });
  const [saving,      setSaving]      = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteLoad,  setDeleteLoad]  = useState(false);
  const [fixLoading,  setFixLoading]  = useState(false);

  // Keep latest depts in a ref so fetch doesn't need it as a dependency
  const deptsRef = useRef<Dept[]>([]);
  deptsRef.current = depts;

  // ── Load departments once (public table, client-side OK) ──
  useEffect(() => {
    supabase.from('departments').select('id, name').order('name').then(({ data }) => {
      if (data) setDepts(data as Dept[]);
    });
  }, []);

  // ── Trigger counter to force re-fetch ──
  const [fetchTick, setFetchTick] = useState(0);
  const reload = () => setFetchTick(t => t + 1);

  // ── Reset page when filter changes ──
  useEffect(() => { setPage(0); }, [filterMonth, filterRole, filterDept, search, showSuspicious]);

  // ── Main fetch ──
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!filterMonth) return;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ month: filterMonth, page: String(page) });
        if (filterRole) params.set('role', filterRole);
        if (filterDept) {
          const found = deptsRef.current.find(d => d.name === filterDept);
          if (found) params.set('dept_id', String(found.id));
        }

        const res = await fetch(`/api/admin/shifts?${params.toString()}`);
        const body = await res.json();

        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        if (cancelled) return;

        const { shifts: raw = [], total: tot = 0, holidayDates = [] } = body;

        setHolidays(new Set<string>(holidayDates));

        let rows: ShiftRow[] = raw;
        if (search.trim()) {
          const s = search.toLowerCase();
          rows = rows.filter((r: ShiftRow) =>
            r.user?.nickname?.toLowerCase().includes(s) ||
            r.user?.pha_id?.toLowerCase().includes(s)
          );
        }
        if (showSuspicious) {
          rows = rows.filter((r: ShiftRow) =>
            r.department?.name === 'โครงการ' &&
            r.shift_type === 'บ่าย' &&
            holidayDates.includes(r.date)
          );
        }

        setShifts(rows);
        setTotal(tot);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'โหลดข้อมูลล้มเหลว');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  // fetchTick lets manual reload work; page resets above handle filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMonth, filterRole, filterDept, page, search, showSuspicious, fetchTick]);

  // ── Handlers ──
  function startEdit(row: ShiftRow) {
    setEditingId(row.id);
    setEditValues({ shift_type: row.shift_type, department_id: row.department.id, position: row.position ?? '' });
    setDeletingId(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editValues, position: editValues.position || null }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('แก้ไขเวรเรียบร้อยแล้ว');
      setEditingId(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'แก้ไขล้มเหลว'); }
    finally { setSaving(false); }
  }

  async function confirmDelete(id: string) {
    setDeleteLoad(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('ลบเวรเรียบร้อยแล้ว');
      setDeletingId(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'ลบล้มเหลว'); }
    finally { setDeleteLoad(false); }
  }

  async function fixSuspicious() {
    setFixLoading(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: filterMonth, dept_name: 'โครงการ' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || body.message);
      toast.success(body.message || `แก้ไขเวรโครงการ (วันหยุด) ${body.updated} รายการ → เวรเช้าเรียบร้อยแล้ว`);
      reload();
    } catch (e: any) { toast.error(e.message || 'เกิดข้อผิดพลาด'); }
    finally { setFixLoading(false); }
  }

  const totalPages   = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isHoliday    = (d: string) => holidays.has(d);
  const isSuspicious = (r: ShiftRow) =>
    r.department?.name === 'โครงการ' && r.shift_type === 'บ่าย' && isHoliday(r.date);
  const thaiDate = (d: string) => {
    try { return format(new Date(d + 'T00:00:00'), 'd MMM yy', { locale: th }); } catch { return d; }
  };

  return (
    <div className="flex flex-col min-h-0" style={{ height: '100%' }}>

      {/* ── Filters ── */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2 flex-shrink-0">
        <div className="flex flex-wrap gap-2 items-center">
          <input type="month" value={filterMonth}
            onChange={e => { setFilterMonth(e.target.value); setPage(0); }}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(0); }}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select value={filterDept} onChange={e => { setFilterDept(e.target.value); setPage(0); }}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value="">ทุกแผนก</option>
            {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <div className="relative flex-1 min-w-[130px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / pha_id"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <button onClick={reload} title="รีเฟรช"
            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setShowSuspicious(p => !p); setPage(0); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              showSuspicious
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-700',
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            แสดงเฉพาะเวรที่อาจผิดพลาด
          </button>
          {showSuspicious && (
            <button onClick={fixSuspicious} disabled={fixLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-all disabled:opacity-50"
            >
              {fixLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              แก้ไขทั้งหมด → เวรเช้า
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {loading ? 'กำลังโหลด...' : `${total.toLocaleString()} รายการ`}
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto min-h-0">
        {/* Error state */}
        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">โหลดข้อมูลล้มเหลว</p>
              <p className="text-xs text-red-500 mt-0.5">{error}</p>
              <button onClick={reload} className="mt-2 text-xs text-red-600 underline">ลองใหม่</button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !error && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            <span className="ml-2 text-sm text-gray-400">กำลังโหลด...</span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && shifts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <span className="text-3xl">📋</span>
            <p className="text-sm">ไม่พบข้อมูลเวรในเดือนนี้</p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && shifts.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left font-semibold">วันที่</th>
                <th className="px-3 py-2.5 text-left font-semibold">ชื่อ</th>
                <th className="px-3 py-2.5 text-left font-semibold">ประเภทเวร</th>
                <th className="px-3 py-2.5 text-left font-semibold">แผนก</th>
                <th className="px-3 py-2.5 text-left font-semibold">ตำแหน่ง</th>
                <th className="px-3 py-2.5 text-right font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.map(row => {
                const isEditing  = editingId  === row.id;
                const isDeleting = deletingId === row.id;
                const suspicious = isSuspicious(row);
                return (
                  <tr key={row.id} className={cn(
                    'transition-colors',
                    suspicious && !isEditing && 'bg-amber-50 hover:bg-amber-100',
                    isEditing && 'bg-indigo-50',
                    !suspicious && !isEditing && 'hover:bg-gray-50',
                  )}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-700">{thaiDate(row.date)}</span>
                      {isHoliday(row.date) && (
                        <span className="ml-1 text-[10px] bg-red-100 text-red-500 border border-red-200 rounded px-1">หยุด</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-800">{row.user?.nickname || '—'}</span>
                      {row.user?.pha_id && <span className="ml-1 text-[11px] text-gray-400">{row.user.pha_id}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select value={editValues.shift_type}
                          onChange={e => setEditValues(p => ({ ...p, shift_type: e.target.value }))}
                          className="text-xs px-2 py-1 border border-indigo-300 rounded-lg bg-white focus:outline-none"
                        >
                          {SHIFT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border',
                          SHIFT_BADGE[row.shift_type] ?? 'bg-gray-100 text-gray-600 border-gray-200',
                          suspicious && 'ring-1 ring-amber-400',
                        )}>
                          {suspicious && <AlertTriangle className="w-3 h-3 mr-1 text-amber-500" />}
                          {row.shift_type}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select value={editValues.department_id}
                          onChange={e => setEditValues(p => ({ ...p, department_id: Number(e.target.value) }))}
                          className="text-xs px-2 py-1 border border-indigo-300 rounded-lg bg-white focus:outline-none"
                        >
                          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-gray-700">{row.department?.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input type="text" value={editValues.position}
                          onChange={e => setEditValues(p => ({ ...p, position: e.target.value }))}
                          placeholder="—"
                          className="w-20 text-xs px-2 py-1 border border-indigo-300 rounded-lg bg-white focus:outline-none"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{row.position || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => saveEdit(row.id)} disabled={saving}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            บันทึก
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="px-2 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-100"
                          ><X className="w-3 h-3" /></button>
                        </div>
                      ) : isDeleting ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-red-600 font-medium mr-1">ยืนยันลบ?</span>
                          <button onClick={() => confirmDelete(row.id)} disabled={deleteLoad}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                          >
                            {deleteLoad ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            ลบ
                          </button>
                          <button onClick={() => setDeletingId(null)}
                            className="px-2 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-100"
                          ><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all" title="แก้ไข"
                          ><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { setDeletingId(row.id); setEditingId(null); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all" title="ลบ"
                          ><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {!showSuspicious && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-white flex-shrink-0">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> ก่อนหน้า
          </button>
          <span className="text-xs text-gray-400">หน้า {page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 disabled:opacity-40"
          >
            ถัดไป <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
