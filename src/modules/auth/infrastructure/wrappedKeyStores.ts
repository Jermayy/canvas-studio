import type {
  WrappedKey,
  WrappedKeyRecord,
  WrappedKeyStore,
} from '@/modules/auth/application/ports';
import type {
  AccountsDatabase,
  WrappedKeyRow,
} from '@/modules/auth/infrastructure/accountsDatabase';
import type { Logger } from '@/shared/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Adapters for `WrappedKeyStore`. Local accounts keep wrapped keys in this
 * device's accounts database; Supabase accounts keep them in
 * `workspace_keys` (RLS: owner only) so any device can unlock the
 * workspace with the password. Only wrapped keys ever leave the keyring.
 */

function fromRow(row: WrappedKeyRow): WrappedKeyRecord {
  return {
    userId: row.userId,
    password: {
      salt: row.salt,
      iterations: row.iterations,
      iv: row.iv,
      wrapped: row.wrapped,
    },
    recovery: row.recovery ?? null,
    version: row.version ?? 1,
  };
}

function toRow(
  record: Omit<WrappedKeyRecord, 'version'>,
  version: number,
): WrappedKeyRow {
  return {
    userId: record.userId,
    ...record.password,
    ...(record.recovery ? { recovery: record.recovery } : {}),
    version,
  };
}

export function createLocalWrappedKeyStore(
  db: AccountsDatabase,
): WrappedKeyStore {
  return {
    get: async (userId) => {
      const row = await db.keys.get(userId);
      return row ? fromRow(row) : null;
    },
    create: (record) =>
      db.transaction('rw', db.keys, async () => {
        if (await db.keys.get(record.userId)) {
          return false;
        }
        await db.keys.add(toRow(record, 1));
        return true;
      }),
    update: (record, expectedVersion) =>
      db.transaction('rw', db.keys, async () => {
        const current = await db.keys.get(record.userId);
        if (!current || (current.version ?? 1) !== expectedVersion) {
          return false;
        }
        await db.keys.put(toRow(record, expectedVersion + 1));
        return true;
      }),
    forget: async (userId) => {
      await db.keys.delete(userId);
    },
  };
}

export const WORKSPACE_KEYS_TABLE = 'workspace_keys';
const COLUMNS = 'user_id, password_wrap, recovery_wrap, version';
const UNIQUE_VIOLATION = '23505';

const base64 = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9+/]+=*$/);

/** Server rows are untrusted input. */
const wrappedKeySchema = z.object({
  salt: base64,
  iterations: z.number().int().min(1000).max(10_000_000),
  iv: base64,
  wrapped: base64,
});

const rowSchema = z.object({
  user_id: z.string(),
  password_wrap: wrappedKeySchema,
  recovery_wrap: wrappedKeySchema.nullable(),
  version: z.number().int().min(1),
});

function wrap(key: WrappedKey): WrappedKey {
  // Only the known fields go to the server.
  return {
    salt: key.salt,
    iterations: key.iterations,
    iv: key.iv,
    wrapped: key.wrapped,
  };
}

export class KeyStoreError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`${context}: ${cause.message}`);
    this.name = 'KeyStoreError';
  }
}

export function createSupabaseWrappedKeyStore(
  client: SupabaseClient,
): WrappedKeyStore {
  return {
    get: async (userId) => {
      const { data, error } = await client
        .from(WORKSPACE_KEYS_TABLE)
        .select(COLUMNS)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        throw new KeyStoreError('load key failed', error);
      }
      if (data === null) {
        return null;
      }
      const row = rowSchema.parse(data);
      return {
        userId: row.user_id,
        password: row.password_wrap,
        recovery: row.recovery_wrap,
        version: row.version,
      };
    },
    create: async (record) => {
      const { error } = await client.from(WORKSPACE_KEYS_TABLE).insert({
        user_id: record.userId,
        password_wrap: wrap(record.password),
        recovery_wrap: record.recovery ? wrap(record.recovery) : null,
      });
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          return false;
        }
        throw new KeyStoreError('store key failed', error);
      }
      return true;
    },
    update: async (record, expectedVersion) => {
      const { data, error } = await client
        .from(WORKSPACE_KEYS_TABLE)
        .update({
          password_wrap: wrap(record.password),
          recovery_wrap: record.recovery ? wrap(record.recovery) : null,
          version: expectedVersion + 1,
        })
        .eq('user_id', record.userId)
        .eq('version', expectedVersion)
        .select('version')
        .maybeSingle();
      if (error) {
        throw new KeyStoreError('update key failed', error);
      }
      return data !== null;
    },
    // workspace_keys rows are deleted with the account (on delete cascade).
    forget: () => Promise.resolve(),
  };
}

/**
 * Server first. If the server has no key but this device does (a Supabase
 * account created before keys moved to the server), the local key is
 * uploaded so the existing encrypted workspace stays readable.
 */
export function withLocalFallback(
  primary: WrappedKeyStore,
  legacy: WrappedKeyStore,
  logger: Logger,
): WrappedKeyStore {
  return {
    get: async (userId) => {
      const found = await primary.get(userId);
      if (found) {
        return found;
      }
      const local = await legacy.get(userId);
      if (!local) {
        return null;
      }
      await primary.create(local);
      logger.info('auth.key_uploaded', { userId });
      return primary.get(userId);
    },
    create: (record) => primary.create(record),
    update: (record, expectedVersion) =>
      primary.update(record, expectedVersion),
    forget: async (userId) => {
      await primary.forget(userId);
      await legacy.forget(userId);
    },
  };
}
