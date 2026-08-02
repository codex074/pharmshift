import { createClient } from '@supabase/supabase-js';

const directSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser REST calls go through this app's own domain (see the
// /api/db-proxy rewrite in next.config.mjs), which Vercel proxies to the
// self-hosted Supabase backend server-to-server. Some locked-down
// hospital PCs don't trust the VPS's certificate no matter which free
// ACME CA it uses, but they already trust this app's domain — routing
// through it sidesteps the problem entirely. Server-side rendering has
// no `window`, so it falls back to calling the backend directly.
const supabaseUrl = typeof window !== 'undefined'
  ? `${window.location.origin}/api/db-proxy`
  : directSupabaseUrl;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: undefined as any,                // disable NavigatorLockManager
    storageKey: 'sb-auth-token',
  },
});

// Realtime subscriptions still connect directly to the VPS (not proxied
// yet — WebSocket proxying through Vercel rewrites needs separate work).
export const supabaseRealtime = createClient(directSupabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
