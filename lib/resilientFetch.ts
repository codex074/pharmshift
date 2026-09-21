// Server-side fetch for Supabase clients. The database sits behind a
// Cloudflare Tunnel at home, and now and then a single request stalls for
// 4-10s while the next one is fast. Idempotent reads get a short timeout and
// one retry (which usually lands on a healthy tunnel connection); anything
// that writes passes straight through, since an aborted POST may still have
// been applied.
const READ_TIMEOUT_MS = 3000;

export const resilientFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return fetch(input, init);

  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) onCallerAbort();
    else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (attempt >= 2 || callerSignal?.aborted) throw error;
      console.warn(`[resilientFetch] ${method} stalled or failed, retrying:`, (error as Error)?.message);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }
};
