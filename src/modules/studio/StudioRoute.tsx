import { FullScreenLoader, Link } from '@/app/components/AppChrome';
import { useWorkspaceState } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { Studio } from '@/modules/studio/components/Studio';
import { Button } from '@/shared/ui/Button';
import { Banner, EmptyState } from '@/shared/ui/feedback';
import { useState } from 'react';

interface Opened {
  document: DesignDocument;
  /** The design's remote revision when the editor took it. */
  revision: number;
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
  const [opened, setOpened] = useState<Opened | null>(null);
  if (!opened && document) {
    setOpened({ document, revision });
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
  const changedRemotely = revision > opened.revision;
  return (
    <>
      {changedRemotely && (
        <div className="studio-remote-notice">
          {document ? (
            <Banner
              tone="info"
              icon="refresh"
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setOpened({ document, revision });
                  }}
                >
                  Load latest
                </Button>
              }
            >
              This design was changed on another device. Load the latest
              version, or keep editing to replace it.
            </Banner>
          ) : (
            <Banner tone="warning">
              This design was deleted on another device. Keep editing to bring
              it back, or <Link to="/projects">return to your projects</Link>.
            </Banner>
          )}
        </div>
      )}
      <Studio
        key={opened.revision}
        initialDocument={opened.document}
        mode="account"
      />
    </>
  );
}
