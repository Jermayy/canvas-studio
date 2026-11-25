import { BrandMark, Link } from '@/app/components/AppChrome';
import { useSession, useWorkspace } from '@/app/services';
import { SecurityDialog } from '@/modules/auth/components/SecurityDialog';
import { SettingsDialog } from '@/modules/preferences/SettingsDialog';
import { SyncIndicator } from '@/modules/sync/SyncIndicator';
import { Menu } from '@/shared/ui/Menu';
import { useState, type ReactNode } from 'react';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`
      : name.slice(0, 2)
  ).toUpperCase();
}

export function AppHeader({ children }: { children?: ReactNode }) {
  const { session, signOut } = useSession();
  const { sync } = useWorkspace();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  return (
    <header className="app-header">
      <Link to="/projects" aria-label="Projects">
        <BrandMark />
      </Link>
      <div className="app-header__center">{children}</div>
      <div className="app-header__end">
        {sync && <SyncIndicator engine={sync} />}
        {session && (
          <Menu
            label={`Account: ${session.displayName}`}
            triggerClassName="avatar-button"
            trigger={
              <>
                <span className="avatar" aria-hidden="true">
                  {initials(session.displayName || session.email)}
                </span>
                <span className="avatar-button__text">
                  <span className="avatar-button__name">
                    {session.displayName}
                  </span>
                  <span className="avatar-button__email">{session.email}</span>
                </span>
              </>
            }
            items={[
              {
                label: 'Appearance & editor',
                icon: 'settings',
                onSelect: () => {
                  setSettingsOpen(true);
                },
              },
              {
                label: 'Account & security',
                icon: 'shield',
                onSelect: () => {
                  setSecurityOpen(true);
                },
              },
              {
                label: 'Sign out',
                icon: 'sign-out',
                onSelect: () => {
                  void signOut();
                },
              },
            ]}
          />
        )}
      </div>
      <SecurityDialog
        open={securityOpen}
        onClose={() => {
          setSecurityOpen(false);
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
        }}
      />
    </header>
  );
}
