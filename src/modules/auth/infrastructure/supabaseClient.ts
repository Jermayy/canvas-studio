import type { SupabaseConfig } from '@/app/config';
import { createClient } from '@supabase/supabase-js';

export const REQUEST_TIMEOUT_MS = 15_000;
/** Namespaced so the session never collides with other apps on the origin (ADR 0006). */
export const AUTH_STORAGE_KEY = 'canvas-studio-auth';

/** Every Supabase request gets a hard timeout (playbook 10). */
export function fetchWithTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return fetchImpl(input, { ...init, signal });
  };
}

/** Untyped database schema: adapters validate every row with zod. */
export type BrowserSupabaseClient = ReturnType<typeof createClient>;

/** One client for auth, sync, share links and account deletion. */
export function createSupabaseBrowserClient(
  config: SupabaseConfig,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
): BrowserSupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      storage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchWithTimeout(fetch, REQUEST_TIMEOUT_MS) },
  });
}
