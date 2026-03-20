export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Secured by CRON_SECRET — set this in Vercel Environment Variables
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Delete swap_requests older than 2 months
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  const cutoffISO = cutoff.toISOString();

  const { error, count } = await supabase
    .from('swap_requests')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffISO);

  if (error) {
    console.error('[cron/cleanup] swap_requests delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[cron/cleanup] Deleted ${count} swap_requests older than ${cutoffISO}`);
  return NextResponse.json({
    ok: true,
    deleted: count,
    cutoff: cutoffISO,
  });
}
