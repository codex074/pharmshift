'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Download, Trash2, Eye, EyeOff, Loader2, AlertTriangle, CheckCircle2, Database, Calendar, ArrowLeftRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { verifyCurrentPassword } from '@/lib/clientAuth';
import type { User } from '@/lib/types';

interface AdminBackupModalProps {
  currentUser: User | null;
}

const BACKUP_TABLES = [
  { key: 'shifts',          label: 'ตารางเวร (shifts)',        desc: 'ข้อมูลเวรทั้งหมด' },
  { key: 'users',           label: 'ผู้ใช้งาน (users)',        desc: 'ข้อมูล user และสิทธิ์' },
  { key: 'departments',     label: 'แผนก (departments)',       desc: 'รายชื่อแผนก' },
  { key: 'holidays',        label: 'วันหยุด (holidays)',       desc: 'วันหยุดนักขัตฤกษ์' },
  { key: 'swap_requests',   label: 'คำขอแลก/โอน',             desc: 'ประวัติ swap requests' },
  { key: 'published_months',label: 'ตารางที่ประกาศแล้ว',       desc: 'สถานะการประกาศแต่ละเดือน' },
] as const;

type TableKey = typeof BACKUP_TABLES[number]['key'];

const ROLES = [
  { value: 'all',                    label: 'ทุก role' },
  { value: 'pharmacist',             label: 'เภสัชกร' },
  { value: 'pharmacy_technician',    label: 'เจ้าพนักงานเภสัชกรรม' },
  { value: 'officer',                label: 'เจ้าหน้าที่' },
];

const SWAP_STATUSES = [
  { value: 'all',      label: 'ทุกสถานะ' },
  { value: 'accepted', label: 'อนุมัติแล้ว' },
  { value: 'rejected', label: 'ปฏิเสธแล้ว' },
  { value: 'pending',  label: 'รอดำเนินการ' },
];

type DeleteMode = 'shifts-month' | 'shifts-range' | 'swap-history';

const DELETE_MODES: { id: DeleteMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'shifts-month',  label: 'เวรตามเดือน',      desc: 'ลบเวรทั้งเดือนที่เลือก',         icon: <Calendar className="w-4 h-4" /> },
  { id: 'shifts-range',  label: 'เวรตามช่วงวันที่',  desc: 'ลบเวรในช่วงวันที่กำหนด',         icon: <Trash2 className="w-4 h-4" /> },
  { id: 'swap-history',  label: 'ประวัติแลก/โอนเวร', desc: 'ลบประวัติ swap requests',         icon: <ArrowLeftRight className="w-4 h-4" /> },
];

