import { useNotify, useServices, useWorkspace } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { ExportSettings } from '@/modules/export/ExportDialog';
import {
  checkExportOptions,
  defaultExportOptions,
  exportFormat,
  type ExportOptions,
} from '@/modules/export/domain/exportOptions';
import { PHASE_LABELS, useExporter } from '@/modules/export/useExporter';
import { buildMailto, parseRecipients } from '@/modules/share/emailDraft';
import { ShareLinkCard } from '@/modules/share/ShareLinkCard';
import { sanitizeFileName } from '@/shared/lib/fileName';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Banner } from '@/shared/ui/feedback';
import { TextField } from '@/shared/ui/fields';
import { Icon } from '@/shared/ui/Icon';
import { useId, useState } from 'react';

type Action = 'native' | 'email' | 'copy';

/**
 * Sharing: a view-only link (signed in with cloud sync), the device share
 * sheet (files go straight to Messages, Mail, Slack…), an email draft in
 * the user's own mail app, or the clipboard.
 */
export function ShareDialog({
  open,
  onClose,
  document,
}: {
  open: boolean;
  onClose: () => void;
  document: DesignDocument;
}) {
  const { files, shares } = useServices();
  const workspace = useWorkspace();
  const linkShares = workspace.kind === 'account' ? shares : null;
  const notify = useNotify();
  const exporter = useExporter();
  const messageId = useId();
  const [options, setOptions] = useState<ExportOptions>(() =>
    defaultExportOptions(document, sanitizeFileName(document.name)),
  );
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState('');
  const [subject, setSubject] = useState(document.name);
  const [message, setMessage] = useState(`Hi,\n\nHere’s “${document.name}”.\n`);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const valid = checkExportOptions(document, options).ok;
  const nativeShare = typeof navigator.share === 'function';

  const perform = async (next: Action, work: () => Promise<void>) => {
    setError(null);
    setAction(next);
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sharing failed.');
    } finally {
      setAction(null);
    }
  };

  const shareNative = () =>
    perform('native', async () => {
      const result = await exporter.run(document, options);
      const file = new File([result.blob], result.fileName, {
        type: result.mimeType,
      });
      if (!files.canShareFiles(file)) {
        files.download(result.blob, result.fileName);
        notify(
          `This browser can’t share ${exportFormat(options.format).label} files, so it was downloaded instead.`,
          {
            tone: 'warning',
          },
        );
        return;
      }
      const outcome = await files.share({
        file,
        title: document.name,
        text: document.name,
      });
      if (outcome === 'shared') {
        notify('Shared.', { tone: 'success' });
        onClose();
      }
    });

  const shareByEmail = () => {
    const parsed = parseRecipients(recipients);
    if (!parsed.ok) {
      setRecipientError(parsed.message);
      return;
    }
    setRecipientError(null);
    void perform('email', async () => {
      const result = await exporter.run(document, options);
      files.download(result.blob, result.fileName);
      const { url, truncated } = buildMailto({
        recipients: parsed.recipients,
        subject: subject.trim() || document.name,
        body: message,
        attachmentName: result.fileName,
      });
      files.openEmailDraft(url);
      notify(
        `${result.fileName} downloaded. Attach it to the email draft${truncated ? ' (your message was shortened to fit)' : ''}.`,
        { tone: 'info', durationMs: 10_000 },
      );
    });
  };

  const copyImage = () =>
    perform('copy', async () => {
      const result = await exporter.run(document, {
        ...options,
        format: 'png',
      });
      await files.copyImage(result.blob);
      notify('Image copied. Paste it into any app.', { tone: 'success' });
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share"
      description={
        linkShares
          ? 'Share a view-only link, or send your design as a file.'
          : 'Send your design as a file — nothing is uploaded to a server.'
      }
      size="lg"
      footer={
        exporter.phase ? (
          <span className="dialog__progress" role="status">
            <Icon name="spinner" className="spin" size={16} />{' '}
            {PHASE_LABELS[exporter.phase]}
          </span>
        ) : undefined
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
      <div className="share-grid">
        {linkShares && (
          <ShareLinkCard shares={linkShares} document={document} />
        )}
        <section className="share-card" aria-labelledby="share-device">
          <h3 id="share-device" className="share-card__title">
            <Icon name="share" size={18} /> Share from this device
          </h3>
          <p className="share-card__text">
            {nativeShare
              ? 'Opens your device’s share sheet: Messages, Mail, AirDrop, WhatsApp, Slack and more.'
              : 'This browser has no share sheet. Use email, copy the image, or export it instead.'}
          </p>
          <Button
            variant="primary"
            icon="share"
            disabled={!nativeShare || !valid || action !== null}
            busy={action === 'native'}
            busyLabel="Preparing file…"
            onClick={() => {
              void shareNative();
            }}
          >
            Share…
          </Button>
        </section>

        <section className="share-card" aria-labelledby="share-copy">
          <h3 id="share-copy" className="share-card__title">
            <Icon name="clipboard" size={18} /> Copy image
          </h3>
          <p className="share-card__text">
            Copies a PNG to your clipboard to paste into chats, docs and slides.
          </p>
          <Button
            icon="copy"
            disabled={!files.canCopyImage() || action !== null}
            busy={action === 'copy'}
            busyLabel="Copying…"
            onClick={() => {
              void copyImage();
            }}
          >
            Copy PNG
          </Button>
        </section>

        <section
          className="share-card share-card--wide"
          aria-labelledby="share-email"
        >
          <h3 id="share-email" className="share-card__title">
            <Icon name="mail" size={18} /> Email
          </h3>
          <TextField
            label="To"
            type="text"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com, another@example.com"
            value={recipients}
            error={recipientError}
            hint="Optional. Separate addresses with commas."
            onChange={(event) => {
              setRecipients(event.target.value);
            }}
          />
          <TextField
            label="Subject"
            value={subject}
            maxLength={150}
            onChange={(event) => {
              setSubject(event.target.value);
            }}
          />
          <div className="field">
            <label className="field__label" htmlFor={messageId}>
              Message
            </label>
            <textarea
              id={messageId}
              className="input textarea"
              rows={4}
              maxLength={1500}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
            />
          </div>
          <p className="share-card__text">
            <Icon name="info" size={13} /> Your mail app opens with this draft
            and the file is downloaded for you to attach — email links can’t
            attach files on their own.
          </p>
          <Button
            icon="mail"
            disabled={!valid || action !== null}
            busy={action === 'email'}
            busyLabel="Preparing email…"
            onClick={shareByEmail}
          >
            Download & open email draft
          </Button>
        </section>
      </div>
      <details className="share-file">
        <summary>
          File settings: {exportFormat(options.format).label}
          {exportFormat(options.format).vector ? '' : ` at ${options.scale}×`},
          “{options.fileName}”
        </summary>
        <ExportSettings
          document={document}
          options={options}
          onChange={setOptions}
          formats={['png', 'jpeg', 'pdf']}
        />
      </details>
    </Dialog>
  );
}
