import { Link } from '@/app/components/AppChrome';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { useNotify, useServices, useWorkspace } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { ExportDialog } from '@/modules/export/ExportDialog';
import { SettingsDialog } from '@/modules/preferences/SettingsDialog';
import { ShareDialog } from '@/modules/share/ShareDialog';
import { CanvasViewport } from '@/modules/studio/components/CanvasViewport';
import { CommandPalette } from '@/modules/studio/components/CommandPalette';
import { InsertPanel } from '@/modules/studio/components/InsertPanel';
import { Inspector } from '@/modules/studio/components/inspector/Inspector';
import { LayersPanel } from '@/modules/studio/components/LayersPanel';
import { ShortcutsDialog } from '@/modules/studio/components/ShortcutsDialog';
import { StatusBar } from '@/modules/studio/components/StatusBar';
import { ToolRail } from '@/modules/studio/components/ToolRail';
import { TopBar } from '@/modules/studio/components/TopBar';
import { useStudioShortcuts } from '@/modules/studio/hooks/useStudioShortcuts';
import { createStudioStore } from '@/modules/studio/state/studioStore';
import {
  StudioContext,
  useStudio,
  type InsertTab,
  type StudioDialog,
} from '@/modules/studio/studioContext';
import { Banner } from '@/shared/ui/feedback';
import { useEffect, useState } from 'react';

function RightPanel() {
  const [tab, setTab] = useState<'design' | 'layers'>('design');
  const layerCount = useStudio(
    (state) => state.history.present.elements.length,
  );
  const { logger } = useServices();
  return (
    <aside className="right-panel" aria-label="Properties and layers">
      <div className="panel-tabs" role="tablist" aria-label="Panels">
        <button
          type="button"
          role="tab"
          id="tab-design"
          aria-selected={tab === 'design'}
          aria-controls="panel-design"
          className="panel-tabs__tab"
          onClick={() => {
            setTab('design');
          }}
        >
          Design
        </button>
        <button
          type="button"
          role="tab"
          id="tab-layers"
          aria-selected={tab === 'layers'}
          aria-controls="panel-layers"
          className="panel-tabs__tab"
          onClick={() => {
            setTab('layers');
          }}
        >
          Layers <span className="badge">{layerCount}</span>
        </button>
      </div>
      <div
        className="right-panel__body"
        role="tabpanel"
        id={tab === 'design' ? 'panel-design' : 'panel-layers'}
        aria-labelledby={tab === 'design' ? 'tab-design' : 'tab-layers'}
      >
        <ErrorBoundary logger={logger} inline>
          {tab === 'design' ? <Inspector /> : <LayersPanel />}
        </ErrorBoundary>
      </div>
    </aside>
  );
}

function OpenDialogs({
  dialog,
  onClose,
}: {
  dialog: StudioDialog | null;
  onClose: () => void;
}) {
  const document = useStudio((state) => state.history.present);
  return (
    <>
      {dialog === 'export' && (
        <ExportDialog open onClose={onClose} document={document} />
      )}
      {dialog === 'share' && (
        <ShareDialog open onClose={onClose} document={document} />
      )}
      <CommandPalette open={dialog === 'commands'} onClose={onClose} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={onClose} />
      <SettingsDialog open={dialog === 'settings'} onClose={onClose} />
    </>
  );
}

/** The editor workspace for one design. */
export function Studio({
  initialDocument,
  mode,
}: {
  initialDocument: DesignDocument;
  mode: 'account' | 'sandbox';
}) {
  const services = useServices();
  const workspace = useWorkspace();
  const notify = useNotify();
  const [store] = useState(() =>
    createStudioStore({
      document: initialDocument,
      createId: services.createId,
      onChange: (document) => {
        workspace.store.getState().saveDocument(document);
      },
      notify: (message, tone) => {
        services.toasts.getState().notify(message, { tone: tone ?? 'info' });
      },
      logger: services.logger.child({
        module: 'studio',
        documentId: initialDocument.id,
      }),
    }),
  );
  const [dialog, setDialog] = useState<StudioDialog | null>(null);
  const [insertTab, setInsertTab] = useState<InsertTab | null>('text');

  // Leaving the editor writes any pending change straight away.
  useEffect(
    () => () => {
      void workspace.store.getState().flush();
    },
    [workspace],
  );

  useStudioShortcuts({
    store,
    dialogOpen: dialog !== null,
    openDialog: setDialog,
    openInsertTab: setInsertTab,
    onSave: () => {
      if (workspace.kind === 'sandbox') {
        notify(
          'Sandbox designs aren’t saved. Export to keep a copy, or create an account.',
          { tone: 'warning' },
        );
        return;
      }
      void workspace.store
        .getState()
        .flush()
        .then(() => {
          notify('All changes saved.', { tone: 'success', durationMs: 2500 });
        });
    },
  });

  return (
    <StudioContext
      value={{
        store,
        mode,
        openDialog: setDialog,
        openInsertTab: setInsertTab,
      }}
    >
      <div className={`studio${insertTab ? '' : ' studio--rail-only'}`}>
        <TopBar />
        {mode === 'sandbox' && (
          <div className="studio__banner">
            <Banner
              tone="warning"
              action={
                <Link to="/sign-up" className="btn btn--secondary btn--sm">
                  Create free account
                </Link>
              }
            >
              <strong>Sandbox mode.</strong> Nothing is saved: closing this tab
              discards the design. Export or share it to keep a copy.
            </Banner>
          </div>
        )}
        <ToolRail active={insertTab} onChange={setInsertTab} />
        {insertTab && <InsertPanel tab={insertTab} />}
        <main className="studio__canvas" aria-label="Design canvas">
          <CanvasViewport />
        </main>
        <RightPanel />
        <StatusBar />
      </div>
      <OpenDialogs
        dialog={dialog}
        onClose={() => {
          setDialog(null);
        }}
      />
    </StudioContext>
  );
}
