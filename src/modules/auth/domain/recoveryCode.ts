/**
 * Recovery codes: the only way back into an encrypted workspace when the
 * password is forgotten. 20 Crockford base32 symbols (100 bits) shown as
 * five groups of four. Input is forgiving: case, spaces, dashes and the
 * look-alikes O/I/L are accepted.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_LENGTH = 20;

export function generateRecoveryCode(
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (
    bytes,
  ) => crypto.getRandomValues(bytes),
): string {
  const bytes = random(new Uint8Array(RECOVERY_CODE_LENGTH));
  // 256 is a multiple of 32, so masking keeps every symbol equally likely.
  const symbols = [...bytes].map((byte) => ALPHABET[byte & 31] ?? '0').join('');
  return formatRecoveryCode(symbols);
}

export function formatRecoveryCode(symbols: string): string {
  return symbols.match(/.{1,4}/g)?.join('-') ?? symbols;
}

/** Canonical form for key derivation, or null if it can't be a valid code. */
export function normaliseRecoveryCode(input: string): string | null {
  const symbols = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (symbols.length !== RECOVERY_CODE_LENGTH) {
    return null;
  }
  return Array.from(symbols).every((symbol) => ALPHABET.includes(symbol))
    ? symbols
    : null;
}
