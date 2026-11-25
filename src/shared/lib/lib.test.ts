import {
  MAX_FILE_NAME_LENGTH,
  sanitizeFileName,
  validateFileName,
  withExtension,
} from '@/shared/lib/fileName';
import {
  createBrowserKeyValueStore,
  createMemoryKeyValueStore,
} from '@/shared/lib/keyValueStore';
import { formatDateTime, formatRelative } from '@/shared/lib/time';
import { createLogger } from '@/shared/logger';

describe('file names', () => {
  it('sanitises design names into safe defaults', () => {
    expect(sanitizeFileName('  Q3: Town/Hall?  ')).toBe('Q3- Town-Hall-');
    expect(sanitizeFileName('...hidden..')).toBe('hidden');
    expect(sanitizeFileName('a\u0007b')).toBe('a-b');
    expect(sanitizeFileName('   ')).toBe('design');
    expect(sanitizeFileName('CON', 'fallback')).toBe('fallback');
    expect(sanitizeFileName('x'.repeat(300))).toHaveLength(
      MAX_FILE_NAME_LENGTH,
    );
  });

  it('explains what’s wrong with a typed name', () => {
    expect(validateFileName('  ')).toEqual({
      ok: false,
      message: 'Enter a file name.',
    });
    expect(validateFileName('a/b')).toMatchObject({ ok: false });
    expect(validateFileName('x'.repeat(101))).toMatchObject({ ok: false });
    expect(validateFileName('.env')).toMatchObject({ ok: false });
    expect(validateFileName('lpt1')).toMatchObject({
      ok: false,
      message: 'That name is reserved on Windows.',
    });
    expect(validateFileName(' Poster final ')).toEqual({
      ok: true,
      value: 'Poster final',
    });
  });

  it('adds an extension without doubling it', () => {
    expect(withExtension('poster', 'png')).toBe('poster.png');
    expect(withExtension('poster.PNG', 'png')).toBe('poster.png');
  });
});

describe('relative time', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('uses friendly wording for recent times', () => {
    expect(formatRelative(ago(10_000), now)).toBe('just now');
    expect(formatRelative(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatRelative(ago(3 * 3_600_000), now)).toBe('3 h ago');
    expect(formatRelative(ago(30 * 3_600_000), now)).toBe('Yesterday');
  });

  it('falls back to dates, with the year only when it differs', () => {
    expect(formatRelative('2026-11-02T12:00:00Z', now, 'en-AU')).toBe('2 Nov');
    expect(formatRelative('2025-03-02T12:00:00Z', now, 'en-AU')).toBe(
      '2 Mar 2025',
    );
    expect(formatDateTime('2026-11-02T12:00:00Z', 'en-AU')).toMatch(/2026/);
  });
});

describe('key/value stores', () => {
  it('stores in memory', () => {
    const store = createMemoryKeyValueStore();
    store.set('a', '1');
    expect(store.get('a')).toBe('1');
    store.remove('a');
    expect(store.get('a')).toBeNull();
  });

  it('wraps browser storage and survives it throwing', () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: 'test',
      sink: (_level, line) => lines.push(line),
    });
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage;
    const store = createBrowserKeyValueStore(() => storage, logger);
    store.set('k', 'v');
    expect(store.get('k')).toBe('v');
    store.remove('k');
    expect(store.get('k')).toBeNull();

    const broken = createBrowserKeyValueStore(() => {
      throw new DOMException('blocked', 'SecurityError');
    }, logger);
    expect(broken.get('k')).toBeNull();
    broken.set('k', 'v');
    broken.remove('k');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('storage.unavailable');
  });
});
