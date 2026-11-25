import { FullScreenLoader, Link } from '@/app/components/AppChrome';
import { useNotify, useWorkspaceState } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { Studio } from '@/modules/studio/components/Studio';
import { Button, IconButton } from '@/shared/ui/Button';
import { Banner, EmptyState } from '@/shared/ui/feedback';
import { useState } from 'react';

interface Opened {
  document: DesignDocument;
  /** Remounts the editor when the user loads the latest version. */
  editorKey: number;
  /** Remote changes up to this revision are already dealt with. */
  seen: number;
  /** Revision at which the design was deleted elsewhere, if it was. */
  deletedAt: number | null;
}

/** Puts focus back in the editor after it remounts (not on <body>). */
function focusEditor() {
  requestAnimationFrame(() => {
    window.document
      .querySelector<HTMLInputElement>('input[aria-label="Design name"]')
      ?.focus();
  });
}

/** Opens a saved design from the signed-in workspace. */
export default function StudioRoute({ documentId }: { documentId: string }) {
  const status = useWorkspaceState((state) => state.status);
  const document = useWorkspaceState((state) => state.documents[documentId]);
  const revision = useWorkspaceState(
    (state) => state.remoteRevisions[documentId] ?? 0,
  );
  // The editor owns the document once open; later workspace updates are
  // its own saves echoing back, so only the first version seeds it. A
  // change from another device is offered, never forced on the editor.
  const notify = useNotify();
  const [opened, setOpened] = useState<Opened | null>(null);
  if (!opened && document) {
    setOpened({ document, editorKey: 0, seen: revision, deletedAt: null });
  }
  if (opened && revision > opened.seen) {
    if (!document && opened.deletedAt !== revision) {
      setOpened({ ...opened, deletedAt: revision });
    } else if (document && opened.deletedAt === revision) {
      // No newer remote change: the user's own edit brought it back.
      setOpened({ ...opened, seen: revision, deletedAt: null });
    }
  }

  if (status === 'idle' || status === 'loading') {
    return <FullScreenLoader label="Opening your design…" />;
  }
  if (!opened) {
    return (
      <main className="centered-page">
        <EmptyState
          icon="folder"
          title="This design isn’t here"
          action={
            <Link to="/projects" className="btn btn--primary btn--md">
              Back to projects
            </Link>
          }
        >
          It may have been deleted, or it belongs to another account on this
          device.
        </EmptyState>
      </main>
    );
  }
  const changedRemotely = revision > opened.seen;
  const dismiss = () => {
    setOpened({ ...opened, seen: revision, deletedAt: null });
    focusEditor();
  };
  const dismissButton = (
    <IconButton icon="close" label="Dismiss" size="sm" onClick={dismiss} />
  );
  return (
    <>
      {changedRemotely && (
        <div className="studio-remote-notice">
          {document ? (
            <Banner
              tone="info"
              icon="refresh"
              action={
                <span className="studio-remote-notice__actions">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setOpened({
                        document,
                        editorKey: opened.editorKey + 1,
                        seen: revision,
                        deletedAt: null,
                      });
                      notify('Latest version loaded.', { tone: 'success' });
                      focusEditor();
                    }}
                  >
                    Load latest
                  </Button>
                  {dismissButton}
                </span>
              }
            >
              This design was changed on another device. Load the latest
              version, or keep editing to replace it.
            </Banner>
          ) : (
            <Banner tone="warning" action={dismissButton}>
              This design was deleted on another device. Keep editing to bring
              it back, or <Link to="/projects">return to your projects</Link>.
            </Banner>
          )}
        </div>
      )}
      <Studio
        key={opened.editorKey}
        initialDocument={opened.document}
        mode="account"
      />
    </>
  );
}
