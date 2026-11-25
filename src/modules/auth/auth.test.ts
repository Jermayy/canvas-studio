import { createAuthService } from '@/modules/auth/application/authService';
import type {
  IdentityProvider,
  Keyring,
  WrappedKeyRecord,
} from '@/modules/auth/application/ports';
import {
  AuthError,
  checkThrottle,
  formatRetryAfter,
  FREE_ATTEMPTS,
  recordFailure,
  REMEMBERED_SESSION_TTL_MS,
  SESSION_TTL_MS,
} from '@/modules/auth/domain/authModel';
import {
  assessPassword,
  emailSchema,
  fieldErrors,
  signUpSchema,
} from '@/modules/auth/domain/credentials';
import {
  formatRecoveryCode,
  generateRecoveryCode,
  normaliseRecoveryCode,
} from '@/modules/auth/domain/recoveryCode';
import { AccountsDatabase } from '@/modules/auth/infrastructure/accountsDatabase';
import {
  createIndexedDbSessionVault,
  createKeyring,
  createMemorySessionVault,
} from '@/modules/auth/infrastructure/keyring';
import { createLocalIdentityProvider } from '@/modules/auth/infrastructure/localIdentityProvider';
import { constantTimeEqual } from '@/modules/auth/infrastructure/passwordKdf';
import {
  createLocalWrappedKeyStore,
  createSupabaseWrappedKeyStore,
  withLocalFallback,
} from '@/modules/auth/infrastructure/wrappedKeyStores';
import {
  createSupabaseIdentityProvider,
  type SupabaseAuthClient,
} from '@/modules/auth/infrastructure/supabaseIdentityProvider';
import { createAesGcmCipher, sealJson, openJson } from '@/shared/crypto/aesGcm';
import { createMemoryKeyValueStore } from '@/shared/lib/keyValueStore';
import { createLogger } from '@/shared/logger';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { NOW } from '@/test/factories';

const ITERATIONS = 1000;
const PASSWORD = 'Correct-horse-9';
const logger = createLogger({ service: 'test', sink: () => undefined });
let dbCounter = 0;
const freshAccounts = () => {
  dbCounter += 1;
  return new AccountsDatabase(`accounts-test-${dbCounter}`);
};

describe('credential rules', () => {
  it('normalises emails and rejects invalid ones', () => {
    expect(emailSchema.parse('  Me@Example.COM ')).toBe('me@example.com');
    expect(emailSchema.safeParse('nope').success).toBe(false);
  });

  it('grades passwords and refuses weak or personal ones', () => {
    expect(assessPassword('short')).toMatchObject({
      score: 0,
      acceptable: false,
      label: 'Too short',
    });
    expect(assessPassword('password123')).toMatchObject({
      label: 'Too common',
      acceptable: false,
    });
    expect(assessPassword('aaaaaaaaaaaa').acceptable).toBe(false);
    expect(assessPassword('jemmasmith99', 'jemmasmith@x.com').label).toBe(
      'Too common',
    );
    expect(assessPassword('lowercaseonly')).toMatchObject({
      score: 1,
      label: 'Weak',
    });
    expect(assessPassword('Lowercase1only')).toMatchObject({ label: 'Good' });
    expect(assessPassword('Lowercase1').label).toBe('Fair');
    expect(assessPassword('A much Longer passphrase 2027!')).toMatchObject({
      score: 4,
      hints: [],
    });
  });

  it('reports one message per field', () => {
    const result = signUpSchema.safeParse({
      displayName: '',
      email: 'bad',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error)).toEqual({
        displayName: 'Enter your name.',
        email: 'Enter a valid email address.',
        password: 'Use at least 10 characters.',
      });
    }
  });
});

describe('sign-in throttling', () => {
  it('allows a few attempts, then locks with growing delays', () => {
    let record = null;
    for (let attempt = 1; attempt < FREE_ATTEMPTS; attempt += 1) {
      record = recordFailure(record, NOW);
      expect(checkThrottle(record, NOW)).toEqual({ allowed: true });
    }
    record = recordFailure(record, NOW);
    expect(checkThrottle(record, NOW)).toEqual({
      allowed: false,
      retryAfterMs: 30_000,
    });
    expect(checkThrottle(record, NOW + 30_000)).toEqual({ allowed: true });
    record = recordFailure(record, NOW);
    expect(checkThrottle(record, NOW)).toEqual({
      allowed: false,
      retryAfterMs: 60_000,
    });
    expect(formatRetryAfter(30_000)).toBe('30 s');
    expect(formatRetryAfter(90_000)).toBe('2 min');
  });
});

