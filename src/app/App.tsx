import { FullScreenLoader, Redirect } from '@/app/components/AppChrome';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { NotFoundPage } from '@/app/components/NotFoundPage';
import { navigate, parseRoute, useLocation, type Route } from '@/app/router';
import {
  ServicesContext,
  SessionContext,
  WorkspaceContext,
  type AppServices,
  type Workspace,
} from '@/app/services';
import type { DeleteAccountResult } from '@/modules/account/deleteAccount';
import type { AuthSuccess } from '@/modules/auth/application/authService';
import type { StoredSession } from '@/modules/auth/application/ports';
import { RecoveryCodeDialog } from '@/modules/auth/components/RecoveryCode';
import { ResetPasswordPage } from '@/modules/auth/components/ResetPasswordPage';
import { AuthPage } from '@/modules/auth/components/AuthPage';
import { LandingPage } from '@/modules/landing/LandingPage';
import { applyPreferences } from '@/modules/preferences/preferences';
import { Toaster } from '@/shared/ui/Toaster';
import { ElsewherePage } from '@/app/components/ElsewherePage';
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';

// Route-level code splitting: the editor (and jsPDF behind it) only loads
// when someone opens a design.
const DashboardPage = lazy(() => import('@/modules/dashboard/DashboardPage'));
const StudioRoute = lazy(() => import('@/modules/studio/StudioRoute'));
const SandboxRoute = lazy(() => import('@/modules/studio/SandboxRoute'));
const SharedDesignPage = lazy(() => import('@/modules/share/SharedDesignPage'));

type AuthState =
  | { status: 'restoring' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; stored: StoredSession; workspace: Workspace }
  /** Signed in, but another tab holds the workspace (one active tab). */
  | { status: 'elsewhere'; stored: StoredSession };

/** Keeps preferences applied to <html> (theme, accent, density, scale). */
function PreferencesEffect({ services }: { services: AppServices }) {
  const preferences = useStore(
    services.preferences,
    (state) => state.preferences,
  );
  useEffect(() => {
    applyPreferences(document.documentElement, preferences);
  }, [preferences]);
  return null;
}

/**
 * Pending saves are written when the tab is hidden or the page unloads.
 * Those are the events browsers reliably deliver (beforeunload alone
 * loses writes, playbook 06); beforeunload only asks to confirm leaving
 * while a save is still pending.
 */
