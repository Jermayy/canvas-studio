import { BrandMark, Link } from '@/app/components/AppChrome';
import { useServices } from '@/app/services';
import type { AuthSuccess } from '@/modules/auth/application/authService';
import { PasswordStrength } from '@/modules/auth/components/PasswordStrength';
import { AuthError, formatRetryAfter } from '@/modules/auth/domain/authModel';
import { Button } from '@/shared/ui/Button';
import { Banner } from '@/shared/ui/feedback';
import { TextField } from '@/shared/ui/fields';
import { useState } from 'react';

function describe(error: unknown): string {
  if (error instanceof AuthError) {
    return error.code === 'locked' && error.retryAfterMs
      ? `Too many attempts. Try again in ${formatRetryAfter(error.retryAfterMs)}.`
      : error.message;
  }
  return 'Something went wrong. Try again.';
}

/**
 * Forgotten password. Device-local accounts: email + recovery code + new
 * password. Supabase: request an email link first, then (with `code` in
 * the URL) recovery code + new password. Either way the encrypted
 * workspace is kept (ADR 0011).
 */
export function ResetPasswordPage({
  email: initialEmail,
  code,
  onAuthenticated,
}: {
  email: string;
  code: string | null;
  onAuthenticated: (success: AuthSuccess) => void;
}) {
  const { auth } = useServices();
  const emailStep = auth.providerKind === 'supabase' && code === null;
  const [email, setEmail] = useState(initialEmail);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (emailStep) {
        await auth.requestResetEmail(email);
        setSent(true);
      } else if (code !== null) {
        onAuthenticated(
          await auth.completeEmailReset({
            code,
            recoveryCode,
            newPassword: password,
            remember: false,
          }),
        );
      } else {
        onAuthenticated(
          await auth.resetWithRecoveryCode({
            email,
            recoveryCode,
            newPassword: password,
            remember: false,
          }),
        );
      }
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="centered-page">
      <Link
        to="/"
        className="centered-page__brand"
        aria-label="Canvas Studio home"
      >
        <BrandMark />
      </Link>
      <div className="auth-card">
        <h1 className="auth-card__title">Reset your password</h1>
        {sent ? (
          <p className="auth-card__subtitle" role="status">
            If an account exists for {email}, a reset link is on its way. Open
            it in this browser.
          </p>
        ) : (
          <form
            className="auth-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p className="auth-card__subtitle">
              {emailStep
                ? 'We’ll email you a link. You’ll also need your recovery code to unlock your designs.'
                : 'Enter the recovery code you saved when you created your account.'}
            </p>
            {error && <Banner tone="error">{error}</Banner>}
            {code === null && (
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            )}
            {!emailStep && (
              <>
                <TextField
                  label="Recovery code"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                  value={recoveryCode}
                  onChange={(event) => {
                    setRecoveryCode(event.target.value);
                  }}
                />
                <TextField
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                />
                <PasswordStrength password={password} email={email} />
              </>
            )}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              busy={busy}
              busyLabel="Working…"
              className="auth-form__submit"
            >
              {emailStep ? 'Send reset link' : 'Reset password and sign in'}
            </Button>
          </form>
        )}
        <p className="auth-card__note">
          Lost your recovery code too? Your encrypted designs can’t be recovered
          without it.
        </p>
        <Link to="/sign-in">Back to sign in</Link>
      </div>
    </main>
  );
}
