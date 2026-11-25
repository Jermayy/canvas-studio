import {
  CATEGORIES,
  categoryLabel,
  FORMATS,
  formatById,
  type CategoryId,
  type FormatId,
} from '@/modules/document/domain/catalog';
import {
  TEMPLATES,
  templatePreview,
  type Template,
} from '@/modules/library/templates';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { Icon } from '@/shared/ui/Icon';
import { useState } from 'react';

export type StartingPoint =
  | { kind: 'template'; template: Template }
  | { kind: 'blank'; formatId: FormatId };

const FILTERS = [
  { id: 'all', label: 'All' },
  ...CATEGORIES.filter((category) => category.id !== 'blank'),
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

/** Template gallery plus blank canvases, shared by "New design" and the sandbox. */
export function TemplatePicker({
  onPick,
  busyKey,
}: {
  onPick: (start: StartingPoint) => void;
  busyKey: string | null;
}) {
  const [filter, setFilter] = useState<FilterId>('all');
  const templates =
    filter === 'all'
      ? TEMPLATES
      : TEMPLATES.filter(
          (template) => template.category === (filter as CategoryId),
        );

  return (
    <div className="template-picker">
      <section aria-labelledby="blank-heading">
        <h3 id="blank-heading" className="picker-heading">
          Blank canvas
        </h3>
        <ul className="format-grid">
          {FORMATS.map((format) => {
            const ratio = format.width / format.height;
            const key = `blank-${format.id}`;
            return (
              <li key={format.id}>
                <button
                  type="button"
                  className="format-card"
                  aria-busy={busyKey === key || undefined}
                  disabled={busyKey !== null}
                  onClick={() => {
                    onPick({ kind: 'blank', formatId: format.id });
                  }}
                >
                  <span className="format-card__shape-wrap" aria-hidden="true">
                    <span
                      className="format-card__shape"
                      style={{
                        width: ratio >= 1 ? 44 : 44 * ratio,
                        height: ratio >= 1 ? 44 / ratio : 44,
                      }}
                    />
                  </span>
                  <span className="format-card__label">{format.label}</span>
                  <span className="format-card__detail">{format.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="templates-heading">
        <div className="picker-heading-row">
          <h3 id="templates-heading" className="picker-heading">
            Templates
          </h3>
          <div className="chip-tabs" role="group" aria-label="Filter templates">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chip${filter === option.id ? ' chip--active' : ''}`}
                aria-pressed={filter === option.id}
                onClick={() => {
                  setFilter(option.id);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="template-grid">
          {templates.map((template) => {
            const key = `template-${template.id}`;
            return (
              <li key={template.id}>
                <button
                  type="button"
                  className="template-card"
                  aria-busy={busyKey === key || undefined}
                  disabled={busyKey !== null}
                  aria-label={`${template.name}: ${template.description}`}
                  onClick={() => {
                    onPick({ kind: 'template', template });
                  }}
                >
                  <span className="template-card__thumb">
                    <DesignSvg
                      document={templatePreview(template)}
                      assetUrls={{}}
                      className="fluid-svg"
                    />
                    {busyKey === key && (
                      <span className="template-card__busy">
                        <Icon name="spinner" className="spin" />
                      </span>
                    )}
                  </span>
                  <span className="template-card__name">{template.name}</span>
                  <span className="template-card__meta">
                    {categoryLabel(template.category)} ·{' '}
                    {formatById(template.formatId)?.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
