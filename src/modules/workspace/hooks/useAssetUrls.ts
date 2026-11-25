import { useWorkspace } from '@/app/services';
import type { DesignDocument } from '@/modules/document/domain/schema';
import { useEffect, useState } from 'react';

/**
 * Object URLs for a design's images, decrypted from the workspace on
 * demand and revoked when no longer needed.
 */
export function useAssetUrls(
  document: DesignDocument | null,
): Readonly<Record<string, string>> {
  const { store } = useWorkspace();
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const key = document
    ? [
        ...new Set(
          document.elements.flatMap((element) =>
            element.type === 'image' ? [element.assetId] : [],
          ),
        ),
      ]
        .sort()
        .join(',')
    : '';

  useEffect(() => {
    if (!key) {
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void Promise.all(
      key.split(',').map(async (id) => {
        const blob = await store.getState().getAssetBlob(id);
        return blob ? ([id, URL.createObjectURL(blob)] as const) : null;
      }),
    ).then((entries) => {
      const found = entries.filter((entry) => entry !== null);
      created.push(...found.map(([, url]) => url));
      if (cancelled) {
        created.forEach((url) => {
          URL.revokeObjectURL(url);
        });
        return;
      }
      setUrls(Object.fromEntries(found));
    });
    return () => {
      cancelled = true;
      created.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [key, store]);

  return key ? urls : {};
}
