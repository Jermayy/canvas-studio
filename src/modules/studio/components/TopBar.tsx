import { BrandMark, Link } from '@/app/components/AppChrome';
import { useWorkspace } from '@/app/services';
import { SaveIndicator } from '@/modules/studio/components/SaveIndicator';
import { MOD } from '@/modules/studio/keyboard';
import { MAX_ZOOM, MIN_ZOOM } from '@/modules/studio/state/studioStore';
import {
  useStudio,
  useStudioActions,
  useStudioContext,
} from '@/modules/studio/studioContext';
import { SyncIndicator } from '@/modules/sync/SyncIndicator';
import { Button, IconButton } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { Menu } from '@/shared/ui/Menu';
import { useState } from 'react';

function DocumentName() {
  const name = useStudio((state) => state.history.present.name);
  const { updateDocument } = useStudioActions();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== name) {
      updateDocument({ name: draft });
    }
    setDraft(null);
  };
  return (
    <input
      className="doc-name"
      aria-label="Design name"
      value={draft ?? name}
      maxLength={120}
      size={Math.max(8, Math.min(40, (draft ?? name).length + 1))}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ZoomControl() {
  const zoom = useStudio((state) => state.zoom);
  const fit = useStudio((state) => state.fitToScreen);
  const { zoomBy, setZoom } = useStudioActions();
  const { store } = useStudioContext();
  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
      <IconButton
        icon="zoom-out"
        label="Zoom out"
        shortcut={`${MOD}−`}
        size="sm"
        disabled={zoom <= MIN_ZOOM}
        onClick={() => {
          zoomBy(1 / 1.25);
        }}
      />
      <Menu
        label="Zoom level"
        triggerClassName="zoom-control__value"
        trigger={<span>{Math.round(zoom * 100)}%</span>}
        align="start"
        items={[
          {
            label: fit ? 'Fit to screen ✓' : 'Fit to screen',
            icon: 'fit',
            shortcut: '⇧1',
            onSelect: () => {
              store.setState({ fitToScreen: true });
            },
          },
          ...[0.5, 1, 2].map((level) => ({
            label: `${level * 100}%`,
            onSelect: () => {
              setZoom(level);
            },
          })),
        ]}
      />
      <IconButton
        icon="zoom-in"
        label="Zoom in"
        shortcut={`${MOD}+`}
        size="sm"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => {
          zoomBy(1.25);
        }}
      />
    </div>
  );
}

export function TopBar() {
  const { mode, openDialog } = useStudioContext();
  const { sync } = useWorkspace();
  const documentId = useStudio((state) => state.history.present.id);
  const canUndo = useStudio((state) => state.history.past.length > 0);
  const canRedo = useStudio((state) => state.history.future.length > 0);
  const { undo, redo } = useStudioActions();

  return (
    <header className="studio-topbar">
      <div className="studio-topbar__start">
        <Link
          to={mode === 'sandbox' ? '/' : '/projects'}
          className="icon-btn icon-btn--md icon-btn--ghost"
          aria-label={mode === 'sandbox' ? 'Leave sandbox' : 'Back to projects'}
          data-tooltip={
            mode === 'sandbox' ? 'Leave sandbox' : 'Back to projects'
          }
        >
          <BrandMark compact />
        </Link>
        <DocumentName />
        <SaveIndicator documentId={documentId} />
        {sync && <SyncIndicator engine={sync} />}
      </div>
      <div className="studio-topbar__center">
        <IconButton
          icon="undo"
          label="Undo"
          shortcut={`${MOD}Z`}
          disabled={!canUndo}
          onClick={undo}
        />
        <IconButton
          icon="redo"
          label="Redo"
          shortcut={`${MOD}⇧Z`}
          disabled={!canRedo}
          onClick={redo}
        />
        <span className="toolbar-divider" aria-hidden="true" />
        <ZoomControl />
      </div>
      <div className="studio-topbar__end">
        <Menu
          label="More options"
          trigger={<Icon name="more" />}
          items={[
            {
              label: 'Command palette',
              icon: 'command',
              shortcut: `${MOD}K`,
              onSelect: () => {
                openDialog('commands');
              },
            },
            {
              label: 'Keyboard shortcuts',
              icon: 'keyboard',
              shortcut: '?',
              onSelect: () => {
                openDialog('shortcuts');
              },
            },
            {
              label: 'Appearance & editor',
              icon: 'settings',
              onSelect: () => {
                openDialog('settings');
              },
            },
          ]}
        />
        <Button
          icon="share"
          onClick={() => {
            openDialog('share');
          }}
        >
          Share
        </Button>
        <Button
          variant="primary"
          icon="download"
          onClick={() => {
            openDialog('export');
          }}
        >
          Export
        </Button>
      </div>
    </header>
  );
}