function useFlushOnHide(workspace: Workspace | null) {
  useEffect(() => {
    if (!workspace) {
      return;
    }
    const flush = () => {
      void workspace.store.getState().flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const saves = Object.values(workspace.store.getState().saves);
      if (saves.some((save) => save.status !== 'saved')) {
        flush();
        event.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [workspace]);
}

function routeNeedsAccount(
  route: Route,
): route is Extract<Route, { name: 'projects' | 'studio' }> {
  return route.name === 'projects' || route.name === 'studio';
}

function Routes({
  route,
  auth,
  onAuthenticated,
  onUseHere,
}: {
  route: Route;
  auth: AuthState;
  onAuthenticated: (success: AuthSuccess, next: string) => void;
  onUseHere: () => Promise<void>;
}) {
  const location = useLocation();
  const signedIn = auth.status === 'signed-in' || auth.status === 'elsewhere';
  switch (route.name) {
    case 'landing':
      return <LandingPage signedIn={signedIn} />;
    case 'sign-in':
    case 'sign-up':
      if (signedIn) {
        return <Redirect to={route.next} />;
      }
      return (
        <AuthPage
          // Keyed by mode: switching sign-up ↔ sign-in starts a fresh form
          // (otherwise "Check your inbox" outlives the link to sign in).
          key={route.name}
          mode={route.name}
          next={route.next}
          onAuthenticated={(success) => {
            onAuthenticated(success, route.next);
          }}
        />
      );
    case 'reset-password':
      // A reset link (with a code) opens the reset form even when signed
      // in; the current session is replaced only once the reset succeeds,
      // so a bad or foreign link changes nothing.
      if (signedIn && !route.code) {
        return <Redirect to="/projects" />;
      }
      return (
        <ResetPasswordPage
          email={route.email}
          code={route.code}
          onAuthenticated={(success) => {
            onAuthenticated(success, '/projects');
          }}
        />
      );
    case 'sandbox':
      return <SandboxRoute />;
    case 'shared':
      return <SharedDesignPage token={route.token} />;
    case 'not-found':
      return <NotFoundPage />;
    case 'projects':
    case 'studio':
      break;
  }
  if (!routeNeedsAccount(route)) {
    return null;
  }
  if (auth.status === 'restoring') {
    return <FullScreenLoader label="Unlocking your workspace…" />;
  }
  if (auth.status === 'signed-out') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Redirect to={`/sign-in?next=${next}`} />;
  }
  if (auth.status === 'elsewhere') {
    return <ElsewherePage onUseHere={onUseHere} />;
  }
  return (
    <WorkspaceContext value={auth.workspace}>
      {route.name === 'projects' ? (
        <DashboardPage search={route.search} />
      ) : (
        <StudioRoute key={route.documentId} documentId={route.documentId} />
      )}
    </WorkspaceContext>
  );
}

export function App({ services }: { services: AppServices }) {
  const location = useLocation();
  const route = parseRoute(location.pathname, location.search);
  const [auth, setAuth] = useState<AuthState>({ status: 'restoring' });
  // Shown once, right after the keyring issues a code.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const workspace = auth.status === 'signed-in' ? auth.workspace : null;
  const stored =
    auth.status === 'signed-in' || auth.status === 'elsewhere'
      ? auth.stored
      : null;
  // The open workspace and its lease, for callbacks that outlive a render.
  const active = useRef<{ workspace: Workspace; release: () => void } | null>(
    null,
  );

  useFlushOnHide(workspace);

  /** Saves and closes the open workspace and gives up its lease. */
  const closeActive = async () => {
    const current = active.current;
    active.current = null;
    if (!current) {
      return;
    }
    try {
      await current.workspace.close();
    } finally {
      current.release();
    }
  };

  // Plain function: it only uses the ref, setAuth and services (all stable).
  const handedOver = async () => {
    // Another tab pressed "Use here". Pending edits are saved first.
    const current = active.current;
    active.current = null;
    await current?.workspace.close();
    setAuth((previous) =>
      previous.status === 'signed-in'
        ? { status: 'elsewhere', stored: previous.stored }
        : previous,
    );
    services.toasts
      .getState()
      .notify('Canvas Studio is now open in another tab.', { tone: 'info' });
  };

  /** Opens the account's workspace if no other tab holds it. */
  const activate = async (next: StoredSession, steal = false) => {
    const lease = await services.leases.acquire(next.session.userId, {
      steal,
      onLost: () => {
        void handedOver();
      },
    });
    if (lease.kind === 'busy') {
      setAuth({ status: 'elsewhere', stored: next });
      return;
    }
    const opened = services.openWorkspace(next);
    active.current = { workspace: opened, release: lease.release };
    void opened.store.getState().load();
    setAuth({ status: 'signed-in', stored: next, workspace: opened });
  };

  const restored = useEffectEvent((next: StoredSession | null) => {
    if (next) {
      void activate(next);
    } else {
      setAuth({ status: 'signed-out' });
    }
  });

  useEffect(() => {
    let cancelled = false;
    void services.auth.restore().then((next) => {
      if (!cancelled) {
        restored(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const signOut = async (reason?: string) => {
    if (!stored) {
      return;
    }
    await closeActive();
    await services.auth.signOut();
    setAuth({ status: 'signed-out' });
    navigate('/', { replace: true });
    services.toasts
      .getState()
      .notify(
        reason ??
          'You’re signed out. Your designs stay encrypted on this device.',
        {
          tone: reason ? 'warning' : 'success',
        },
      );
  };

  const deleteAccount = async (
    password: string,
  ): Promise<DeleteAccountResult> => {
    const current = active.current;
    if (auth.status !== 'signed-in' || !current) {
      return {
        ok: false,
        message: 'You’re not signed in.',
        workspaceClosed: false,
      };
    }
    let result: DeleteAccountResult;
    try {
      result = await services.deleteAccount({
        session: auth.stored.session,
        password,
        workspace: current.workspace,
      });
    } catch (error) {
      services.logger.error('account.delete_crashed', { error });
      result = {
        ok: false,
        message: 'Your account wasn’t fully deleted. Sign in and try again.',
        workspaceClosed: true,
      };
    }
    if (!result.ok && !result.workspaceClosed) {
      return result;
    }
    active.current = null;
    current.release();
    if (!result.ok) {
      // Half-finished: the workspace is closed, so sign out and say why.
      await services.auth.signOut().catch(() => undefined);
    }
    setAuth({ status: 'signed-out' });
    navigate('/', { replace: true });
    services.toasts
      .getState()
      .notify(
        result.ok
          ? 'Your account and all its designs were deleted.'
          : result.message,
        { tone: result.ok ? 'success' : 'warning', durationMs: 10_000 },
      );
    return result;
  };

  // Sessions end on time even if the tab stays open.
  const expiresAt = stored ? stored.session.expiresAt : null;
  const onExpired = useEffectEvent(() => {
    void signOut('Your session expired. Sign in again to continue.');
  });
  useEffect(() => {
    if (expiresAt === null) {
      return;
    }
    const timer = setTimeout(
      onExpired,
      Math.min(Math.max(0, expiresAt - services.now()), 2_147_483_647),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [expiresAt, services]);

  return (
    <ServicesContext value={services}>
      <PreferencesEffect services={services} />
      <SessionContext
        value={{
          session: stored ? stored.session : null,
          signOut: () => signOut(),
          deleteAccount,
        }}
      >
        <ErrorBoundary logger={services.logger}>
          <Suspense fallback={<FullScreenLoader label="Loading…" />}>
            <Routes
              route={route}
              auth={auth}
              onAuthenticated={(success, next) => {
                // A reset from a link while signed in replaces the session.
                void closeActive().then(() => activate(success.stored));
                setRecoveryCode(success.recoveryCode);
                navigate(next, { replace: true });
              }}
              onUseHere={() => {
                if (auth.status !== 'elsewhere') {
                  return Promise.resolve();
                }
                return activate(auth.stored, true);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </SessionContext>
      {recoveryCode && (
        <RecoveryCodeDialog
          code={recoveryCode}
          onDone={() => {
            setRecoveryCode(null);
          }}
        />
      )}
      <Toaster store={services.toasts} />
    </ServicesContext>
  );
}
