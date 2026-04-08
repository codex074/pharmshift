'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Shift, ShiftType, SwapRequest, User, Holiday, AppNotification } from '@/lib/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { toMonthYear } from '@/lib/utils';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

/** "เวรดึก 15 ม.ค. (ER)" — for notification body text */
function fmtShiftNotif(s: Shift | null | undefined): string {
  if (!s) return 'เวรดังกล่าว';
  const date = s.date ? format(new Date(s.date + 'T00:00:00'), 'd MMM', { locale: th }) : '';
  const dept = (s as any).department?.name || '';
  return `เวร${s.shift_type}${date ? ` ${date}` : ''}${dept ? ` (${dept})` : ''}`;
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) return [nextItem, ...items];
  const next = [...items];
  next[index] = nextItem;
  return next;
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function countSwapPending(items: SwapRequest[], userId?: string): number {
  if (!userId) return 0;
  const incomingPending = items.filter((r) => r.status === 'pending' && r.target_user_id === userId).length;
  const unreadResults = items.filter((r) =>
    (r.status === 'accepted' || r.status === 'rejected')
      && r.requester_id === userId
      && r.requester_read === false
  ).length;
  return incomingPending + unreadResults;
}

function pendingSwapRequestKey(item: Pick<SwapRequest, 'status' | 'request_type' | 'shift_id' | 'requester_id' | 'target_user_id' | 'target_shift_id'>): string | null {
  if (item.status !== 'pending') return null;
  return [
    item.request_type,
    item.shift_id,
    item.requester_id,
    item.target_user_id,
    item.target_shift_id || 'no-target-shift',
  ].join(':');
}

function dedupeSwapRequests(items: SwapRequest[]): SwapRequest[] {
  const seenPending = new Set<string>();
  return items.filter((item) => {
    const key = pendingSwapRequestKey(item);
    if (!key) return true;
    if (seenPending.has(key)) return false;
    seenPending.add(key);
    return true;
  });
}

function escapeLikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

function buildSwapRequestNotificationMatcher(req: {
  request_type: 'swap' | 'transfer' | 'cover';
  requester?: { f_name?: string; nickname?: string } | null;
  shift?: { shift_type?: string; date?: string; department?: { name?: string } | null } | null;
  target_shift?: { shift_type?: string; date?: string; department?: { name?: string } | null } | null;
}) {
  const requesterName = req.requester?.nickname || req.requester?.f_name || 'เพื่อนร่วมงาน';
  const shiftType = req.shift?.shift_type || '';
  const shiftDate = req.shift?.date ? new Date(req.shift.date + 'T00:00:00') : null;
  const shiftDept = req.shift?.department?.name || '';

  if (req.request_type === 'transfer') {
    const shiftDateFmt = shiftDate ? format(shiftDate, 'd MMM', { locale: th }) : '';
    return {
      title: '📩 คำขอโอนเวร',
      bodyLike: `${escapeLikePattern(`${requesterName} ขอให้คุณรับ เวร${shiftType} ${shiftDateFmt}${shiftDept ? ` (${shiftDept})` : ''}`)}%`,
    };
  }

  if (req.request_type === 'cover') {
    const shiftDateFmt = shiftDate ? format(shiftDate, 'd/M', { locale: th }) : '';
    return {
      title: '🙋 คำขออยู่เวรแทน',
      bodyLike: escapeLikePattern(`${requesterName} ต้องการขออยู่เวร${shiftType}${shiftDept ? ` ${shiftDept}` : ''} ${shiftDateFmt} แทนคุณ`),
    };
  }

  const myShiftType = req.target_shift?.shift_type || '';
  const myDate = req.target_shift?.date ? new Date(req.target_shift.date + 'T00:00:00') : null;
  const myDateFmt = myDate ? format(myDate, 'd MMM', { locale: th }) : '';
  const yourDateFmt = shiftDate ? format(shiftDate, 'd MMM', { locale: th }) : '';
  const myDept = req.target_shift?.department?.name || '';

  return {
    title: '🔄 คำขอแลกเวร',
    bodyLike: escapeLikePattern(
      `${requesterName} เสนอแลก เวร${myShiftType} ${myDateFmt}${myDept ? ` (${myDept})` : ''} ของเขา กับ เวร${shiftType} ${yourDateFmt}${shiftDept ? ` (${shiftDept})` : ''} ของคุณ`
    ),
  };
}

