import type {
  PullCursor,
  RealtimeStatus,
  RemoteDesign,
  RemoteDesignWrite,
  RemoteWorkspace,
} from '@/modules/sync/remoteWorkspace';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const DESIGNS_TABLE = 'workspace_designs';
export const ASSETS_BUCKET = 'workspace-assets';
const COLUMNS =
  'id, ciphertext, iv, version, client_updated_at, updated_at, deleted_at';
const UNIQUE_VIOLATION = '23505';
/**
 * Supabase-js's realtime "SUBSCRIBED" state, as a string set so this module
 * doesn't import supabase-js values (it stays in its lazy chunk).
 */
const CONNECTED_STATES = new Set<string>(['SUBSCRIBED']);

/** Server rows are untrusted input; validate before mapping. */
const rowSchema = z.object({
  id: z.string(),
  ciphertext: z.string().nullable(),
  iv: z.string().nullable(),
  version: z.number().int().min(1),
  client_updated_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export function rowToRemote(data: unknown): RemoteDesign {
  const row = rowSchema.parse(data);
  return {
    id: row.id,
    version: row.version,
    payload:
      row.ciphertext !== null && row.iv !== null
        ? { iv: row.iv, ciphertext: row.ciphertext }
        : null,
    clientUpdatedAt: row.client_updated_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toColumns(design: RemoteDesignWrite) {
  return {
    ciphertext: design.payload?.ciphertext ?? null,
    iv: design.payload?.iv ?? null,
    client_updated_at: design.clientUpdatedAt,
    deleted_at: design.deletedAt,
  };
}

/** Quotes a value for a PostgREST `or()` filter. */
function quote(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

function statusOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };
  return status ?? statusCode;
}

export class RemoteWorkspaceError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`${context}: ${cause.message}`);
    this.name = 'RemoteWorkspaceError';
  }
}

/**
 * Supabase implementation. RLS guarantees each query only sees the
 * signed-in user's rows; `userId` is used for storage paths and the
 * realtime filter only.
 */
export function createSupabaseRemoteWorkspace(
  client: SupabaseClient,
  userId: string,
): RemoteWorkspace {
  const assetPath = (id: string) => `${userId}/${id}`;
  const bucket = () => client.storage.from(ASSETS_BUCKET);

  return {
    fetchChangedSince: async (cursor: PullCursor | null, limit: number) => {
      let query = client.from(DESIGNS_TABLE).select(COLUMNS);
      if (cursor && cursor.id === '') {
        query = query.gte('updated_at', cursor.updatedAt);
      } else if (cursor) {
        const at = quote(cursor.updatedAt);
        query = query.or(
          `updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${quote(cursor.id)})`,
        );
      }
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit);
      if (error) {
        throw new RemoteWorkspaceError('fetch designs failed', error);
      }
      return z.array(z.unknown()).parse(data).map(rowToRemote);
    },

    fetchById: async (id) => {
      const { data, error } = await client
        .from(DESIGNS_TABLE)
        .select(COLUMNS)
        .eq('id', id)
        .maybeSingle();
      if (error) {
        throw new RemoteWorkspaceError('fetch design failed', error);
      }
      return data === null ? null : rowToRemote(data);
    },

    insert: async (design) => {
      const { data, error } = await client
        .from(DESIGNS_TABLE)
        .insert({ id: design.id, version: 1, ...toColumns(design) })
        .select(COLUMNS)
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          return null;
        }
        throw new RemoteWorkspaceError('insert design failed', error);
      }
      return rowToRemote(data);
    },

    update: async (design, expectedVersion) => {
      const { data, error } = await client
        .from(DESIGNS_TABLE)
        .update({ version: expectedVersion + 1, ...toColumns(design) })
        .eq('id', design.id)
        .eq('version', expectedVersion)
        .select(COLUMNS)
        .maybeSingle();
      if (error) {
        throw new RemoteWorkspaceError('update design failed', error);
      }
      return data === null ? null : rowToRemote(data);
    },

    uploadAsset: async (id, sealedEnvelope) => {
      const { error } = await bucket().upload(
        assetPath(id),
        new Blob([sealedEnvelope], { type: 'application/json' }),
        { contentType: 'application/json', upsert: false },
      );
      const status = statusOf(error);
      // Assets are immutable: an existing object is the same upload.
      if (error && status !== 409 && status !== '409') {
        throw new RemoteWorkspaceError('upload image failed', error);
      }
    },

    downloadAsset: async (id) => {
      const { data, error } = await bucket().download(assetPath(id));
      if (error) {
        const status = statusOf(error);
        if (status === 404 || status === 400 || status === '404') {
          return null;
        }
        throw new RemoteWorkspaceError('download image failed', error);
      }
      return data.text();
    },

    deleteAsset: async (id) => {
      const { error } = await bucket().remove([assetPath(id)]);
      if (error) {
        throw new RemoteWorkspaceError('delete image failed', error);
      }
    },

    subscribe: (onChange, onStatus) => {
      const channel = client
        .channel(`workspace:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: DESIGNS_TABLE,
            filter: `user_id=eq.${userId}`,
          },
          () => {
            onChange();
          },
        )
        .subscribe((status) => {
          const mapped: RealtimeStatus = CONNECTED_STATES.has(status)
            ? 'connected'
            : 'disconnected';
          onStatus(mapped);
        });
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
