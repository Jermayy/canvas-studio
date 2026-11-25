import type { IdentityProvider } from '@/modules/auth/application/ports';
import { AuthError, type Identity } from '@/modules/auth/domain/authModel';

/**
 * Supabase Auth adapter: credentials are verified server-side, with
 * Supabase's own rate limits and email confirmation. Typed against the
 * small slice of supabase-js it uses so tests can fake it.
 */

interface SupabaseUser {
  id: string;
  email?: string;
  identities?: unknown[];
  user_metadata: Record<string, unknown>;
}

interface SupabaseError {
  status?: number;
  code?: string;
  message: string;
}

interface AuthResponse {
  data: { user: SupabaseUser | null; session: unknown };
  error: SupabaseError | null;
}

export interface SupabaseAuthClient {
  auth: {
    signInWithPassword: (credentials: {
      email: string;
      password: string;
    }) => Promise<AuthResponse>;
    signUp: (credentials: {
      email: string;
      password: string;
      options: { data: Record<string, string>; emailRedirectTo: string };
    }) => Promise<AuthResponse>;
    signOut: () => Promise<{ error: SupabaseError | null }>;
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string },
    ) => Promise<{ error: SupabaseError | null }>;
    exchangeCodeForSession: (code: string) => Promise<AuthResponse>;
    updateUser: (attributes: { password: string }) => Promise<{
      data: { user: SupabaseUser | null };
      error: SupabaseError | null;
    }>;
    getSession: () => Promise<{
      data: { session: { user: SupabaseUser } | null };
      error: SupabaseError | null;
    }>;
  };
  rpc: (fn: 'delete_my_account') => PromiseLike<{
    error: SupabaseError | null;
  }>;
}

function toAuthError(error: SupabaseError): AuthError {
  // Checked first: it's also a 429, but hourly and project-wide.
  if (error.code === 'over_email_send_rate_limit') {
    return new AuthError('email-limited');
  }
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return new AuthError('rate-limited');
  }
  if (error.code === 'weak_password') {
    return new AuthError('weak-password');
  }
  if (error.status === 400 || error.code === 'invalid_credentials') {
    return new AuthError('invalid-credentials');
  }
  if (error.status === undefined || error.status === 0) {
    return new AuthError('network');
  }
  return new AuthError('unknown');
}

function toIdentity(user: SupabaseUser, fallbackEmail: string): Identity {
  const name = user.user_metadata.display_name;
  return {
    userId: user.id,
    email: user.email ?? fallbackEmail,
    displayName:
      typeof name === 'string' && name
        ? name
        : (fallbackEmail.split('@')[0] ?? ''),
  };
}

export function createSupabaseIdentityProvider(
  client: SupabaseAuthClient,
  redirectUrl: string,
  resetRedirectUrl = redirectUrl,
): IdentityProvider {
  return {
    kind: 'supabase',

    signIn: async (email, password) => {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw toAuthError(error);
      }
      if (!data.user) {
        throw new AuthError('unknown');
      }
      return toIdentity(data.user, email);
    },

    signUp: async ({ email, password, displayName }) => {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: redirectUrl,
        },
      });
      if (error) {
        throw toAuthError(error);
      }
      // With email confirmation on (or an existing email, which Supabase
      // deliberately doesn't reveal) there's no session yet.
      if (!data.session || !data.user) {
        return { kind: 'confirm-email', email };
      }
      return { kind: 'signed-in', identity: toIdentity(data.user, email) };
    },

    signOut: async () => {
      const { error } = await client.auth.signOut();
      if (error) {
        throw toAuthError(error);
      }
    },

    currentUserId: async () => {
      const { data } = await client.auth.getSession();
      return data.session?.user.id ?? null;
    },

    // Supabase resets go through its email link; there's no email lookup.
    findAccount: () => Promise.resolve(null),

    updatePassword: async (userId, newPassword) => {
      const { data, error } = await client.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        throw toAuthError(error);
      }
      if (data.user?.id !== userId) {
        throw new AuthError('unknown');
      }
    },

    requestPasswordReset: async (email) => {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectUrl,
      });
      // Unknown emails succeed silently on Supabase, so nothing is revealed.
      if (error) {
        throw toAuthError(error);
      }
    },

    deleteAccount: async () => {
      // Server-side: refuses while files remain, then deletes the auth user
      // (keys, designs and shares cascade). RLS scopes it to the caller.
      const { error } = await client.rpc('delete_my_account');
      if (error) {
        throw toAuthError(error);
      }
      // The session belongs to a deleted user; drop it locally.
      await client.auth.signOut();
    },

    exchangeResetCode: async (code) => {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        throw new AuthError('reset-link-invalid');
      }
      return toIdentity(data.user, data.user.email ?? '');
    },
  };
}