describe('local identity provider + keyring', () => {
  function setup() {
    const db = freshAccounts();
    let id = 0;
    const identity = createLocalIdentityProvider({
      db,
      createId: () => `user-${(id += 1)}`,
      now: () => NOW,
      iterations: ITERATIONS,
    });
    return {
      db,
      identity,
      keyring: createKeyring({
        store: createLocalWrappedKeyStore(db),
        iterations: ITERATIONS,
      }),
    };
  }

  it('signs up and signs in with a stored verifier, never the password', async () => {
    const { db, identity } = setup();
    const outcome = await identity.signUp({
      email: 'a@x.test',
      password: PASSWORD,
      displayName: 'Ann',
    });
    expect(outcome).toEqual({
      kind: 'signed-in',
      identity: { userId: 'user-1', email: 'a@x.test', displayName: 'Ann' },
    });
    const row = await db.accounts.get('user-1');
    expect(JSON.stringify(row)).not.toContain(PASSWORD);
    expect(await identity.signIn('a@x.test', PASSWORD)).toMatchObject({
      userId: 'user-1',
    });
    expect(await identity.currentUserId()).toBeNull();
    await identity.signOut();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { identity } = setup();
    await identity.signUp({
      email: 'a@x.test',
      password: PASSWORD,
      displayName: 'Ann',
    });
    await expect(
      identity.signIn('a@x.test', 'Wrong-password-1'),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
    await expect(
      identity.signIn('ghost@x.test', PASSWORD),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
    await expect(
      identity.signUp({
        email: 'a@x.test',
        password: PASSWORD,
        displayName: 'Again',
      }),
    ).rejects.toMatchObject({ code: 'email-taken' });
  });

  it('unlocks the same data key with the right password only', async () => {
    const { keyring } = setup();
    const first = await keyring.unlock('user-1', PASSWORD);
    expect(first.dataKey.extractable).toBe(false);
    expect(first.recoveryCode).toMatch(/^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/);
    const sealed = await sealJson(createAesGcmCipher(first.dataKey), {
      hello: 'world',
    });
    const again = await keyring.unlock('user-1', PASSWORD);
    expect(again.recoveryCode).toBeNull();
    expect(await openJson(createAesGcmCipher(again.dataKey), sealed)).toEqual({
      hello: 'world',
    });
    await expect(
      keyring.unlock('user-1', 'Not-the-password-1'),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
  });

  it('keeps sessions in a vault', async () => {
    const vault = createIndexedDbSessionVault(freshAccounts());
    expect(await vault.load()).toBeNull();
    const memory = createMemorySessionVault();
    const stored = {
      session: {
        userId: 'u',
        email: 'e',
        displayName: 'd',
        provider: 'local' as const,
        expiresAt: 1,
      },
      dataKey: await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
      ),
    };
    await memory.save(stored);
    expect(await memory.load()).toBe(stored);
    await memory.clear();
    expect(await memory.load()).toBeNull();
    await vault.clear();
  });

  it('compares bytes in constant time', () => {
    expect(
      constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
    ).toBe(true);
    expect(
      constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
    ).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(
      false,
    );
  });
});

describe('auth service', () => {
  const identityFor = (
    overrides: Partial<IdentityProvider> = {},
  ): IdentityProvider => ({
    kind: 'local',
    signIn: vi.fn(() =>
      Promise.resolve({ userId: 'u1', email: 'a@x.test', displayName: 'Ann' }),
    ),
    signUp: vi.fn(() =>
      Promise.resolve({
        kind: 'signed-in' as const,
        identity: { userId: 'u1', email: 'a@x.test', displayName: 'Ann' },
      }),
    ),
    signOut: vi.fn(() => Promise.resolve()),
    currentUserId: vi.fn(() => Promise.resolve(null)),
    findAccount: vi.fn(() =>
      Promise.resolve({ userId: 'u1', email: 'a@x.test', displayName: 'Ann' }),
    ),
    updatePassword: vi.fn(() => Promise.resolve()),
    requestPasswordReset: vi.fn(() => Promise.resolve()),
    exchangeResetCode: vi.fn(() =>
      Promise.resolve({ userId: 'u1', email: 'a@x.test', displayName: 'Ann' }),
    ),
    deleteAccount: vi.fn(() => Promise.resolve()),
    ...overrides,
  });

  async function setup(identity = identityFor(), now = { value: NOW }) {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const keyring: Keyring = {
      unlock: vi.fn(() =>
        Promise.resolve({ dataKey: key, recoveryCode: null }),
      ),
      recover: vi.fn(
        async (_userId, code: string, _password, commitPassword) => {
          if (code !== 'GOOD-CODE') {
            throw new AuthError('invalid-recovery');
          }
          await commitPassword?.();
          return key;
        },
      ),
      changePassword: vi.fn(
        async (_userId, current: string, _next, commitPassword) => {
          if (current !== PASSWORD) {
            throw new AuthError('invalid-credentials');
          }
          await commitPassword?.();
        },
      ),
      issueRecoveryCode: vi.fn(() =>
        Promise.resolve('NEW0-CODE-0000-0000-0000'),
      ),
      forget: vi.fn(() => Promise.resolve()),
    };
    const vault = createMemorySessionVault();
    const service = createAuthService({
      identity,
      keyring,
      vault,
      throttleStore: createMemoryKeyValueStore(),
      now: () => now.value,
      logger,
    });
    return { service, vault, keyring, identity, now };
  }

  it('signs in, unlocks the key and remembers the session for the chosen time', async () => {
    const { service, vault } = await setup();
    const { stored } = await service.signIn({
      email: ' A@X.test ',
      password: PASSWORD,
      remember: false,
    });
    expect(stored.session).toMatchObject({
      userId: 'u1',
      provider: 'local',
      expiresAt: NOW + SESSION_TTL_MS,
    });
    expect(await vault.load()).toBe(stored);
    const remembered = await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: true,
    });
    expect(remembered.stored.session.expiresAt).toBe(
      NOW + REMEMBERED_SESSION_TTL_MS,
    );
  });

  it('rejects blank input without calling the provider', async () => {
    const { service, identity } = await setup();
    await expect(
      service.signIn({ email: 'x', password: '', remember: false }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(identity.signIn).not.toHaveBeenCalled();
  });

  it('locks an email after repeated failures', async () => {
    const identity = identityFor({
      signIn: vi.fn(() => Promise.reject(new AuthError('invalid-credentials'))),
    });
    const { service } = await setup(identity);
    for (let attempt = 0; attempt < FREE_ATTEMPTS; attempt += 1) {
      await expect(
        service.signIn({
          email: 'a@x.test',
          password: 'Wrong-pass-1',
          remember: false,
        }),
      ).rejects.toMatchObject({
        code: 'invalid-credentials',
      });
    }
    await expect(
      service.signIn({
        email: 'a@x.test',
        password: PASSWORD,
        remember: false,
      }),
    ).rejects.toMatchObject({
      code: 'locked',
      retryAfterMs: 30_000,
    });
    expect(identity.signIn).toHaveBeenCalledTimes(FREE_ATTEMPTS);
  });

  it('wraps unexpected failures', async () => {
    const identity = identityFor({
      signIn: vi.fn(() => Promise.reject(new Error('kaboom'))),
    });
    const { service } = await setup(identity);
    await expect(
      service.signIn({
        email: 'a@x.test',
        password: PASSWORD,
        remember: false,
      }),
    ).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('restores a valid session and ends expired ones', async () => {
    const { service, now } = await setup();
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    expect(await service.restore()).not.toBeNull();
    now.value += SESSION_TTL_MS;
    expect(await service.restore()).toBeNull();
    expect(await service.restore()).toBeNull();
  });

  it('ends a Supabase session that no longer matches the server', async () => {
    const identity = identityFor({
      kind: 'supabase',
      currentUserId: vi.fn(() => Promise.resolve('someone-else')),
    });
    const { service } = await setup(identity);
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    expect(await service.restore()).toBeNull();
  });

  it('signs up, or reports that confirmation is needed', async () => {
    const { service } = await setup();
    const result = await service.signUp({
      displayName: 'Ann',
      email: 'a@x.test',
      password: PASSWORD,
      remember: true,
    });
    expect(result.kind).toBe('signed-in');

    const confirming = await setup(
      identityFor({
        signUp: vi.fn(() =>
          Promise.resolve({
            kind: 'confirm-email' as const,
            email: 'a@x.test',
          }),
        ),
      }),
    );
    expect(
      await confirming.service.signUp({
        displayName: 'Ann',
        email: 'a@x.test',
        password: PASSWORD,
        remember: true,
      }),
    ).toEqual({ kind: 'confirm-email', email: 'a@x.test' });
    await expect(
      confirming.service.signUp({
        displayName: 'Ann',
        email: 'a@x.test',
        password: 'weak',
        remember: true,
      }),
    ).rejects.toMatchObject({ code: 'weak-password' });
  });

  it('signs out locally even if the provider fails', async () => {
    const identity = identityFor({
      signOut: vi.fn(() => Promise.reject(new Error('offline'))),
    });
    const { service, vault } = await setup(identity);
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    await service.signOut();
    expect(await vault.load()).toBeNull();
  });

  const session = {
    userId: 'u1',
    email: 'a@x.test',
    displayName: 'Ann',
    provider: 'local' as const,
    expiresAt: NOW + 1,
  };

  it('resets with a recovery code, updates the password and signs in', async () => {
    const { service, identity, vault } = await setup();
    const result = await service.resetWithRecoveryCode({
      email: ' A@X.test ',
      recoveryCode: 'GOOD-CODE',
      newPassword: 'Fresh-password-55',
      remember: false,
    });
    expect(identity.findAccount).toHaveBeenCalledWith('a@x.test');
    expect(identity.updatePassword).toHaveBeenCalledWith(
      'u1',
      'Fresh-password-55',
    );
    expect(result.recoveryCode).toBeNull();
    expect(await vault.load()).toBe(result.stored);
  });

  it('gives one error for unknown emails and wrong codes, and throttles guesses', async () => {
    const unknown = await setup(
      identityFor({ findAccount: vi.fn(() => Promise.resolve(null)) }),
    );
    const input = {
      email: 'a@x.test',
      newPassword: 'Fresh-password-55',
      remember: false,
    };
    await expect(
      unknown.service.resetWithRecoveryCode({
        ...input,
        recoveryCode: 'GOOD-CODE',
      }),
    ).rejects.toMatchObject({ code: 'invalid-recovery' });

    const { service, identity } = await setup();
    for (let attempt = 0; attempt < FREE_ATTEMPTS; attempt += 1) {
      await expect(
        service.resetWithRecoveryCode({ ...input, recoveryCode: 'BAD' }),
      ).rejects.toMatchObject({
        code: 'invalid-recovery',
      });
    }
    await expect(
      service.resetWithRecoveryCode({ ...input, recoveryCode: 'GOOD-CODE' }),
    ).rejects.toMatchObject({
      code: 'locked',
    });
    expect(identity.updatePassword).not.toHaveBeenCalled();
  });

  it('refuses weak new passwords and invalid emails before doing any work', async () => {
    const { service, identity } = await setup();
    await expect(
      service.resetWithRecoveryCode({
        email: 'a@x.test',
        recoveryCode: 'GOOD-CODE',
        newPassword: 'short',
        remember: false,
      }),
    ).rejects.toMatchObject({ code: 'weak-password' });
    await expect(
      service.resetWithRecoveryCode({
        email: 'nope',
        recoveryCode: 'GOOD-CODE',
        newPassword: 'Fresh-password-55',
        remember: false,
      }),
    ).rejects.toMatchObject({ code: 'invalid-recovery' });
    expect(identity.findAccount).not.toHaveBeenCalled();
  });

  it('wraps unexpected reset failures', async () => {
    const { service } = await setup(
      identityFor({
        findAccount: vi.fn(() => Promise.reject(new Error('db'))),
      }),
    );
    await expect(
      service.resetWithRecoveryCode({
        email: 'a@x.test',
        recoveryCode: 'GOOD-CODE',
        newPassword: 'Fresh-password-55',
        remember: false,
      }),
    ).rejects.toMatchObject({ code: 'unknown' });
  });

  it('sends reset emails and completes them with the recovery code', async () => {
    const { service, identity } = await setup(
      identityFor({ kind: 'supabase' }),
    );
    await service.requestResetEmail(' A@X.test ');
    expect(identity.requestPasswordReset).toHaveBeenCalledWith('a@x.test');
    await expect(service.requestResetEmail('nope')).rejects.toBeInstanceOf(
      AuthError,
    );

    const result = await service.completeEmailReset({
      code: 'link-code',
      recoveryCode: 'GOOD-CODE',
      newPassword: 'Fresh-password-55',
      remember: true,
    });
    expect(identity.exchangeResetCode).toHaveBeenCalledWith('link-code');
    expect(identity.updatePassword).toHaveBeenCalledWith(
      'u1',
      'Fresh-password-55',
    );
    expect(result.stored.session.provider).toBe('supabase');

    vi.mocked(identity.updatePassword).mockClear();
    await expect(
      service.completeEmailReset({
        code: 'link-code',
        recoveryCode: 'BAD',
        newPassword: 'Fresh-password-55',
        remember: true,
      }),
    ).rejects.toMatchObject({ code: 'invalid-recovery' });
    expect(identity.updatePassword).not.toHaveBeenCalled();

    vi.mocked(identity.requestPasswordReset).mockRejectedValueOnce(
      new Error('smtp'),
    );
    await expect(service.requestResetEmail('a@x.test')).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('changes the password only after proving the current one', async () => {
    const { service, identity } = await setup();
    await service.changePassword({
      session,
      currentPassword: PASSWORD,
      newPassword: 'Fresh-password-55',
    });
    expect(identity.signIn).toHaveBeenCalledWith('a@x.test', PASSWORD);
    expect(identity.updatePassword).toHaveBeenCalledWith(
      'u1',
      'Fresh-password-55',
    );
    await expect(
      service.changePassword({
        session,
        currentPassword: PASSWORD,
        newPassword: 'weak',
      }),
    ).rejects.toMatchObject({ code: 'weak-password' });

    const wrong = await setup(
      identityFor({
        signIn: vi.fn(() =>
          Promise.reject(new AuthError('invalid-credentials')),
        ),
      }),
    );
    await expect(
      wrong.service.changePassword({
        session,
        currentPassword: 'Wrong-pass-1',
        newPassword: 'Fresh-password-55',
      }),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
    expect(wrong.identity.updatePassword).not.toHaveBeenCalled();
  });

  it('issues a new recovery code', async () => {
    const { service, keyring } = await setup();
    expect(
      await service.issueRecoveryCode({ session, password: PASSWORD }),
    ).toBe('NEW0-CODE-0000-0000-0000');
    vi.mocked(keyring.issueRecoveryCode).mockRejectedValueOnce(
      new AuthError('invalid-credentials'),
    );
    await expect(
      service.issueRecoveryCode({ session, password: 'x' }),
    ).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
  });

  it('treats a broken vault as signed out', async () => {
    const { service, vault } = await setup();
    vault.load = () => Promise.reject(new Error('corrupt'));
    expect(await service.restore()).toBeNull();
  });

  it('verifies a password for account deletion, throttling failures', async () => {
    const { service, identity } = await setup();
    await expect(
      service.verifyPassword({ session, password: PASSWORD }),
    ).resolves.toBeUndefined();
    vi.mocked(identity.signIn).mockRejectedValue(
      new AuthError('invalid-credentials'),
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.verifyPassword({ session, password: 'nope' }),
      ).rejects.toMatchObject({ code: 'invalid-credentials' });
    }
    await expect(
      service.verifyPassword({ session, password: 'nope' }),
    ).rejects.toMatchObject({ code: 'locked' });
  });

  it('rejects a password that belongs to a different account', async () => {
    const { service, identity } = await setup();
    vi.mocked(identity.signIn).mockResolvedValueOnce({
      userId: 'someone-else',
      email: 'a@x.test',
      displayName: 'Ann',
    });
    await expect(
      service.verifyPassword({ session, password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'invalid-credentials' });
  });

  it('deletes the identity, the wrapped key and the stored session', async () => {
    const { service, identity, keyring, vault } = await setup();
    await service.signIn({
      email: 'a@x.test',
      password: PASSWORD,
      remember: false,
    });
    await service.deleteIdentity(session);
    expect(identity.deleteAccount).toHaveBeenCalledWith('u1');
    expect(keyring.forget).toHaveBeenCalledWith('u1');
    expect(await vault.load()).toBeNull();
  });
});

describe('Supabase identity provider', () => {
  const user = {
    id: 'sb-1',
    email: 'a@x.test',
    user_metadata: { display_name: 'Ann' },
  };

  function client(
    overrides: Partial<SupabaseAuthClient['auth']> = {},
    rpc: SupabaseAuthClient['rpc'] = vi.fn(() =>
      Promise.resolve({ error: null }),
    ),
  ): SupabaseAuthClient {
    return {
      rpc,
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: { user, session: {} }, error: null }),
        ),
        signUp: vi.fn(() =>
          Promise.resolve({ data: { user, session: {} }, error: null }),
        ),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
        resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })),
        exchangeCodeForSession: vi.fn(() =>
          Promise.resolve({ data: { user, session: {} }, error: null }),
        ),
        updateUser: vi.fn(() =>
          Promise.resolve({ data: { user }, error: null }),
        ),
        getSession: vi.fn(() =>
          Promise.resolve({ data: { session: { user } }, error: null }),
        ),
        ...overrides,
      },
    };
  }

  it('deletes the account server-side, then drops the session', async () => {
    const rpc = vi.fn(() => Promise.resolve({ error: null }));
    const signOut = vi.fn(() => Promise.resolve({ error: null }));
    const provider = createSupabaseIdentityProvider(
      client({ signOut }, rpc),
      'https://app/sign-in',
    );
    await provider.deleteAccount('sb-1');
    expect(rpc).toHaveBeenCalledWith('delete_my_account');
    expect(signOut).toHaveBeenCalled();

    const refusing = createSupabaseIdentityProvider(
      client({}, () =>
        Promise.resolve({
          error: { status: 400, message: 'storage_not_empty' },
        }),
      ),
      'https://app/sign-in',
    );
    await expect(refusing.deleteAccount('sb-1')).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('maps a successful sign-in and the current session', async () => {
    const provider = createSupabaseIdentityProvider(
      client(),
      'https://app/sign-in',
    );
    expect(await provider.signIn('a@x.test', PASSWORD)).toEqual({
      userId: 'sb-1',
      email: 'a@x.test',
      displayName: 'Ann',
    });
    expect(await provider.currentUserId()).toBe('sb-1');
    await provider.signOut();
  });

  it('maps Supabase errors to auth errors', async () => {
    const failing = (status: number | undefined, code?: string) =>
      createSupabaseIdentityProvider(
        client({
          signInWithPassword: () =>
            Promise.resolve({
              data: { user: null, session: null },
              error: { status, code, message: 'x' },
            }),
        }),
        '',
      );
    await expect(failing(400).signIn('a', 'b')).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    await expect(failing(429).signIn('a', 'b')).rejects.toMatchObject({
      code: 'rate-limited',
    });
    // The hourly email quota gets its own message, not "wait a minute".
    await expect(
      failing(429, 'over_email_send_rate_limit').signIn('a', 'b'),
    ).rejects.toMatchObject({
      code: 'email-limited',
      message: expect.stringContaining('Try again in an hour'),
    });
    await expect(
      failing(422, 'weak_password').signIn('a', 'b'),
    ).rejects.toMatchObject({ code: 'weak-password' });
    await expect(failing(undefined).signIn('a', 'b')).rejects.toMatchObject({
      code: 'network',
    });
    await expect(failing(500).signIn('a', 'b')).rejects.toMatchObject({
      code: 'unknown',
    });
    const noUser = createSupabaseIdentityProvider(
      client({
        signInWithPassword: () =>
          Promise.resolve({ data: { user: null, session: null }, error: null }),
      }),
      '',
    );
    await expect(noUser.signIn('a', 'b')).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('asks for email confirmation when sign-up returns no session', async () => {
    const signUp = vi.fn(() =>
      Promise.resolve({ data: { user, session: null }, error: null }),
    );
    const provider = createSupabaseIdentityProvider(
      client({ signUp }),
      'https://app/sign-in',
    );
    expect(
      await provider.signUp({
        email: 'a@x.test',
        password: PASSWORD,
        displayName: 'Ann',
      }),
    ).toEqual({
      kind: 'confirm-email',
      email: 'a@x.test',
    });
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          data: { display_name: 'Ann' },
          emailRedirectTo: 'https://app/sign-in',
        },
      }),
    );
    const direct = createSupabaseIdentityProvider(
      client({
        signUp: () =>
          Promise.resolve({
            data: { user: { ...user, user_metadata: {} }, session: {} },
            error: null,
          }),
      }),
      '',
    );
    expect(
      await direct.signUp({
        email: 'a@x.test',
        password: PASSWORD,
        displayName: 'Ann',
      }),
    ).toMatchObject({
      kind: 'signed-in',
      identity: { displayName: 'a' },
    });
  });

  it('resets passwords through the emailed link', async () => {
    const auth = client();
    const provider = createSupabaseIdentityProvider(
      auth,
      'https://app/sign-in',
      'https://app/reset-password',
    );
    await provider.requestPasswordReset('a@x.test');
    expect(auth.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@x.test', {
      redirectTo: 'https://app/reset-password',
    });
    expect(await provider.exchangeResetCode('code')).toMatchObject({
      userId: 'sb-1',
    });
    await provider.updatePassword('sb-1', PASSWORD);
    expect(auth.auth.updateUser).toHaveBeenCalledWith({ password: PASSWORD });
    await expect(
      provider.updatePassword('someone-else', PASSWORD),
    ).rejects.toBeInstanceOf(AuthError);
    expect(await provider.findAccount('a@x.test')).toBeNull();
  });

  it('maps reset failures', async () => {
    const provider = createSupabaseIdentityProvider(
      client({
        resetPasswordForEmail: () =>
          Promise.resolve({ error: { status: 429, message: 'slow down' } }),
        exchangeCodeForSession: () =>
          Promise.resolve({
            data: { user: null, session: null },
            error: { status: 400, message: 'expired' },
          }),
        updateUser: () =>
          Promise.resolve({
            data: { user: null },
            error: { status: 422, code: 'weak_password', message: 'weak' },
          }),
      }),
      '',
    );
    await expect(
      provider.requestPasswordReset('a@x.test'),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(provider.exchangeResetCode('old')).rejects.toMatchObject({
      code: 'reset-link-invalid',
    });
    await expect(provider.updatePassword('sb-1', 'x')).rejects.toMatchObject({
      code: 'weak-password',
    });
  });

  it('surfaces sign-out errors', async () => {
    const provider = createSupabaseIdentityProvider(
      client({
        signOut: () =>
          Promise.resolve({ error: { status: 500, message: 'x' } }),
      }),
      '',
    );
    await expect(provider.signOut()).rejects.toBeInstanceOf(AuthError);
  });
});

