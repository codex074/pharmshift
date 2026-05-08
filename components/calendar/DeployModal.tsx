'use client';

import { useMemo, useState, useEffect } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { ROLE_LABELS, STAFF_ROLES, UserRole, isAdminLike, isAdmin } from '@/lib/types';
import { insertNotifications } from '@/lib/notifyUsers';
import { postAuditLog } from '@/lib/auditLogClient';

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
  // Full admin selects roles manually; sub-admin is locked to own role.
  const [selectedRoles, setSelectedRoles] = useState<Set<UserRole>>(new Set());
  // Password confirmation
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Track which roles are already published for the selected month/year
  const [alreadyPublished, setAlreadyPublished] = useState<Set<UserRole>>(new Set());

  // Load published status whenever month/year changes
  useEffect(() => {
    const monthYear = format(new Date(year, month - 1), 'yyyy-MM');
    supabase
      .from('published_months')
      .select('pharmacist_published, pharmacy_technician_published, officer_published')
      .eq('month_year', monthYear)
      .maybeSingle()
      .then(({ data }) => {
        const published = new Set<UserRole>();
        if (data?.pharmacist_published)          published.add('pharmacist');
        if (data?.pharmacy_technician_published) published.add('pharmacy_technician');
        if (data?.officer_published)             published.add('officer');
        setAlreadyPublished(published);
        // Deselect any role that is already published
        setSelectedRoles(prev => {
          const next = new Set(prev);
          published.forEach(r => next.delete(r));
          return next;
        });
      });
  }, [month, year]);

  const isFullAdmin = isAdmin(currentUser);
  const isSubAdmin = !isFullAdmin && currentUser?.is_sub_admin === true;
  const myRole: UserRole | null = (isSubAdmin && STAFF_ROLES.includes(currentUser?.role)) ? currentUser.role : null;

  const deployRoles = useMemo(
    () => (isSubAdmin && myRole ? new Set<UserRole>([myRole]) : selectedRoles),
    [isSubAdmin, myRole, selectedRoles]
  );

  const currentYear = new Date().getFullYear();

  const toggleRole = (role: UserRole) => {
    if (isSubAdmin) return;
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const allSelected = STAFF_ROLES.every(r => selectedRoles.has(r));
  const toggleAll = () => {
    if (isSubAdmin) return;
    setSelectedRoles(allSelected ? new Set() : new Set(STAFF_ROLES));
  };

  const handleDeploy = async () => {
    if (!currentUser || !isAdminLike(currentUser)) {
      toast.error('ไม่มีสิทธิ์ดำเนินการ');
      return;
    }
    // Filter out already-published roles
    const newRoles = new Set(Array.from(deployRoles).filter(r => !alreadyPublished.has(r)));
    if (newRoles.size === 0) {
      toast.error('ตำแหน่งที่เลือกประกาศไปแล้วทั้งหมด');
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

      const updatePayload: any = {
        month_year: monthYear,
        published_at: new Date().toISOString(),
        published_by: currentUser.id,
        pharmacist_published:          alreadyPublished.has('pharmacist')          || newRoles.has('pharmacist'),
        pharmacy_technician_published: alreadyPublished.has('pharmacy_technician') || newRoles.has('pharmacy_technician'),
        officer_published:             alreadyPublished.has('officer')             || newRoles.has('officer'),
      };
      updatePayload.is_published =
        updatePayload.pharmacist_published &&
        updatePayload.pharmacy_technician_published &&
        updatePayload.officer_published;

      const { error } = await supabase.from('published_months').upsert(updatePayload);
      if (error) throw error;

      await postAuditLog({
        action: 'publish_schedule',
        description: `ประกาศตารางเวร เดือน ${monthYear} (${Array.from(newRoles).map((role) => ROLE_LABELS[role]).join(', ')})`,
      });

      setSuccessMsg('ประกาศตารางเวรสำเร็จแล้ว!');
      toast.success('ประกาศตารางเวรสำเร็จแล้ว!');

      // Stamp original_user_id + snapshot user data
      try {
        const rolesToProcess = Array.from(newRoles);
        const { data: staffUsers } = await supabase
          .from('users')
          .select('id, prefix, f_name, l_name, role, pha_id, salary_number, nickname')
          .in('role', rolesToProcess);

        if (staffUsers?.length) {
          const publishedUserIds = staffUsers.map(u => u.id);
          const staffMap = new Map(staffUsers.map(u => [u.id, u]));

          // 1. Stamp original_user_id for un-stamped shifts
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

          // 2. Snapshot user info for all un-snapshotted shifts in this month/roles
          const { data: allMonthShifts } = await supabase
            .from('shifts')
            .select('id, user_id, original_user_id')
            .eq('month_year', monthYear)
            .is('user_snapshot', null);

          // Only snapshot shifts whose original owner belongs to the published roles
          const shiftsToSnapshot = (allMonthShifts || []).filter(s => {
            const origUid = s.original_user_id || s.user_id;
            return publishedUserIds.includes(origUid);
          });

          if (shiftsToSnapshot.length) {
            // Collect any extra user IDs not in staffUsers (e.g. swapped-in users from other roles)
            const extraIds = Array.from(new Set(
              shiftsToSnapshot
                .map(s => s.original_user_id || s.user_id)
                .filter(uid => !staffMap.has(uid))
            ));
            if (extraIds.length) {
              const { data: extraUsers } = await supabase
                .from('users')
                .select('id, prefix, f_name, l_name, role, pha_id, salary_number, nickname')
                .in('id', extraIds);
              extraUsers?.forEach(u => staffMap.set(u.id, u));
            }

            const byOrigUser = new Map<string, string[]>();
            for (const s of shiftsToSnapshot) {
              const uid = s.original_user_id || s.user_id;
              const ids = byOrigUser.get(uid) || [];
              ids.push(s.id);
              byOrigUser.set(uid, ids);
            }
            await Promise.all(
              Array.from(byOrigUser.entries()).map(([uid, ids]) => {
                const u = staffMap.get(uid);
                if (!u) return Promise.resolve();
                const snapshot = {
                  prefix: u.prefix,
                  f_name: u.f_name,
                  l_name: u.l_name,
                  role: u.role,
                  pha_id: u.pha_id,
                  salary_number: u.salary_number,
                  nickname: u.nickname,
                };
                return supabase.from('shifts').update({ user_snapshot: snapshot }).in('id', ids);
              })
            );
          }

          const rolesToNotify = rolesToProcess;
          const now = new Date();
          const timestamp = `วันที่ ${format(now, 'd MMM', { locale: th })} ${(now.getFullYear() + 543).toString().slice(-2)} เวลา ${format(now, 'HH:mm')} น.`;
          const roleNames = rolesToNotify.map(r => ROLE_LABELS[r as UserRole]).join(', ');
          const notifTitle = '📋 ตารางเวรประกาศแล้ว';
          const notifBody = `${currentUser?.f_name || 'ผู้ดูแลระบบ'} ประกาศตารางเวรเดือน ${format(new Date(year, month - 1), 'MMMM', { locale: th })} ${(year + 543).toString().slice(-2)} (${roleNames}) แล้ว — ${timestamp}`;

          fetch('/api/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: publishedUserIds, title: notifTitle, body: notifBody, url: '/calendar', tag: `publish-${monthYear}` }),
          }).catch(() => {});

          insertNotifications(publishedUserIds, 'schedule_published', notifTitle, notifBody);

          if (currentUser?.id && !publishedUserIds.includes(currentUser.id)) {
            const ts2 = `วันที่ ${format(now, 'd MMM', { locale: th })} ${(now.getFullYear() + 543).toString().slice(-2)} เวลา ${format(now, 'HH:mm')} น.`;
            insertNotifications(
              [currentUser.id],
              'schedule_published',
              '📋 คุณประกาศตารางเวรแล้ว',
              `คุณประกาศตารางเวรเดือน ${format(new Date(year, month - 1), 'MMMM', { locale: th })} ${(year + 543).toString().slice(-2)} (${roleNames}) ส่งถึงพนักงาน ${publishedUserIds.length} คน — ${ts2}`,
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
          {isSubAdmin && myRole ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">ตำแหน่งที่ประกาศ</label>
              <div className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-green-400 bg-green-50">
                <div className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 bg-green-500 border-green-500">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
                <span className="text-lg">{ROLE_ICONS[myRole]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800">{ROLE_LABELS[myRole]}</p>
                </div>
                <span className="text-[10px] font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  role ของคุณ
                </span>
              </div>
              <p className="text-xs text-gray-500">sub-admin สามารถประกาศได้เฉพาะตำแหน่งของตัวเอง</p>
            </div>
          ) : (
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
                  const isDone = alreadyPublished.has(role);

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => !isDone && toggleRole(role)}
                      disabled={isDone}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                        isDone
                          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                          : isChecked
                          ? 'border-green-400 bg-green-50 cursor-pointer'
                          : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        isDone
                          ? 'bg-gray-300 border-gray-300'
                          : isChecked
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300'
                      }`}>
                        {(isChecked || isDone) && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>

                      <span className="text-lg">{ROLE_ICONS[role]}</span>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isDone ? 'text-gray-400' : isChecked ? 'text-green-800' : 'text-gray-700'}`}>
                          {ROLE_LABELS[role]}
                        </p>
                      </div>

                      {isDone && (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          ประกาศแล้ว
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
          )}

          {/* Password confirmation */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">รหัสผ่านของคุณ</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && deployRoles.size > 0 && handleDeploy()}
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
            disabled={loading || deployRoles.size === 0 || !password}
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
                {deployRoles.size > 0 && (
                  <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">
                    {deployRoles.size} ตำแหน่ง
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
