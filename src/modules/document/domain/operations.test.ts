import {
  addElements,
  alignElements,
  distributeElements,
  duplicateElements,
  findElement,
  moveElementTo,
  removeElements,
  reorderElements,
  updateDocumentProps,
  updateElements,
} from '@/modules/document/domain/operations';
import {
  DocumentValidationError,
  MAX_ELEMENTS,
} from '@/modules/document/domain/schema';
import { makeDocument, rect, text, withElements } from '@/test/factories';

const ids = (document: { elements: { id: string }[] }) =>
  document.elements.map((element) => element.id);

describe('addElements', () => {
  it('appends elements on top and leaves the input untouched', () => {
    const original = makeDocument();
    const next = addElements(original, [rect({ id: 'a' })]);
    expect(ids(next)).toEqual(['a']);
    expect(original.elements).toHaveLength(0);
  });

  it('refuses to exceed the element limit', () => {
    const full = makeDocument({
      elements: Array.from({ length: MAX_ELEMENTS }, () => rect()),
    });
    expect(() => addElements(full, [rect()])).toThrow(DocumentValidationError);
  });

  it('rejects invalid elements', () => {
    expect(() => addElements(makeDocument(), [rect({ width: -5 })])).toThrow(
      DocumentValidationError,
    );
  });
});

describe('updateElements', () => {
  it('patches only the targeted elements', () => {
    const document = withElements(rect({ id: 'a' }), rect({ id: 'b' }));
    const next = updateElements(document, ['b'], { x: 50 });
    expect(findElement(next, 'a')?.x).toBe(0);
    expect(findElement(next, 'b')?.x).toBe(50);
  });

  it('accepts a function patch', () => {
    const document = withElements(rect({ id: 'a', x: 10 }));
    expect(
      findElement(
        updateElements(document, ['a'], (element) => ({ x: element.x * 2 })),
        'a',
      )?.x,
    ).toBe(20);
  });

  it('returns the same document when nothing matches', () => {
    const document = withElements(rect({ id: 'a' }));
    expect(updateElements(document, ['missing'], { x: 1 })).toBe(document);
  });

  it('strips fields that don’t belong to the element kind', () => {
    const document = withElements(rect({ id: 'a' }));
    const next = updateElements(document, ['a'], { fontSize: 40 });
    expect(findElement(next, 'a')).not.toHaveProperty('fontSize');
  });

  it('re-flows text height when the text changes', () => {
    const document = withElements(text({ id: 't', width: 100, fontSize: 20 }));
    const before = findElement(document, 't')?.height ?? 0;
    const next = updateElements(document, ['t'], {
      text: 'A much longer line that has to wrap several times',
    });
    expect(findElement(next, 't')?.height).toBeGreaterThan(before);
  });

  it('rejects out-of-range values', () => {
    expect(() =>
      updateElements(withElements(rect({ id: 'a' })), ['a'], { opacity: 2 }),
    ).toThrow(DocumentValidationError);
  });
});

describe('removeElements / duplicateElements', () => {
  it('removes by id and is a no-op for unknown ids', () => {
    const document = withElements(rect({ id: 'a' }), rect({ id: 'b' }));
    expect(ids(removeElements(document, ['a']))).toEqual(['b']);
    expect(removeElements(document, ['zzz'])).toBe(document);
  });

  it('duplicates with new ids, an offset, a copy name and unlocked', () => {
    const document = withElements(
      rect({ id: 'a', x: 10, name: 'Card' }),
      rect({ id: 'b' }),
    );
    const locked = updateElements(document, ['a'], { locked: true });
    let counter = 0;
    const result = duplicateElements(
      locked,
      ['a', 'b'],
      () => `copy-${(counter += 1)}`,
    );
    expect(result.ids).toEqual(['copy-1', 'copy-2']);
    const copy = findElement(result.document, 'copy-1');
    expect(copy).toMatchObject({ x: 34, name: 'Card copy', locked: false });
    expect(findElement(result.document, 'copy-2')?.name).toBe('');
  });
});

