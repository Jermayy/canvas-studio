import { assessPassword } from '@/modules/auth/domain/credentials';

/** Live strength feedback while choosing a password. */
export function PasswordStrength({
  password,
  email,
}: {
  password: string;
  email: string;
}) {
  if (!password) {
    return null;
  }
  const assessment = assessPassword(password, email);
  return (
    <div
      className={`strength strength--${assessment.score}`}
      aria-live="polite"
    >
      <div className="strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={
              bar <= assessment.score
                ? 'strength__bar strength__bar--on'
                : 'strength__bar'
            }
          />
        ))}
      </div>
      <p className="strength__text">
        <strong>{assessment.label}.</strong>{' '}
        {assessment.hints[0] ?? 'Nice — that’s a strong password.'}
      </p>
    </div>
  );
}
