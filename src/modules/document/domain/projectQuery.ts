import {
  CATEGORY_IDS,
  categoryLabel,
  type CategoryId,
} from '@/modules/document/domain/catalog';
import type { DesignDocument } from '@/modules/document/domain/schema';

/**
 * Filtering and sorting for the projects dashboard. The query round-trips
 * through the URL (playbook 06: the URL is the source of truth for
 * filters), so links and the back button keep the view.
 */

export const DATE_RANGES = ['any', 'today', '7d', '30d', '365d'] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export const SORT_ORDERS = ['edited', 'created', 'name'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  any: 'Any time',
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '365d': 'Last 12 months',
};

export const SORT_LABELS: Record<SortOrder, string> = {
  edited: 'Last edited',
  created: 'Date created',
  name: 'Name (A–Z)',
};

export interface ProjectQuery {
  search: string;
  categories: CategoryId[];
  created: DateRange;
  edited: DateRange;
  sort: SortOrder;
}

export const DEFAULT_QUERY: ProjectQuery = {
  search: '',
  categories: [],
  created: 'any',
  edited: 'any',
  sort: 'edited',
};

const DAY = 86_400_000;

function startOfRange(range: DateRange, now: number): number | null {
  switch (range) {
    case 'any':
      return null;
    case 'today': {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }
    case '7d':
      return now - 7 * DAY;
    case '30d':
      return now - 30 * DAY;
    case '365d':
      return now - 365 * DAY;
  }
}

function within(iso: string, range: DateRange, now: number): boolean {
  const start = startOfRange(range, now);
  return start === null || Date.parse(iso) >= start;
}

function matchesSearch(document: DesignDocument, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) {
    return true;
  }
  return (
    document.name.toLowerCase().includes(term) ||
    categoryLabel(document.category).toLowerCase().includes(term)
  );
}

const COMPARATORS: Record<
  SortOrder,
  (a: DesignDocument, b: DesignDocument) => number
> = {
  edited: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  name: (a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
};

export function applyQuery(
  documents: readonly DesignDocument[],
  query: ProjectQuery,
  now: number,
): DesignDocument[] {
  const categories = new Set(query.categories);
  return documents
    .filter(
      (document) =>
        (categories.size === 0 || categories.has(document.category)) &&
        within(document.createdAt, query.created, now) &&
        within(document.updatedAt, query.edited, now) &&
        matchesSearch(document, query.search),
    )
    .sort(COMPARATORS[query.sort]);
}

export function countByCategory(
  documents: readonly DesignDocument[],
): Record<CategoryId, number> {
  const counts = Object.fromEntries(
    CATEGORY_IDS.map((id) => [id, 0]),
  ) as Record<CategoryId, number>;
  for (const document of documents) {
    counts[document.category] += 1;
  }
  return counts;
}

export function isFiltered(query: ProjectQuery): boolean {
  return (
    query.search.trim() !== '' ||
    query.categories.length > 0 ||
    query.created !== 'any' ||
    query.edited !== 'any'
  );
}

function pick<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((option) => option === value) ?? fallback;
}

export function parseQuery(params: URLSearchParams): ProjectQuery {
  const categories = (params.get('type') ?? '')
    .split(',')
    .map((value) => CATEGORY_IDS.find((id) => id === value))
    .filter((value): value is CategoryId => value !== undefined);
  return {
    search: (params.get('q') ?? '').slice(0, 100),
    categories: [...new Set(categories)],
    created: pick(params.get('created'), DATE_RANGES, 'any'),
    edited: pick(params.get('edited'), DATE_RANGES, 'any'),
    sort: pick(params.get('sort'), SORT_ORDERS, 'edited'),
  };
}

export function serializeQuery(query: ProjectQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search.trim()) {
    params.set('q', query.search.trim());
  }
  if (query.categories.length > 0) {
    params.set('type', query.categories.join(','));
  }
  if (query.created !== 'any') {
    params.set('created', query.created);
  }
  if (query.edited !== 'any') {
    params.set('edited', query.edited);
  }
  if (query.sort !== 'edited') {
    params.set('sort', query.sort);
  }
  return params;
}
