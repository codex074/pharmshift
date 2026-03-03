'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, X, Search } from 'lucide-react';
import type { Shift, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toastError } from '@/lib/swal';

interface AdminShiftSubstituteModalProps {
  shift: Shift;
  onClose: () => void;
  onSelectSubstitute: (user: User) => void;
}

export function AdminShiftSubstituteModal({ shift, onClose, onSelectSubstitute }: AdminShiftSubstituteModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const currentRole = (shift as any).user_role || shift.user?.role || 'pharmacist'; // fallback to pharmacist if needed

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', currentRole)
        .order('name');
        
      if (error) {
        toastError('ค้นหารายชื่อผู้ใช้งานล้มเหลว');
      } else {
        setUsers((data as unknown as User[]) || []);
      }
      setLoading(false);
    }
    loadUsers();
  }, [currentRole]);

  const filteredUsers = users.filter(usr => 
    usr.name?.toLowerCase().includes(search.toLowerCase()) || 
    usr.nickname?.toLowerCase().includes(search.toLowerCase()) || 
    usr.fullname?.toLowerCase().includes(search.toLowerCase())
  );

  const currentUserText = (shift as any).user_name || shift.user?.name || shift.user_id;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            เปลี่ยนผู้มีเวรแทน
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/20 text-white/80 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-sm flex flex-col gap-1">
            <div className="font-medium">แก้ไขเวรวันที่ {shift.date}</div>
            <div className="text-gray-500 text-xs">แผนก/ผลัด: {shift.shift_type} {(shift as any).department_name || ''}</div>
            <div className="text-gray-500 text-xs mt-1">
              เจ้าของเวรเดิม: <span className="text-slate-700 font-semibold">{currentUserText}</span>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="ค้นหารายชื่อ..."
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
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
                    onClick={() => onSelectSubstitute(usr)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-violet-50 transition-colors flex items-center justify-between",
                      usr.id === shift.user_id && "opacity-50 cursor-not-allowed bg-gray-50"
                    )}
                    disabled={usr.id === shift.user_id}
                  >
                    <div>
                      <div className="font-medium text-sm text-gray-800">{usr.name} {usr.nickname ? `(${usr.nickname})` : ''}</div>
                      {usr.fullname && <div className="text-xs text-gray-500">{usr.fullname}</div>}
                    </div>
                    {usr.id === shift.user_id && <span className="text-[10px] text-gray-400 font-medium">ปัจจุบัน</span>}
                  </button>
                ))
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
