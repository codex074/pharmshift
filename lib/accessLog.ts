import { createClient } from '@supabase/supabase-js';

// Daily-active access logging. Records one row per user per Bangkok day
// (see migration 20260614_create_access_logs.sql). Called from
// GET /api/auth/me, the natural "app opened" chokepoint.

const accessClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Per-instance cache of `${userId}:${day}` already recorded, so a warm
// lambda skips the DB round-trip on repeated app opens within the same day.
const recordedToday = new Set<string>();

function bangkokDay(): string {
  // YYYY-MM-DD in Asia/Bangkok (en-CA formats as ISO date)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function recordAccess(userId: string) {
  const day = bangkokDay();
  const key = `${userId}:${day}`;
  if (recordedToday.has(key)) return;

  try {
    const { data: existing, error: readError } = await accessClient
      .from('access_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('day', day)
      .maybeSingle();

    if (readError) throw readError;
    if (existing) {
      recordedToday.add(key);
      return;
    }

    await accessClient.rpc('record_access', { p_user_id: userId, p_day: day });

    // Bound the cache: clear it once it grows (e.g. across a day boundary).
    // The RPC is insert-only, so a few redundant attempts are harmless.
    if (recordedToday.size > 500) recordedToday.clear();
    recordedToday.add(key);
  } catch (error) {
    console.error('[access] record failed:', error);
  }
}
