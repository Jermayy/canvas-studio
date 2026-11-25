import { UI_ICONS, type UiIconName } from '@/shared/ui/uiIcons';
import { createElement } from 'react';
import type { IconNode } from 'lucide';

export function IconGlyph({
  node,
  size = 18,
  strokeWidth = 2,
  className,
}: {
  node: IconNode;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {node.map(([tag, attributes], index) =>
        createElement(tag, { ...attributes, key: index }),
      )}
    </svg>
  );
}

export function Icon({
  name,
  size,
  className,
}: {
  name: UiIconName;
  size?: number;
  className?: string;
}) {
  return <IconGlyph node={UI_ICONS[name]} size={size} className={className} />;
}
