import type { DesignShare, ShareStore } from '@/modules/share/shareStore';
import type {
  RealtimeStatus,
  RemoteDesign,
  RemoteDesignWrite,
  RemoteWorkspace,
} from '@/modules/sync/remoteWorkspace';

/**
 * In-memory stand-in for the Supabase backend with the same rules as the
 * migrations: server-owned versions that must increase by one, keyset
 * ordering on server time, tombstones and idempotent image uploads. Several
 * "devices" can share one cloud to exercise sync between them.
 */
export interface FakeCloud {
  rows: Map<string, RemoteDesign>;
  assets: Map<string, string>;
  /** Makes the next N remote calls fail (simulates an outage). */
  failNext: (count: number, message?: string) => void;
  /** Fires realtime change notifications on every subscriber. */
  notify: () => void;
  setRealtime: (status: RealtimeStatus) => void;
  workspace: () => RemoteWorkspace;
  calls: string[];
}

export function createFakeCloud(): FakeCloud {
  const rows = new Map<string, RemoteDesign>();
  const assets = new Map<string, string>();
  const subscribers = new Set<{
    onChange: () => void;
    onStatus: (status: RealtimeStatus) => void;
  }>();
  const calls: string[] = [];
  let failures = 0;
  let failureMessage = 'cloud unavailable';
  let clock = Date.parse('2026-11-01T00:00:00.000Z');

  const tick = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };

  const call = async (name: string) => {
    calls.push(name);
    await Promise.resolve();
    if (failures > 0) {
      failures -= 1;
      throw new Error(failureMessage);
    }
  };

  const store = (write: RemoteDesignWrite, version: number): RemoteDesign => {
    const row: RemoteDesign = {
      id: write.id,
      version,
      payload: write.deletedAt === null ? write.payload : null,
      clientUpdatedAt: write.clientUpdatedAt,
      updatedAt: tick(),
      deletedAt: write.deletedAt,
    };
    rows.set(row.id, row);
    return row;
  };

  const sorted = () =>
    [...rows.values()].sort(
      (a, b) =>
        a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
    );

  const workspace = (): RemoteWorkspace => ({
    fetchChangedSince: async (cursor, limit) => {
      await call('fetchChangedSince');
      return sorted()
        .filter((row) => {
          if (!cursor) {
            return true;
          }
          if (cursor.id === '') {
            return row.updatedAt >= cursor.updatedAt;
          }
          return (
            row.updatedAt > cursor.updatedAt ||
            (row.updatedAt === cursor.updatedAt && row.id > cursor.id)
          );
        })
        .slice(0, limit);
    },
    fetchById: async (id) => {
      await call('fetchById');
      return rows.get(id) ?? null;
    },
    insert: async (write) => {
      await call('insert');
      return rows.has(write.id) ? null : store(write, 1);
    },
    update: async (write, expectedVersion) => {
      await call('update');
      const current = rows.get(write.id);
      if (current?.version !== expectedVersion) {
        return null;
      }
      return store(write, expectedVersion + 1);
    },
    uploadAsset: async (id, envelope) => {
      await call('uploadAsset');
      if (!assets.has(id)) {
        assets.set(id, envelope);
      }
    },
    downloadAsset: async (id) => {
      await call('downloadAsset');
      return assets.get(id) ?? null;
    },
    deleteAsset: async (id) => {
      await call('deleteAsset');
      assets.delete(id);
    },
    subscribe: (onChange, onStatus) => {
      const subscriber = { onChange, onStatus };
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
  });

  return {
    rows,
    assets,
    calls,
    failNext: (count, message = 'cloud unavailable') => {
      failures = count;
      failureMessage = message;
    },
    notify: () => {
      for (const subscriber of subscribers) {
        subscriber.onChange();
      }
    },
    setRealtime: (status) => {
      for (const subscriber of subscribers) {
        subscriber.onStatus(status);
      }
    },
    workspace,
  };
}

function viewOf(share: DesignShare): DesignShare {
  return {
    id: share.id,
    title: share.title,
    width: share.width,
    height: share.height,
    updatedAt: share.updatedAt,
  };
}

/** Share links kept in memory, with the same public/owner split. */
export function createFakeShareStore(): ShareStore & {
  shares: Map<string, DesignShare & { png: Blob }>;
} {
  const shares = new Map<string, DesignShare & { png: Blob }>();
  let counter = 0;
  return {
    shares,
    getForDesign: (designId) => {
      const share = shares.get(designId);
      return Promise.resolve(share ? viewOf(share) : null);
    },
    publish: (input) => {
      counter += 1;
      const existing = shares.get(input.designId);
      const share = {
        id:
          existing?.id ??
          `5a000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
        title: input.title,
        width: input.width,
        height: input.height,
        updatedAt: `2026-11-01T00:00:0${counter % 10}.000Z`,
        png: input.png,
      };
      shares.set(input.designId, share);
      return Promise.resolve(viewOf(share));
    },
    unpublish: (designId) => {
      shares.delete(designId);
      return Promise.resolve();
    },
    fetchShared: (shareId) => {
      const share = [...shares.values()].find((entry) => entry.id === shareId);
      if (!share) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        ...viewOf(share),
        imageUrl: `https://cloud.example.test/${share.id}.png`,
      });
    },
  };
}
