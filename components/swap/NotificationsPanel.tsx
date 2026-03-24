'use client';

import { useEffect, useState } from 'react';
import { X, Check, Ban, Bell, ArrowRightLeft, Calendar, AlertTriangle, Loader2, Trash2, Settings2, BellOff, BellRing } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { toast } from 'sonner';
import type { SwapRequest, User, AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getPermissionStatus, getSubscriptionStatus } from '@/lib/pushNotifications';

/** "เวรดึก 15 ม.ค. (ER)" */
function shiftLabel(s: any): string {
  if (!s) return '?';
  const d = s.date ? format(new Date(s.date + 'T00:00:00'), 'd MMM', { locale: th }) : '';
  const dept = s.department?.name || '';
  return `${s.shift_type}${d ? ` ${d}` : ''}${dept ? ` (${dept})` : ''}`;
}

/** Human-readable sentence describing the request from the viewer's POV */
function describeRequest(req: SwapRequest, currentUserId: string | undefined): string {
  const myId = currentUserId;
  const rName = (req.requester as any)?.nickname || (req.requester as any)?.f_name || '?';
  const tName = (req.target_user as any)?.nickname || (req.target_user as any)?.f_name || '?';
  const iAmRequester = req.requester_id === myId;
  const iAmTarget    = req.target_user_id === myId;

  const sl  = shiftLabel(req.shift);          // the shift being acted on
  const tsl = shiftLabel(req.target_shift);   // requester's offered shift (swap only)

  if (req.request_type === 'transfer') {
    // req.shift belongs to requester; requester wants to give it to target
    if (req.status === 'pending') {
      if (iAmTarget)    return `${rName} ขอโอนเวร ${sl} ให้คุณรับแทน`;
      if (iAmRequester) return `คุณขอโอนเวร ${sl} ให้ ${tName}`;
    }
    if (iAmRequester) {
      if (req.status === 'accepted') return `${tName} ยอมรับรับเวร ${sl} แล้ว ✅`;
      if (req.status === 'rejected') return `${tName} ปฏิเสธการรับเวร ${sl} ❌`;
    }
  } else {
    // swap: req.shift = target's shift (requester wants it); req.target_shift = requester's shift (offered)
    if (req.status === 'pending') {
      if (iAmTarget) {
        // I'm target: req.shift = my shift, req.target_shift = requester's shift
        return `${rName} ขอแลก ${tsl} (เวรของเขา) กับ ${sl} (เวรของคุณ)`;
      }
      if (iAmRequester) {
        return `คุณขอแลก ${tsl} (เวรคุณ) กับ ${sl} (เวรของ ${tName})`;
      }
    }
    if (iAmRequester) {
      if (req.status === 'accepted') return `${tName} ยอมรับการแลกเวร ✅`;
      if (req.status === 'rejected') return `${tName} ปฏิเสธการแลกเวร ❌`;
    }
  }

  // Fallback
  return iAmRequester
    ? `${tName} ${req.status === 'accepted' ? 'ยอมรับ ✅' : req.status === 'rejected' ? 'ปฏิเสธ ❌' : 'รอดำเนินการ'}`
    : `${rName} ส่งคำขอถึงคุณ`;
}

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
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Load both browser permission and actual subscription status on mount
  useEffect(() => {
    setPushPermission(getPermissionStatus());
    getSubscriptionStatus().then(setIsSubscribed);
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

  async function handleTogglePush() {
    if (!currentUser?.id) return;
    setIsSubscribing(true);
    try {
      if (isSubscribed) {
        // Turn OFF — unsubscribe from push manager + remove from server
        await unsubscribeFromPush();
        setIsSubscribed(false);
        setPushPermission(getPermissionStatus());
        toast.success('ปิดการแจ้งเตือนแล้ว');
      } else {
        // Turn ON — request permission (if needed) + subscribe
        const ok = await subscribeToPush(currentUser.id);
        const newPerm = getPermissionStatus();
        setPushPermission(newPerm);
        if (ok) {
          setIsSubscribed(true);
          toast.success('เปิดการแจ้งเตือนเรียบร้อย — ระบบจะแจ้งเวรให้ทุกวัน');
        } else if (newPerm === 'denied') {
          toast.error('ถูกบล็อก — กรุณาอนุญาต Notification ในการตั้งค่าเบราว์เซอร์');
        } else {
          toast.info('ไม่สามารถเปิดการแจ้งเตือนได้ในขณะนี้');
        }
      }
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
              const deptName = shift?.department?.name || '';
              const shiftDate = shift?.date ? new Date(shift.date + 'T00:00:00') : null;
              const isIncoming = req.target_user_id === currentUser?.id && req.status === 'pending';
              const isMyPendingRequest = req.requester_id === currentUser?.id && req.status === 'pending';
              const isUnreadResult = req.requester_id === currentUser?.id && (req.status === 'accepted' || req.status === 'rejected') && req.requester_read === false;
              const isProcessing = processingId === req.id;
              const showCollisionConfirm = collisionReqId === req.id;
              const showCancelConfirm = cancelConfirmId === req.id;

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
                    <div className="space-y-1.5 flex-1 min-w-0">

                      {/* Type badge + status */}
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-[9px] font-semibold px-1.5 py-0.5 rounded',
                          req.request_type === 'swap'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-violet-100 text-violet-700'
                        )}>
                          {req.request_type === 'swap' ? '🔄 แลกเวร' : '📌 โอนเวร'}
                        </span>
                        {statusBadge(req.status)}
                      </div>

                      {/* Descriptive sentence */}
                      <p className="text-xs font-medium text-gray-800 leading-snug">
                        {describeRequest(req, currentUser?.id)}
                      </p>

                      {/* Shift detail badges */}
                      {req.request_type === 'transfer' ? (
                        shiftDate && (
                          <div className="flex items-center gap-1 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                              <Calendar className="w-2.5 h-2.5" />
                              {format(shiftDate, 'd MMM', { locale: th })} · {shift?.shift_type}{deptName ? ` · ${deptName}` : ''}
                            </span>
                          </div>
                        )
                      ) : (
                        /* Swap: show both shifts clearly labelled */
                        <div className="space-y-1">
                          {/* For target (incoming): req.shift = my shift, req.target_shift = their shift */}
                          {/* For requester (outgoing): req.shift = their shift, req.target_shift = my shift */}
                          {req.target_shift && (() => {
                            const iAmTarget = req.target_user_id === currentUser?.id;
                            const myShift    = iAmTarget ? req.shift : req.target_shift;
                            const theirShift = iAmTarget ? req.target_shift : req.shift;
                            const theirName  = iAmTarget
                              ? ((req.requester as any)?.nickname || (req.requester as any)?.f_name)
                              : ((req.target_user as any)?.nickname || (req.target_user as any)?.f_name);
                            return (
                              <>
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="text-gray-400 w-12 shrink-0">เวรคุณ:</span>
                                  <span className="flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                                    <Calendar className="w-2.5 h-2.5" />
                                    {shiftLabel(myShift)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="text-gray-400 w-12 shrink-0">เวร{theirName}:</span>
                                  <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                    <Calendar className="w-2.5 h-2.5" />
                                    {shiftLabel(theirShift)}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {req.message && (
                        <p className="text-[10px] text-gray-400 italic">&ldquo;{req.message}&rdquo;</p>
                      )}
                    </div>
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
              'rounded-xl border p-3 space-y-2 transition-colors',
              isSubscribed          ? 'border-green-200 bg-green-50/50' :
              pushPermission === 'denied' ? 'border-red-200 bg-red-50/50' :
              'border-gray-200 bg-gray-50/50'
            )}>
              <div className="flex items-center justify-between gap-3">
                {/* Icon + label */}
                <div className="flex items-center gap-2 min-w-0">
                  {isSubscribed
                    ? <BellRing className="w-4 h-4 text-green-600 flex-shrink-0" />
                    : <BellOff  className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800">การแจ้งเตือน Push</p>
                    <p className="text-[10px] text-gray-500 leading-tight">
                      {pushPermission === 'denied'
                        ? '⚠️ ถูกบล็อก — อนุญาตใน ⚙️ เบราว์เซอร์'
                        : isSubscribed
                          ? 'เปิดอยู่ — รับแจ้งเตือนเวรล่วงหน้า'
                          : 'ปิดอยู่ — กดเพื่อเปิดรับแจ้งเตือนเวร'
                      }
                    </p>
                  </div>
                </div>

                {/* Toggle switch */}
                {pushPermission !== 'denied' && (
                  <button
                    role="switch"
                    aria-checked={isSubscribed}
                    onClick={handleTogglePush}
                    disabled={isSubscribing}
                    className={cn(
                      'relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                      isSubscribed ? 'bg-green-500' : 'bg-gray-300',
                      isSubscribing && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 flex items-center justify-center',
                      isSubscribed ? 'translate-x-5' : 'translate-x-0'
                    )}>
                      {isSubscribing
                        ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                        : null
                      }
                    </span>
                  </button>
                )}
              </div>

              {/* Schedule info — only when subscribed */}
              {isSubscribed && (
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
