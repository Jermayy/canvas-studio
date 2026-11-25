import { BrandMark, Link } from '@/app/components/AppChrome';
import { useServices } from '@/app/services';
import { parseShareId } from '@/modules/share/domain/shareLink';
import type { SharedDesignView } from '@/modules/share/shareStore';
import { sanitizeFileName } from '@/shared/lib/fileName';
import { Button } from '@/shared/ui/Button';
import { Banner, EmptyState, Spinner } from '@/shared/ui/feedback';
import { useEffect, useState } from 'react';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const APP_NAME = 'Canvas Studio';

type State =
  | { shareId: string; kind: 'missing' | 'error' }
  | { shareId: string; kind: 'ready'; view: SharedDesignView };

/** The public, read-only view of a shared design (/s/<token>). */
export default function SharedDesignPage({ token }: { token: string }) {
  const { shares, files, logger } = useServices();
  const shareId = parseShareId(token);
  const [loaded, setLoaded] = useState<State | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    if (!shareId || !shares) {
      return undefined;
    }
    let cancelled = false;
    shares.fetchShared(shareId).then(
      (view) => {
        if (!cancelled) {
          setLoaded(
            view
              ? { shareId, kind: 'ready', view }
              : { shareId, kind: 'missing' },
          );
        }
      },
      (error: unknown) => {
        logger.error('share.view_failed', { error });
        if (!cancelled) {
          setLoaded({ shareId, kind: 'error' });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shareId, shares, logger]);

  const state: State | null =
    !shareId || !shares
      ? { shareId: token, kind: 'missing' }
      : loaded?.shareId === shareId
        ? loaded
        : null;
  const title =
    state?.kind === 'ready' ? `${state.view.title} · ${APP_NAME}` : APP_NAME;

  useEffect(() => {
    document.title = title;
  }, [title]);

  const download = async (view: SharedDesignView) => {
    setDownloading(true);
    setDownloadError(false);
    try {
      // Fetched as bytes: browsers ignore `download` on cross-origin links.
      const response = await fetch(view.imageUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`image download failed: HTTP ${response.status}`);
      }
      const blob = await response.blob();
      files.download(
        new Blob([blob], { type: 'image/png' }),
        `${sanitizeFileName(view.title)}.png`,
      );
    } catch (error) {
      logger.error('share.download_failed', { error });
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="shared-page">
      <header className="shared-page__header">
        <Link to="/" aria-label={`${APP_NAME} home`}>
          <BrandMark />
        </Link>
      </header>
      {state === null && <Spinner label="Loading design…" size={22} />}
      {state?.kind === 'missing' && (
        <EmptyState icon="eye-off" title="This link isn’t available">
          It may have been turned off by its owner, or the design was deleted.
        </EmptyState>
      )}
      {state?.kind === 'error' && (
        <EmptyState icon="cloud-off" title="Couldn’t load this design">
          Check your connection and reload the page.
        </EmptyState>
      )}
      {state?.kind === 'ready' && (
        <article className="shared-page__design">
          <h1 className="shared-page__title">{state.view.title}</h1>
          <img
            className="shared-page__image"
            src={state.view.imageUrl}
            alt={`Design: ${state.view.title}`}
            width={state.view.width}
            height={state.view.height}
          />
          {downloadError && (
            <Banner tone="error">Download failed. Please try again.</Banner>
          )}
          <Button
            variant="primary"
            icon="download"
            busy={downloading}
            busyLabel="Downloading…"
            onClick={() => {
              void download(state.view);
            }}
          >
            Download PNG
          </Button>
        </article>
      )}
      <p className="shared-page__footer">
        View-only. Made with <Link to="/">{APP_NAME}</Link>.
      </p>
    </main>
  );
}