describe('recovery codes', () => {
  it('generates five groups of four from an unambiguous alphabet', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){4}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(generateRecoveryCode()).not.toBe(code);
    expect(generateRecoveryCode((bytes) => bytes.fill(255))).toBe(
      'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ',
    );
    expect(formatRecoveryCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('accepts sloppy input but rejects impossible codes', () => {
    expect(normaliseRecoveryCode(' abcd-efgh ijkm-np0o-il00 ')).toBe(
      'ABCDEFGH1JKMNP001100',
    );
    expect(normaliseRecoveryCode('ABCD-EFGH')).toBeNull();
    expect(normaliseRecoveryCode('UUUU-UUUU-UUUU-UUUU-UUUU')).toBeNull();
  });
});

describe('keyring recovery', () => {
  const NEW_PASSWORD = 'Brand-new-pass-77';

  function setup() {
    const db = freshAccounts();
    return {
      db,
      keyring: createKeyring({
        store: createLocalWrappedKeyStore(db),
        iterations: ITERATIONS,
      }),
    };
  }

  async function sealedWith(key: CryptoKey) {
    return sealJson(createAesGcmCipher(key), { design: 'kept' });
  }

  it('resets the password with the recovery code and keeps the same data key', async () => {
    const { keyring } = setup();
    const created = await keyring.unlock('u', PASSWORD);
    const sealed = await sealedWith(created.dataKey);
    const commit = vi.fn(() => Promise.resolve());
    const code = (created.recoveryCode ?? '').toLowerCase().replace(/-/g, ' ');
    const recovered = await keyring.recover('u', code, NEW_PASSWORD, commit);
    expect(commit).toHaveBeenCalled();
    expect(recovered.extractable).toBe(false);
    expect(await openJson(createAesGcmCipher(recovered), sealed)).toEqual({
      design: 'kept',
    });
    await expect(keyring.unlock('u', PASSWORD)).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    const unlocked = await keyring.unlock('u', NEW_PASSWORD);
    expect(
      await openJson(createAesGcmCipher(unlocked.dataKey), sealed),
    ).toEqual({ design: 'kept' });
  });

  it('rejects a wrong, malformed or missing recovery code without changing anything', async () => {
    const { keyring } = setup();
    await keyring.unlock('u', PASSWORD);
    const commit = vi.fn(() => Promise.resolve());
    await expect(
      keyring.recover('u', generateRecoveryCode(), NEW_PASSWORD, commit),
    ).rejects.toMatchObject({
      code: 'invalid-recovery',
    });
    await expect(
      keyring.recover('u', 'nope', NEW_PASSWORD),
    ).rejects.toMatchObject({ code: 'invalid-recovery' });
    await expect(
      keyring.recover('ghost', generateRecoveryCode(), NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: 'invalid-recovery',
    });
    expect(commit).not.toHaveBeenCalled();
    await expect(keyring.unlock('u', PASSWORD)).resolves.toBeDefined();
  });

  it('leaves the keyring untouched if the password update elsewhere fails', async () => {
    const { keyring } = setup();
    const { recoveryCode } = await keyring.unlock('u', PASSWORD);
    await expect(
      keyring.recover('u', recoveryCode ?? '', NEW_PASSWORD, () =>
        Promise.reject(new Error('server down')),
      ),
    ).rejects.toThrow('server down');
    await expect(keyring.unlock('u', PASSWORD)).resolves.toBeDefined();
  });

  it('changes the password and issues replacement codes', async () => {
    const { keyring } = setup();
    const { recoveryCode: original } = await keyring.unlock('u', PASSWORD);
    await expect(
      keyring.changePassword('u', 'Wrong-pass-1', NEW_PASSWORD),
    ).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    await keyring.changePassword('u', PASSWORD, NEW_PASSWORD);
    await expect(keyring.unlock('u', NEW_PASSWORD)).resolves.toBeDefined();

    const replacement = await keyring.issueRecoveryCode('u', NEW_PASSWORD);
    await expect(
      keyring.recover('u', original ?? '', PASSWORD),
    ).rejects.toMatchObject({ code: 'invalid-recovery' });
    await expect(
      keyring.recover('u', replacement, PASSWORD),
    ).resolves.toBeDefined();
    await expect(
      keyring.issueRecoveryCode('ghost', PASSWORD),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      keyring.changePassword('ghost', PASSWORD, NEW_PASSWORD),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it('issues a code to older accounts that never had one', async () => {
    const { db, keyring } = setup();
    await keyring.unlock('u', PASSWORD);
    const row = await db.keys.get('u');
    await db.keys.put({
      ...row,
      userId: 'u',
      salt: row?.salt ?? '',
      iterations: row?.iterations ?? 0,
      iv: row?.iv ?? '',
      wrapped: row?.wrapped ?? '',
      recovery: undefined,
    });
    const upgraded = await keyring.unlock('u', PASSWORD);
    expect(upgraded.recoveryCode).not.toBeNull();
    expect((await keyring.unlock('u', PASSWORD)).recoveryCode).toBeNull();
  });
});

describe('keyring concurrency and key stores', () => {
  const NEW_PASSWORD = 'Brand-new-pass-77';

  it('fails a stale update with nothing stored, so the other device’s change stands', async () => {
    const store = createLocalWrappedKeyStore(freshAccounts());
    const deviceA = createKeyring({ store, iterations: ITERATIONS });
    await deviceA.unlock('u', PASSWORD);
    // Device B read the key, then A changed the password first.
    const staleRead = await store.get('u');
    await deviceA.changePassword('u', PASSWORD, NEW_PASSWORD);
    const racing = {
      ...store,
      get: () => Promise.resolve(staleRead),
    };
    const deviceB = createKeyring({ store: racing, iterations: ITERATIONS });
    await expect(
      deviceB.changePassword('u', PASSWORD, 'Third-pass-123'),
    ).rejects.toMatchObject({ code: 'stale' });
    await expect(deviceA.unlock('u', NEW_PASSWORD)).resolves.toBeDefined();
  });

  it('adopts the key another device created first instead of making a second', async () => {
    const store = createLocalWrappedKeyStore(freshAccounts());
    const first = createKeyring({ store, iterations: ITERATIONS });
    const created = await first.unlock('u', PASSWORD);
    const sealed = await sealJson(createAesGcmCipher(created.dataKey), 'x');
    // A device that saw no key yet tries to create one.
    const racing = {
      ...store,
      get: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockImplementation(() => store.get('u')),
    };
    const second = createKeyring({ store: racing, iterations: ITERATIONS });
    const adopted = await second.unlock('u', PASSWORD);
    expect(adopted.recoveryCode).toBeNull();
    expect(await openJson(createAesGcmCipher(adopted.dataKey), sealed)).toBe(
      'x',
    );
    // If the winner vanished, the loser fails safely.
    const vanished = createKeyring({
      store: { ...store, get: () => Promise.resolve(null) },
      iterations: ITERATIONS,
    });
    await expect(vanished.unlock('u', PASSWORD)).rejects.toMatchObject({
      code: 'stale',
    });
  });

  it('stores the new wrap before changing the provider’s password', async () => {
    const store = createLocalWrappedKeyStore(freshAccounts());
    const keyring = createKeyring({ store, iterations: ITERATIONS });
    await keyring.unlock('u', PASSWORD);
    const commit = vi.fn(async () => {
      // By now the key already unlocks with the new password.
      await expect(keyring.unlock('u', NEW_PASSWORD)).resolves.toBeDefined();
    });
    await keyring.changePassword('u', PASSWORD, NEW_PASSWORD, commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('never changes the provider’s password when the wrap can’t be stored', async () => {
    const store = createLocalWrappedKeyStore(freshAccounts());
    await createKeyring({ store, iterations: ITERATIONS }).unlock(
      'u',
      PASSWORD,
    );
    const failing = createKeyring({
      store: { ...store, update: () => Promise.resolve(false) },
      iterations: ITERATIONS,
    });
    const commit = vi.fn(() => Promise.resolve());
    await expect(
      failing.changePassword('u', PASSWORD, NEW_PASSWORD, commit),
    ).rejects.toMatchObject({ code: 'stale' });
    expect(commit).not.toHaveBeenCalled();
  });

  it('restores the old wrap when the provider rejects the new password', async () => {
    const store = createLocalWrappedKeyStore(freshAccounts());
    const keyring = createKeyring({ store, iterations: ITERATIONS });
    const { recoveryCode } = await keyring.unlock('u', PASSWORD);
    await expect(
      keyring.recover('u', recoveryCode ?? '', NEW_PASSWORD, () =>
        Promise.reject(new Error('provider down')),
      ),
    ).rejects.toThrow('provider down');
    await expect(keyring.unlock('u', PASSWORD)).resolves.toBeDefined();
    await expect(keyring.unlock('u', NEW_PASSWORD)).rejects.toMatchObject({
      code: 'invalid-credentials',
    });
    // Even if restoring fails too, the provider's error is what's reported.
    const brittle = createKeyring({
      store: {
        ...store,
        update: vi
          .fn()
          .mockImplementationOnce((record, version: number) =>
            store.update(record as never, version),
          )
          .mockRejectedValue(new Error('offline')),
      },
      iterations: ITERATIONS,
    });
    await expect(
      brittle.changePassword('u', PASSWORD, NEW_PASSWORD, () =>
        Promise.reject(new Error('provider down')),
      ),
    ).rejects.toThrow('provider down');
  });

  it('forgets a local key on account deletion', async () => {
    const store = createLocalWrappedKeyStore(freshAccounts());
    const keyring = createKeyring({ store, iterations: ITERATIONS });
    await keyring.unlock('u', PASSWORD);
    await keyring.forget('u');
    expect(await store.get('u')).toBeNull();
    expect(
      await store.update(
        {
          userId: 'u',
          password: { salt: 'a', iterations: 1000, iv: 'a', wrapped: 'a' },
          recovery: null,
        },
        1,
      ),
    ).toBe(false);
  });

  const WRAP = {
    salt: 'c2FsdA==',
    iterations: 600000,
    iv: 'aXY=',
    wrapped: 'd3JhcHBlZA==',
  };
  const ROW = {
    user_id: 'u',
    password_wrap: WRAP,
    recovery_wrap: null,
    version: 3,
  };

  it('stores wrapped keys on Supabase with version-checked updates', async () => {
    const fake = createFakeSupabase();
    const store = createSupabaseWrappedKeyStore(fake.client);
    fake.respond(
      { data: ROW },
      { data: null },
      { data: null },
      { error: { message: 'dup', code: '23505' } },
      { data: { version: 4 } },
      { data: null },
    );
    expect(await store.get('u')).toEqual({
      userId: 'u',
      password: WRAP,
      recovery: null,
      version: 3,
    });
    expect(await store.get('ghost')).toBeNull();
    const record = { userId: 'u', password: WRAP, recovery: WRAP };
    expect(await store.create(record)).toBe(true);
    expect(await store.create(record)).toBe(false);
    expect(await store.update(record, 3)).toBe(true);
    expect(await store.update(record, 3)).toBe(false);
    expect(fake.calls[0]?.table).toBe('workspace_keys');
    const update = fake.calls[4]?.chain;
    expect(
      update?.filter(([name]) => name === 'eq').map(([, args]) => args),
    ).toEqual([
      ['user_id', 'u'],
      ['version', 3],
    ]);
    await expect(store.forget('u')).resolves.toBeUndefined();
  });

  it('rejects malformed server rows and surfaces errors', async () => {
    const fake = createFakeSupabase();
    const store = createSupabaseWrappedKeyStore(fake.client);
    const record = { userId: 'u', password: WRAP, recovery: null };
    fake.respond(
      { data: { ...ROW, password_wrap: { ...WRAP, iterations: 1 } } },
      { error: { message: 'down' } },
      { error: { message: 'down' } },
      { error: { message: 'down' } },
    );
    await expect(store.get('u')).rejects.toThrow();
    await expect(store.get('u')).rejects.toThrow('load key failed');
    await expect(store.create(record)).rejects.toThrow('store key failed');
    await expect(store.update(record, 1)).rejects.toThrow('update key failed');
  });

  it('uploads a key that only this device has, then uses the server copy', async () => {
    const local = createLocalWrappedKeyStore(freshAccounts());
    const keyring = createKeyring({ store: local, iterations: ITERATIONS });
    await keyring.unlock('u', PASSWORD);
    const server = new Map<string, WrappedKeyRecord>();
    const remote = {
      get: (userId: string) => Promise.resolve(server.get(userId) ?? null),
      create: (record: Omit<WrappedKeyRecord, 'version'>) => {
        server.set(record.userId, { ...record, version: 1 });
        return Promise.resolve(true);
      },
      update: () => Promise.resolve(false),
      forget: vi.fn(() => Promise.resolve()),
    };
    const layered = withLocalFallback(remote, local, logger);
    expect(await layered.get('u')).toMatchObject({ userId: 'u', version: 1 });
    expect(server.has('u')).toBe(true);
    expect(await layered.get('ghost')).toBeNull();
    expect(
      await layered.update({ userId: 'u', password: WRAP, recovery: null }, 1),
    ).toBe(false);
    await layered.forget('u');
    expect(remote.forget).toHaveBeenCalled();
    expect(await local.get('u')).toBeNull();
    // The upgraded key still unlocks with the same password.
    const upgraded = createKeyring({ store: layered, iterations: ITERATIONS });
    await expect(upgraded.unlock('u', PASSWORD)).resolves.toBeDefined();
  });
});

describe('local identity provider password updates', () => {
  it('finds accounts by email and replaces the verifier', async () => {
    const db = freshAccounts();
    const identity = createLocalIdentityProvider({
      db,
      createId: () => 'u',
      now: () => NOW,
      iterations: ITERATIONS,
    });
    await identity.signUp({
      email: 'a@x.test',
      password: PASSWORD,
      displayName: 'Ann',
    });
    expect(await identity.findAccount('a@x.test')).toEqual({
      userId: 'u',
      email: 'a@x.test',
      displayName: 'Ann',
    });
    expect(await identity.findAccount('ghost@x.test')).toBeNull();
    await identity.updatePassword('u', 'Another-pass-99');
    await expect(identity.signIn('a@x.test', PASSWORD)).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(
      identity.signIn('a@x.test', 'Another-pass-99'),
    ).resolves.toMatchObject({ userId: 'u' });
    await expect(
      identity.updatePassword('ghost', 'Another-pass-99'),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      identity.requestPasswordReset('a@x.test'),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(identity.exchangeResetCode('code')).rejects.toMatchObject({
      code: 'reset-link-invalid',
    });
    await identity.deleteAccount('u');
    expect(await identity.findAccount('a@x.test')).toBeNull();
  });
});
