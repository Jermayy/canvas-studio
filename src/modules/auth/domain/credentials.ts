import { z } from 'zod';

/** Credential rules shared by the forms (UX) and the auth service (enforcement). */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.').max(254));

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name.')
  .max(60, 'Keep your name to 60 characters or fewer.');

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'iloveyou123',
  'letmein123',
  'welcome123',
  'administrator',
  'passw0rd123',
  'canvasstudio',
]);

export interface PasswordAssessment {
  /** 0 (unusable) … 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Too common' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  acceptable: boolean;
  hints: string[];
}

export function assessPassword(
  password: string,
  email = '',
): PasswordAssessment {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 0,
      label: 'Too short',
      acceptable: false,
      hints: [`Use at least ${MIN_PASSWORD_LENGTH} characters.`],
    };
  }
  const lower = password.toLowerCase();
  const localPart = email.split('@')[0]?.toLowerCase() ?? '';
  if (
    COMMON_PASSWORDS.has(lower) ||
    (localPart.length >= 4 && lower.includes(localPart)) ||
    /^(.)\1+$/.test(password)
  ) {
    return {
      score: 0,
      label: 'Too common',
      acceptable: false,
      hints: ['Avoid common passwords, repeated characters and your email.'],
    };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  const hints: string[] = [];
  if (classes < 3) {
    hints.push('Mix upper and lower case, numbers and symbols.');
  }
  if (password.length < 14) {
    hints.push('Longer is stronger: try a short phrase.');
  }
  const points =
    classes + (password.length >= 14 ? 1 : 0) + (password.length >= 20 ? 1 : 0);
  if (points <= 2) {
    return { score: 1, label: 'Weak', acceptable: true, hints };
  }
  if (points === 3) {
    return { score: 2, label: 'Fair', acceptable: true, hints };
  }
  if (points === 4) {
    return { score: 3, label: 'Good', acceptable: true, hints };
  }
  return { score: 4, label: 'Strong', acceptable: true, hints };
}

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(MAX_PASSWORD_LENGTH),
});

export const signUpSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: z.string().max(MAX_PASSWORD_LENGTH, 'That password is too long.'),
  })
  .superRefine((value, context) => {
    const assessment = assessPassword(value.password, value.email);
    if (!assessment.acceptable) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: assessment.hints[0] ?? 'Choose a stronger password.',
      });
    }
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** First validation message per field, for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}
