import { CATEGORIES, type CategoryId } from '@/modules/document/domain/catalog';
import {
  DATE_RANGE_LABELS,
  DATE_RANGES,
  isFiltered,
  type DateRange,
  type ProjectQuery,
} from '@/modules/document/domain/projectQuery';
import { Button } from '@/shared/ui/Button';
import { useId } from 'react';

function RangeGroup({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  const name = useId();
  return (
    <fieldset className="filter-group">
      <legend className="filter-group__title">{legend}</legend>
      {DATE_RANGES.map((range) => (
        <label key={range} className="radio-row">
          <input
            type="radio"
            name={name}
            checked={value === range}
            onChange={() => {
              onChange(range);
            }}
          />
          <span>{DATE_RANGE_LABELS[range]}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function FilterSidebar({
  query,
  counts,
  onChange,
}: {
  query: ProjectQuery;
  counts: Readonly<Record<CategoryId, number>>;
  onChange: (patch: Partial<ProjectQuery>) => void;
}) {
  const selected = new Set(query.categories);
  return (
    <aside className="filter-sidebar" aria-label="Filters">
      <div className="filter-sidebar__header">
        <h2>Filters</h2>
        {isFiltered(query) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange({
                categories: [],
                created: 'any',
                edited: 'any',
                search: '',
              });
            }}
          >
            Clear all
          </Button>
        )}
      </div>
      <fieldset className="filter-group">
        <legend className="filter-group__title">Template type</legend>
        {CATEGORIES.map((category) => (
          <label key={category.id} className="check-row">
            <input
              type="checkbox"
              checked={selected.has(category.id)}
              onChange={(event) => {
                onChange({
                  categories: event.target.checked
                    ? [...query.categories, category.id]
                    : query.categories.filter((id) => id !== category.id),
                });
              }}
            />
            <span
              className={`category-dot category-dot--${category.id}`}
              aria-hidden="true"
            />
            <span className="check-row__label">{category.label}</span>
            <span
              className="check-row__count"
              aria-label={`${counts[category.id]} designs`}
            >
              {counts[category.id]}
            </span>
          </label>
        ))}
      </fieldset>
      <RangeGroup
        legend="Last edited"
        value={query.edited}
        onChange={(edited) => {
          onChange({ edited });
        }}
      />
      <RangeGroup
        legend="Date created"
        value={query.created}
        onChange={(created) => {
          onChange({ created });
        }}
      />
    </aside>
  );
}
