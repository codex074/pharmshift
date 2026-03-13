'use client';

import { useState, useEffect } from 'react';
import { X, History, ArrowRightLeft, Calendar, Loader2, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format, subDays } from 'date-fns';
import { th } from 'date-fns/locale';
import type { ShiftLog, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ShiftLogsModalProps {
  currentUser: User | null;
  onClose: () => void;
}

export function ShiftLogsModal({ currentUser, onClose }: ShiftLogsModalProps) {
  const [logs, setLogs] = useState<ShiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);

  // For Admin, toggle to see ALL history vs OWN history
  const [viewAll, setViewAll] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    async function fetchLogs() {
      setLoading(true);
      try {
        // Run cleanup for records older than 60 days
        const sixtyDaysAgo = subDays(new Date(), 60).toISOString();
        
        let deleteQuery = supabase
          .from('shift_logs')
          .delete()
          .lt('created_at', sixtyDaysAgo);
          
        if (currentUser?.role !== 'admin') {
           deleteQuery = deleteQuery.or(`old_user_id.eq.${currentUser?.id},new_user_id.eq.${currentUser?.id}`);
        }
        
        // We don't await this so it doesn't block UI loading. Send it in background.
        deleteQuery.then(({ error }) => {
          if (error) console.error("Error cleaning up old history:", error);
        });

        // Now fetch history
        let query = supabase
          .from('shift_logs')
          .select(`
            *,
            shift:shifts(id, date, shift_type, department:departments(id, name)),
            old_user:users!shift_logs_old_user_id_fkey(id, name, nickname),
            new_user:users!shift_logs_new_user_id_fkey(id, name, nickname),
            performer:users!shift_logs_performed_by_fkey(id, name, nickname)
          `)
          .order('created_at', { ascending: false })
          .limit(200);

        if (currentUser?.role !== 'admin' || !viewAll) {
          query = query.or(`old_user_id.eq.${currentUser?.id},new_user_id.eq.${currentUser?.id}`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setLogs(data as ShiftLog[] || []);
      } catch (err) {
        toast.error('ไม่สามารถโหลดประวัติได้');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
    setVisibleCount(10);
  }, [currentUser, viewAll]);

  function renderActionIcon(action: string) {
    switch (action) {
      case 'swap':
      case 'transfer':
        return <ArrowRightLeft className="w-4 h-4 text-blue-600" />;
      case 'admin_edit':
        return <Edit className="w-4 h-4 text-orange-600" />;
      case 'admin_delete':
        return <Trash2 className="w-4 h-4 text-red-600" />;
      default:
        return <History className="w-4 h-4 text-gray-600" />;
    }
  }

  function renderActionLabel(action: string) {
    switch (action) {
      case 'swap':
        return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">แลกเวร</span>;
      case 'transfer':
        return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">ยก/ขายเวร</span>;
      case 'admin_edit':
        return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-700">Admin แก้ไข</span>;
      case 'admin_delete':
        return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700">Admin ลบเวร</span>;
      default:
        return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-50 text-gray-700">{action}</span>;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative glass-card rounded-2xl shadow-2xl w-full max-w-md animate-fade-in max-h-[85vh] flex flex-col bg-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <History className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">ประวัติการแลกเวรและการแก้ไข</h2>
              <p className="text-[10px] text-gray-400 leading-tight">เก็บประวัติย้อนหลัง 60 วัน</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentUser?.role === 'admin' && (
          <div className="px-4 pt-3 flex items-center justify-end">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
              <input 
                type="checkbox" 
                checked={viewAll} 
                onChange={(e) => setViewAll(e.target.checked)} 
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              ดูประวัติของทุกคน (Admin)
            </label>
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-sm text-gray-500">กำลังโหลดประวัติ...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <History className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600">ไม่มีประวัติ</p>
              <p className="text-[10px] text-gray-400 mt-1">ยังไม่มีการแก้ไขหรือแลกเวรในช่วงที่ผ่านมา</p>
            </div>
          ) : (
            logs.slice(0, visibleCount).map((log) => {
              const shiftDate = log.shift?.date ? new Date(log.shift.date + 'T00:00:00') : null;
              const deptName = (log.shift?.department as any)?.name || '';
              
              const oldUserLabel = log.old_user?.nickname || log.old_user?.name || '-';
              const newUserLabel = log.new_user?.nickname || log.new_user?.name || '-';
              const performerLabel = log.performer?.nickname || log.performer?.name || '-';

              return (
                <div key={log.id} className="rounded-xl border border-gray-100 bg-white p-3 space-y-2 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all hover:border-indigo-100 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      
                      <div className="flex items-center gap-2 w-full flex-wrap">
                        {renderActionLabel(log.action)}
                        
                        {(log.action === 'swap' || log.action === 'transfer' || log.action === 'admin_edit') && (
                          <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5 flex-wrap">
                            <span className={cn(log.old_user_id === currentUser?.id ? 'text-indigo-600 font-bold' : 'text-gray-600')}>{oldUserLabel}</span>
                            <ArrowRightLeft className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className={cn(log.new_user_id === currentUser?.id ? 'text-indigo-600 font-bold' : 'text-gray-800')}>{newUserLabel}</span>
                          </p>
                        )}
                        {log.action === 'admin_delete' && (
                          <p className="text-sm font-medium text-red-600">
                            ลบเวรของ {oldUserLabel}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 w-full bg-slate-50 rounded-lg p-2 border border-slate-100">
                        {shiftDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span className="font-medium text-slate-700 text-xs">
                              {format(shiftDate, 'd MMM yy', { locale: th })} {log.shift?.shift_type} ({deptName})
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-500 text-xs italic">เวรถูกลบไปแล้ว</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-4 items-end pt-1">
                        <div className="flex-1">
                          {log.details && (
                            <p className="text-[10px] text-gray-500 leading-tight">
                              {log.details}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            ดำเนินการโดย: {performerLabel}
                          </p>
                        </div>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1 shrink-0">
                          <History className="w-3 h-3" />
                          {log.created_at ? format(new Date(log.created_at), 'd MMM HH:mm', { locale: th }) : ''}
                        </p>
                      </div>

                    </div>
                    
                    <div className="shrink-0 p-1.5 bg-gray-50 rounded-lg border border-gray-100">
                      {renderActionIcon(log.action)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {logs.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(c => c + 10)}
              className="w-full py-2.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 hover:bg-indigo-50 rounded-xl transition-colors border border-indigo-100"
            >
              โหลดเพิ่มเติม ({logs.length - visibleCount} รายการ)
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-100 hover:text-gray-900 transition-all bg-white shadow-sm"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
