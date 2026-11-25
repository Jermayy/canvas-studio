import { navigate } from '@/app/router';
import { Spinner } from '@/shared/ui/feedback';
import { useEffect, type AnchorHTMLAttributes, type ReactNode } from 'react';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <svg className="brand__logo" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="brand__tile" />
        <path d="M9 21.5 15 9l3.2 6.4" className="brand__stroke" />
        <circle cx="21.5" cy="20.5" r="4" className="brand__dot" />
      </svg>
      {!compact && (
        <span className="brand__name">
          Canvas <strong>Studio</strong>
        </span>
      )}
    </span>
  );
}

/** In-app link: real <a href> for accessibility and new tabs, pushState on click. */
export function Link({
  to,
  children,
  ...rest
}: { to: string; children: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href'
>) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(event) => {
        rest.onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to]);
  return null;
}

export function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="full-screen-loader">
      <BrandMark compact />
      <Spinner label={label} size={22} />
      <p aria-hidden="true">{label}</p>
    </div>
  );
}
