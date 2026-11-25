import { MOD } from '@/modules/studio/keyboard';
import { Dialog } from '@/shared/ui/Dialog';
import { Kbd } from '@/shared/ui/feedback';

const GROUPS: readonly { title: string; items: readonly [string, string][] }[] =
  [
    {
      title: 'Essentials',
      items: [
        [`${MOD}K`, 'Command palette'],
        [`${MOD}Z / ${MOD}⇧Z`, 'Undo / redo'],
        [`${MOD}S`, 'Save now'],
        [`${MOD}E`, 'Export'],
        ['?', 'This list'],
      ],
    },
    {
      title: 'Selection',
      items: [
        ['Click / Shift-click', 'Select / add to selection'],
        ['Drag on empty canvas', 'Box select'],
        [`${MOD}A`, 'Select all'],
        ['Esc', 'Deselect'],
        ['Enter / double-click', 'Edit text'],
      ],
    },
    {
      title: 'Editing',
      items: [
        ['Arrow keys', 'Nudge 1 px (Shift: 10 px)'],
        [`${MOD}D`, 'Duplicate'],
        [`${MOD}C / ${MOD}V`, 'Copy / paste'],
        ['Delete', 'Delete (locked layers are kept)'],
        ['[ / ]', 'Send backward / bring forward'],
        ['Shift + [ / ]', 'Send to back / bring to front'],
      ],
    },
    {
      title: 'Canvas',
      items: [
        ['Shift while resizing', 'Keep proportions (images: free resize)'],
        ['Shift while rotating', 'Snap to 15°'],
        ['Alt while dragging', 'Move without snapping'],
        [`${MOD}+ / ${MOD}−`, 'Zoom in / out'],
        [`${MOD} + scroll`, 'Zoom'],
        ['Shift+1 / Shift+0', 'Fit / 100%'],
        ['T S I U B', 'Text, Shapes, Icons, Uploads, Backdrop panels'],
      ],
    },
  ];

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" size="lg">
      <div className="shortcuts">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="settings-section__title">{group.title}</h3>
            <dl className="shortcuts__list">
              {group.items.map(([keys, action]) => (
                <div key={action} className="shortcuts__row">
                  <dt>
                    <Kbd>{keys}</Kbd>
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
