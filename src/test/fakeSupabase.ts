import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A scriptable stand-in for the slice of supabase-js the adapters use.
 * Queries are chainable and record every call; each awaited query takes
 * the next queued result. Storage, RPC and realtime are plain mocks.
 */

export interface FakeResult {
  data?: unknown;
  error?: {
    message: string;
    code?: string;
    status?: number;
    statusCode?: string;
  } | null;
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'gte',
  'or',
  'order',
  'limit',
  'single',
  'maybeSingle',
];

/** A downloaded file; typed nullable like supabase-js's response. */
const envelope = (): Blob | null => new Blob(['envelope']);

export function createFakeSupabase() {
  const results: FakeResult[] = [];
  const calls: { table: string; chain: [string, unknown[]][] }[] = [];

  const from = vi.fn((table: string) => {
    const entry = { table, chain: [] as [string, unknown[]][] };
    calls.push(entry);
    const builder: Record<string, unknown> = {};
    for (const name of CHAIN_METHODS) {
      builder[name] = (...args: unknown[]) => {
        entry.chain.push([name, args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: FakeResult) => unknown) => {
      const next = results.shift() ?? { data: null, error: null };
      return Promise.resolve(
        resolve({ data: next.data ?? null, error: next.error ?? null }),
      );
    };
    return builder;
  });

  const bucket = {
    upload: vi.fn(() =>
      Promise.resolve({ error: null as FakeResult['error'] }),
    ),
    download: vi.fn(() =>
      Promise.resolve({ data: envelope(), error: null as FakeResult['error'] }),
    ),
    remove: vi.fn(() =>
      Promise.resolve({ error: null as FakeResult['error'] }),
    ),
    list: vi.fn(() =>
      Promise.resolve({
        data: [] as { name: string }[] | null,
        error: null as FakeResult['error'],
      }),
    ),
    createSignedUrl: vi.fn((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://cloud.example.test/sign/${path}?token=t` },
        error: null as FakeResult['error'],
      }),
    ),
  };

  const channel: {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  } = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };

  const rpc = vi.fn(() => {
    const next = results.shift() ?? { data: null, error: null };
    return Promise.resolve({
      data: next.data ?? null,
      error: next.error ?? null,
    });
  });

  const client = {
    from,
    rpc,
    storage: { from: vi.fn(() => bucket) },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve()),
  };

  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    bucket,
    channel,
    calls,
    /** Queues results for the next awaited queries / RPCs, in order. */
    respond: (...next: FakeResult[]) => {
      results.push(...next);
    },
    /** The chain method names of the n-th query. */
    chainOf: (index: number) =>
      (calls[index]?.chain ?? []).map(([name]) => name),
  };
}
