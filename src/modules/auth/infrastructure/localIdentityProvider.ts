import type { IdentityProvider } from '@/modules/auth/application/ports';
import { AuthError } from '@/modules/auth/domain/authModel';
import type { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  constantTimeEqual,
  DEFAULT_ITERATIONS,
  deriveVerifier,
  randomSalt,
} from '@/modules/auth/infrastructure/passwordKdf';
import { fromBase64, toBase64 } from '@/shared/crypto/aesGcm';

/**
 * Accounts that live on this device, for running without a backend. Only a
 * salted PBKDF2 verifier is stored. Unknown emails still pay for a full
 * derivation so response time doesn't reveal which accounts exist.
 */
export function createLocalIdentityProvider(options: {
  db: AccountsDatabase;
  createId: () => string;
  now: () => number;
  iterations?: number;
}): IdentityProvider {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const decoySalt = randomSalt();

  return {
    kind: 'local',

    signIn: async (email, password) => {
      const account = await options.db.accounts
        .where('email')
        .equals(email)
        .first();
      if (!account) {
        await deriveVerifier(password, decoySalt, iterations);
        throw new AuthError('invalid-credentials');
      }
      const verifier = await deriveVerifier(
        password,
        fromBase64(account.salt),
        account.iterations,
      );
      if (!constantTimeEqual(verifier, fromBase64(account.verifier))) {
        throw new AuthError('invalid-credentials');
      }
      return {
        userId: account.id,
        email: account.email,
        displayName: account.displayName,
      };
    },

    signUp: async ({ email, password, displayName }) => {
      const existing = await options.db.accounts
        .where('email')
        .equals(email)
        .count();
      if (existing > 0) {
        throw new AuthError('email-taken');
      }
      const salt = randomSalt();
      const verifier = await deriveVerifier(password, salt, iterations);
      const id = options.createId();
      await options.db.accounts.add({
        id,
        email,
        displayName,
        salt: toBase64(salt),
        verifier: toBase64(verifier),
        iterations,
        createdAt: new Date(options.now()).toISOString(),
      });
      return {
        kind: 'signed-in',
        identity: { userId: id, email, displayName },
      };
    },

    signOut: () => Promise.resolve(),

    currentUserId: () => Promise.resolve(null),

    findAccount: async (email) => {
      const account = await options.db.accounts
        .where('email')
        .equals(email)
        .first();
      return account
        ? {
            userId: account.id,
            email: account.email,
            displayName: account.displayName,
          }
        : null;
    },

    updatePassword: async (userId, newPassword) => {
      const salt = randomSalt();
      const verifier = await deriveVerifier(newPassword, salt, iterations);
      const updated = await options.db.accounts.update(userId, {
        salt: toBase64(salt),
        verifier: toBase64(verifier),
        iterations,
      });
      if (updated === 0) {
        throw new AuthError('invalid-credentials');
      }
    },

    // Device-local accounts have no email channel; resets use a recovery code.
    requestPasswordReset: () => Promise.reject(new AuthError('unknown')),
    exchangeResetCode: () =>
      Promise.reject(new AuthError('reset-link-invalid')),

    deleteAccount: async (userId) => {
      await options.db.accounts.delete(userId);
    },
  };
}
