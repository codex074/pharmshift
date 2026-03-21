'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, X, Search, Plus } from 'lucide-react';
import type { User, ShiftType } from '@/lib/types';
import { userFullName } from '@/lib/types';
import { cn, shiftsOverlap } from '@/lib/utils';
import { toastError, confirmAction } from '@/lib/swal';

export interface PendingAdd {
  date: string;           // ISO date: "YYYY-MM-DD"
  shift_type: ShiftType;
  department: string;     // department name e.g. 'ER', 'MED'
  department_id: number;
  position: string;
  user: User;
  month_year: string;
}

export interface AddShiftContext {
  date: string;
  shift_type: ShiftType;
  department: string;
  position: string;
}

interface AdminAddShiftModalProps {
  context: AddShiftContext;
  roleGroup: string;
  onClose: () => void;
  onAdd: (add: PendingAdd) => void;
}

export function AdminAddShiftModal({ context, roleGroup, onClose, onAdd }: AdminAddShiftModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', roleGroup)
        .neq('is_active', false)
        .neq('is_readonly', true)
        .order('f_name');

      if (error) {
        toastError('ค้นหารายชื่อผู้ใช้งานล้มเหลว');
      } else {
        setUsers((data as unknown as User[]) || []);
      }
      setLoading(false);
    }
    loadUsers();
  }, [roleGroup]);

  async function handleSelectUser(user: User) {
    // Check for conflicting shifts on the same date
    const { data: existingShifts } = await supabase
      .from('shifts')
      .select('id, shift_type, department:departments(name), position')
      .eq('user_id', user.id)
      .eq('date', context.date);

    if (existingShifts && existingShifts.length > 0) {
      const conflicts = existingShifts.filter(s =>
        shiftsOverlap(s.shift_type as ShiftType, context.shift_type)
      );
      if (conflicts.length > 0) {
        const conflictDesc = conflicts
          .map(s => `${s.shift_type}${(s as any).department?.name ? ` (${(s as any).department.name}${(s as any).position ? `/${(s as any).position}` : ''})` : ''}`)
          .join(', ');
        const ok = await confirmAction({
          title: 'พบเวรซ้อนทับ!',
          text: `${userFullName(user)} มีเวรที่ทับซ้อนกันในวันที่ ${context.date} อยู่แล้ว: ${conflictDesc}\n\nต้องการเพิ่มเวรซ้อนทับหรือไม่?`,
          confirmText: 'เพิ่มต่อไป',
          cancelText: 'ยกเลิก',
          isDanger: true,
        });
        if (!ok) return;
      }
    }

    // Fetch department_id from DB
    const { data: dept } = await supabase
      .from('departments')
      .select('id')
      .eq('name', context.department)
      .single();

    if (!dept) {
      toastError(`ไม่พบแผนก "${context.department}" ในระบบ`);
      return;
    }

    const dateParts = context.date.split('-');
    const monthYear = `${dateParts[0]}-${dateParts[1]}`;

    onAdd({
      date: context.date,
      shift_type: context.shift_type,
      department: context.department,
      department_id: dept.id,
      position: context.position,
      user,
      month_year: monthYear,
    });
  }

  const filteredUsers = users.filter(usr =>
    usr.f_name?.toLowerCase().includes(search.toLowerCase()) ||
    usr.nickname?.toLowerCase().includes(search.toLowerCase()) ||
    usr.l_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Format display
  const deptLabel = context.department || '-';
  const posLabel = context.position ? ` (${context.position})` : '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Plus className="w-5 h-5" />
            เพิ่มเวรใหม่
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="bg-green-50 border border-green-100 p-3 rounded-lg text-sm flex flex-col gap-1">
            <div className="font-medium text-green-900">วันที่ {context.date}</div>
            <div className="text-green-700 text-xs">
              ผลัด: {context.shift_type} | แผนก: {deptLabel}{posLabel}
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหารายชื่อ..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[40vh] border border-gray-100 rounded-xl divide-y">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                ไม่พบรายชื่อในระบบ
              </div>
            ) : (
              filteredUsers.map(usr => (
                <button
                  key={usr.id}
                  onClick={() => handleSelectUser(usr)}
                  className="w-full text-left px-4 py-3 hover:bg-green-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-sm text-gray-800">{userFullName(usr)} {usr.nickname ? `(${usr.nickname})` : ''}</div>
                  </div>
                  <Plus className="w-4 h-4 text-green-500" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
