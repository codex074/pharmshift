'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Shift, SwapRequest, User } from '@/lib/types';
import { toMonthYear } from '@/lib/utils';

export function useShifts(year: number, month: number) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [publishedRoles, setPublishedRoles] = useState<Record<string, boolean>>({
    pharmacist: false,
    pharmacy_technician: false,
    officer: false
  });
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
        user:users(id, name, nickname, prefix, profile_image, role)
      `)
      .eq('month_year', monthYear)
      .order('date', { ascending: true });

    if (!error && data) {
      setShifts(data as Shift[]);
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

  return { shifts, isPublished, publishedRoles, loading, refetch: fetchShifts };
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
        requester:users!requester_id(id, name, nickname),
        target_user:users!target_user_id(id, name, nickname)
      `)
      .or(`requester_id.eq.${userId},target_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setSwapRequests(data as SwapRequest[]);
      setPendingCount(data.filter((r) => r.status === 'pending' && r.target_user_id === userId).length);
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
    // PRE-ACCEPTANCE VALIDATION TO PREVENT COLLISION
    const checks = [];
    
    // Determine the actual shifts involved and who receives them
    if (req.request_type === 'swap' && req.target_shift && req.shift) {
      // Requester receives `target_shift`
      checks.push(
        supabase.from('shifts').select('id')
          .eq('user_id', req.requester_id)
          .eq('date', req.target_shift.date)
          .eq('shift_type', req.target_shift.shift_type)
          .neq('id', req.shift.id) // exclude the shift they give away
          .maybeSingle()
      );
      // Target User receives `shift`
      checks.push(
        supabase.from('shifts').select('id')
          .eq('user_id', req.target_user_id)
          .eq('date', req.shift.date)
          .eq('shift_type', req.shift.shift_type)
          .neq('id', req.target_shift.id) // exclude the shift they give away
          .maybeSingle()
      );
    } else if (req.request_type === 'transfer' && req.shift) {
      // The new owner is whoever is currently NOT the owner
      const currentOwnerId = req.shift.user_id;
      const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
      checks.push(
        supabase.from('shifts').select('id')
          .eq('user_id', newUserId)
          .eq('date', req.shift.date)
          .eq('shift_type', req.shift.shift_type)
          .maybeSingle()
      );
    }
    
    // Execute checks
    const checkResults = await Promise.all(checks);
    for (const res of checkResults) {
      if (res.data) {
        throw new Error("ไม่สามารถดำเนินการได้ เนื่องจากมีเวรประเภทเดียวกันในวันดังกล่าวอยู่แล้ว (Shift Collision)");
      }
    }
    
    // 1. Update swap status → accepted
    await supabase
      .from('swap_requests')
      .update({ status: 'accepted' })
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
    } else {
      // For transfer, the new owner is whoever is currently NOT the owner
      const currentOwnerId = req.shift?.user_id;
      const newUserId = currentOwnerId === req.requester_id ? req.target_user_id : req.requester_id;
      
      await supabase
        .from('shifts')
        .update({ user_id: newUserId })
        .eq('id', req.shift_id);
    }

    await fetchSwaps();
  };

  const rejectSwap = async (swapId: string) => {
    await supabase
      .from('swap_requests')
      .update({ status: 'rejected' })
      .eq('id', swapId);
    await fetchSwaps();
  };

  return { swapRequests, pendingCount, fetchSwaps, acceptSwap, rejectSwap };
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