export function AdminBackupModal({ currentUser }: AdminBackupModalProps) {
  // ── Backup ──────────────────────────────────────────────────────────
  const [selectedTables, setSelectedTables] = useState<Set<TableKey>>(new Set<TableKey>(['shifts']));
  const [backupLoading, setBackupLoading] = useState(false);

  // ── Delete ──────────────────────────────────────────────────────────
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('shifts-month');

  // shifts-month
  const [deleteMonth, setDeleteMonth] = useState('');
  const [deleteRole, setDeleteRole] = useState('all');

  // shifts-range
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rangeRole, setRangeRole] = useState('all');

  // swap-history
  const [swapDateFrom, setSwapDateFrom] = useState('');
  const [swapDateTo, setSwapDateTo] = useState('');
  const [swapStatus, setSwapStatus] = useState('all');

  // shared
  const [deletePassword, setDeletePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm'>('idle');
  const [deleteSuccess, setDeleteSuccess] = useState<{ count: number; label: string } | null>(null);

  function resetDeleteState() {
    setDeleteStep('idle');
    setPreviewCount(null);
    setDeletePassword('');
    setDeleteSuccess(null);
  }

  // ── Backup handler ──────────────────────────────────────────────────
  async function handleBackup() {
    if (selectedTables.size === 0) { toast.error('กรุณาเลือกข้อมูลที่ต้องการ backup'); return; }
    setBackupLoading(true);
    try {
      const result: Record<string, any[]> = {};
      for (const table of BACKUP_TABLES) {
        if (!selectedTables.has(table.key)) continue;
        const { data, error } = await supabase.from(table.key).select('*');
        if (error) throw new Error(`ดึงข้อมูล ${table.key} ล้มเหลว: ${error.message}`);
        result[table.key] = data || [];
      }
      const now = new Date();
      const dateStr = format(now, 'yyyyMMdd_HHmm');
      const blob = new Blob([JSON.stringify({ exported_at: now.toISOString(), data: result }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmshift_backup_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const totalRows = Object.values(result).reduce((s, arr) => s + arr.length, 0);
      toast.success(`Backup สำเร็จ — ${totalRows} รายการ`);
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setBackupLoading(false);
    }
  }

  // ── Build role-filtered user IDs ─────────────────────────────────────
  async function getRoleUserIds(role: string): Promise<string[] | null> {
    if (role === 'all') return null;
    const { data } = await supabase.from('users').select('id').eq('role', role);
    return (data || []).map((u: any) => u.id);
  }

  // ── Preview ──────────────────────────────────────────────────────────
  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewCount(null);
    try {
      if (deleteMode === 'shifts-month') {
        if (!deleteMonth) { toast.error('กรุณาเลือกเดือนที่ต้องการลบ'); return; }
        let q = supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('month_year', deleteMonth);
        const ids = await getRoleUserIds(deleteRole);
        if (ids !== null) {
          if (ids.length === 0) { setPreviewCount(0); setDeleteStep('confirm'); return; }
          q = q.in('user_id', ids);
        }
        const { count } = await q;
        setPreviewCount(count ?? 0);

      } else if (deleteMode === 'shifts-range') {
        if (!dateFrom || !dateTo) { toast.error('กรุณาเลือกช่วงวันที่'); return; }
        if (dateFrom > dateTo) { toast.error('วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด'); return; }
        let q = supabase.from('shifts').select('id', { count: 'exact', head: true })
          .gte('date', dateFrom).lte('date', dateTo);
        const ids = await getRoleUserIds(rangeRole);
        if (ids !== null) {
          if (ids.length === 0) { setPreviewCount(0); setDeleteStep('confirm'); return; }
          q = q.in('user_id', ids);
        }
        const { count } = await q;
        setPreviewCount(count ?? 0);

      } else {
        // swap-history
        let q = supabase.from('swap_requests').select('id', { count: 'exact', head: true });
        if (swapDateFrom) q = q.gte('created_at', swapDateFrom);
        if (swapDateTo)   q = q.lte('created_at', swapDateTo + 'T23:59:59');
        if (swapStatus !== 'all') q = q.eq('status', swapStatus);
        const { count } = await q;
        setPreviewCount(count ?? 0);
      }

      setDeleteStep('confirm');
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deletePassword) { toast.error('กรุณากรอกรหัสผ่าน'); return; }
    setDeleteLoading(true);
    try {
      await verifyCurrentPassword(deletePassword);

      let label = '';

      if (deleteMode === 'shifts-month') {
        let q = supabase.from('shifts').delete().eq('month_year', deleteMonth);
        const ids = await getRoleUserIds(deleteRole);
        if (ids !== null && ids.length > 0) q = q.in('user_id', ids);
        const { error } = await q;
        if (error) throw error;
        label = `เวรเดือน ${thaiMonth(deleteMonth)}`;

      } else if (deleteMode === 'shifts-range') {
        let q = supabase.from('shifts').delete().gte('date', dateFrom).lte('date', dateTo);
        const ids = await getRoleUserIds(rangeRole);
        if (ids !== null && ids.length > 0) q = q.in('user_id', ids);
        const { error } = await q;
        if (error) throw error;
        label = `เวร ${dateFrom} ถึง ${dateTo}`;

      } else {
        let q = supabase.from('swap_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // always-true filter
        if (swapDateFrom) q = (q as any).gte('created_at', swapDateFrom);
        if (swapDateTo)   q = (q as any).lte('created_at', swapDateTo + 'T23:59:59');
        if (swapStatus !== 'all') q = (q as any).eq('status', swapStatus);
        const { error } = await q;
        if (error) throw error;
        label = 'ประวัติแลก/โอนเวร';
      }

      setDeleteSuccess({ count: previewCount ?? 0, label });
      resetDeleteState();
      toast.success('ลบข้อมูลเรียบร้อยแล้ว');
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setDeleteLoading(false);
    }
  }

  const toggleTable = (key: TableKey) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const thaiMonth = (ym: string) => {
    if (!ym) return '';
    try {
      const [y, m] = ym.split('-');
      return format(new Date(Number(y), Number(m) - 1), 'MMMM yyyy', { locale: th });
    } catch { return ym; }
  };

  const previewLabel = () => {
    if (deleteMode === 'shifts-month') return `พบเวร ${previewCount} รายการ ในเดือน ${thaiMonth(deleteMonth)}${deleteRole !== 'all' ? ` (${ROLES.find(r => r.value === deleteRole)?.label})` : ''}`;
    if (deleteMode === 'shifts-range') return `พบเวร ${previewCount} รายการ ระหว่างวันที่ ${dateFrom} ถึง ${dateTo}${rangeRole !== 'all' ? ` (${ROLES.find(r => r.value === rangeRole)?.label})` : ''}`;
    return `พบประวัติแลก/โอนเวร ${previewCount} รายการ${swapStatus !== 'all' ? ` (${SWAP_STATUSES.find(s => s.value === swapStatus)?.label})` : ''}`;
  };

  return (
    <div className="flex flex-col gap-6 p-5 overflow-y-auto flex-1 min-h-0">

      {/* ── Section 1: Backup ───────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
            <Download className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">Backup ข้อมูล</h3>
            <p className="text-xs text-gray-400">ดาวน์โหลดข้อมูลเป็นไฟล์ JSON</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BACKUP_TABLES.map(t => (
            <label
              key={t.key}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all',
                selectedTables.has(t.key)
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              <input
                type="checkbox"
                checked={selectedTables.has(t.key)}
                onChange={() => toggleTable(t.key)}
                className="mt-0.5 accent-blue-500"
              />
              <div>
                <p className="text-xs font-semibold text-gray-700">{t.label}</p>
                <p className="text-[11px] text-gray-400">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedTables(new Set<TableKey>(BACKUP_TABLES.map(t => t.key)))}
            className="text-xs text-blue-600 hover:underline"
          >เลือกทั้งหมด</button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => setSelectedTables(new Set())}
            className="text-xs text-gray-400 hover:underline"
          >ล้างทั้งหมด</button>
          <span className="ml-auto text-xs text-gray-400">เลือก {selectedTables.size}/{BACKUP_TABLES.length} ตาราง</span>
        </div>

        <button
          onClick={handleBackup}
          disabled={backupLoading || selectedTables.size === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {backupLoading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลัง export...</>
            : <><Download className="w-4 h-4" /> ดาวน์โหลด JSON</>}
        </button>
      </section>

      <div className="border-t border-gray-100" />

      {/* ── Section 2: Delete ───────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">ลบข้อมูล</h3>
            <p className="text-xs text-gray-400">ไม่สามารถกู้คืนได้ — กรุณา backup ก่อนดำเนินการ</p>
          </div>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-2">
          {DELETE_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setDeleteMode(m.id); resetDeleteState(); }}
              className={cn(
                'flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all',
                deleteMode === m.id
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
              )}
            >
              {m.icon}
              <span className="text-[11px] font-semibold leading-tight">{m.label}</span>
            </button>
          ))}
        </div>

        {deleteSuccess !== null && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <p className="text-sm text-green-700 font-medium">ลบ{deleteSuccess.label} {deleteSuccess.count} รายการเรียบร้อยแล้ว</p>
          </div>
        )}

        {/* ── Mode: shifts-month ── */}
        {deleteMode === 'shifts-month' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">เดือนที่ต้องการลบ</label>
              <input
                type="month"
                value={deleteMonth}
                onChange={e => { setDeleteMonth(e.target.value); resetDeleteState(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">กลุ่มผู้ใช้</label>
              <select
                value={deleteRole}
                onChange={e => { setDeleteRole(e.target.value); resetDeleteState(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Mode: shifts-range ── */}
        {deleteMode === 'shifts-range' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); resetDeleteState(); }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">วันที่สิ้นสุด</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); resetDeleteState(); }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">กลุ่มผู้ใช้</label>
              <select
                value={rangeRole}
                onChange={e => { setRangeRole(e.target.value); resetDeleteState(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── Mode: swap-history ── */}
        {deleteMode === 'swap-history' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">ตั้งแต่วันที่ (ไม่บังคับ)</label>
                <input
                  type="date"
                  value={swapDateFrom}
                  onChange={e => { setSwapDateFrom(e.target.value); resetDeleteState(); }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">ถึงวันที่ (ไม่บังคับ)</label>
                <input
                  type="date"
                  value={swapDateTo}
                  onChange={e => { setSwapDateTo(e.target.value); resetDeleteState(); }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">สถานะ</label>
              <select
                value={swapStatus}
                onChange={e => { setSwapStatus(e.target.value); resetDeleteState(); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
              >
                {SWAP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Preview button */}
        {deleteStep === 'idle' && (
          <button
            onClick={handlePreview}
            disabled={
              previewLoading ||
              (deleteMode === 'shifts-month' && !deleteMonth) ||
              (deleteMode === 'shifts-range' && (!dateFrom || !dateTo))
            }
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {previewLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบ...</>
              : <><Database className="w-4 h-4" /> ตรวจสอบจำนวนที่จะลบ</>}
          </button>
        )}

        {/* Confirm step */}
        {deleteStep === 'confirm' && previewCount !== null && (
          <div className="space-y-3 p-4 rounded-xl border-2 border-red-300 bg-red-50 animate-in fade-in">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-700">{previewLabel()}</p>
                <p className="text-xs text-red-500 mt-0.5">ข้อมูลที่ลบแล้วไม่สามารถกู้คืนได้ กรุณา backup ก่อนดำเนินการ</p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">ยืนยันด้วยรหัสผ่านของคุณ</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  placeholder="รหัสผ่าน"
                  className="w-full pl-3 pr-10 py-2 text-sm border border-red-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={resetDeleteState}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-all"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading || !deletePassword || previewCount === 0}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {deleteLoading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังลบ...</>
                  : <><Trash2 className="w-4 h-4" /> ยืนยันลบ {previewCount} รายการ</>}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
