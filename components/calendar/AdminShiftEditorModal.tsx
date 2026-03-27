'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Pencil, Trash2, Check, X, Loader2,
  ChevronLeft, ChevronRight, AlertTriangle, Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────
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

// ── Component ──────────────────────────────────────────────────────────
export function AdminShiftEditorModal() {
  // ── Filters ──
  const [filterMonth, setFilterMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [filterRole,  setFilterRole]  = useState('');
  const [filterDept,  setFilterDept]  = useState('');
  const [search,      setSearch]      = useState('');
  const [showSuspicious, setShowSuspicious] = useState(false);

  // ── Data ──
  const [shifts,    setShifts]    = useState<ShiftRow[]>([]);
  const [depts,     setDepts]     = useState<Dept[]>([]);
  const [holidays,  setHolidays]  = useState<Set<string>>(new Set());
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(0);
  const [loading,   setLoading]   = useState(false);

  // ── Edit state ──
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editValues,  setEditValues]  = useState<{
    shift_type: string; department_id: number; position: string;
  }>({ shift_type: '', department_id: 0, position: '' });
  const [saving, setSaving] = useState(false);

  // ── Delete state ──
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fix suspicious state ──
  const [fixLoading, setFixLoading] = useState(false);

  // ── Fetch departments once (client-side OK, departments are public) ──
  useEffect(() => {
    supabase.from('departments').select('id, name').order('name').then(({ data }) => {
      if (data) setDepts(data as Dept[]);
    });
  }, []);

  // ── Fetch shifts via server-side API ──
  const fetchShifts = useCallback(async () => {
    if (!filterMonth) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: filterMonth, page: String(page) });
      if (filterRole) params.set('role', filterRole);

      // Find dept ID from name
      if (filterDept) {
        const found = depts.find(d => d.name === filterDept);
        if (found) params.set('dept_id', String(found.id));
      }

      const res = await fetch(`/api/admin/shifts?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'โหลดข้อมูลล้มเหลว');
      }

      const { shifts: rawShifts, total: rawTotal, holidayDates } = await res.json();

      // Update holiday set from API response
      setHolidays(new Set(holidayDates || []));

      // Client-side search filter
      let rows: ShiftRow[] = rawShifts;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        rows = rows.filter(r =>
          r.user?.nickname?.toLowerCase().includes(s) ||
          r.user?.pha_id?.toLowerCase().includes(s)
        );
      }

      // Suspicious filter (client-side after holidays are loaded)
      if (showSuspicious) {
        rows = rows.filter(r =>
          r.department?.name === 'โครงการ' &&
          r.shift_type === 'บ่าย' &&
          (holidayDates || []).includes(r.date)
        );
      }

      setShifts(rows);
      setTotal(rawTotal);
    } catch (err: any) {
      toast.error(err.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterRole, filterDept, page, search, showSuspicious, depts]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  // Reset page when filters change (excluding page itself)
  useEffect(() => { setPage(0); }, [filterMonth, filterRole, filterDept, search, showSuspicious]);

  // ── Handlers ──
  function startEdit(row: ShiftRow) {
    setEditingId(row.id);
    setEditValues({
      shift_type:    row.shift_type,
      department_id: row.department.id,
      position:      row.position ?? '',
    });
    setDeletingId(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          shift_type:    editValues.shift_type,
          department_id: editValues.department_id,
          position:      editValues.position || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('แก้ไขเวรเรียบร้อยแล้ว');
      setEditingId(null);
      fetchShifts();
    } catch (err: any) {
      toast.error(err.message || 'แก้ไขล้มเหลว');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('ลบเวรเรียบร้อยแล้ว');
      setDeletingId(null);
      fetchShifts();
    } catch (err: any) {
      toast.error(err.message || 'ลบล้มเหลว');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function fixSuspicious() {
    setFixLoading(true);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: filterMonth, dept_name: 'โครงการ' }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || e.message); }
      const { updated, message } = await res.json();
      toast.success(message || `แก้ไขเวรโครงการ (วันหยุด) ${updated} รายการ → เวรเช้าเรียบร้อยแล้ว`);
      fetchShifts();
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setFixLoading(false);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isHoliday   = (d: string) => holidays.has(d);
  const isSuspicious = (r: ShiftRow) =>
    r.department?.name === 'โครงการ' && r.shift_type === 'บ่าย' && isHoliday(r.date);
  const thaiDate = (d: string) => {
    try { return format(new Date(d + 'T00:00:00'), 'd MMM yy', { locale: th }); }
    catch { return d; }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Filter bar ── */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2 shrink-0">
        <div className="flex flex-wrap gap-2">
          {/* Month */}
          <input
            type="month" value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
          {/* Role */}
          <select
            value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {/* Dept */}
          <select
            value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="">ทุกแผนก</option>
            {depts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          {/* Search */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / pha_id"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
          </div>
        </div>

        {/* Suspicious row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSuspicious(p => !p)}
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
            <button
              onClick={fixSuspicious} disabled={fixLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-all disabled:opacity-50"
            >
              {fixLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
              แก้ไขทั้งหมด → เวรเช้า
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {loading ? '...' : `${total} รายการ`}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <span className="text-3xl">📋</span>
            <p className="text-sm">ไม่พบข้อมูลเวร</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide sticky top-0">
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
                const isEditing   = editingId  === row.id;
                const isDeleting  = deletingId === row.id;
                const suspicious  = isSuspicious(row);

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'transition-colors',
                      suspicious  && !isEditing && 'bg-amber-50 hover:bg-amber-100',
                      isEditing   && 'bg-indigo-50',
                      !suspicious && !isEditing && 'hover:bg-gray-50',
                    )}
                  >
                    {/* Date */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-700">{thaiDate(row.date)}</span>
                      {isHoliday(row.date) && (
                        <span className="ml-1.5 text-[10px] bg-red-100 text-red-500 border border-red-200 rounded px-1 py-0.5">หยุด</span>
                      )}
                    </td>

                    {/* User */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium text-gray-800">{row.user?.nickname || '—'}</span>
                      {row.user?.pha_id && (
                        <span className="ml-1 text-[11px] text-gray-400">{row.user.pha_id}</span>
                      )}
                    </td>

                    {/* Shift type */}
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          value={editValues.shift_type}
                          onChange={e => setEditValues(p => ({ ...p, shift_type: e.target.value }))}
                          className="text-xs px-2 py-1 border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
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

                    {/* Dept */}
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          value={editValues.department_id}
                          onChange={e => setEditValues(p => ({ ...p, department_id: Number(e.target.value) }))}
                          className="text-xs px-2 py-1 border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        >
                          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-gray-700">{row.department?.name}</span>
                      )}
                    </td>

                    {/* Position */}
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <input
                          type="text" value={editValues.position}
                          onChange={e => setEditValues(p => ({ ...p, position: e.target.value }))}
                          placeholder="—"
                          className="w-20 text-xs px-2 py-1 border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                        />
                      ) : (
                        <span className="text-gray-500 text-xs">{row.position || '—'}</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => saveEdit(row.id)} disabled={saving}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all disabled:opacity-50"
                          >
                            {saving
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Check className="w-3 h-3" />}
                            บันทึก
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-100 transition-all"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : isDeleting ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-red-600 font-medium mr-1">ยืนยันลบ?</span>
                          <button
                            onClick={() => confirmDelete(row.id)} disabled={deleteLoading}
                            className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1"
                          >
                            {deleteLoading
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Check className="w-3 h-3" />}
                            ลบ
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                            title="แก้ไข"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeletingId(row.id); setEditingId(null); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                            title="ลบ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-white shrink-0">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 disabled:opacity-40 transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> ก่อนหน้า
          </button>
          <span className="text-xs text-gray-400">หน้า {page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs hover:bg-gray-50 disabled:opacity-40 transition-all"
          >
            ถัดไป <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
