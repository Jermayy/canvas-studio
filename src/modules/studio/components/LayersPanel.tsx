import { usePreferences } from '@/app/services';
import {
  describeElement,
  stackPositionLabel,
} from '@/modules/document/domain/layers';
import type { DesignElement } from '@/modules/document/domain/schema';
import { iconLabel } from '@/modules/library/iconCatalog';
import { LayerKindIcon } from '@/modules/studio/components/LayerKindIcon';
import { useStudio, useStudioActions } from '@/modules/studio/studioContext';
import { IconButton } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/feedback';
import { Icon } from '@/shared/ui/Icon';
import { useState } from 'react';

const LAYER_MIME = 'application/x-canvas-studio-layer';

function RenameField({
  element,
  onDone,
}: {
  element: DesignElement;
  onDone: () => void;
}) {
  const { renameElement } = useStudioActions();
  const [value, setValue] = useState(element.name);
  const finish = (save: boolean) => {
    if (save && value.trim() !== element.name) {
      renameElement(element.id, value);
    }
    onDone();
  };
  return (
    <input
      className="input layer-row__rename"
      aria-label="Layer name"
      placeholder="Layer name"
      value={value}
      maxLength={80}
      // Opened by an explicit rename action, so moving focus is expected.
      autoFocus
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onBlur={() => {
        finish(true);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          finish(true);
        } else if (event.key === 'Escape') {
          finish(false);
        }
      }}
    />
  );
}

function LayerRow({
  element,
  index,
  total,
  selected,
  showHints,
  dropTarget,
  onDragTarget,
}: {
  element: DesignElement;
  index: number;
  total: number;
  selected: boolean;
  showHints: boolean;
  dropTarget: boolean;
  onDragTarget: (index: number | null) => void;
}) {
  const {
    select,
    toggleSelection,
    toggleHidden,
    toggleLocked,
    setHovered,
    moveLayer,
  } = useStudioActions();
  const [renaming, setRenaming] = useState(false);
  const description = describeElement(element, iconLabel);
  const position = stackPositionLabel(index, total);
  const label = [
    description.title,
    description.kind,
    position,
    ...description.notes,
  ].join(', ');

  return (
    <li
      className={[
        'layer-row',
        selected ? 'layer-row--selected' : '',
        element.hidden ? 'layer-row--hidden' : '',
        element.locked ? 'layer-row--locked' : '',
        dropTarget ? 'layer-row--drop' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={!renaming}
      onDragStart={(event) => {
        event.dataTransfer.setData(LAYER_MIME, element.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes(LAYER_MIME)) {
          event.preventDefault();
          onDragTarget(index);
        }
      }}
      onDragEnd={() => {
        onDragTarget(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDragTarget(null);
        const id = event.dataTransfer.getData(LAYER_MIME);
        if (id) {
          moveLayer(id, index);
        }
      }}
      onMouseEnter={() => {
        setHovered(element.id);
      }}
      onMouseLeave={() => {
        setHovered(null);
      }}
    >
      <Icon name="grip" size={14} className="layer-row__grip" />
      <LayerKindIcon element={element} />
      {renaming ? (
        <RenameField
          element={element}
          onDone={() => {
            setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="layer-row__main"
          aria-pressed={selected}
          aria-label={label}
          onClick={(event) => {
            if (event.shiftKey || event.metaKey || event.ctrlKey) {
              toggleSelection(element.id);
            } else {
              select([element.id]);
            }
          }}
          onDoubleClick={() => {
            setRenaming(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              setRenaming(true);
            } else if (
              event.altKey &&
              (event.key === 'ArrowUp' || event.key === 'ArrowDown')
            ) {
              event.preventDefault();
              event.stopPropagation();
              moveLayer(element.id, index + (event.key === 'ArrowUp' ? 1 : -1));
            }
          }}
        >
          <span className="layer-row__title">{description.title}</span>
          {showHints && (
            <span className="layer-row__detail">
              {description.kind} · {description.detail}
            </span>
          )}
          {showHints && description.notes.length > 0 && (
            <span className="layer-row__notes">
              {description.notes.map((note) => (
                <span key={note} className="layer-note">
                  {note}
                </span>
              ))}
            </span>
          )}
        </button>
      )}
      <span className="layer-row__actions">
        <IconButton
          icon="pencil"
          label={`Rename ${description.title}`}
          size="sm"
          onClick={() => {
            setRenaming(true);
          }}
        />
        <IconButton
          icon={element.hidden ? 'eye-off' : 'eye'}
          label={
            element.hidden
              ? `Show ${description.title}`
              : `Hide ${description.title}`
          }
          pressed={element.hidden}
          size="sm"
          onClick={() => {
            toggleHidden(element.id);
          }}
        />
        <IconButton
          icon={element.locked ? 'lock' : 'unlock'}
          label={
            element.locked
              ? `Unlock ${description.title}`
              : `Lock ${description.title}`
          }
          pressed={element.locked}
          size="sm"
          onClick={() => {
            toggleLocked(element.id);
          }}
        />
      </span>
    </li>
  );
}

/**
 * The layer stack, front-most first, with plain-language descriptions of
 * each layer and its state. Drag (or Alt+↑/↓) to reorder; F2 to rename.
 */
export function LayersPanel() {
  const elements = useStudio((state) => state.history.present.elements);
  const selection = useStudio((state) => state.selection);
  const { preferences } = usePreferences();
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const total = elements.length;

  if (total === 0) {
    return (
      <EmptyState icon="layers" title="No layers yet">
        Add text, shapes, icons or images from the left panel. Each one becomes
        a layer here.
      </EmptyState>
    );
  }

  return (
    <div className="layers">
      <p className="layers__legend">
        <Icon name="info" size={13} /> Top of the list is the front of the
        design. Drag to reorder, double-click to rename.
      </p>
      <ol
        className="layers__list"
        aria-label={`${total} layers, front-most first`}
      >
        {elements
          .map((element, index) => ({ element, index }))
          .reverse()
          .map(({ element, index }) => (
            <LayerRow
              key={element.id}
              element={element}
              index={index}
              total={total}
              selected={selection.includes(element.id)}
              showHints={preferences.layerHints}
              dropTarget={dropIndex === index}
              onDragTarget={setDropIndex}
            />
          ))}
      </ol>
    </div>
  );
}
