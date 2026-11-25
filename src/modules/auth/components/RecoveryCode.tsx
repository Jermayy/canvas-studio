import { useServices } from '@/app/services';
import { Button } from '@/shared/ui/Button';
import { Dialog } from '@/shared/ui/Dialog';
import { Banner } from '@/shared/ui/feedback';
import { useState } from 'react';

/** Shows a freshly issued recovery code once; it can't be retrieved later. */
export function RecoveryCodePanel({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}) {
  const { files } = useServices();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="recovery-code">
      <Banner tone="warning">
        This is the only way back in if you forget your password. Your designs
        are encrypted, so without it they can’t be recovered. It won’t be shown
        again.
      </Banner>
      <output className="recovery-code__value" aria-label="Recovery code">
        {code}
      </output>
      <div className="recovery-code__actions">
        <Button
          icon="copy"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        <Button
          icon="download"
          onClick={() => {
            files.download(
              new Blob([`Canvas Studio recovery code\n\n${code}\n`], {
                type: 'text/plain',
              }),
              'canvas-studio-recovery-code.txt',
            );
          }}
        >
          Download as text
        </Button>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => {
            setSaved(event.target.checked);
          }}
        />
        <span>I’ve stored my recovery code somewhere safe</span>
      </label>
      <Button variant="primary" disabled={!saved} onClick={onDone}>
        Continue
      </Button>
    </div>
  );
}

export function RecoveryCodeDialog({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}) {
  return (
    <Dialog
      open
      // Closing is only allowed once the user confirms they've saved it.
      onClose={() => undefined}
      title="Save your recovery code"
      description="Keep it in a password manager or print it."
      size="sm"
      dismissible={false}
    >
      <RecoveryCodePanel code={code} onDone={onDone} />
    </Dialog>
  );
}
