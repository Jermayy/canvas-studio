import {
  categoryLabel,
  fontById,
  formatById,
} from '@/modules/document/domain/catalog';
import { createImage } from '@/modules/document/domain/elementFactory';
import {
  createHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
} from '@/modules/document/domain/history';
import {
  describeElement,
  shapeLabel,
  stackPositionLabel,
} from '@/modules/document/domain/layers';
import {
  DocumentValidationError,
  parseDocument,
  parseElement,
} from '@/modules/document/domain/schema';
import { buildSnapTargets, snapBox } from '@/modules/document/domain/snapping';
import {
  configureTextMeasure,
  cssFont,
  estimateTextWidth,
  fontSpec,
  layoutText,
  withAutoHeight,
} from '@/modules/document/domain/textLayout';
import {
  icon,
  line,
  makeDocument,
  rect,
  text,
  withElements,
} from '@/test/factories';

const iconLabel = (id: string) => (id === 'star' ? 'Star' : 'Unknown');

describe('schema', () => {
  it('accepts a valid document and rejects a broken one with readable issues', () => {
    const document = withElements(rect(), text());
    expect(parseDocument(JSON.parse(JSON.stringify(document)))).toEqual(
      document,
    );
    try {
      parseDocument({
        ...document,
        background: { kind: 'solid', color: 'red' },
      });
      expect.fail('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentValidationError);
      expect((error as DocumentValidationError).issues[0]).toMatch(
        /background\.color/,
      );
    }
  });

  it('rejects unknown element types and fonts', () => {
    expect(() => parseElement({ ...rect(), type: 'video' })).toThrow(
      DocumentValidationError,
    );
    expect(() => parseElement({ ...text(), fontFamily: 'Comic' })).toThrow(
      DocumentValidationError,
    );
  });
});

describe('catalog', () => {
  it('looks up fonts, formats and categories with safe fallbacks', () => {
    expect(fontById('mono').label).toBe('Mono');
    expect(formatById('a4')?.width).toBe(794);
    expect(formatById('nope')).toBeUndefined();
    expect(categoryLabel('christmas')).toBe('Christmas');
  });
});

describe('history', () => {
  it('undoes, redoes and clears the redo stack on a new change', () => {
    let history = createHistory(1);
    history = pushHistory(history, 2);
    history = pushHistory(history, 3);
    history = undo(history);
    expect(history.present).toBe(2);
    history = redo(history);
    expect(history.present).toBe(3);
    history = pushHistory(undo(history), 4);
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
    expect(undo(createHistory(1))).toEqual(createHistory(1));
  });

  it('ignores identical pushes, caps its size and can replace without a step', () => {
    const history = createHistory(1);
    expect(pushHistory(history, 1)).toBe(history);
    let capped = createHistory(0);
    for (let value = 1; value <= 5; value += 1) {
      capped = pushHistory(capped, value, 3);
    }
    expect(capped.past).toEqual([2, 3, 4]);
    expect(replacePresent(capped, 9)).toMatchObject({
      present: 9,
      past: [2, 3, 4],
    });
  });
});

describe('snapping', () => {
  const document = withElements(
    rect({ id: 'a', x: 100, y: 100, width: 100, height: 100 }),
    rect({ id: 'moving' }),
  );

  it('snaps to the page centre and other elements within the threshold', () => {
    const targets = buildSnapTargets(document, new Set(['moving']));
    const result = snapBox(
      { x: 445, y: 203, width: 100, height: 100 },
      targets,
      6,
    );
    expect(result.dx).toBe(5);
    expect(result.dy).toBe(-3);
    expect(result.guides).toEqual([
      { axis: 'x', position: 500 },
      { axis: 'y', position: 200 },
    ]);
  });

  it('leaves the box alone when nothing is close', () => {
    const targets = buildSnapTargets(document, new Set(['moving']));
    expect(
      snapBox({ x: 620, y: 620, width: 10, height: 10 }, targets, 4),
    ).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('ignores hidden elements', () => {
    const hidden = withElements({ ...rect({ id: 'h', x: 333 }), hidden: true });
    expect(buildSnapTargets(hidden, new Set()).x).not.toContain(333);
  });
});

describe('text layout', () => {
  afterEach(() => {
    configureTextMeasure(estimateTextWidth);
  });

  it('wraps words to the box width and keeps explicit line breaks', () => {
    configureTextMeasure((value) => value.length * 10);
    const element = text({
      text: 'one two three\nfour',
      width: 80,
      fontSize: 10,
      lineHeight: 2,
    });
    if (element.type !== 'text') {
      throw new Error('expected text');
    }
    const layout = layoutText(element);
    expect(layout.lines).toEqual(['one two', 'three', 'four']);
    expect(layout.height).toBe(60);
  });

  it('breaks words longer than the box and handles blank lines', () => {
    configureTextMeasure((value) => value.length * 10);
    const element = text({ text: 'abcdefghij\n', width: 40, uppercase: true });
    if (element.type !== 'text') {
      throw new Error('expected text');
    }
    expect(layoutText(element).lines).toEqual(['ABCD', 'EFGH', 'IJ', '']);
  });

  it('sizes text boxes to their content and builds CSS fonts', () => {
    const element = text({
      text: 'Hi',
      fontSize: 20,
      lineHeight: 1.5,
      italic: true,
      fontWeight: 700,
    });
    if (element.type !== 'text') {
      throw new Error('expected text');
    }
    expect(withAutoHeight({ ...element, height: 999 }).height).toBe(30);
    expect(withAutoHeight(element)).toBe(element);
    expect(cssFont(fontSpec(element))).toMatch(/^italic 700 20px /);
  });
});

describe('layer descriptions', () => {
  it('describes each kind of element in plain language', () => {
    expect(
      describeElement(
        text({ text: '\n  Grand opening night of the year\nmore' }),
        iconLabel,
      ).title,
    ).toBe('“Grand opening night of the…”');
    expect(describeElement(text({ text: '' }), iconLabel).title).toBe(
      'Empty text',
    );
    expect(describeElement(rect(), iconLabel)).toMatchObject({
      title: 'Rectangle',
      kind: 'Shape',
      detail: 'Fill #4F46E5',
    });
    expect(describeElement(line({ endCap: 'arrow' }), iconLabel).title).toBe(
      'Arrow',
    );
    expect(describeElement(line(), iconLabel).detail).toBe(
      '4px solid · #111827',
    );
    expect(describeElement(icon(), iconLabel).title).toBe('Star icon');
    const image = createImage(
      'img',
      { id: 'asset', width: 400, height: 200, name: 'beach.jpg' },
      { width: 1000, height: 1000 },
    );
    expect(describeElement({ ...image, name: '' }, iconLabel)).toMatchObject({
      title: 'Image',
      kind: 'Image',
    });
    expect(describeElement(rect({ name: 'Hero card' }), iconLabel).title).toBe(
      'Hero card',
    );
    expect(shapeLabel('burst')).toBe('Badge burst');
  });

  it('explains fills, outlines and state', () => {
    const shape = rect({
      fill: { kind: 'linear', from: '#000000', to: '#ffffff', angle: 0 },
      stroke: { color: '#000000', width: 2, dash: 'solid' },
      opacity: 0.5,
    });
    const description = describeElement(
      { ...shape, hidden: true, locked: true },
      iconLabel,
    );
    expect(description.detail).toBe('Gradient #000000 → #FFFFFF · 2px outline');
    expect(description.notes).toEqual([
      'Hidden — not shown or exported',
      'Locked — can’t be moved, resized or deleted',
      '50% opacity',
    ]);
    expect(
      describeElement(rect({ fill: { kind: 'none' } }), iconLabel).detail,
    ).toBe('No fill');
  });

  it('labels stack positions', () => {
    expect(stackPositionLabel(0, 1)).toBe('Only layer');
    expect(stackPositionLabel(4, 5)).toBe('Front-most layer');
    expect(stackPositionLabel(0, 5)).toBe('Back-most layer');
    expect(stackPositionLabel(2, 5)).toBe('Layer 3 of 5 from the front');
  });
});

describe('createImage', () => {
  it('fits large images to 60% of the canvas, centred, without the extension in its name', () => {
    const image = createImage(
      'i',
      { id: 'a', width: 4000, height: 2000, name: 'Team photo.JPG' },
      makeDocument().format,
    );
    expect(image).toMatchObject({
      width: 600,
      height: 300,
      x: 200,
      y: 350,
      name: 'Team photo',
    });
  });
});
