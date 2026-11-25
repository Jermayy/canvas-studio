import { BrandMark, Link } from '@/app/components/AppChrome';
import { useServices } from '@/app/services';
import type { AuthSuccess } from '@/modules/auth/application/authService';
import { PasswordStrength } from '@/modules/auth/components/PasswordStrength';
import { AuthError, formatRetryAfter } from '@/modules/auth/domain/authModel';
import {
  fieldErrors,
  signInSchema,
  signUpSchema,
} from '@/modules/auth/domain/credentials';
import { templateById, templatePreview } from '@/modules/library/templates';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { Button, IconButton } from '@/shared/ui/Button';
import { Banner } from '@/shared/ui/feedback';
import { TextField } from '@/shared/ui/fields';
import { Icon } from '@/shared/ui/Icon';
import { useState } from 'react';

type Mode = 'sign-in' | 'sign-up';

const SHOWCASE = [
  'birthday-thirty',
  'corporate-town-hall',
  'wedding-save-the-date',
];

function Showcase() {
  return (
    <div className="auth-showcase" aria-hidden="true">
      {SHOWCASE.map((id, index) => {
        const template = templateById(id);
        return template ? (
          <div
            key={id}
            className={`auth-showcase__card auth-showcase__card--${index}`}
          >
            <DesignSvg
              document={templatePreview(template)}
              assetUrls={{}}
              className="fluid-svg"
            />
          </div>
        ) : null;
      })}
    </div>
  );
}

function describeFailure(error: unknown): string {
  if (error instanceof AuthError) {
    return error.code === 'locked' && error.retryAfterMs
      ? `Too many attempts. Try again in ${formatRetryAfter(error.retryAfterMs)}.`
      : error.message;
  }
  return 'Something went wrong. Try again.';
}

export function AuthPage({
  mode,
  next,
  onAuthenticated,
}: {
  mode: Mode;
  next: string;
  onAuthenticated: (success: AuthSuccess) => void;
}) {
  const { auth } = useServices();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(
    null,
  );
  const isSignUp = mode === 'sign-up';
  const nextQuery =
    next === '/projects' ? '' : `?next=${encodeURIComponent(next)}`;
  const local = auth.providerKind === 'local';

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setFormError(null);
    const parsed = isSignUp
      ? signUpSchema.safeParse({ displayName, email, password })
      : signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (isSignUp) {
        const result = await auth.signUp({
          displayName,
          email,
          password,
          remember,
        });
        if (result.kind === 'confirm-email') {
          setConfirmationSentTo(result.email);
          return;
        }
        onAuthenticated(result);
      } else {
        onAuthenticated(await auth.signIn({ email, password, remember }));
      }
    } catch (error) {
      setFormError(describeFailure(error));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-page__brand">
        <Link to="/" className="auth-page__logo">
          <BrandMark />
        </Link>
        <div className="auth-page__pitch">
          <h1>Event graphics that look agency-made.</h1>
          <p>
            Posters, invitations, slides and social posts, from first idea to
            print-ready PDF.
          </p>
          <ul className="auth-page__points">
            <li>
              <Icon name="shield" size={16} />{' '}
              {local
                ? 'Designs encrypted with your password'
                : 'Secured by Supabase Auth'}
            </li>
            <li>
              <Icon name="layers" size={16} /> Precise layers, guides and
              snapping
            </li>
            <li>
              <Icon name="download" size={16} /> PDF, PNG, JPEG and vector SVG
            </li>
          </ul>
        </div>
        <Showcase />
      </aside>

      <main className="auth-page__main">
        <div className="auth-card">
          {confirmationSentTo ? (
            <div className="auth-card__confirm" role="status">
              <span className="auth-card__confirm-icon">
                <Icon name="mail" size={26} />
              </span>
              <h2>Check your inbox</h2>
              <p>
                We sent a confirmation link to{' '}
                <strong>{confirmationSentTo}</strong>. Open it, then sign in
                here.
              </p>
              {/* Shown for every sign-up, so it never reveals whether the
                  email is registered (playbook 03; Supabase sends no new
                  link to an existing account). */}
              <p className="auth-card__confirm-hint">
                Already have an account with this email? We don’t send another
                link. Sign in instead, or reset your password.
              </p>
              <div className="auth-card__confirm-actions">
                <Link
                  to={`/sign-in${nextQuery}`}
                  className="btn btn--primary btn--md"
                >
                  Go to sign in
                </Link>
                <Link
                  to={`/reset-password?email=${encodeURIComponent(confirmationSentTo)}`}
                  className="auth-form__forgot"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          ) : (
            <>
              <nav className="auth-card__tabs" aria-label="Account">
                <Link
                  to={`/sign-in${nextQuery}`}
                  className={`auth-card__tab${isSignUp ? '' : ' auth-card__tab--active'}`}
                  aria-current={isSignUp ? undefined : 'page'}
                >
                  Sign in
                </Link>
                <Link
                  to={`/sign-up${nextQuery}`}
                  className={`auth-card__tab${isSignUp ? ' auth-card__tab--active' : ''}`}
                  aria-current={isSignUp ? 'page' : undefined}
                >
                  Create account
                </Link>
              </nav>
              <h2 className="auth-card__title">
                {isSignUp ? 'Create your studio' : 'Welcome back'}
              </h2>
              <p className="auth-card__subtitle">
                {isSignUp
                  ? 'Free, private and ready in seconds.'
                  : 'Sign in to open your projects.'}
              </p>

              <form
                className="auth-form"
                noValidate
                onSubmit={(event) => {
                  void submit(event);
                }}
              >
                {formError && <Banner tone="error">{formError}</Banner>}
                {isSignUp && (
                  <TextField
                    label="Name"
                    autoComplete="name"
                    value={displayName}
                    error={errors.displayName}
                    maxLength={60}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                    }}
                  />
                )}
                <TextField
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  error={errors.email}
                  data-autofocus
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  error={errors.password}
                  maxLength={128}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  trailing={
                    <IconButton
                      icon={showPassword ? 'eye-off' : 'eye'}
                      label={showPassword ? 'Hide password' : 'Show password'}
                      size="sm"
                      className="field__trailing"
                      onClick={() => {
                        setShowPassword((value) => !value);
                      }}
                    />
                  }
                />
                {isSignUp && (
                  <PasswordStrength password={password} email={email} />
                )}
                {!isSignUp && (
                  <Link
                    to={`/reset-password${email ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                    className="auth-form__forgot"
                  >
                    Forgot password?
                  </Link>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => {
                      setRemember(event.target.checked);
                    }}
                  />
                  <span>Keep me signed in for 30 days</span>
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  busy={busy}
                  busyLabel={
                    isSignUp
                      ? 'Creating your encrypted studio…'
                      : 'Unlocking your workspace…'
                  }
                  className="auth-form__submit"
                >
                  {isSignUp ? 'Create account' : 'Sign in'}
                </Button>
              </form>

              <div className="auth-card__divider">
                <span>or</span>
              </div>
              <Link
                to="/sandbox"
                className="btn btn--secondary btn--md auth-card__sandbox"
              >
                <Icon name="sparkles" size={17} /> Try the studio without an
                account
              </Link>
              <p className="auth-card__note">
                <Icon name="shield" size={14} />
                {local
                  ? 'Accounts live on this device only. Your password never leaves it, and your designs are encrypted at rest with a key only your password unlocks.'
                  : 'Your email and password are handled by Supabase Auth (Sydney). Designs are also encrypted on this device.'}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
