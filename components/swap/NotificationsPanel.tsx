'use client';

import { useEffect, useState } from 'react';
import { X, Check, Ban, Bell, ArrowRightLeft, Calendar, Moon, Sun, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import type { SwapRequest, User } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NotificationsPanelProps {
  swapRequests: SwapRequest[];
  currentUser: User | null;
  pendingCount: number;
  onAccept: (req: SwapRequest, force?: boolean) => Promise<{ collision?: string } | void>;
  onReject: (swapId: string) => Promise<void>;
  onOpen?: () => void;
  onClose: () => void;
}

function statusBadge(status: string) {
  if (status === 'accepted')  return <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ยอมรับ</span>;
  if (status === 'rejected')  return <span className="text-[10px] font-semibold text-red-500   bg-red-50   px-2 py-0.5 rounded-full">ปฏิเสธ</span>;
  return <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">รอดำเนินการ</span>;
}

export function NotificationsPanel({
  swapRequests, currentUser, pendingCount, onAccept, onReject, onOpen, onClose,
}: NotificationsPanelProps) {

  const [visibleCount, setVisibleCount] = useState(10);
  const [collisionReqId, setCollisionReqId] = useState<string | null>(null);
  const [collisionMsg, setCollisionMsg] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Mark requester results as read when panel opens
  useEffect(() => {
    if (onOpen) onOpen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept(req: SwapRequest, force = false) {
    setProcessingId(req.id);
    try {
      const result = await onAccept(req, force);
      if (result && 'collision' in result && result.collision) {
        // Collision detected — show confirm in-place
        setCollisionReqId(req.id);
        setCollisionMsg(result.collision);
        setProcessingId(null);
        return;
      }
      setCollisionReqId(null);
      setCollisionMsg('');
      toast.success('ยอมรับคำขอเรียบร้อย');
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleForceAccept(req: SwapRequest) {
    setProcessingId(req.id);
    try {
      await onAccept(req, true);
      setCollisionReqId(null);
      setCollisionMsg('');
      toast.success('ยอมรับคำขอเรียบร้อย');
      toast.warning('⚠️ มีเวรทับซ้อนในช่วงเวลาเดียวกัน กรุณาจัดการเวรที่ซ้อนกัน', {
        duration: 8000,
      });
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(req: SwapRequest) {
    setProcessingId(req.id);
    try {
      await onReject(req.id);
      toast.info('ปฏิเสธคำขอแล้ว');
    } catch {
      toast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:justify-end p-0 sm:p-4 sm:pt-16">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 sm:bg-transparent" onClick={onClose} />

      {/* Panel */}
      <div className="relative glass-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-slide-up sm:animate-slide-in max-h-[85vh] sm:max-h-[80vh] flex flex-col">
        {/* Mobile drag indicator */}
        <div className="sm:hidden w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />
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
            swapRequests.slice(0, visibleCount).map((req) => {
              const shift = req.shift as any;
              const requester = req.requester as any;
              const targetUser = req.target_user as any;
              const deptName = shift?.department?.name || '';
              const shiftDate = shift?.date ? new Date(shift.date + 'T00:00:00') : null;
              const isIncoming = req.target_user_id === currentUser?.id && req.status === 'pending';
              const isUnreadResult = req.requester_id === currentUser?.id && (req.status === 'accepted' || req.status === 'rejected') && req.requester_read === false;
              const isProcessing = processingId === req.id;
              const showCollisionConfirm = collisionReqId === req.id;

              // Determine arrow direction: เจ้าของเวรเดิม → คนใหม่
              const leftName = req.request_type === 'swap'
                ? (requester?.nickname || requester?.f_name)   // swap: requester เป็นเจ้าของเวร ขอให้ target มาแทน
                : (targetUser?.nickname || targetUser?.f_name); // transfer: target เป็นเจ้าของเวร requester ขอรับ
              const rightName = req.request_type === 'swap'
                ? (targetUser?.nickname || targetUser?.f_name)
                : (requester?.nickname || requester?.f_name);

              return (
                <div
                  key={req.id}
                  className={cn(
                    'rounded-xl border p-3 space-y-2 transition-all',
                    isIncoming ? 'border-violet-200 bg-violet-50/50' :
                    isUnreadResult && req.status === 'accepted' ? 'border-green-200 bg-green-50/50 ring-1 ring-green-200' :
                    isUnreadResult && req.status === 'rejected' ? 'border-red-200 bg-red-50/50 ring-1 ring-red-200' :
                    'border-gray-100 bg-white'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 w-full">
                        <ArrowRightLeft className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <p className="text-xs font-medium text-gray-800 truncate">
                          {leftName}
                          <span className="text-gray-400 font-normal"> → </span>
                          {rightName}
                        </p>
                        <span className="ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                          {req.request_type === 'swap' ? 'ขอให้อยู่แทน' : 'ขออยู่เวรแทน'}
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
                        <p className="text-[10px] text-gray-400 italic">&ldquo;{req.message}&rdquo;</p>
                      )}
                    </div>
                    {statusBadge(req.status)}
                  </div>

                  {/* Collision Confirm Dialog */}
                  {showCollisionConfirm && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border-2 border-amber-400 animate-fade-in space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-medium text-amber-800">
                          ⚠️ {collisionMsg} — ยืนยันรับคำขอหรือไม่?
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setCollisionReqId(null);
                            setCollisionMsg('');
                          }}
                          disabled={isProcessing}
                          className="flex-1 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={() => handleForceAccept(req)}
                          disabled={isProcessing}
                          className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          ยืนยันรับ (มีเวรซ้อน)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons — only for incoming, pending requests */}
                  {isIncoming && !showCollisionConfirm && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleAccept(req)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} ยอมรับ
                      </button>
                      <button
                        onClick={() => handleReject(req)}
                        disabled={isProcessing}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        <Ban className="w-3 h-3" /> ปฏิเสธ
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {swapRequests.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(c => c + 10)}
              className="w-full py-2 text-xs text-violet-600 font-medium hover:text-violet-800 hover:bg-violet-50 rounded-lg transition-colors border border-violet-100"
            >
              โหลดเพิ่มเติม ({swapRequests.length - visibleCount} รายการ)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
