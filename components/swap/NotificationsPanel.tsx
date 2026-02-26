'use client';

import { X, Check, Ban, Bell, ArrowRightLeft, Calendar, Moon, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import type { SwapRequest, User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NotificationsPanelProps {
  swapRequests: SwapRequest[];
  currentUser: User | null;
  pendingCount: number;
  onAccept: (req: SwapRequest) => Promise<void>;
  onReject: (swapId: string) => Promise<void>;
  onClose: () => void;
}

function statusBadge(status: string) {
  if (status === 'accepted')  return <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ยอมรับ</span>;
  if (status === 'rejected')  return <span className="text-[10px] font-semibold text-red-500   bg-red-50   px-2 py-0.5 rounded-full">ปฏิเสธ</span>;
  return <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">รอดำเนินการ</span>;
}

export function NotificationsPanel({
  swapRequests, currentUser, pendingCount, onAccept, onReject, onClose,
}: NotificationsPanelProps) {

  async function handleAccept(req: SwapRequest) {
    try {
      await onAccept(req);
      toast.success('ยอมรับคำขอเรียบร้อย');
    } catch {
      toast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    }
  }

  async function handleReject(req: SwapRequest) {
    try {
      await onReject(req.id);
      toast.info('ปฏิเสธคำขอแลกเวรแล้ว');
    } catch {
      toast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Panel */}
      <div className="relative glass-card rounded-2xl shadow-2xl w-full max-w-sm animate-slide-in max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-violet-600" />
            <h2 className="font-semibold text-gray-900 text-sm">การแจ้งเตือน</h2>
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {swapRequests.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">ไม่มีการแจ้งเตือน</p>
            </div>
          ) : (
            swapRequests.map((req) => {
              const shift = req.shift as any;
              const requester = req.requester as any;
              const targetUser = req.target_user as any;
              const deptName = shift?.department?.name || '';
              const shiftDate = shift?.date ? new Date(shift.date + 'T00:00:00') : null;
              const isIncoming = req.target_user_id === currentUser?.id && req.status === 'pending';

              return (
                <div
                  key={req.id}
                  className={cn(
                    'rounded-xl border p-3 space-y-2 transition-all',
                    isIncoming ? 'border-violet-200 bg-violet-50/50' : 'border-gray-100 bg-white'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 w-full">
                        <ArrowRightLeft className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <p className="text-xs font-medium text-gray-800 truncate">
                          {requester?.nickname || requester?.name}
                          <span className="text-gray-400 font-normal"> → </span>
                          {targetUser?.nickname || targetUser?.name}
                        </p>
                        <span className="ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                          {req.request_type === 'swap' ? 'แลกเวร' : 'ขาย/ยกเวร'}
                        </span>
                      </div>

                      {shiftDate && (
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded">
                            <Calendar className="w-2.5 h-2.5" />
                            {format(shiftDate, 'd MMM', { locale: th })} {shift?.shift_type} ({deptName})
                          </span>
                          {req.request_type === 'swap' && req.target_shift && (
                            <>
                              <ArrowRightLeft className="w-2.5 h-2.5 text-gray-300" />
                              <span className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded">
                                <Calendar className="w-2.5 h-2.5" />
                                {format(new Date(req.target_shift.date + 'T00:00:00'), 'd MMM', { locale: th })} {req.target_shift.shift_type} ({(req.target_shift.department as any)?.name || ''})
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {req.message && (
                        <p className="text-[10px] text-gray-400 italic">"{req.message}"</p>
                      )}
                    </div>
                    {statusBadge(req.status)}
                  </div>

                  {/* Action buttons — only for incoming, pending requests */}
                  {isIncoming && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleAccept(req)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-all"
                      >
                        <Check className="w-3 h-3" /> ยอมรับ
                      </button>
                      <button
                        onClick={() => handleReject(req)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold transition-all"
                      >
                        <Ban className="w-3 h-3" /> ปฏิเสธ
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
