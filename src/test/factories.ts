import {
  createDocument,
  createIcon,
  createLine,
  createShape,
  createText,
} from '@/modules/document/domain/elementFactory';
import type {
  DesignDocument,
  DesignElement,
} from '@/modules/document/domain/schema';

/** Test data builders: say only what matters to the test. */

export const NOW = Date.parse('2026-11-20T10:00:00.000Z');
export const NOW_ISO = new Date(NOW).toISOString();

let sequence = 0;

export function nextId(prefix = 'el'): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function makeDocument(
  overrides: Partial<DesignDocument> = {},
): DesignDocument {
  return {
    ...createDocument({
      id: overrides.id ?? '00000000-0000-4000-8000-000000000001',
      name: 'Test design',
      category: 'party',
      format: { id: 'square', width: 1000, height: 1000 },
      now: NOW_ISO,
    }),
    ...overrides,
  };
}

export function rect(
  options: Parameters<typeof createShape>[2] & { id?: string } = {},
): DesignElement {
  return createShape(options.id ?? nextId('rect'), 'rectangle', {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...options,
  });
}

export function text(
  options: Partial<Parameters<typeof createText>[1]> & { id?: string } = {},
): DesignElement {
  return createText(options.id ?? nextId('text'), {
    text: 'Hello',
    ...options,
  });
}

export function line(
  options: Parameters<typeof createLine>[1] & { id?: string } = {},
): DesignElement {
  return createLine(options.id ?? nextId('line'), options);
}

export function icon(
  options: Parameters<typeof createIcon>[2] & {
    id?: string;
    icon?: string;
  } = {},
): DesignElement {
  return createIcon(
    options.id ?? nextId('icon'),
    options.icon ?? 'star',
    options,
  );
}

export function withElements(...elements: DesignElement[]): DesignDocument {
  return makeDocument({ elements });
}

/** A PNG header followed by padding: enough for type sniffing. */
export function pngFile(name = 'photo.png', size = 64): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], name, { type: 'image/png' });
}