export function useShifts(year: number, month: number) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedRoles, setPublishedRoles] = useState<Record<string, boolean>>({
    pharmacist: false,
    pharmacy_technician: false,
    officer: false
  });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const monthYear = toMonthYear(year, month);

  const fetchShiftById = useCallback(async (shiftId: string) => {
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        *,
        department:departments(id, name),
        user:users!user_id(id, prefix, f_name, l_name, nickname, profile_image, role),
        original_user:users!original_user_id(id, prefix, f_name, l_name, nickname, profile_image, role)
      `)
      .eq('id', shiftId)
      .single();

    if (error || !data) return null;
    return data as Shift;
  }, []);

  const fetchShifts = useCallback(async () => {
    setLoading(true);

    const { data: publishData } = await supabase
      .from('published_months')
      .select('is_published, pharmacist_published, pharmacy_technician_published, officer_published')
      .eq('month_year', monthYear)
      .maybeSingle();
      
    setIsPublished(publishData?.is_published ?? false);
    setPublishedRoles({
      pharmacist: publishData?.pharmacist_published ?? publishData?.is_published ?? false,
      pharmacy_technician: publishData?.pharmacy_technician_published ?? publishData?.is_published ?? false,
      officer: publishData?.officer_published ?? publishData?.is_published ?? false,
    });

    const { data, error } = await supabase
      .from('shifts')
      .select(`
        *,
        department:departments(id, name),
        user:users!user_id(id, prefix, f_name, l_name, nickname, profile_image, role),
        original_user:users!original_user_id(id, prefix, f_name, l_name, nickname, profile_image, role)
      `)
      .eq('month_year', monthYear)
      .order('date', { ascending: true });

    const { data: holidaysData, error: holidaysError } = await supabase
      .from('holidays')
      .select('*');

    if (!error && data) {
      setShifts(data as Shift[]);
    }
    
    if (!holidaysError && holidaysData) {
      setHolidays(holidaysData as Holiday[]);
    }
    
    setLoading(false);
  }, [monthYear]);

  useEffect(() => {
    fetchShifts();

    // Real-time subscription for shifts
    const channel = supabase
      .channel(`shifts-${monthYear}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `month_year=eq.${monthYear}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (!deletedId) return;
            setShifts((prev) => removeById(prev, deletedId));
            return;
          }

          const shiftId = (payload.new as { id?: string })?.id;
          if (!shiftId) return;
          const fullShift = await fetchShiftById(shiftId);
          if (!fullShift) return;
          setShifts((prev) => upsertById(prev, fullShift));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'published_months', filter: `month_year=eq.${monthYear}` },
        () => { fetchShifts(); }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [monthYear, fetchShifts, fetchShiftById]);

  return { shifts, holidays, isPublished, publishedRoles, loading, refetch: fetchShifts };
}

export function useSwapRequests(userId?: string) {
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const syncPendingCount = useCallback((items: SwapRequest[]) => {
    setPendingCount(countSwapPending(items, userId));
  }, [userId]);

  const applySwapRequests = useCallback((updater: (prev: SwapRequest[]) => SwapRequest[]) => {
    setSwapRequests((prev) => {
      const next = updater(prev);
      syncPendingCount(next);
      return next;
    });
  }, [syncPendingCount]);

  const fetchSwapById = useCallback(async (swapId: string) => {
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        *,
        shift:shifts!shift_id(*, department:departments(id, name)),
        target_shift:shifts!target_shift_id(*, department:departments(id, name)),
        requester:users!requester_id(id, prefix, f_name, l_name, nickname),
        target_user:users!target_user_id(id, prefix, f_name, l_name, nickname)
      `)
      .eq('id', swapId)
      .maybeSingle();

    return (data as SwapRequest | null) ?? null;
  }, []);

  const fetchSwaps = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('swap_requests')
      .select(`
        *,
        shift:shifts!shift_id(*, department:departments(id, name)),
        target_shift:shifts!target_shift_id(*, department:departments(id, name)),
        requester:users!requester_id(id, prefix, f_name, l_name, nickname),
        target_user:users!target_user_id(id, prefix, f_name, l_name, nickname)
      `)
      .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      const next = dedupeSwapRequests(data as SwapRequest[]);
      setSwapRequests(next);
      syncPendingCount(next);
    }
  }, [syncPendingCount, userId]);

  useEffect(() => {
    fetchSwaps();

    if (!userId) return;
    const channel = supabase
      .channel(`swaps-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swap_requests' },
        async (payload: RealtimePostgresChangesPayload<{ id: string; requester_id?: string; target_user_id?: string }>) => {
          const newRow = (payload.new ?? null) as { id?: string; requester_id?: string; target_user_id?: string } | null;
          const oldRow = (payload.old ?? null) as { id?: string; requester_id?: string; target_user_id?: string } | null;
          const isRelevant = newRow?.requester_id === userId
            || newRow?.target_user_id === userId
            || oldRow?.requester_id === userId
            || oldRow?.target_user_id === userId;

          if (!isRelevant) return;

          if (payload.eventType === 'DELETE') {
            const deletedId = oldRow?.id;
            if (!deletedId) return;
            applySwapRequests((prev) => removeById(prev, deletedId));
            return;
          }

          const newId = newRow?.id;
          if (!newId) return;
          const fullSwap = await fetchSwapById(newId);
          if (!fullSwap) {
            applySwapRequests((prev) => removeById(prev, newId));
            return;
          }

          applySwapRequests((prev) => {
            const next = dedupeSwapRequests(
              upsertById(prev, fullSwap)
                .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
            );
            return next.slice(0, 50);
          });
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [userId, fetchSwaps, fetchSwapById, applySwapRequests]);

  const acceptSwap = useCallback(async (req: SwapRequest, force = false): Promise<{ collision?: string }> => {
    // Call server-side API route (uses SERVICE_ROLE_KEY — guaranteed DB access)
    const res = await fetch('/api/swap/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swapId: req.id, force }),
    });

    const data = await res.json();

    if (!res.ok && !data.collision) {
      throw new Error(data.error || 'เกิดข้อผิดพลาด');
    }

    if (data.collision) {
      return { collision: data.collision };
    }

    applySwapRequests((prev) =>
      prev.map((item) =>
        item.id === req.id ? { ...item, status: 'accepted', requester_read: false } : item
      )
    );

    return {};
  }, [applySwapRequests]);

  const rejectSwap = useCallback(async (swapId: string) => {
    // Get the request details for notification before updating
    const reqData = swapRequests.find(r => r.id === swapId);

    await supabase
      .from('swap_requests')
      .update({ status: 'rejected', requester_read: false })
      .eq('id', swapId);

    // Notify requester (push + in-app) — swap rejected
    if (reqData) {
      const rejectorName = (reqData.target_user as any)?.f_name || (reqData.target_user as any)?.nickname || 'เพื่อนร่วมงาน';
      const rejectTitle = reqData.request_type === 'swap'
        ? '❌ ปฏิเสธคำขอแลกเวร'
        : reqData.request_type === 'cover'
        ? '❌ ปฏิเสธคำขออยู่เวรแทน'
        : '❌ ปฏิเสธคำขอโอนเวร';
      const rejectBody = reqData.request_type === 'swap'
        ? `${rejectorName} ไม่ยอมรับการแลก ${fmtShiftNotif(reqData.target_shift as Shift)} กับ ${fmtShiftNotif(reqData.shift as Shift)}`
        : reqData.request_type === 'cover'
        ? `${rejectorName} ไม่อนุมัติคำขออยู่เวรแทน ${fmtShiftNotif(reqData.shift as Shift)}`
        : `${rejectorName} ไม่รับ ${fmtShiftNotif(reqData.shift as Shift)}`;
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: reqData.requester_id,
          title: rejectTitle,
          body: rejectBody,
          url: '/calendar',
          tag: `swap-${swapId}`,
        }),
      }).catch(() => {});
      supabase.from('notifications').insert({
        user_id: reqData.requester_id,
        type: 'swap_result',
        title: rejectTitle,
        body: rejectBody,
        url: '/calendar',
      }).then(({ error: nErr }) => { if (nErr) console.error('[Reject] in-app notif error:', nErr); });
    }

    applySwapRequests((prev) =>
      prev.map((item) =>
        item.id === swapId ? { ...item, status: 'rejected', requester_read: false } : item
      )
    );
  }, [applySwapRequests, swapRequests]);

  const markRequesterRead = useCallback(async () => {
    if (!userId) return;
    // Mark all unread results for this user as read
    await supabase
      .from('swap_requests')
      .update({ requester_read: true })
      .eq('requester_id', userId)
      .eq('requester_read', false)
      .in('status', ['accepted', 'rejected']);
    applySwapRequests((prev) =>
      prev.map((item) =>
        item.requester_id === userId && (item.status === 'accepted' || item.status === 'rejected')
          ? { ...item, requester_read: true }
          : item
      )
    );
  }, [applySwapRequests, userId]);

  const cancelSwap = useCallback(async (swapId: string) => {
    // Verify it's still pending before deleting
    const { data: freshReq } = await supabase
      .from('swap_requests')
      .select(`
        status, requester_id, target_user_id, request_type, created_at,
        requester:users!requester_id(f_name, nickname),
        shift:shifts!shift_id(shift_type, date, department:departments(name)),
        target_shift:shifts!target_shift_id(shift_type, date, department:departments(name))
      `)
      .eq('id', swapId)
      .single();

    if (!freshReq) throw new Error('ไม่พบคำขอนี้ในระบบ');
    if (freshReq.status !== 'pending') throw new Error('คำขอนี้ดำเนินการไปแล้ว ไม่สามารถยกเลิกได้');
    if (freshReq.requester_id !== userId) throw new Error('คุณไม่มีสิทธิ์ยกเลิกคำขอนี้');

    const notifMatcher = buildSwapRequestNotificationMatcher(freshReq as any);

    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', freshReq.target_user_id)
      .eq('type', 'swap_request')
      .eq('title', notifMatcher.title)
      .like('body', notifMatcher.bodyLike)
      .gte('created_at', freshReq.created_at);

    // Delete from DB immediately
    await supabase.from('swap_requests').delete().eq('id', swapId);

    applySwapRequests((prev) => removeById(prev, swapId));
  }, [applySwapRequests, userId]);

  return { swapRequests, pendingCount, fetchSwaps, acceptSwap, rejectSwap, cancelSwap, markRequesterRead };
}

export function useNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const syncUnreadCount = useCallback((items: AppNotification[]) => {
    setUnreadCount(items.filter((n) => !n.is_read).length);
  }, []);

  const applyNotifications = useCallback((updater: (prev: AppNotification[]) => AppNotification[]) => {
    setNotifications((prev) => {
      const next = updater(prev);
      syncUnreadCount(next);
      return next;
    });
  }, [syncUnreadCount]);

  // Fetch via API route (uses iron-session — avoids Supabase RLS/auth issues)
  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      const notifs = (data.notifications || []) as AppNotification[];
      setNotifications(notifs);
      syncUnreadCount(notifs);
    } catch {}
  }, [syncUnreadCount, userId]);

  useEffect(() => {
    fetchNotifications();
    if (!userId) return;
    // Listen for INSERT events — refetch when any notification is added
    const channel = supabase
      .channel(`notifs-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<AppNotification>) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (!deletedId) return;
            applyNotifications((prev) => removeById(prev, deletedId));
            return;
          }

          if (!payload.new) return;
          applyNotifications((prev) => {
            const next = upsertById(prev, payload.new as AppNotification)
              .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            return next.slice(0, 50);
          });
        },
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [userId, fetchNotifications, applyNotifications]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    try {
      await fetch('/api/notifications', { method: 'PUT' });
      applyNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch {}
  }, [userId, applyNotifications]);

  return { notifications, unreadCount, fetchNotifications, markAllRead };
}

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
