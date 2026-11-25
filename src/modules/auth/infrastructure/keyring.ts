import type {
  Keyring,
  SessionVault,
  StoredSession,
  WrappedKey,
  WrappedKeyRecord,
  WrappedKeyStore,
} from '@/modules/auth/application/ports';
import { AuthError } from '@/modules/auth/domain/authModel';
import {
  generateRecoveryCode,
  normaliseRecoveryCode,
} from '@/modules/auth/domain/recoveryCode';
import type { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  DEFAULT_ITERATIONS,
  deriveWrappingKey,
  randomSalt,
} from '@/modules/auth/infrastructure/passwordKdf';
import { fromBase64, toBase64 } from '@/shared/crypto/aesGcm';

/**
 * Envelope encryption for workspaces. Each account has a random AES-256
 * data key, stored only wrapped: once by a key derived from the password
 * and once by a key derived from a recovery code. Either secret unlocks
 * the same key, so resetting a forgotten password keeps every design.
 * Keys handed to the app are non-extractable.
 *
 * The wrapped key lives in a `WrappedKeyStore` (this device, or the server
 * for Supabase accounts). Updates are version-checked, so two devices
 * changing the password at once can't silently undo each other: the
 * second one fails with `stale` and nothing is stored.
 */
export function createKeyring(options: {
  store: WrappedKeyStore;
  iterations?: number;
}): Keyring {
  const { store } = options;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const dataKeyAlgorithm = { name: 'AES-GCM', length: 256 } as const;
  const usages: KeyUsage[] = ['encrypt', 'decrypt'];

  const wrapWith = async (
    secret: string,
    dataKey: CryptoKey,
  ): Promise<WrappedKey> => {
    const salt = randomSalt();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrappingKey = await deriveWrappingKey(secret, salt, iterations);
    const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, {
      name: 'AES-GCM',
      iv,
    });
    return {
      salt: toBase64(salt),
      iterations,
      iv: toBase64(iv),
      wrapped: toBase64(new Uint8Array(wrapped)),
    };
  };

  const wrapRecovery = (code: string, dataKey: CryptoKey) =>
    wrapWith(normaliseRecoveryCode(code) ?? '', dataKey);

  /** Extractable only so it can be re-wrapped; never leaves this module. */
  const unwrapWith = async (
    wrapped: WrappedKey,
    secret: string,
    failure: AuthError['code'],
  ): Promise<CryptoKey> => {
    const wrappingKey = await deriveWrappingKey(
      secret,
      fromBase64(wrapped.salt),
      wrapped.iterations,
    );
    try {
      return await crypto.subtle.unwrapKey(
        'raw',
        fromBase64(wrapped.wrapped),
        wrappingKey,
        { name: 'AES-GCM', iv: fromBase64(wrapped.iv) },
        dataKeyAlgorithm,
        true,
        usages,
      );
    } catch {
      // The GCM tag fails when the secret differs from the one used to wrap.
      throw new AuthError(failure);
    }
  };

  const nonExtractable = async (key: CryptoKey): Promise<CryptoKey> => {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    try {
      return await crypto.subtle.importKey(
        'raw',
        raw,
        dataKeyAlgorithm,
        false,
        usages,
      );
    } finally {
      raw.fill(0);
    }
  };

  const save = async (
    current: WrappedKeyRecord,
    next: Partial<Pick<WrappedKeyRecord, 'password' | 'recovery'>>,
  ) => {
    const stored = await store.update(
      {
        userId: current.userId,
        password: next.password ?? current.password,
        recovery:
          next.recovery === undefined ? current.recovery : next.recovery,
      },
      current.version,
    );
    if (!stored) {
      throw new AuthError('stale');
    }
  };

  /**
   * Stores the new password wrap, then lets the provider change the
   * password. Saving first means a stale or failed save leaves the
   * provider's password alone; a provider failure restores the old wrap.
   */
  const rewrap = async (
    record: WrappedKeyRecord,
    password: WrappedKey,
    commitPassword: (() => Promise<void>) | undefined,
  ) => {
    await save(record, { password });
    if (!commitPassword) {
      return;
    }
    try {
      await commitPassword();
    } catch (error) {
      // Best effort: if even this fails, the recovery code still unlocks
      // the key, so the provider's error is the one worth reporting.
      await store
        .update(
          {
            userId: record.userId,
            password: record.password,
            recovery: record.recovery,
          },
          record.version + 1,
        )
        .catch(() => false);
      throw error;
    }
  };

  const unlockExisting = async (record: WrappedKeyRecord, password: string) => {
    const dataKey = await unwrapWith(
      record.password,
      password,
      'invalid-credentials',
    );
    if (record.recovery) {
      return { dataKey: await nonExtractable(dataKey), recoveryCode: null };
    }
    // Accounts created before recovery codes existed get one now.
    const recoveryCode = generateRecoveryCode();
    await save(record, { recovery: await wrapRecovery(recoveryCode, dataKey) });
    return { dataKey: await nonExtractable(dataKey), recoveryCode };
  };

  return {
    unlock: async (userId, password) => {
      const record = await store.get(userId);
      if (record) {
        return unlockExisting(record, password);
      }
      const dataKey = await crypto.subtle.generateKey(
        dataKeyAlgorithm,
        true,
        usages,
      );
      const recoveryCode = generateRecoveryCode();
      const created = await store.create({
        userId,
        password: await wrapWith(password, dataKey),
        recovery: await wrapRecovery(recoveryCode, dataKey),
      });
      if (!created) {
        // Another device created the key first: use that one.
        const winner = await store.get(userId);
        if (!winner) {
          throw new AuthError('stale');
        }
        return unlockExisting(winner, password);
      }
      return { dataKey: await nonExtractable(dataKey), recoveryCode };
    },

    recover: async (userId, recoveryCode, newPassword, commitPassword) => {
      const record = await store.get(userId);
      const code = normaliseRecoveryCode(recoveryCode);
      if (!record?.recovery || !code) {
        throw new AuthError('invalid-recovery');
      }
      const dataKey = await unwrapWith(
        record.recovery,
        code,
        'invalid-recovery',
      );
      await rewrap(
        record,
        await wrapWith(newPassword, dataKey),
        commitPassword,
      );
      return nonExtractable(dataKey);
    },

    changePassword: async (
      userId,
      currentPassword,
      newPassword,
      commitPassword,
    ) => {
      const record = await store.get(userId);
      if (!record) {
        throw new AuthError('invalid-credentials');
      }
      const dataKey = await unwrapWith(
        record.password,
        currentPassword,
        'invalid-credentials',
      );
      await rewrap(
        record,
        await wrapWith(newPassword, dataKey),
        commitPassword,
      );
    },

    issueRecoveryCode: async (userId, password) => {
      const record = await store.get(userId);
      if (!record) {
        throw new AuthError('invalid-credentials');
      }
      const dataKey = await unwrapWith(
        record.password,
        password,
        'invalid-credentials',
      );
      const recoveryCode = generateRecoveryCode();
      // Replacing the wrap makes any earlier code useless.
      await save(record, {
        recovery: await wrapRecovery(recoveryCode, dataKey),
      });
      return recoveryCode;
    },

    forget: (userId) => store.forget(userId),
  };
}

export function createIndexedDbSessionVault(
  db: AccountsDatabase,
): SessionVault {
  return {
    load: async () => {
      const row = await db.sessions.get('current');
      return row ? { session: row.session, dataKey: row.dataKey } : null;
    },
    save: async ({ session, dataKey }) => {
      await db.sessions.put({ id: 'current', session, dataKey });
    },
    clear: async () => {
      await db.sessions.delete('current');
    },
  };
}

export function createMemorySessionVault(): SessionVault {
  let stored: StoredSession | null = null;
  return {
    load: () => Promise.resolve(stored),
    save: (next) => {
      stored = next;
      return Promise.resolve();
    },
    clear: () => {
      stored = null;
      return Promise.resolve();
    },
  };
}