describe('reordering', () => {
  const document = withElements(
    rect({ id: 'a' }),
    rect({ id: 'b' }),
    rect({ id: 'c' }),
    rect({ id: 'd' }),
  );

  it('moves to the front or back as a block', () => {
    expect(ids(reorderElements(document, ['a', 'b'], 'front'))).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
    expect(ids(reorderElements(document, ['c', 'd'], 'back'))).toEqual([
      'c',
      'd',
      'a',
      'b',
    ]);
  });

  it('steps forward and backward past one neighbour', () => {
    expect(ids(reorderElements(document, ['b'], 'forward'))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
    expect(ids(reorderElements(document, ['c'], 'backward'))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
    expect(ids(reorderElements(document, ['d'], 'forward'))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('ignores an empty selection', () => {
    expect(reorderElements(document, [], 'front')).toBe(document);
  });

  it('moves one element to an index, clamped to the stack', () => {
    expect(ids(moveElementTo(document, 'a', 2))).toEqual(['b', 'c', 'a', 'd']);
    expect(ids(moveElementTo(document, 'a', 99))).toEqual(['b', 'c', 'd', 'a']);
    expect(moveElementTo(document, 'a', 0)).toBe(document);
    expect(moveElementTo(document, 'zzz', 1)).toBe(document);
  });
});

describe('alignElements', () => {
  it('aligns a single element to the page', () => {
    const document = withElements(
      rect({ id: 'a', x: 10, y: 10, width: 100, height: 50 }),
    );
    const centred = alignElements(document, ['a'], 'center');
    expect(findElement(centred, 'a')?.x).toBe(450);
    expect(findElement(alignElements(document, ['a'], 'bottom'), 'a')?.y).toBe(
      950,
    );
    expect(findElement(alignElements(document, ['a'], 'right'), 'a')?.x).toBe(
      900,
    );
    expect(findElement(alignElements(document, ['a'], 'middle'), 'a')?.y).toBe(
      475,
    );
  });

  it('aligns several elements to their shared bounds', () => {
    const document = withElements(
      rect({ id: 'a', x: 0, y: 0, width: 100 }),
      rect({ id: 'b', x: 300, y: 200, width: 50 }),
    );
    const left = alignElements(document, ['a', 'b'], 'left');
    expect(findElement(left, 'b')?.x).toBe(0);
    const top = alignElements(document, ['a', 'b'], 'top');
    expect(findElement(top, 'b')?.y).toBe(0);
  });

  it('does nothing without a selection', () => {
    const document = withElements(rect({ id: 'a' }));
    expect(alignElements(document, [], 'left')).toBe(document);
  });
});

describe('distributeElements', () => {
  it('spaces three or more elements evenly', () => {
    const document = withElements(
      rect({ id: 'a', x: 0, width: 100 }),
      rect({ id: 'b', x: 150, width: 100 }),
      rect({ id: 'c', x: 500, width: 100 }),
    );
    const next = distributeElements(document, ['a', 'b', 'c'], 'horizontal');
    expect(findElement(next, 'b')?.x).toBe(250);
    const vertical = distributeElements(
      withElements(
        rect({ id: 'a', y: 0 }),
        rect({ id: 'b', y: 10 }),
        rect({ id: 'c', y: 400 }),
      ),
      ['a', 'b', 'c'],
      'vertical',
    );
    expect(findElement(vertical, 'b')?.y).toBe(200);
  });

  it('needs at least three elements', () => {
    const document = withElements(rect({ id: 'a' }), rect({ id: 'b' }));
    expect(distributeElements(document, ['a', 'b'], 'horizontal')).toBe(
      document,
    );
  });
});

describe('updateDocumentProps', () => {
  it('trims names and ignores blank ones', () => {
    const document = makeDocument({ name: 'Old' });
    expect(updateDocumentProps(document, { name: '  New  ' }).name).toBe('New');
    expect(updateDocumentProps(document, { name: '   ' }).name).toBe('Old');
  });

  it('updates the background and format', () => {
    const next = updateDocumentProps(makeDocument(), {
      background: { kind: 'none' },
      format: { id: 'custom', width: 300, height: 200 },
    });
    expect(next.background).toEqual({ kind: 'none' });
    expect(next.format.width).toBe(300);
  });
});
