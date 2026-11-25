import { useNotify, useServices, useWorkspace } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import {
  defaultExportOptions,
  type ExportOptions,
} from '@/modules/export/domain/exportOptions';
import { useExporter } from '@/modules/export/useExporter';
import {
  buildShareUrl,
  MAX_SHARE_IMAGE_BYTES,
  shareImageScale,
} from '@/modules/share/domain/shareLink';
import type { DesignShare, ShareStore } from '@/modules/share/shareStore';
import { sanitizeFileName } from '@/shared/lib/fileName';
import { Button } from '@/shared/ui/Button';
import { Banner } from '@/shared/ui/feedback';
import { TextField } from '@/shared/ui/fields';
import { Icon } from '@/shared/ui/Icon';
import { useEffect, useState } from 'react';

type Loaded =
  | { designId: string; status: 'ready'; share: DesignShare | null }
  | { designId: string; status: 'error' };

type Busy = 'publish' | 'stop' | 'copy' | null;

const NOT_SYNCED =
  'This design hasn’t reached the cloud yet. Wait for “Synced”, then try again.';

/** The design's current share link, loaded once per open dialog. */
function useDesignShare(shares: ShareStore, designId: string) {
  const { logger } = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let cancelled = false;
    shares.getForDesign(designId).then(
      (share) => {
        if (!cancelled) {
          setLoaded({ designId, status: 'ready', share });
        }
      },
      (error: unknown) => {
        logger.warn('share.load_failed', { designId, error });
        if (!cancelled) {
          setLoaded({ designId, status: 'error' });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shares, designId, logger]);
  const current = loaded?.designId === designId ? loaded : null;
  const set = (share: DesignShare | null) => {
    setLoaded({ designId, status: 'ready', share });
  };
  return [current, set] as const;
}

/**
 * View-only share links: publishes the design's name and a PNG to a public
 * link (/s/<token>). Everything else about the design stays encrypted.
 */
export function ShareLinkCard({
  shares,
  document,
}: {
  shares: ShareStore;
  document: DesignDocument;
}) {
  const { files, logger } = useServices();
  const { sync } = useWorkspace();
  const notify = useNotify();
  const exporter = useExporter();
  const [loaded, setShare] = useDesignShare(shares, document.id);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const share = loaded?.status === 'ready' ? loaded.share : null;
  const url = share ? buildShareUrl(window.location.origin, share.id) : null;

  const run = async (next: Exclude<Busy, null>, work: () => Promise<void>) => {
    setBusy(next);
    setError(null);
    try {
      await work();
    } finally {
      setBusy(null);
    }
  };

  const publish = () =>
    run('publish', async () => {
      try {
        // The link points at the cloud copy, so it must exist first.
        await sync?.syncNow();
        const options: ExportOptions = {
          ...defaultExportOptions(document, sanitizeFileName(document.name)),
          format: 'png',
          scale: shareImageScale(document),
          transparent: false,
        };
        const image = await exporter.run(document, options);
        if (image.blob.size > MAX_SHARE_IMAGE_BYTES) {
          setError(
            'This design is too large to share as a link. Export it instead.',
          );
          return;
        }
        const published = await shares.publish({
          designId: document.id,
          title: document.name,
          width: document.format.width,
          height: document.format.height,
          png: image.blob,
        });
        setShare(published);
        await files.copyText(
          buildShareUrl(window.location.origin, published.id),
        );
        notify(
          share
            ? 'Link updated with your latest changes.'
            : 'Link created and copied.',
          { tone: 'success' },
        );
      } catch (failure) {
        logger.error('share.publish_failed', {
          designId: document.id,
          error: failure,
        });
        setError(
          sync?.store.getState().pending
            ? NOT_SYNCED
            : 'Couldn’t create the link. Check your connection and try again.',
        );
      }
    });

  const stop = () =>
    run('stop', async () => {
      try {
        await shares.unpublish(document.id);
        setShare(null);
        notify('Link turned off. It no longer works for anyone.', {
          tone: 'success',
        });
      } catch (failure) {
        logger.error('share.unpublish_failed', {
          designId: document.id,
          error: failure,
        });
        setError('Couldn’t turn the link off. Try again.');
      }
    });

  const copy = (link: string) =>
    run('copy', async () => {
      try {
        await files.copyText(link);
        notify('Link copied.', { tone: 'success' });
      } catch {
        setError('Couldn’t copy. Select the link and copy it yourself.');
      }
    });

  return (
    <section
      className="share-card share-card--wide"
      aria-labelledby="share-link"
      aria-busy={loaded === null}
    >
      <h3 id="share-link" className="share-card__title">
        <Icon name="link" size={18} /> View-only link
      </h3>
      {error && <Banner tone="error">{error}</Banner>}
      {loaded?.status === 'error' && (
        <Banner tone="warning">
          Couldn’t check this design’s link. You’re probably offline.
        </Banner>
      )}
      <p className="share-card__text">
        Anyone with the link sees an image of this design and its name, and can
        download it. They can’t edit it, and the rest of your workspace stays
        encrypted. Update the link after changes; turn it off at any time.
      </p>
      {url && (
        <TextField
          label="Share link"
          readOnly
          value={url}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
      )}
      <div className="share-card__actions">
        <Button
          variant={url ? 'secondary' : 'primary'}
          icon={url ? 'refresh' : 'link'}
          disabled={loaded === null || busy !== null}
          busy={busy === 'publish'}
          busyLabel={url ? 'Updating…' : 'Creating link…'}
          onClick={() => {
            void publish();
          }}
        >
          {url ? 'Update image' : 'Create link'}
        </Button>
        {url && (
          <>
            <Button
              icon="copy"
              disabled={busy !== null}
              busy={busy === 'copy'}
              onClick={() => {
                void copy(url);
              }}
            >
              Copy link
            </Button>
            <Button
              variant="danger"
              icon="trash"
              disabled={busy !== null}
              busy={busy === 'stop'}
              busyLabel="Turning off…"
              onClick={() => {
                void stop();
              }}
            >
              Stop sharing
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
