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
      const next = data as SwapRequest[];
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
          const newRow = payload.new || {};
          const oldRow = payload.old || {};
          const isRelevant = newRow.requester_id === userId
            || newRow.target_user_id === userId
            || oldRow.requester_id === userId
            || oldRow.target_user_id === userId;

          if (!isRelevant) return;

          if (payload.eventType === 'DELETE') {
            if (!oldRow.id) return;
            applySwapRequests((prev) => removeById(prev, oldRow.id));
            return;
          }

          if (!newRow.id) return;
          const fullSwap = await fetchSwapById(newRow.id);
          if (!fullSwap) {
            applySwapRequests((prev) => removeById(prev, newRow.id));
            return;
          }

          applySwapRequests((prev) => {
            const next = upsertById(prev, fullSwap)
              .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
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
      .select('status, requester_id, target_user_id, request_type')
      .eq('id', swapId)
      .single();

    if (!freshReq) throw new Error('ไม่พบคำขอนี้ในระบบ');
    if (freshReq.status !== 'pending') throw new Error('คำขอนี้ดำเนินการไปแล้ว ไม่สามารถยกเลิกได้');
    if (freshReq.requester_id !== userId) throw new Error('คุณไม่มีสิทธิ์ยกเลิกคำขอนี้');

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
