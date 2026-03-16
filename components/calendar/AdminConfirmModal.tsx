'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toastError, toastSuccess } from '@/lib/swal';
import { Loader2, X, AlertCircle, AlertTriangle } from 'lucide-react';
import type { Shift, ShiftType, User } from '@/lib/types';
import { userFullName } from '@/lib/types';
import { shiftsOverlap } from '@/lib/utils';
import type { PendingAdd } from './AdminAddShiftModal';

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
  const [passwordConfirm, setPasswordConfirm] = useState('');
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
    if (!password || password !== passwordConfirm) {
      toastError('รหัสผ่านไม่ตรงกัน หรือยังไม่ได้กรอก');
      return;
    }
    
    // Minimal password check locally for safety if available, else omit
    if (currentUser?.password && currentUser.password !== password) {
       toastError('รหัสผ่านไม่ถูกต้อง');
       return;
    }

    setLoading(true);

    try {
      // 1. Delete shifts
      if (deletes.length > 0) {
        const delIds = deletes.map(s => s.id);

        const logs = deletes.map(s => ({
          shift_id: s.id,
          action: 'admin_delete',
          old_user_id: s.user_id,
          performed_by: currentUser?.id,
          details: `Admin deleted shift: ${s.date} ${s.shift_type}`,
        }));
        await supabase.from('shift_logs').insert(logs);

        const { error: delError } = await supabase.from('shifts').delete().in('id', delIds);
        if (delError) throw delError;
      }

      // 2. Edit shifts & trigger notifications if applicable
      if (edits.length > 0) {
        // Run updates in parallel
        const promises = edits.map(async (e) => {
           const { error } = await supabase.from('shifts')
               .update({ user_id: e.newUser.id })
               .eq('id', e.shift.id);
           if (error) throw error;
           
           // Log edit
           await supabase.from('shift_logs').insert({
             shift_id: e.shift.id,
             action: 'admin_edit',
             old_user_id: e.shift.user_id,
             new_user_id: e.newUser.id,
             performed_by: currentUser?.id,
             details: 'Admin changed shift owner',
           });
        });
        await Promise.all(promises);
      }

      // 3. Insert new shifts
      if (pendingAdds.length > 0) {
        const insertRecords = pendingAdds.map(add => ({
          date: add.date,
          department_id: add.department_id,
          shift_type: add.shift_type,
          position: add.position || null,
          user_id: add.user.id,
          month_year: add.month_year,
        }));

        const { error: insertError } = await supabase.from('shifts').insert(insertRecords);
        if (insertError) throw insertError;

        // Log each addition
        const addLogs = pendingAdds.map(add => ({
          shift_id: null as any, // shift doesn't have an id yet
          action: 'admin_edit',
          new_user_id: add.user.id,
          performed_by: currentUser?.id,
          details: `Admin added new shift: ${add.date} ${add.shift_type} ${add.department}`,
        }));
        // Only insert logs that are valid (shift_id can be null for new shifts)
        // Use shift_logs without shift_id reference since we don't have the new shift id
        try {
          await supabase.from('shift_logs').insert(addLogs);
        } catch {
          // ignore log errors — not critical
        }
      }

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

          <div className="space-y-3 pt-4 border-t border-gray-100">
            <div className="bg-orange-50 text-orange-800 p-2.5 rounded-lg text-xs flex gap-2">
               <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
               <span>กรุณายืนยันการเปลี่ยนแปลงด้วยรหัสผ่านของคุณ 2 รอบ (เพื่อป้องกันข้อผิดพลาด)</span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">รหัสผ่าน (รอบที่ 1)</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full mt-1 border-gray-300 rounded-lg text-sm px-3 py-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="ป้อนรหัสผ่าน"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">ยืนยันรหัสผ่าน (รอบที่ 2)</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                className="w-full mt-1 border-gray-300 rounded-lg text-sm px-3 py-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="ป้อนรหัสผ่าน อีกครั้ง"
              />
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
            disabled={loading || !password || !passwordConfirm}
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
