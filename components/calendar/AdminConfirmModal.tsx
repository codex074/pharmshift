'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { toastError, toastSuccess } from '@/lib/swal';
import { Loader2, X, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { Shift, ShiftType, User } from '@/lib/types';
import { userFullName, userDisplayName } from '@/lib/types';
import { insertNotifications } from '@/lib/notifyUsers';
import { shiftsOverlap } from '@/lib/utils';
import type { PendingAdd } from './AdminAddShiftModal';

async function pushAdminChange(userIds: string[], title: string, body: string) {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: ids, title, body, url: '/calendar', tag: 'admin-shift-change' }),
  }).catch(() => {});
}

interface AdminConfirmModalProps {
  pendingDeletes: Set<string>;
  pendingEdits: Record<string, User>;
  pendingAdds: PendingAdd[];
  allShifts: Shift[];
  currentUser: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AdminConfirmModal({ pendingDeletes, pendingEdits, pendingAdds, allShifts, currentUser, onClose, onSuccess }: AdminConfirmModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const deletes = Array.from(pendingDeletes).map(id => allShifts.find(s => s.id === id)).filter(Boolean) as Shift[];
  const edits = Object.keys(pendingEdits).map(id => ({
    shift: allShifts.find(s => s.id === id) as Shift,
    newUser: pendingEdits[id],
  })).filter(e => e.shift && e.newUser);

  /** Check if a pending-add conflicts with existing shifts or other pending adds */
  function getPendingAddConflicts(add: PendingAdd, addIdx: number): string[] {
    const conflicts: string[] = [];
    // Against already-loaded shifts
    const existing = allShifts.filter(
      s => s.user_id === add.user.id &&
           s.date === add.date &&
           shiftsOverlap(s.shift_type as ShiftType, add.shift_type)
    );
    for (const s of existing) {
      conflicts.push(`${s.shift_type}${(s as any).department_name ? ` (${(s as any).department_name})` : ''}`);
    }
    // Against other pending adds for the same user/date
    pendingAdds.forEach((other, i) => {
      if (i !== addIdx && other.user.id === add.user.id && other.date === add.date &&
          shiftsOverlap(other.shift_type, add.shift_type)) {
        conflicts.push(`${other.shift_type} (${other.department}) [รายการที่ ${i + 1}]`);
      }
    });
    return conflicts;
  }

  /** Check if a pending-edit would give the new user a conflicting shift */
  function getPendingEditConflicts(shiftId: string, newUser: User): string[] {
    const shift = allShifts.find(s => s.id === shiftId);
    if (!shift) return [];
    const conflicts = allShifts.filter(
      s => s.user_id === newUser.id &&
           s.date === shift.date &&
           s.id !== shiftId &&
           shiftsOverlap(s.shift_type as ShiftType, shift.shift_type as ShiftType)
    );
    return conflicts.map(s => `${s.shift_type}${(s as any).department_name ? ` (${(s as any).department_name})` : ''}`);
  }

  async function handleConfirm() {
    if (!password) { toastError('กรุณากรอกรหัสผ่าน'); return; }
    if (currentUser?.password && currentUser.password !== password) {
      toastError('รหัสผ่านไม่ถูกต้อง'); return;
    }
    setLoading(true);
    const now = new Date();
    const timestamp = `วันที่ ${format(now, 'd MMM', { locale: th })} ${(now.getFullYear() + 543).toString().slice(-2)} เวลา ${format(now, 'HH:mm')} น.`;
    const adminName = currentUser?.f_name || 'ผู้ดูแลระบบ';
    /** Format shift date "2025-03-20" → "20 มี.ค." */
    const fmtDate = (d: string) => {
      try { return format(new Date(d + 'T00:00'), 'd MMM', { locale: th }); }
      catch { return d; }
    };
    /** Format one shift line: "20 มี.ค. เช้า (แผนก OPD)" */
    const fmtShift = (date: string, shiftType: string, dept?: string) =>
      `${fmtDate(date)} ${shiftType}${dept ? ` (${dept})` : ''}`;
    /** Format for push: "เวรบ่าย MED วันที่ 26 มี.ค. 69" */
    const fmtShiftPush = (date: string, shiftType: string, dept?: string) => {
      try {
        const d = new Date(date + 'T00:00');
        const year = (d.getFullYear() + 543).toString().slice(-2);
        return `เวร${shiftType}${dept ? ` ${dept}` : ''} วันที่ ${format(d, 'd MMM', { locale: th })} ${year}`;
      } catch { return `เวร${shiftType}`; }
    };
    try {
      // ── Prefetch published status for all affected month_years ──────────
      const allMonthYears = new Set<string>();
      deletes.forEach(s => s.month_year && allMonthYears.add(s.month_year));
      edits.forEach(e => e.shift.month_year && allMonthYears.add(e.shift.month_year));
      pendingAdds.forEach(a => a.month_year && allMonthYears.add(a.month_year));

      const publishedMap: Record<string, any> = {};
      if (allMonthYears.size > 0) {
        const { data: pubData } = await supabase
          .from('published_months')
          .select('month_year, is_published, pharmacist_published, pharmacy_technician_published, officer_published')
          .in('month_year', Array.from(allMonthYears));
        (pubData || []).forEach((p: any) => { publishedMap[p.month_year] = p; });
      }

      /** ส่ง push เฉพาะเดือนที่ประกาศแล้วเท่านั้น */
      const isPublished = (monthYear: string, role?: string): boolean => {
        const pub = publishedMap[monthYear];
        if (!pub) return false;
        if (pub.is_published) return true;
        if (role === 'pharmacist') return pub.pharmacist_published ?? false;
        if (role === 'pharmacy_technician') return pub.pharmacy_technician_published ?? false;
        if (role === 'officer') return pub.officer_published ?? false;
        return false;
      };
      // ────────────────────────────────────────────────────────────────────

      // 1. Delete shifts
      if (deletes.length > 0) {
        const delIds = deletes.map(s => s.id);
        const { error: delError } = await supabase.from('shifts').delete().in('id', delIds);
        if (delError) throw delError;

        // In-app + push notification per user — only if month is published
        const deletesByUser = new Map<string, typeof deletes>();
        deletes
          .filter(s => s.month_year && isPublished(s.month_year, (s.user as any)?.role))
          .forEach(s => {
            if (!s.user_id) return;
            const list = deletesByUser.get(s.user_id) || [];
            list.push(s);
            deletesByUser.set(s.user_id, list);
          });
        deletesByUser.forEach((shifts, userId) => {
          const details = shifts.map(s => fmtShift(s.date, s.shift_type as string, (s as any).department_name)).join(', ');
          insertNotifications(
            [userId],
            'shift_removed',
            '🗑️ เวรของคุณถูกลบ',
            `${adminName} ได้ลบเวรของคุณ: ${details} — ${timestamp}`,
          );
          const pushDetail = shifts.length === 1
            ? fmtShiftPush(shifts[0].date, shifts[0].shift_type as string, (shifts[0] as any).department_name)
            : `เวร ${shifts.length} รายการ`;
          pushAdminChange([userId], '🗑️ เวรของคุณถูกลบ', `${adminName} ได้ลบ${pushDetail} ออกจากตารางของคุณ`);
        });
      }

      // 2. Edit shifts (change owner)
      if (edits.length > 0) {
        const promises = edits.map(async (e) => {
          const { error } = await supabase.from('shifts')
            .update({ user_id: e.newUser.id })
            .eq('id', e.shift.id);
          if (error) throw error;
        });
        await Promise.all(promises);

        // In-app + push notifications per user — only if month is published
        const editsByOldOwner = new Map<string, typeof edits>();
        const editsByNewOwner = new Map<string, typeof edits>();
        edits
          .filter(e => e.shift.month_year && isPublished(e.shift.month_year, (e.shift.user as any)?.role))
          .forEach(e => {
            if (e.shift.user_id) {
              const list = editsByOldOwner.get(e.shift.user_id) || [];
              list.push(e);
              editsByOldOwner.set(e.shift.user_id, list);
            }
            if (e.newUser.id) {
              const list = editsByNewOwner.get(e.newUser.id) || [];
              list.push(e);
              editsByNewOwner.set(e.newUser.id, list);
            }
          });
        editsByOldOwner.forEach((items, userId) => {
          const details = items.map(e => fmtShift(e.shift.date, e.shift.shift_type as string, (e.shift as any).department_name)).join(', ');
          insertNotifications(
            [userId],
            'shift_changed',
            '🔄 เวรของคุณถูกเปลี่ยนแปลง',
            `${adminName} ได้เปลี่ยนผู้อยู่เวรของคุณไปให้คนอื่น: ${details} — ${timestamp}`,
          );
          const pushDetail = items.length === 1
            ? fmtShiftPush(items[0].shift.date, items[0].shift.shift_type as string, (items[0].shift as any).department_name)
            : `เวร ${items.length} รายการ`;
          pushAdminChange([userId], '🔄 เวรของคุณถูกเปลี่ยนแปลง', `${adminName} ได้โอน${pushDetail} ให้คนอื่น`);
        });
        editsByNewOwner.forEach((items, userId) => {
          const details = items.map(e => fmtShift(e.shift.date, e.shift.shift_type as string, (e.shift as any).department_name)).join(', ');
          insertNotifications(
            [userId],
            'shift_assigned',
            '📋 คุณได้รับมอบหมายเวรใหม่',
            `${adminName} ได้มอบหมายเวรให้คุณ: ${details} — ${timestamp}`,
          );
          const pushDetail = items.length === 1
            ? fmtShiftPush(items[0].shift.date, items[0].shift.shift_type as string, (items[0].shift as any).department_name)
            : `เวร ${items.length} รายการ`;
          pushAdminChange([userId], '📋 คุณได้รับมอบหมายเวรใหม่', `${adminName} ได้มอบหมาย${pushDetail} ให้คุณ`);
        });
      }

      // 3. Insert new shifts
      if (pendingAdds.length > 0) {
        const insertRecords = pendingAdds.map(add => ({
          date: add.date,
          department_id: add.department_id,
          shift_type: add.shift_type,
          position: add.position || null,
          user_id: add.user.id,
          // Set original_user_id only if month is already published (post-publish admin add)
          original_user_id: isPublished(add.month_year, add.user.role as any) ? add.user.id : null,
          month_year: add.month_year,
        }));
        const { error: insertError } = await supabase.from('shifts').insert(insertRecords);
        if (insertError) throw insertError;

        // In-app + push notifications per user — only if month is published
        const addsByUser = new Map<string, PendingAdd[]>();
        pendingAdds
          .filter(a => isPublished(a.month_year, a.user.role as any))
          .forEach(add => {
            if (!add.user.id) return;
            const list = addsByUser.get(add.user.id) || [];
            list.push(add);
            addsByUser.set(add.user.id, list);
          });
        addsByUser.forEach((adds, userId) => {
          const details = adds.map(a => fmtShift(a.date, a.shift_type, a.department)).join(', ');
          insertNotifications(
            [userId],
            'shift_assigned',
            '📋 คุณได้รับมอบหมายเวรใหม่',
            `${adminName} ได้มอบหมายเวรให้คุณ: ${details} — ${timestamp}`,
          );
          const pushDetail = adds.length === 1
            ? fmtShiftPush(adds[0].date, adds[0].shift_type, adds[0].department)
            : `เวร ${adds.length} รายการ`;
          pushAdminChange([userId], '📋 คุณได้รับมอบหมายเวรใหม่', `${adminName} ได้มอบหมาย${pushDetail} ให้คุณ`);
        });
      }

      // ── Summary notification → Admin + all affected users ──────────────
      if (currentUser?.id) {
        const summaryLines: string[] = [];
        const allAffectedIds = new Set<string>();

        if (deletes.length > 0) {
          deletes.forEach(s => {
            const ownerName = (s as any).user_f_name || s.user?.f_name || 'ไม่ทราบชื่อ';
            summaryLines.push(`🗑️ ลบเวร ${ownerName}: ${fmtShift(s.date, s.shift_type as string, (s as any).department_name)}`);
            // Only add to affected list if month is published (for user notifications)
            if (s.user_id && s.month_year && isPublished(s.month_year, (s.user as any)?.role)) allAffectedIds.add(s.user_id);
          });
        }

        if (edits.length > 0) {
          edits.forEach(e => {
            const oldName = (e.shift as any).user_f_name || e.shift.user?.f_name || 'ไม่ทราบชื่อ';
            const newName = userDisplayName(e.newUser);
            summaryLines.push(`🔄 เปลี่ยนเวร ${oldName} → ${newName}: ${fmtShift(e.shift.date, e.shift.shift_type as string, (e.shift as any).department_name)}`);
            const pub = e.shift.month_year && isPublished(e.shift.month_year, (e.shift.user as any)?.role);
            if (pub) {
              if (e.shift.user_id) allAffectedIds.add(e.shift.user_id);
              if (e.newUser.id) allAffectedIds.add(e.newUser.id);
            }
          });
        }

        if (pendingAdds.length > 0) {
          pendingAdds.forEach(a => {
            const userName = userDisplayName(a.user);
            summaryLines.push(`📋 เพิ่มเวร ${userName}: ${fmtShift(a.date, a.shift_type, a.department)}`);
            if (a.user.id && isPublished(a.month_year, a.user.role as any)) allAffectedIds.add(a.user.id);
          });
        }

        if (summaryLines.length > 0) {
          // Include admin in recipient list
          allAffectedIds.add(currentUser.id);
          const recipientIds = Array.from(allAffectedIds).filter(Boolean);
          const summaryBody = `${adminName} ได้จัดการเวร ${summaryLines.length} รายการ:\n${summaryLines.join('\n')}\n— ${timestamp}`;
          insertNotifications(
            recipientIds,
            'shift_changed',
            `📝 สรุปการจัดการเวร (${summaryLines.length} รายการ)`,
            summaryBody,
          );
        }
      }
      // ────────────────────────────────────────────────────────────────────

      toastSuccess('บันทึกการเปลี่ยนแปลงสำเร็จ');
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toastError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm shadow-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            สรุปการแก้ไข/ลบ ตารางเวร
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {edits.length === 0 && deletes.length === 0 && pendingAdds.length === 0 && (
            <p className="text-gray-500 text-center py-4">ไม่มีรายการรอเปลี่ยนแปลง</p>
          )}

          {/* Pending Adds Section */}
          {pendingAdds.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-green-800 border-b pb-1">รายการเพิ่มเวรใหม่ ({pendingAdds.length})</h3>
              <ul className="space-y-1 text-sm">
                {pendingAdds.map((add, idx) => {
                  const addConflicts = getPendingAddConflicts(add, idx);
                  return (
                    <li key={idx} className={`flex flex-col p-2 rounded border ${addConflicts.length > 0 ? 'bg-yellow-50 border-yellow-300 text-yellow-900' : 'bg-green-50 border-green-100 text-green-900'}`}>
                      <span className="font-medium flex items-center gap-1">
                        {addConflicts.length > 0 && <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 shrink-0" />}
                        {add.date} | {add.shift_type} | {add.department}{add.position ? ` (${add.position})` : ''}
                      </span>
                      <span className="text-xs">
                        ผู้มีเวร: <span className="font-bold">{userFullName(add.user)} {add.user.nickname ? `(${add.user.nickname})` : ''}</span>
                      </span>
                      {addConflicts.length > 0 && (
                        <span className="text-xs text-yellow-700 mt-0.5">
                          ⚠️ ซ้อนทับกับเวรที่มีอยู่: {addConflicts.join(', ')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {edits.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-800 border-b pb-1">รายการเปลี่ยนคนอยู่เวร ({edits.length})</h3>
              <ul className="space-y-1 text-sm">
                {edits.map((e, idx) => {
                  const shiftName = (e.shift as any).user_f_name || e.shift.user?.f_name || e.shift.user_id;
                  const editConflicts = getPendingEditConflicts(e.shift.id, e.newUser);
                  return (
                    <li key={idx} className={`flex flex-col p-2 rounded border ${editConflicts.length > 0 ? 'bg-yellow-50 border-yellow-300 text-yellow-900' : 'bg-indigo-50 border-indigo-100 text-indigo-900'}`}>
                      <span className="font-medium flex items-center gap-1">
                        {editConflicts.length > 0 && <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 shrink-0" />}
                        {e.shift.date} | {e.shift.shift_type} | {(e.shift as any).department_name || ''}
                      </span>
                      <span className="text-xs">
                        จาก : <span className="line-through text-gray-400 mr-2">{shiftName}</span>
                        ไปหา : <span className="font-bold">{userFullName(e.newUser)}</span>
                      </span>
                      {editConflicts.length > 0 && (
                        <span className="text-xs text-yellow-700 mt-0.5">
                          ⚠️ {userFullName(e.newUser)} มีเวรซ้อนทับในวันนั้นอยู่แล้ว: {editConflicts.join(', ')}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {deletes.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-red-800 border-b pb-1">รายการลบเวร ({deletes.length})</h3>
              <ul className="space-y-1 text-sm">
                {deletes.map((s, idx) => {
                  const shiftName = (s as any).user_f_name || s.user?.f_name || s.user_id;
                  return (
                    <li key={idx} className="flex flex-col p-2 bg-red-50 rounded text-red-900 border border-red-100">
                      <span className="font-medium text-red-700">{s.date} | {s.shift_type} | {(s as any).department_name || ''}</span>
                      <span className="text-xs">เจ้าของเวร : {shiftName}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-gray-100">
            <div className="bg-amber-50 text-amber-800 p-2.5 rounded-lg text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>การเปลี่ยนแปลงจะมีผลทันที — จะแจ้งเตือนผู้ที่ได้รับผลกระทบเฉพาะเดือนที่ประกาศแล้วเท่านั้น</span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">รหัสผ่านของคุณ</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                  className="w-full border border-gray-300 rounded-lg text-sm px-3 py-2 pr-10 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="ป้อนรหัสผ่าน"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t px-5 py-4 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !password}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            ยืนยันการเปลี่ยนแปลง
          </button>
        </div>
      </div>
    </div>
  );
}
