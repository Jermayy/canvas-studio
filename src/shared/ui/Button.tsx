import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: UiIconName;
  /** Shows a spinner, announces busy and blocks double submission. */
  busy?: boolean;
  busyLabel?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  busy = false,
  busyLabel,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (
        <Icon name="spinner" className="spin" size={16} />
      ) : (
        icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />
      )}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  icon: UiIconName;
  /** Accessible name, also shown as the tooltip. */
  label: string;
  shortcut?: string;
  pressed?: boolean;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary';
}

export function IconButton({
  icon,
  label,
  shortcut,
  pressed,
  size = 'md',
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`icon-btn icon-btn--${size} icon-btn--${variant}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={shortcut ? `${label} (${shortcut})` : label}
    >
      <Icon name={icon} size={size === 'sm' ? 15 : 18} />
    </button>
  );
}
