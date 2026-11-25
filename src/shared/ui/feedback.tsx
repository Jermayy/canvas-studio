import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';
import type { ReactNode } from 'react';

export function Spinner({
  label,
  size = 20,
}: {
  label: string;
  size?: number;
}) {
  return (
    <span className="spinner" role="status">
      <Icon name="spinner" className="spin" size={size} />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: UiIconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} size={28} />
      </span>
      <h3 className="empty-state__title">{title}</h3>
      {children && <p className="empty-state__text">{children}</p>}
      {action}
    </div>
  );
}

export function Banner({
  tone = 'info',
  icon,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'error';
  icon?: UiIconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`banner banner--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon name={icon ?? (tone === 'info' ? 'info' : 'warning')} size={16} />
      <span className="banner__text">{children}</span>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
