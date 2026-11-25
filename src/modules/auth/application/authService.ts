import type {
  IdentityProvider,
  Keyring,
  SessionVault,
  StoredSession,
} from '@/modules/auth/application/ports';
import {
  AuthError,
  checkThrottle,
  recordFailure,
  REMEMBERED_SESSION_TTL_MS,
  SESSION_TTL_MS,
  type Identity,
  type Session,
  type ThrottleRecord,
} from '@/modules/auth/domain/authModel';
import {
  assessPassword,
  emailSchema,
  MAX_PASSWORD_LENGTH,
  signInSchema,
  signUpSchema,
  type SignUpInput,
} from '@/modules/auth/domain/credentials';
import type { KeyValueStore } from '@/shared/lib/keyValueStore';
import type { Logger } from '@/shared/logger';

/**
 * Sign-in use cases: validate input, throttle repeated failures, verify
 * with the identity provider, unlock the workspace key and keep the
 * session. Password resets go through the recovery code so the encrypted
 * workspace survives (ADR 0011). Everything a screen needs is one call.
 */

export interface AuthSuccess {
  stored: StoredSession;
  /** A recovery code issued just now: show it once, then it's gone. */
  recoveryCode: string | null;
}

export type SignUpResult =
  | ({ kind: 'signed-in' } & AuthSuccess)
  | { kind: 'confirm-email'; email: string };

export interface ResetInput {
  recoveryCode: string;
  newPassword: string;
  remember: boolean;
}

export interface AuthService {
  readonly providerKind: IdentityProvider['kind'];
  restore: () => Promise<StoredSession | null>;
  signIn: (input: {
    email: string;
    password: string;
    remember: boolean;
  }) => Promise<AuthSuccess>;
  signUp: (input: SignUpInput & { remember: boolean }) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /**
   * Ends this app's session only (key and session vault), keeping the
   * provider's state. Used before a reset link: a Supabase sign-out would
   * also delete the PKCE verifier the link needs.
   */
  endLocalSession: () => Promise<void>;
  /** Device-local accounts: email + recovery code + new password. */
  resetWithRecoveryCode: (
    input: ResetInput & { email: string },
  ) => Promise<AuthSuccess>;
  /** Supabase: send the reset email. */
  requestResetEmail: (email: string) => Promise<void>;
  /** Supabase: finish from the emailed link, keeping the encrypted workspace. */
  completeEmailReset: (
    input: ResetInput & { code: string },
  ) => Promise<AuthSuccess>;
  changePassword: (input: {
    session: Session;
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  issueRecoveryCode: (input: {
    session: Session;
    password: string;
  }) => Promise<string>;
  /** Proves the password with the provider (throttled like sign-in). */
  verifyPassword: (input: {
    session: Session;
    password: string;
  }) => Promise<void>;
  /** Deletes the account, its wrapped key and this device's session. */
  deleteIdentity: (session: Session) => Promise<void>;
}

const THROTTLE_PREFIX = 'canvas-studio-v2:throttle:';
const RESET_THROTTLE_PREFIX = 'canvas-studio-v2:throttle-reset:';

function isThrottleRecord(value: unknown): value is ThrottleRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ThrottleRecord).failures === 'number' &&
    typeof (value as ThrottleRecord).lockedUntil === 'number'
  );
}

