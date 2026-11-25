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
import { lazy, Suspense, useEffect, useEffectEvent, useState } from 'react';
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
  | { status: 'signed-in'; stored: StoredSession; workspace: Workspace };

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

/** Runs `onEnd` once on mount (ending a session before a reset link). */
function EndSessionForReset({ onEnd }: { onEnd: () => Promise<void> }) {
  const end = useEffectEvent(onEnd);
  useEffect(() => {
    void end();
  }, []);
  return <FullScreenLoader label="Opening your reset link…" />;
}

function Routes({
  route,
  auth,
  onAuthenticated,
  onResetLinkWhileSignedIn,
}: {
  route: Route;
  auth: AuthState;
  onAuthenticated: (success: AuthSuccess, next: string) => void;
  onResetLinkWhileSignedIn: () => Promise<void>;
}) {
  const location = useLocation();
  switch (route.name) {
    case 'landing':
      return <LandingPage signedIn={auth.status === 'signed-in'} />;
    case 'sign-in':
    case 'sign-up':
      if (auth.status === 'signed-in') {
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
      // A reset link (with a code) wins over the current session: whoever
      // opened it proved access to the account's email.
      if (auth.status === 'signed-in' && route.code) {
        return <EndSessionForReset onEnd={onResetLinkWhileSignedIn} />;
      }
      if (auth.status === 'signed-in') {
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

  useFlushOnHide(workspace);

  const open = (stored: StoredSession) => {
    const opened = services.openWorkspace(stored);
    void opened.store.getState().load();
    setAuth({ status: 'signed-in', stored, workspace: opened });
  };

  useEffect(() => {
    let cancelled = false;
    void services.auth.restore().then((stored) => {
      if (cancelled) {
        return;
      }
      if (stored) {
        const opened = services.openWorkspace(stored);
        void opened.store.getState().load();
        setAuth({ status: 'signed-in', stored, workspace: opened });
      } else {
        setAuth({ status: 'signed-out' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const signOut = async (reason?: string) => {
    if (auth.status !== 'signed-in') {
      return;
    }
    await auth.workspace.close();
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
    if (auth.status !== 'signed-in') {
      return {
        ok: false,
        message: 'You’re not signed in.',
        workspaceClosed: false,
      };
    }
    const result = await services.deleteAccount({
      session: auth.stored.session,
      password,
      workspace: auth.workspace,
    });
    if (!result.ok && !result.workspaceClosed) {
      return result;
    }
    if (!result.ok) {
      // Half-finished: the workspace is closed, so sign out and say why.
      await services.auth.signOut();
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
  const expiresAt =
    auth.status === 'signed-in' ? auth.stored.session.expiresAt : null;
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
          session: auth.status === 'signed-in' ? auth.stored.session : null,
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
                open(success.stored);
                setRecoveryCode(success.recoveryCode);
                navigate(next, { replace: true });
              }}
              onResetLinkWhileSignedIn={async () => {
                if (auth.status !== 'signed-in') {
                  return;
                }
                await auth.workspace.close();
                await services.auth.endLocalSession();
                setAuth({ status: 'signed-out' });
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
