import { FORMATS } from '@/modules/document/domain/catalog';
import { parseDocument, parseElement } from '@/modules/document/domain/schema';
import {
  ICON_CATALOG,
  iconById,
  iconLabel,
  searchIcons,
} from '@/modules/library/iconCatalog';
import {
  BACKGROUND_PRESETS,
  EXTRA_SHAPE_PRESETS,
  findPreset,
  LINE_PRESETS,
  SHAPE_PRESETS,
  TEXT_COMBOS,
  TEXT_PRESETS,
} from '@/modules/library/presets';
import {
  createFromStartingPoint,
  startingPointKey,
} from '@/modules/library/startingPoint';
import {
  blankDocument,
  TEMPLATES,
  templateById,
  templatePreview,
} from '@/modules/library/templates';
import { NOW } from '@/test/factories';

let counter = 0;
const createId = () => `id-${(counter += 1)}`;

describe('templates', () => {
  it.each(TEMPLATES.map((template) => [template.id, template] as const))(
    '%s builds a valid document',
    (_id, template) => {
      const document = createFromStartingPoint(
        { kind: 'template', template },
        { createId, now: NOW },
      );
      expect(() => parseDocument(document)).not.toThrow();
      expect(document.elements.length).toBeGreaterThan(3);
      expect(new Set(document.elements.map((element) => element.id)).size).toBe(
        document.elements.length,
      );
      for (const element of document.elements) {
        if (element.type === 'icon') {
          expect(iconById(element.icon), element.icon).toBeDefined();
        }
      }
    },
  );

  it('covers every category except blank, with unique ids', () => {
    const categories = new Set(TEMPLATES.map((template) => template.category));
    expect(categories.size).toBe(6);
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(
      TEMPLATES.length,
    );
  });

  it('creates blank canvases in every format', () => {
    for (const format of FORMATS) {
      const document = createFromStartingPoint(
        { kind: 'blank', formatId: format.id },
        { createId, now: NOW },
      );
      expect(document).toMatchObject({
        category: 'blank',
        elements: [],
        format: { width: format.width },
      });
    }
    expect(
      blankDocument({
        id: 'x',
        now: new Date(NOW).toISOString(),
        formatId: 'a4',
        name: 'Mine',
      }).name,
    ).toBe('Mine');
    expect(startingPointKey({ kind: 'blank', formatId: 'a4' })).toBe(
      'blank-a4',
    );
  });

  it('caches previews with stable ids', () => {
    const template = templateById('birthday-thirty');
    if (!template) {
      throw new Error('template missing');
    }
    expect(templatePreview(template)).toBe(templatePreview(template));
    expect(startingPointKey({ kind: 'template', template })).toBe(
      'template-birthday-thirty',
    );
    expect(templateById('nope')).toBeUndefined();
  });
});

describe('presets', () => {
  const all = [
    ...TEXT_PRESETS,
    ...TEXT_COMBOS,
    ...SHAPE_PRESETS,
    ...EXTRA_SHAPE_PRESETS,
    ...LINE_PRESETS,
  ];

  it('every preset builds a valid element and can be found by id', () => {
    for (const preset of all) {
      expect(() => parseElement(preset.build('x'))).not.toThrow();
      expect(findPreset(preset.id)).toBe(preset);
    }
  });

  it('resolves icon presets from the catalog only', () => {
    expect(findPreset('icon-cake')?.build('x')).toMatchObject({
      type: 'icon',
      icon: 'cake',
    });
    expect(findPreset('icon-not-real')).toBeUndefined();
    expect(findPreset('')).toBeUndefined();
  });

  it('offers valid background fills', () => {
    expect(BACKGROUND_PRESETS.length).toBeGreaterThan(8);
  });
});

describe('icon catalog', () => {
  it('has unique ids and searchable keywords', () => {
    expect(new Set(ICON_CATALOG.map((entry) => entry.id)).size).toBe(
      ICON_CATALOG.length,
    );
    expect(searchIcons('')).toHaveLength(ICON_CATALOG.length);
    expect(searchIcons('rsvp').map((entry) => entry.id)).toEqual(['mail']);
    expect(searchIcons('BUSINESS').length).toBeGreaterThan(5);
    expect(iconLabel('cake')).toBe('Cake');
    expect(iconLabel('missing')).toBe('Unknown');
  });
});