export function createAuthService(deps: {
  identity: IdentityProvider;
  keyring: Keyring;
  vault: SessionVault;
  throttleStore: KeyValueStore;
  now: () => number;
  logger: Logger;
}): AuthService {
  const { identity, keyring, vault, logger } = deps;

  const readThrottle = (key: string): ThrottleRecord | null => {
    const raw = deps.throttleStore.get(key);
    if (!raw) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return isThrottleRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const guard = (key: string) => {
    const decision = checkThrottle(readThrottle(key), deps.now());
    if (!decision.allowed) {
      logger.warn('auth.throttled', { provider: identity.kind });
      throw new AuthError('locked', decision.retryAfterMs);
    }
  };

  const fail = (key: string): number => {
    const record = recordFailure(readThrottle(key), deps.now());
    deps.throttleStore.set(key, JSON.stringify(record));
    return record.failures;
  };

  const requireNewPassword = (password: string, email: string) => {
    if (
      password.length > MAX_PASSWORD_LENGTH ||
      !assessPassword(password, email).acceptable
    ) {
      throw new AuthError('weak-password');
    }
  };

  const saveSession = async (
    who: Identity,
    dataKey: CryptoKey,
    remember: boolean,
  ): Promise<StoredSession> => {
    const stored: StoredSession = {
      session: {
        ...who,
        provider: identity.kind,
        expiresAt:
          deps.now() + (remember ? REMEMBERED_SESSION_TTL_MS : SESSION_TTL_MS),
      },
      dataKey,
    };
    await vault.save(stored);
    return stored;
  };

  const startSession = async (
    who: Identity,
    password: string,
    remember: boolean,
  ): Promise<AuthSuccess> => {
    const { dataKey, recoveryCode } = await keyring.unlock(
      who.userId,
      password,
    );
    return { stored: await saveSession(who, dataKey, remember), recoveryCode };
  };

  const asAuthError = (error: unknown): AuthError =>
    error instanceof AuthError ? error : new AuthError('unknown');

  return {
    providerKind: identity.kind,

    restore: async () => {
      try {
        const stored = await vault.load();
        if (!stored) {
          return null;
        }
        const expired = stored.session.expiresAt <= deps.now();
        const providerMismatch =
          stored.session.provider !== identity.kind ||
          (identity.kind === 'supabase' &&
            (await identity.currentUserId()) !== stored.session.userId);
        if (expired || providerMismatch) {
          await vault.clear();
          logger.info('auth.session_ended', {
            reason: expired ? 'expired' : 'provider',
          });
          return null;
        }
        return stored;
      } catch (error) {
        logger.error('auth.restore_failed', { error });
        return null;
      }
    },

    signIn: async ({ email, password, remember }) => {
      const parsed = signInSchema.safeParse({ email, password });
      if (!parsed.success) {
        throw new AuthError('invalid-credentials');
      }
      const normalised = parsed.data.email;
      const throttleKey = THROTTLE_PREFIX + normalised;
      guard(throttleKey);
      try {
        const who = await identity.signIn(normalised, parsed.data.password);
        const result = await startSession(who, parsed.data.password, remember);
        deps.throttleStore.remove(throttleKey);
        logger.info('auth.signed_in', {
          provider: identity.kind,
          userId: who.userId,
        });
        return result;
      } catch (error) {
        if (
          error instanceof AuthError &&
          error.code === 'invalid-credentials'
        ) {
          logger.warn('auth.sign_in_failed', {
            provider: identity.kind,
            failures: fail(throttleKey),
          });
        } else {
          logger.error('auth.sign_in_error', {
            provider: identity.kind,
            error,
          });
        }
        throw asAuthError(error);
      }
    },

    signUp: async (input) => {
      const parsed = signUpSchema.safeParse(input);
      if (!parsed.success) {
        throw new AuthError('weak-password');
      }
      try {
        const outcome = await identity.signUp(parsed.data);
        if (outcome.kind === 'confirm-email') {
          logger.info('auth.sign_up_confirmation_sent', {
            provider: identity.kind,
          });
          return outcome;
        }
        const result = await startSession(
          outcome.identity,
          parsed.data.password,
          input.remember,
        );
        logger.info('auth.signed_up', {
          provider: identity.kind,
          userId: outcome.identity.userId,
        });
        return { kind: 'signed-in', ...result };
      } catch (error) {
        logger.warn('auth.sign_up_failed', { provider: identity.kind, error });
        throw asAuthError(error);
      }
    },

    signOut: async () => {
      await vault.clear();
      try {
        await identity.signOut();
      } catch (error) {
        // The local session is already gone; the server one expires on its own.
        logger.warn('auth.remote_sign_out_failed', { error });
      }
      logger.info('auth.signed_out', { provider: identity.kind });
    },

    endLocalSession: async () => {
      await vault.clear();
      logger.info('auth.local_session_ended', { provider: identity.kind });
    },

    resetWithRecoveryCode: async ({
      email,
      recoveryCode,
      newPassword,
      remember,
    }) => {
      const parsedEmail = emailSchema.safeParse(email);
      if (!parsedEmail.success) {
        throw new AuthError('invalid-recovery');
      }
      const normalised = parsedEmail.data;
      requireNewPassword(newPassword, normalised);
      const throttleKey = RESET_THROTTLE_PREFIX + normalised;
      guard(throttleKey);
      try {
        const who = await identity.findAccount(normalised);
        if (!who) {
          throw new AuthError('invalid-recovery');
        }
        const dataKey = await keyring.recover(
          who.userId,
          recoveryCode,
          newPassword,
          () => identity.updatePassword(who.userId, newPassword),
        );
        deps.throttleStore.remove(throttleKey);
        deps.throttleStore.remove(THROTTLE_PREFIX + normalised);
        logger.info('auth.password_reset', {
          provider: identity.kind,
          userId: who.userId,
        });
        return {
          stored: await saveSession(who, dataKey, remember),
          recoveryCode: null,
        };
      } catch (error) {
        if (error instanceof AuthError && error.code === 'invalid-recovery') {
          logger.warn('auth.reset_failed', {
            provider: identity.kind,
            failures: fail(throttleKey),
          });
        } else {
          logger.error('auth.reset_error', { provider: identity.kind, error });
        }
        throw asAuthError(error);
      }
    },

    requestResetEmail: async (email) => {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) {
        throw new AuthError('invalid-recovery');
      }
      try {
        await identity.requestPasswordReset(parsed.data);
        logger.info('auth.reset_email_requested', { provider: identity.kind });
      } catch (error) {
        logger.warn('auth.reset_email_failed', {
          provider: identity.kind,
          error,
        });
        throw asAuthError(error);
      }
    },

    completeEmailReset: async ({
      code,
      recoveryCode,
      newPassword,
      remember,
    }) => {
      try {
        const who = await identity.exchangeResetCode(code);
        requireNewPassword(newPassword, who.email);
        // The recovery code is checked first; the server password only
        // changes once the workspace key is known to unlock.
        const dataKey = await keyring.recover(
          who.userId,
          recoveryCode,
          newPassword,
          () => identity.updatePassword(who.userId, newPassword),
        );
        logger.info('auth.password_reset', {
          provider: identity.kind,
          userId: who.userId,
        });
        return {
          stored: await saveSession(who, dataKey, remember),
          recoveryCode: null,
        };
      } catch (error) {
        logger.warn('auth.reset_failed', { provider: identity.kind, error });
        throw asAuthError(error);
      }
    },

    changePassword: async ({ session, currentPassword, newPassword }) => {
      requireNewPassword(newPassword, session.email);
      try {
        // Proves the current password with the provider, not just the keyring.
        await identity.signIn(session.email, currentPassword);
        await keyring.changePassword(
          session.userId,
          currentPassword,
          newPassword,
          () => identity.updatePassword(session.userId, newPassword),
        );
        logger.info('auth.password_changed', {
          provider: identity.kind,
          userId: session.userId,
        });
      } catch (error) {
        logger.warn('auth.password_change_failed', {
          provider: identity.kind,
          error,
        });
        throw asAuthError(error);
      }
    },

    verifyPassword: async ({ session, password }) => {
      const throttleKey = THROTTLE_PREFIX + session.email;
      guard(throttleKey);
      try {
        const who = await identity.signIn(session.email, password);
        if (who.userId !== session.userId) {
          throw new AuthError('invalid-credentials');
        }
        deps.throttleStore.remove(throttleKey);
      } catch (error) {
        if (
          error instanceof AuthError &&
          error.code === 'invalid-credentials'
        ) {
          fail(throttleKey);
        }
        throw asAuthError(error);
      }
    },

    deleteIdentity: async (session) => {
      await identity.deleteAccount(session.userId);
      await keyring.forget(session.userId);
      await vault.clear();
      logger.info('auth.account_deleted', {
        provider: identity.kind,
        userId: session.userId,
      });
    },

    issueRecoveryCode: async ({ session, password }) => {
      try {
        const code = await keyring.issueRecoveryCode(session.userId, password);
        logger.info('auth.recovery_code_issued', {
          provider: identity.kind,
          userId: session.userId,
        });
        return code;
      } catch (error) {
        logger.warn('auth.recovery_code_failed', {
          provider: identity.kind,
          error,
        });
        throw asAuthError(error);
      }
    },
  };
}
