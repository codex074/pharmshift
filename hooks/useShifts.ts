'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Shift, ShiftType, SwapRequest, User, Holiday } from '@/lib/types';
import { toMonthYear, shiftsOverlap } from '@/lib/utils';

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
        user:users(id, prefix, f_name, l_name, nickname, profile_image, role)
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
        () => { fetchShifts(); }
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
  }, [monthYear, fetchShifts]);

  return { shifts, holidays, isPublished, publishedRoles, loading, refetch: fetchShifts };
}

export function useSwapRequests(userId?: string) {
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

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
      setSwapRequests(data as SwapRequest[]);
      // Count: incoming pending + unread results for requester
      const incomingPending = data.filter((r) => r.status === 'pending' && r.target_user_id === userId).length;
      const unreadResults = data.filter((r) => (r.status === 'accepted' || r.status === 'rejected') && r.requester_id === userId && r.requester_read === false).length;
      setPendingCount(incomingPending + unreadResults);
    }
  }, [userId]);

  useEffect(() => {
    fetchSwaps();

    if (!userId) return;
    const channel = supabase
      .channel(`swaps-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swap_requests' },
        () => { fetchSwaps(); }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [userId, fetchSwaps]);

  const acceptSwap = async (req: SwapRequest) => {
    // Verify the request is still pending (prevent race condition)
    const { data: freshReq } = await supabase
      .from('swap_requests')
      .select('status')
      .eq('id', req.id)
      .single();
    if (freshReq?.status !== 'pending') {
      throw new Error('คำขอนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรชหน้า');
    }

    // Verify the shift still belongs to the original owner
    const { data: freshShift } = await supabase
      .from('shifts')
      .select('user_id')
      .eq('id', req.shift_id)
      .single();
    if (freshShift && req.shift && freshShift.user_id !== req.shift.user_id) {
      throw new Error('เวรนี้ถูกเปลี่ยนเจ้าของไปแล้ว กรุณารีเฟรชหน้า');
    }

    // PRE-ACCEPTANCE VALIDATION TO PREVENT COLLISION
    const checks = [];
    
    // Determine the actual shifts involved and who receives them
    if (req.request_type === 'swap' && req.target_shift && req.shift) {
      // Fetch requester's shifts on target_shift's date (excluding the shift they give away)
      checks.push(
        supabase.from('shifts').select('id, shift_type')
          .eq('user_id', req.requester_id)
          .eq('date', req.target_shift.date)
          .neq('id', req.shift.id)
      );
      // Fetch target_user's shifts on shift's date (excluding the shift they give away)
      checks.push(
        supabase.from('shifts').select('id, shift_type')
          .eq('user_id', req.target_user_id)
          .eq('date', req.shift.date)
          .neq('id', req.target_shift.id)
      );
    } else if (req.request_type === 'transfer' && req.shift) {
      const currentOwnerId = req.shift.user_id;
      const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
      checks.push(
        supabase.from('shifts').select('id, shift_type')
          .eq('user_id', newUserId)
          .eq('date', req.shift.date)
      );
    }

    // Execute checks and validate overlap
    const checkResults = await Promise.all(checks);

    if (req.request_type === 'swap' && req.target_shift && req.shift) {
      const [requesterOtherShifts, targetOtherShifts] = checkResults;
      if ((requesterOtherShifts.data || []).some(s =>
        shiftsOverlap(s.shift_type as ShiftType, req.target_shift!.shift_type as ShiftType)
      )) {
        throw new Error("ไม่สามารถดำเนินการได้ เนื่องจากผู้ขอแลกมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว");
      }
      if ((targetOtherShifts.data || []).some(s =>
        shiftsOverlap(s.shift_type as ShiftType, req.shift!.shift_type as ShiftType)
      )) {
        throw new Error("ไม่สามารถดำเนินการได้ เนื่องจากผู้รับเวรมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว");
      }
    } else if (req.request_type === 'transfer' && req.shift) {
      const [newUserShifts] = checkResults;
      if ((newUserShifts.data || []).some(s =>
        shiftsOverlap(s.shift_type as ShiftType, req.shift!.shift_type as ShiftType)
      )) {
        throw new Error("ไม่สามารถดำเนินการได้ เนื่องจากมีเวรที่ทับซ้อนกันในวันดังกล่าวอยู่แล้ว");
      }
    }
    
    // 1. Update swap status → accepted + mark requester_read = false
    await supabase
      .from('swap_requests')
      .update({ status: 'accepted', requester_read: false })
      .eq('id', req.id);

    if (req.request_type === 'swap' && req.target_shift_id) {
      await supabase
        .from('shifts')
        .update({ user_id: req.target_user_id })
        .eq('id', req.shift_id);
        
      await supabase
        .from('shifts')
        .update({ user_id: req.requester_id })
        .eq('id', req.target_shift_id);

      // Log both shift changes
      await supabase.from('shift_logs').insert([
        {
          shift_id: req.shift_id,
          action: 'swap',
          old_user_id: req.requester_id,
          new_user_id: req.target_user_id,
          performed_by: req.target_user_id, // Acceptor is target_user
          details: 'Swap accepted (outgoing shift)',
        },
        {
          shift_id: req.target_shift_id,
          action: 'swap',
          old_user_id: req.target_user_id,
          new_user_id: req.requester_id,
          performed_by: req.target_user_id, // Acceptor is target_user
          details: 'Swap accepted (incoming shift)',
        }
      ]);
    } else {
      // For transfer, the new owner is whoever is currently NOT the owner
      const currentOwnerId = req.shift?.user_id;
      const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
      
      await supabase
        .from('shifts')
        .update({ user_id: newUserId })
        .eq('id', req.shift_id);

      // Log transfer
      await supabase.from('shift_logs').insert({
        shift_id: req.shift_id,
        action: 'transfer',
        old_user_id: currentOwnerId,
        new_user_id: newUserId,
        performed_by: req.target_user_id, // Acceptor
        details: 'Transfer accepted',
      });
    }

    // Send push notification to requester (swap accepted)
    const acceptorName = (req.target_user as any)?.f_name || (req.target_user as any)?.nickname || 'เพื่อนร่วมงาน';
    const acceptBody = req.request_type === 'swap'
      ? `${acceptorName} ยอมรับมาอยู่เวรแทนคุณแล้ว กรุณาตรวจสอบตารางเวร`
      : `${acceptorName} อนุมัติให้คุณอยู่เวรแทนแล้ว กรุณาตรวจสอบตารางเวร`;
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: req.requester_id,
        title: '✅ คำขอของคุณได้รับการอนุมัติ',
        body: acceptBody,
        url: '/calendar',
        tag: `swap-${req.id}`,
      }),
    }).catch(() => {}); // fire-and-forget

    // Auto-cancel other pending requests for the same shift(s)
    const shiftIdsToCancel = [req.shift_id];
    if (req.target_shift_id) shiftIdsToCancel.push(req.target_shift_id);

    const { data: otherPending } = await supabase
      .from('swap_requests')
      .select('id, requester_id, target_user_id')
      .in('shift_id', shiftIdsToCancel)
      .eq('status', 'pending')
      .neq('id', req.id);

    if (otherPending?.length) {
      // Cancel all other pending requests
      await supabase
        .from('swap_requests')
        .update({ status: 'rejected', requester_read: false })
        .in('id', otherPending.map(r => r.id));

      // Notify affected users (exclude parties already involved)
      const involvedIds = new Set([req.requester_id, req.target_user_id]);
      const notifyIds = Array.from(
        new Set(
          otherPending
            .flatMap(r => [r.requester_id, r.target_user_id])
            .filter(id => !involvedIds.has(id))
        )
      );

      if (notifyIds.length) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: notifyIds,
            title: '⚠️ คำขอถูกยกเลิกอัตโนมัติ',
            body: 'เวรนี้ได้ถูกดำเนินการแล้ว คำขอของคุณจึงถูกยกเลิกโดยอัตโนมัติ',
            url: '/calendar',
            tag: `swap-auto-cancel-${req.shift_id}`,
          }),
        }).catch(() => {});
      }
    }

    await fetchSwaps();
  };

  const rejectSwap = async (swapId: string) => {
    // Get the request details for notification before updating
    const reqData = swapRequests.find(r => r.id === swapId);

    await supabase
      .from('swap_requests')
      .update({ status: 'rejected', requester_read: false })
      .eq('id', swapId);

    // Send push notification to requester (swap rejected)
    if (reqData) {
      const rejectorName = (reqData.target_user as any)?.f_name || (reqData.target_user as any)?.nickname || 'เพื่อนร่วมงาน';
      const rejectBody = reqData.request_type === 'swap'
        ? `${rejectorName} ไม่สามารถมาอยู่เวรแทนคุณได้`
        : `${rejectorName} ปฏิเสธคำขออยู่เวรแทนของคุณ`;
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: reqData.requester_id,
          title: '❌ คำขอของคุณถูกปฏิเสธ',
          body: rejectBody,
          url: '/calendar',
          tag: `swap-${swapId}`,
        }),
      }).catch(() => {});
    }

    await fetchSwaps();
  };

  const markRequesterRead = async () => {
    if (!userId) return;
    // Mark all unread results for this user as read
    await supabase
      .from('swap_requests')
      .update({ requester_read: true })
      .eq('requester_id', userId)
      .eq('requester_read', false)
      .in('status', ['accepted', 'rejected']);
    await fetchSwaps();
  };

  return { swapRequests, pendingCount, fetchSwaps, acceptSwap, rejectSwap, markRequesterRead };
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
