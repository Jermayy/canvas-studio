import type { InsertTab } from '@/modules/studio/studioContext';
import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';

const TOOLS: readonly {
  tab: InsertTab;
  label: string;
  icon: UiIconName;
  key: string;
}[] = [
  { tab: 'text', label: 'Text', icon: 'text', key: 'T' },
  { tab: 'shapes', label: 'Shapes', icon: 'shapes', key: 'S' },
  { tab: 'icons', label: 'Icons', icon: 'star', key: 'I' },
  { tab: 'uploads', label: 'Uploads', icon: 'upload', key: 'U' },
  { tab: 'background', label: 'Backdrop', icon: 'background', key: 'B' },
];

export function ToolRail({
  active,
  onChange,
}: {
  active: InsertTab | null;
  onChange: (tab: InsertTab | null) => void;
}) {
  return (
    <nav className="tool-rail" aria-label="Insert">
      {TOOLS.map((tool) => (
        <button
          key={tool.tab}
          type="button"
          className={`tool-rail__button${active === tool.tab ? ' tool-rail__button--active' : ''}`}
          aria-pressed={active === tool.tab}
          aria-controls={active === tool.tab ? 'insert-panel' : undefined}
          data-tooltip={`${tool.label} (${tool.key})`}
          onClick={() => {
            onChange(active === tool.tab ? null : tool.tab);
          }}
        >
          <Icon name={tool.icon} size={20} />
          <span>{tool.label}</span>
        </button>
      ))}
    </nav>
  );
}
