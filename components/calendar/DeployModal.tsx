'use client';

import { useState } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertCircle, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { ROLE_LABELS, STAFF_ROLES, UserRole, isAdminLike, isAdmin } from '@/lib/types';
import { insertNotifications } from '@/lib/notifyUsers';

interface DeployModalProps {
  initialYear: number;
  initialMonth: number;
  currentUser: any;
  onClose: () => void;
  onSuccess: () => void;
}

const ROLE_ICONS: Record<string, string> = {
  pharmacist:          '💊',
  pharmacy_technician: '⚗️',
  officer:             '📋',
};

export function DeployModal({ initialYear, initialMonth, currentUser, onClose, onSuccess }: DeployModalProps) {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorDesc, setErrorDesc] = useState('');
  const [month, setMonth] = useState<number>(initialMonth);
  const [year, setYear] = useState<number>(initialYear);
  // All checkboxes start empty — user selects manually
  const [selectedRoles, setSelectedRoles] = useState<Set<UserRole>>(new Set());
  // Password confirmation
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isFullAdmin = isAdmin(currentUser);
  const isSubAdmin = !isFullAdmin && currentUser?.is_sub_admin === true;
  const myRole: UserRole | null = (isSubAdmin && STAFF_ROLES.includes(currentUser?.role)) ? currentUser.role : null;

  // Roles that are "not mine" when sub-admin selects them
  const otherRolesSelected: UserRole[] = isSubAdmin && myRole
    ? Array.from(selectedRoles).filter(r => r !== myRole)
    : [];

  const currentYear = new Date().getFullYear();

  const toggleRole = (role: UserRole) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const allSelected = STAFF_ROLES.every(r => selectedRoles.has(r));
  const toggleAll = () => {
    setSelectedRoles(allSelected ? new Set() : new Set(STAFF_ROLES));
  };

  const handleDeploy = async () => {
    if (!currentUser || !isAdminLike(currentUser)) {
      toast.error('ไม่มีสิทธิ์ดำเนินการ');
      return;
    }
    if (selectedRoles.size === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 ตำแหน่ง');
      return;
    }
    if (!password) {
      toast.error('กรุณากรอกรหัสผ่านเพื่อยืนยัน');
      return;
    }
    if (currentUser?.password && currentUser.password !== password) {
      toast.error('รหัสผ่านไม่ถูกต้อง');
      return;
    }

    setLoading(true);
    setErrorDesc('');
    setSuccessMsg('');

    try {
      const monthYear = format(new Date(year, month - 1), 'yyyy-MM');

      // Fetch existing row to merge
      const { data: existingData } = await supabase
        .from('published_months')
        .select('*')
        .eq('month_year', monthYear)
        .maybeSingle();

      const updatePayload: any = {
        month_year: monthYear,
        published_at: new Date().toISOString(),
        published_by: currentUser.id,
        // Preserve existing, then apply newly selected roles
        pharmacist_published:          existingData?.pharmacist_published          || selectedRoles.has('pharmacist'),
        pharmacy_technician_published: existingData?.pharmacy_technician_published || selectedRoles.has('pharmacy_technician'),
        officer_published:             existingData?.officer_published             || selectedRoles.has('officer'),
      };

      // Global flag: true only when all 3 roles are published
      updatePayload.is_published =
        updatePayload.pharmacist_published &&
        updatePayload.pharmacy_technician_published &&
        updatePayload.officer_published;

      const { error } = await supabase.from('published_months').upsert(updatePayload);
      if (error) throw error;

      setSuccessMsg('ประกาศตารางเวรสำเร็จแล้ว!');
      toast.success('ประกาศตารางเวรสำเร็จแล้ว!');

      // Notifications + stamp original_user_id
      try {
        const rolesToNotify = Array.from(selectedRoles);
        const { data: staffUsers } = await supabase
          .from('users')
          .select('id')
          .in('role', rolesToNotify);

        if (staffUsers?.length) {
          // Stamp original_user_id = user_id for all shifts in this publish batch
          // that haven't been stamped yet (first time published)
          const publishedUserIds = staffUsers.map(u => u.id);
          const { data: shiftsToStamp } = await supabase
            .from('shifts')
            .select('id, user_id')
            .eq('month_year', monthYear)
            .in('user_id', publishedUserIds)
            .is('original_user_id', null);

          if (shiftsToStamp?.length) {
            const byUser = new Map<string, string[]>();
            for (const s of shiftsToStamp) {
              const ids = byUser.get(s.user_id) || [];
              ids.push(s.id);
              byUser.set(s.user_id, ids);
            }
            await Promise.all(
              Array.from(byUser.entries()).map(([uid, ids]) =>
                supabase.from('shifts').update({ original_user_id: uid }).in('id', ids)
              )
            );
          }

          const now = new Date();
          const timestamp = `วันที่ ${format(now, 'd MMM', { locale: th })} ${(now.getFullYear() + 543).toString().slice(-2)} เวลา ${format(now, 'HH:mm')} น.`;
          const roleNames = rolesToNotify.map(r => ROLE_LABELS[r as UserRole]).join(', ');
          const notifTitle = '📋 ตารางเวรประกาศแล้ว';
          const notifBody = `${currentUser?.f_name || 'ผู้ดูแลระบบ'} ประกาศตารางเวรเดือน ${format(new Date(year, month - 1), 'MMMM', { locale: th })} ${(year + 543).toString().slice(-2)} (${roleNames}) แล้ว — ${timestamp}`;

          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: staffUsers.map(u => u.id), title: notifTitle, body: notifBody, url: '/calendar', tag: `publish-${monthYear}` }),
          }).catch(() => {});

          insertNotifications(staffUsers.map(u => u.id), 'schedule_published', notifTitle, notifBody);

          if (currentUser?.id && !staffUsers.some(u => u.id === currentUser.id)) {
            const ts2 = `วันที่ ${format(now, 'd MMM', { locale: th })} ${(now.getFullYear() + 543).toString().slice(-2)} เวลา ${format(now, 'HH:mm')} น.`;
            insertNotifications(
              [currentUser.id],
              'schedule_published',
              '📋 คุณประกาศตารางเวรแล้ว',
              `คุณประกาศตารางเวรเดือน ${format(new Date(year, month - 1), 'MMMM', { locale: th })} ${(year + 543).toString().slice(-2)} (${roleNames}) ส่งถึงพนักงาน ${staffUsers.length} คน — ${ts2}`,
            );
          }
        }
      } catch {}

      setTimeout(() => { onSuccess(); onClose(); }, 1500);

    } catch (err: any) {
      toast.error('เกิดข้อผิดพลาด: ' + err.message);
      setErrorDesc(err.message);
    } finally {
      setLoading(false);
    }
  };

  const thaiMonths = Array.from({ length: 12 }).map((_, i) =>
    new Date(2000, i, 1).toLocaleString('th-TH', { month: 'long' })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-white/90" />
            ประกาศตารางเวร
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Month / Year */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">เดือน</label>
              <select
                value={month}
                onChange={e => setMonth(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all shadow-sm"
              >
                {thaiMonths.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">ปี</label>
              <select
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
                className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all shadow-sm"
              >
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map(y => (
                  <option key={y} value={y}>{y + 543}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Role checkboxes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                ตำแหน่งที่ต้องการประกาศ
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs text-green-600 hover:text-green-700 font-medium transition-colors"
              >
                {allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
            </div>

            <div className="space-y-2">
              {STAFF_ROLES.map(role => {
                const isChecked = selectedRoles.has(role);
                const isMyOwnRole = myRole === role;
                const isOtherRole = isSubAdmin && !isMyOwnRole;

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left cursor-pointer ${
                      isChecked
                        ? isOtherRole
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-green-400 bg-green-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                      isChecked
                        ? isOtherRole
                          ? 'bg-amber-500 border-amber-500'
                          : 'bg-green-500 border-green-500'
                        : 'bg-white border-gray-300'
                    }`}>
                      {isChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>

                    <span className="text-lg">{ROLE_ICONS[role]}</span>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        isChecked
                          ? isOtherRole ? 'text-amber-800' : 'text-green-800'
                          : 'text-gray-700'
                      }`}>
                        {ROLE_LABELS[role]}
                      </p>
                    </div>

                    {/* Badge for sub-admin */}
                    {isMyOwnRole && (
                      <span className="text-[10px] font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                        role ของคุณ
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedRoles.size === 0 && (
              <p className="text-xs text-red-500 mt-1">กรุณาเลือกอย่างน้อย 1 ตำแหน่ง</p>
            )}
          </div>

          {/* Warning: sub-admin selecting other roles */}
          {isSubAdmin && otherRolesSelected.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
              <div>
                <p className="font-semibold text-xs">คุณกำลังประกาศตำแหน่งที่ไม่ใช่ของคุณ</p>
                <p className="text-xs mt-0.5 text-amber-700">
                  {otherRolesSelected.map(r => ROLE_LABELS[r]).join(', ')} — กรุณาตรวจสอบให้แน่ใจก่อนยืนยัน
                </p>
              </div>
            </div>
          )}

          {/* Password confirmation */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">รหัสผ่านของคุณ</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && selectedRoles.size > 0 && handleDeploy()}
                placeholder="ป้อนรหัสผ่านเพื่อยืนยัน"
                className="w-full border border-gray-300 rounded-xl text-sm px-4 py-2.5 pr-10 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500/50 focus:border-green-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Success / Error */}
          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex gap-2 items-center">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              {successMsg}
            </div>
          )}
          {errorDesc && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex flex-col gap-2">
              <div className="flex gap-2 items-center font-bold">
                <AlertCircle className="w-5 h-5 flex-shrink-0" /> พบข้อผิดพลาด
              </div>
              <p className="text-xs">{errorDesc}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleDeploy}
            disabled={loading || selectedRoles.size === 0 || !password}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังดำเนินการ...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                ยืนยันประกาศตารางเวร
                {selectedRoles.size > 0 && (
                  <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">
                    {selectedRoles.size} ตำแหน่ง
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
