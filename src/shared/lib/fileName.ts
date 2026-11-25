/**
 * File-name rules for exports. Names come from user input and end up in
 * downloads, share sheets and email attachments, so they're validated here
 * once and every caller gets the same messages.
 */

export const MAX_FILE_NAME_LENGTH = 100;

const FORBIDDEN_CHARACTERS = new Set([
  '\\',
  '/',
  ':',
  '*',
  '?',
  '"',
  '<',
  '>',
  '|',
]);
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type FileNameCheck =
  { ok: true; value: string } | { ok: false; message: string };

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code < 32 || code === 127;
}

function isForbidden(character: string): boolean {
  return FORBIDDEN_CHARACTERS.has(character) || isControlCharacter(character);
}

/** Turns any text (e.g. a design name) into a safe default file name. */
export function sanitizeFileName(input: string, fallback = 'design'): string {
  const replaced = Array.from(input)
    .map((character) => (isForbidden(character) ? '-' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  if (replaced.length === 0 || RESERVED_WINDOWS_NAMES.test(replaced)) {
    return fallback;
  }
  return replaced;
}

/** Validates a name typed by the user, without its extension. */
export function validateFileName(input: string): FileNameCheck {
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, message: 'Enter a file name.' };
  }
  if (Array.from(value).some(isForbidden)) {
    return {
      ok: false,
      message: 'File names can’t contain \\ / : * ? " < > | characters.',
    };
  }
  if (value.length > MAX_FILE_NAME_LENGTH) {
    return {
      ok: false,
      message: `Keep it to ${MAX_FILE_NAME_LENGTH} characters or fewer.`,
    };
  }
  if (value.startsWith('.')) {
    return { ok: false, message: 'File names can’t start with a dot.' };
  }
  if (RESERVED_WINDOWS_NAMES.test(value)) {
    return { ok: false, message: 'That name is reserved on Windows.' };
  }
  return { ok: true, value };
}

/** Appends `.ext`, without doubling it if the user already typed it. */
export function withExtension(name: string, extension: string): string {
  const suffix = `.${extension.toLowerCase()}`;
  return name.toLowerCase().endsWith(suffix)
    ? name.slice(0, -suffix.length) + suffix
    : name + suffix;
}
