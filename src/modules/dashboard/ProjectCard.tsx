import { Link } from '@/app/components/AppChrome';
import { categoryLabel, formatById } from '@/modules/document/domain/catalog';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { useAssetUrls } from '@/modules/workspace/hooks/useAssetUrls';
import { formatDateTime, formatRelative } from '@/shared/lib/time';
import { Menu } from '@/shared/ui/Menu';
import { Icon } from '@/shared/ui/Icon';
import { useState } from 'react';

function RenameInput({
  name,
  onDone,
}: {
  name: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <input
      className="input project-card__rename"
      aria-label="Design name"
      value={value}
      maxLength={120}
      // Opened by an explicit "Rename" action, so moving focus is expected.
      autoFocus
      onFocus={(event) => {
        event.target.select();
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onBlur={() => {
        onDone(value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onDone(value);
        } else if (event.key === 'Escape') {
          onDone(null);
        }
      }}
    />
  );
}

export function ProjectCard({
  document,
  view,
  now,
  renaming,
  onRename,
  onStartRename,
  onDuplicate,
  onDelete,
}: {
  document: DesignDocument;
  view: 'grid' | 'list';
  now: number;
  renaming: boolean;
  onRename: (name: string | null) => void;
  onStartRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const assetUrls = useAssetUrls(document);
  const href = `/studio/${document.id}`;
  const format = formatById(document.format.id);
  return (
    <article className={`project-card project-card--${view}`}>
      <Link
        to={href}
        className="project-card__thumb"
        tabIndex={-1}
        aria-hidden="true"
      >
        <DesignSvg
          document={document}
          assetUrls={assetUrls}
          className="fluid-svg"
        />
      </Link>
      <div className="project-card__body">
        {renaming ? (
          <RenameInput name={document.name} onDone={onRename} />
        ) : (
          <h3 className="project-card__title">
            <Link to={href}>{document.name}</Link>
          </h3>
        )}
        <p className="project-card__meta">
          <span className={`category-pill category-pill--${document.category}`}>
            {categoryLabel(document.category)}
          </span>
          <span title={`Last edited ${formatDateTime(document.updatedAt)}`}>
            <Icon name="pencil" size={12} />{' '}
            {formatRelative(document.updatedAt, now)}
          </span>
          {view === 'list' && (
            <>
              <span title={formatDateTime(document.createdAt)}>
                <Icon name="calendar" size={12} /> Created{' '}
                {formatRelative(document.createdAt, now)}
              </span>
              <span>
                {format?.label ?? 'Custom'} · {document.format.width}×
                {document.format.height}
              </span>
            </>
          )}
        </p>
      </div>
      <Menu
        label={`Actions for ${document.name}`}
        trigger={<Icon name="more" />}
        items={[
          { label: 'Rename', icon: 'pencil', onSelect: onStartRename },
          { label: 'Duplicate', icon: 'copy', onSelect: onDuplicate },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: onDelete },
        ]}
      />
    </article>
  );
}
