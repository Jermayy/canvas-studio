import { BrandMark } from '@/app/components/AppChrome';
import { Button } from '@/shared/ui/Button';
import { useState } from 'react';

/**
 * Shown when the account is open in another tab (one active tab, ADR
 * 0012). "Use here" takes over; the other tab saves and pauses.
 */
export function ElsewherePage({
  onUseHere,
}: {
  onUseHere: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="centered-page">
      <div className="centered-page__brand">
        <BrandMark />
      </div>
      <h1>Canvas Studio is open in another tab</h1>
      <p>
        To keep your designs in step, only one tab can edit at a time. Use it
        here instead, and the other tab saves your work and pauses.
      </p>
      <Button
        variant="primary"
        icon="refresh"
        busy={busy}
        busyLabel="Switching…"
        onClick={() => {
          setBusy(true);
          void onUseHere().finally(() => {
            setBusy(false);
          });
        }}
      >
        Use here
      </Button>
    </main>
  );
}
