import { BrandMark, Link } from '@/app/components/AppChrome';
import { useServices, WorkspaceContext } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { TemplatePicker } from '@/modules/library/components/TemplatePicker';
import { createFromStartingPoint } from '@/modules/library/startingPoint';
import { Studio } from '@/modules/studio/components/Studio';
import { Banner } from '@/shared/ui/feedback';
import { useEffect, useState } from 'react';

/**
 * The no-account studio: a full editor on an in-memory workspace. Nothing
 * is written to storage, so closing the tab discards the design — the UI
 * says so up front and the export flow is the way to keep work.
 */
export default function SandboxRoute() {
  const services = useServices();
  const [workspace] = useState(() => services.openSandbox());
  const [document, setDocument] = useState<DesignDocument | null>(null);

  useEffect(() => {
    void workspace.store.getState().load();
    return () => {
      void workspace.close();
    };
  }, [workspace]);

  // Leaving with work in progress loses it; ask first.
  useEffect(() => {
    if (!document) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [document]);

  return (
    <WorkspaceContext value={workspace}>
      {document ? (
        <Studio initialDocument={document} mode="sandbox" />
      ) : (
        <div className="sandbox-start">
          <header className="sandbox-start__header">
            <Link to="/" aria-label="Canvas Studio home">
              <BrandMark />
            </Link>
            <Link to="/sign-up" className="btn btn--primary btn--md">
              Create free account
            </Link>
          </header>
          <main className="sandbox-start__main">
            <h1>Pick a starting point</h1>
            <Banner tone="info" icon="info">
              Sandbox mode: everything works, including export and sharing, but
              nothing is saved. Create an account to keep designs.
            </Banner>
            <TemplatePicker
              busyKey={null}
              onPick={(start) => {
                const created = createFromStartingPoint(start, {
                  createId: services.createId,
                  now: services.now(),
                });
                void workspace.store.getState().createDocument(created);
                setDocument(created);
              }}
            />
          </main>
        </div>
      )}
    </WorkspaceContext>
  );
}
