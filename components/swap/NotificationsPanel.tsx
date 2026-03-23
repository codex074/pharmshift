'use client';

import { useEffect, useState } from 'react';
import { X, Check, Ban, Bell, ArrowRightLeft, Calendar, AlertTriangle, Loader2, Trash2, Settings2, BellOff, BellRing } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import type { SwapRequest, User, AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getPermissionStatus } from '@/lib/pushNotifications';

interface NotificationsPanelProps {
  swapRequests: SwapRequest[];
  notifications: AppNotification[];
  notifUnreadCount: number;
  currentUser: User | null;
  pendingCount: number;
  onAccept: (req: SwapRequest, force?: boolean) => Promise<{ collision?: string } | void>;
  onReject: (swapId: string) => Promise<void>;
  onCancel: (swapId: string) => Promise<void>;
  onMarkNotifsRead: () => Promise<void>;
  onOpen?: () => void;
  onClose: () => void;
}

function statusBadge(status: string) {
  if (status === 'accepted')  return <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">ยอมรับ</span>;
  if (status === 'rejected')  return <span className="text-[10px] font-semibold text-red-500   bg-red-50   px-2 py-0.5 rounded-full">ปฏิเสธ</span>;
  return <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">รอดำเนินการ</span>;
}

export function NotificationsPanel({
  swapRequests, notifications, notifUnreadCount, currentUser, pendingCount,
  onAccept, onReject, onCancel, onMarkNotifsRead, onOpen, onClose,
}: NotificationsPanelProps) {

  const PAGE_SIZE = 10;
  const [tab, setTab] = useState<'swap' | 'system'>('swap');
  const [page, setPage] = useState(0);
  const [collisionReqId, setCollisionReqId] = useState<string | null>(null);
  const [collisionMsg, setCollisionMsg] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // Push notification state
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    setPushPermission(getPermissionStatus());
  }, []);

  // Mark requester results as read when panel opens
  useEffect(() => {
    if (onOpen) onOpen();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark system notifications as read when switching to system tab
  useEffect(() => {
    if (tab === 'system' && notifUnreadCount > 0) {
      onMarkNotifsRead();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleCancel(swapId: string) {
    setProcessingId(swapId);
    try {
      await onCancel(swapId);
      setCancelConfirmId(null);
      toast.success('ยกเลิกคำขอเรียบร้อยแล้ว');
    } catch (err: any) {
      toast.error(err.message || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleEnablePush() {
    if (!currentUser?.id) return;
    setIsSubscribing(true);
    try {
      const ok = await subscribeToPush(currentUser.id);
      const newStatus = getPermissionStatus();
      setPushPermission(newStatus);
      if (ok) {
        toast.success('เปิดการแจ้งเตือนเรียบร้อย — ระบบจะแจ้งเวรให้ทุกวัน');
      } else if (newStatus === 'denied') {
        toast.error('ถูกบล็อก — กรุณาอนุญาต Notification ในการตั้งค่าเบราว์เซอร์');
      } else {
        toast.info('ไม่สามารถเปิดการแจ้งเตือนได้ในขณะนี้');
      }
    } catch {
      toast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setIsSubscribing(false);
    }
  }

  async function handleDisablePush() {
    setIsSubscribing(true);
    try {
      await unsubscribeFromPush();
      setPushPermission(getPermissionStatus());
      toast.success('ปิดการแจ้งเตือนแล้ว');
    } catch {
      toast.error('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
    } finally {
      setIsSubscribing(false);
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
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-600" />
              <h2 className="font-semibold text-gray-900 text-sm">การแจ้งเตือน</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => { setTab('swap'); setPage(0); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all',
                tab === 'swap' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <ArrowRightLeft className="w-3 h-3" />
              แลก/โอนเวร
              {pendingCount > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setTab('system'); setPage(0); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-semibold transition-all',
                tab === 'system' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Settings2 className="w-3 h-3" />
              จากระบบ
              {notifUnreadCount > 0 && tab !== 'system' && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {notifUnreadCount > 9 ? '9+' : notifUnreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Swap Tab Content */}
        {tab === 'swap' && (
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {swapRequests.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">ไม่มีการแจ้งเตือน</p>
            </div>
          ) : (
            swapRequests.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((req) => {
              const shift = req.shift as any;
              const requester = req.requester as any;
              const targetUser = req.target_user as any;
              const deptName = shift?.department?.name || '';
              const shiftDate = shift?.date ? new Date(shift.date + 'T00:00:00') : null;
              const isIncoming = req.target_user_id === currentUser?.id && req.status === 'pending';
              const isMyPendingRequest = req.requester_id === currentUser?.id && req.status === 'pending';
              const isUnreadResult = req.requester_id === currentUser?.id && (req.status === 'accepted' || req.status === 'rejected') && req.requester_read === false;
              const isProcessing = processingId === req.id;
              const showCollisionConfirm = collisionReqId === req.id;
              const showCancelConfirm = cancelConfirmId === req.id;

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
                    isMyPendingRequest ? 'border-blue-200 bg-blue-50/40' :
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

                  {/* Cancel button — only for my own pending requests */}
                  {isMyPendingRequest && !showCancelConfirm && (
                    <div className="pt-1">
                      <button
                        onClick={() => setCancelConfirmId(req.id)}
                        disabled={isProcessing}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 text-xs font-medium transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" /> ยกเลิกคำขอ
                      </button>
                    </div>
                  )}

                  {/* Cancel confirm dialog */}
                  {showCancelConfirm && (
                    <div className="p-2.5 rounded-lg bg-red-50 border-2 border-red-300 animate-fade-in space-y-2">
                      <p className="text-xs font-medium text-red-700">ยืนยันการยกเลิกคำขอนี้? รายการจะถูกลบออกทันที</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCancelConfirmId(null)}
                          disabled={isProcessing}
                          className="flex-1 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                        >
                          ไม่ยกเลิก
                        </button>
                        <button
                          onClick={() => handleCancel(req.id)}
                          disabled={isProcessing}
                          className="flex-1 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          ยืนยันยกเลิก
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {swapRequests.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ◀ ก่อนหน้า
              </button>
              <span className="text-[11px] text-gray-400">
                {page + 1} / {Math.ceil(swapRequests.length / PAGE_SIZE)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= swapRequests.length}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ถัดไป ▶
              </button>
            </div>
          )}
        </div>
        )}

        {/* System Tab Content */}
        {tab === 'system' && (
        <div className="overflow-y-auto flex-1 p-3 space-y-2">

          {/* Push Notification Settings */}
          {isPushSupported() ? (
            <div className={cn(
              'rounded-xl border p-3 space-y-2',
              pushPermission === 'granted' ? 'border-green-200 bg-green-50/50' :
              pushPermission === 'denied'  ? 'border-red-200 bg-red-50/50' :
              'border-violet-200 bg-violet-50/40'
            )}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {pushPermission === 'granted'
                    ? <BellRing className="w-4 h-4 text-green-600 flex-shrink-0" />
                    : <BellOff  className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-xs font-semibold text-gray-800">การแจ้งเตือน Push</p>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      {pushPermission === 'granted' && 'เปิดอยู่ — ระบบจะแจ้งเวรล่วงหน้าให้'}
                      {pushPermission === 'denied'  && 'ถูกบล็อก — กรุณาอนุญาตใน ⚙️ เบราว์เซอร์'}
                      {pushPermission === 'default' && 'ยังไม่ได้เปิด — กดเพื่อรับแจ้งเตือนเวร'}
                    </p>
                  </div>
                </div>
                {pushPermission !== 'denied' && (
                  <button
                    onClick={pushPermission === 'granted' ? handleDisablePush : handleEnablePush}
                    disabled={isSubscribing}
                    className={cn(
                      'flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50',
                      pushPermission === 'granted'
                        ? 'border border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50'
                        : 'bg-violet-600 text-white hover:bg-violet-700'
                    )}
                  >
                    {isSubscribing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {pushPermission === 'granted' ? 'ปิด' : 'เปิดรับแจ้งเตือน'}
                  </button>
                )}
              </div>
              {pushPermission === 'granted' && (
                <div className="text-[10px] text-gray-500 space-y-0.5 pl-6 border-t border-green-100 pt-2">
                  <p>🕕 18:00 วันก่อน — แจ้งเตือนเวรวันรุ่งขึ้นทุกเวร</p>
                  <p>🕗 08:00 วันนั้น — แจ้งเตือนเวรวันนี้ (ยกเว้นเวรรุ่งอรุณ)</p>
                </div>
              )}
            </div>
          ) : null}

          {notifications.length === 0 ? (
            <div className="text-center py-8">
              <Settings2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">ไม่มีการแจ้งเตือนจากระบบ</p>
            </div>
          ) : (
            <>
              {notifications.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((notif) => (
                <div
                  key={notif.id}
                  className={cn(
                    'rounded-xl border p-3 space-y-1 transition-all',
                    !notif.is_read
                      ? 'border-violet-200 bg-violet-50/40 ring-1 ring-violet-100'
                      : 'border-gray-100 bg-white'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900">{notif.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed whitespace-pre-line">{notif.body}</p>
                    </div>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: th })}
                  </p>
                </div>
              ))}
              {notifications.length > PAGE_SIZE && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <button
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ◀ ก่อนหน้า
                  </button>
                  <span className="text-[11px] text-gray-400">
                    {page + 1} / {Math.ceil(notifications.length / PAGE_SIZE)}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * PAGE_SIZE >= notifications.length}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ถัดไป ▶
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        )}

      </div>
    </div>
  );
}
