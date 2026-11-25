import {
  applyQuery,
  countByCategory,
  DEFAULT_QUERY,
  isFiltered,
  parseQuery,
  serializeQuery,
} from '@/modules/document/domain/projectQuery';
import { makeDocument, NOW } from '@/test/factories';

const DAY = 86_400_000;
const at = (offsetDays: number) =>
  new Date(NOW - offsetDays * DAY).toISOString();

const documents = [
  makeDocument({
    id: 'a',
    name: 'Office party',
    category: 'christmas',
    createdAt: at(40),
    updatedAt: at(0.01),
  }),
  makeDocument({
    id: 'b',
    name: 'Birthday bash',
    category: 'birthday',
    createdAt: at(3),
    updatedAt: at(2),
  }),
  makeDocument({
    id: 'c',
    name: 'all hands',
    category: 'corporate',
    createdAt: at(400),
    updatedAt: at(100),
  }),
];

const names = (list: { name: string }[]) =>
  list.map((document) => document.name);

describe('applyQuery', () => {
  it('sorts by last edited by default', () => {
    expect(names(applyQuery(documents, DEFAULT_QUERY, NOW))).toEqual([
      'Office party',
      'Birthday bash',
      'all hands',
    ]);
  });

  it('sorts by creation date or name', () => {
    expect(
      names(
        applyQuery(documents, { ...DEFAULT_QUERY, sort: 'created' }, NOW),
      )[0],
    ).toBe('Birthday bash');
    expect(
      names(applyQuery(documents, { ...DEFAULT_QUERY, sort: 'name' }, NOW)),
    ).toEqual(['all hands', 'Birthday bash', 'Office party']);
  });

  it('filters by template type, dates and search (name or type)', () => {
    expect(
      names(
        applyQuery(
          documents,
          { ...DEFAULT_QUERY, categories: ['birthday', 'corporate'] },
          NOW,
        ),
      ),
    ).toEqual(['Birthday bash', 'all hands']);
    expect(
      names(applyQuery(documents, { ...DEFAULT_QUERY, edited: '7d' }, NOW)),
    ).toEqual(['Office party', 'Birthday bash']);
    expect(
      names(applyQuery(documents, { ...DEFAULT_QUERY, created: '30d' }, NOW)),
    ).toEqual(['Birthday bash']);
    expect(
      names(applyQuery(documents, { ...DEFAULT_QUERY, created: '365d' }, NOW)),
    ).toHaveLength(2);
    expect(
      names(applyQuery(documents, { ...DEFAULT_QUERY, edited: 'today' }, NOW)),
    ).toEqual(['Office party']);
    expect(
      names(
        applyQuery(documents, { ...DEFAULT_QUERY, search: 'CHRISTMAS' }, NOW),
      ),
    ).toEqual(['Office party']);
    expect(
      names(applyQuery(documents, { ...DEFAULT_QUERY, search: 'bash' }, NOW)),
    ).toEqual(['Birthday bash']);
  });
});

describe('query helpers', () => {
  it('counts designs per type', () => {
    expect(countByCategory(documents)).toMatchObject({
      christmas: 1,
      birthday: 1,
      corporate: 1,
      wedding: 0,
    });
  });

  it('knows when any filter is active', () => {
    expect(isFiltered(DEFAULT_QUERY)).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, sort: 'name' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_QUERY, search: ' x ' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_QUERY, created: '7d' })).toBe(true);
  });

  it('round-trips through the URL and drops defaults', () => {
    const query = {
      search: 'gala',
      categories: ['wedding' as const, 'party' as const],
      created: '30d' as const,
      edited: 'today' as const,
      sort: 'name' as const,
    };
    expect(parseQuery(serializeQuery(query))).toEqual(query);
    expect(serializeQuery(DEFAULT_QUERY).toString()).toBe('');
  });

  it('ignores unknown or malicious values', () => {
    expect(
      parseQuery(
        new URLSearchParams(
          'type=wedding,hack,wedding&created=forever&sort=<script>',
        ),
      ),
    ).toEqual({
      ...DEFAULT_QUERY,
      categories: ['wedding'],
    });
    expect(
      parseQuery(new URLSearchParams(`q=${'x'.repeat(500)}`)).search,
    ).toHaveLength(100);
  });
});
