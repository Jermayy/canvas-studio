import {
  browserLeaseLocks,
  createWorkspaceLeases,
  leaseName,
  type LeaseLockManager,
} from '@/modules/workspace/infrastructure/workspaceLease';
import { createLogger } from '@/shared/logger';
import { createFakeLockManager } from '@/test/fakeLocks';

const logger = createLogger({ service: 'test', sink: () => undefined });

describe('workspace leases (one active tab)', () => {
  it('gives the account to one tab; a second finds it busy', async () => {
    const locks = createFakeLockManager();
    const tabA = createWorkspaceLeases(locks, logger);
    const tabB = createWorkspaceLeases(locks, logger);
    const first = await tabA.acquire('u1', { steal: false, onLost: vi.fn() });
    expect(first.kind).toBe('held');
    expect(
      (await tabB.acquire('u1', { steal: false, onLost: vi.fn() })).kind,
    ).toBe('busy');
    // Other accounts are independent.
    expect(
      (await tabB.acquire('u2', { steal: false, onLost: vi.fn() })).kind,
    ).toBe('held');
  });

  it('hands over on steal and tells the previous tab', async () => {
    const locks = createFakeLockManager();
    const onLost = vi.fn();
    const tabA = createWorkspaceLeases(locks, logger);
    const tabB = createWorkspaceLeases(locks, logger);
    await tabA.acquire('u1', { steal: false, onLost });
    expect(
      (await tabB.acquire('u1', { steal: true, onLost: vi.fn() })).kind,
    ).toBe('held');
    await vi.waitFor(() => {
      expect(onLost).toHaveBeenCalledTimes(1);
    });
  });

  it('frees the account on release', async () => {
    const locks = createFakeLockManager();
    const tab = createWorkspaceLeases(locks, logger);
    const held = await tab.acquire('u1', { steal: false, onLost: vi.fn() });
    if (held.kind !== 'held') {
      throw new Error('expected the lease');
    }
    held.release();
    await vi.waitFor(async () => {
      expect(
        (await tab.acquire('u1', { steal: false, onLost: vi.fn() })).kind,
      ).toBe('held');
    });
  });

  it('works without Web Locks, and fails open on unexpected lock errors', async () => {
    const none = createWorkspaceLeases(undefined, logger);
    const result = await none.acquire('u1', { steal: false, onLost: vi.fn() });
    expect(result.kind).toBe('held');
    if (result.kind === 'held') {
      result.release();
    }
    const broken: LeaseLockManager = {
      request: () => Promise.reject(new Error('SecurityError')),
    };
    const onLost = vi.fn();
    expect(
      (
        await createWorkspaceLeases(broken, logger).acquire('u1', {
          steal: false,
          onLost,
        })
      ).kind,
    ).toBe('held');
    expect(onLost).not.toHaveBeenCalled();
    expect(leaseName('u1')).toBe('canvas-studio-workspace:u1');
  });

  it('uses navigator.locks when the browser has it', async () => {
    expect('locks' in navigator).toBe(false);
    expect(browserLeaseLocks()).toBeUndefined();
    const request = vi.fn(
      (
        _name: string,
        _options: object,
        callback: (lock: unknown) => Promise<void>,
      ) => callback({}),
    );
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });
    try {
      const locks = browserLeaseLocks();
      await locks?.request('x', { ifAvailable: true }, () => Promise.resolve());
      expect(request).toHaveBeenCalledWith(
        'x',
        { ifAvailable: true },
        expect.any(Function),
      );
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });
});
