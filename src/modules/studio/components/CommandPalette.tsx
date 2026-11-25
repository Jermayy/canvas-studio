import { buildCommands, filterCommands } from '@/modules/studio/commands';
import { useStudioContext } from '@/modules/studio/studioContext';
import { Dialog } from '@/shared/ui/Dialog';
import { Icon } from '@/shared/ui/Icon';
import { useId, useState } from 'react';

/** ⌘K: run any studio action by name. */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { store, openDialog, openInsertTab } = useStudioContext();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const commands = open
    ? filterCommands(buildCommands(store, { openDialog, openInsertTab }), term)
    : [];
  const enabled = commands.filter((command) => command.enabled);
  const current = enabled[Math.min(active, enabled.length - 1)];

  const close = () => {
    setTerm('');
    setActive(0);
    onClose();
  };

  const run = (index: number) => {
    const command = enabled[index];
    if (command) {
      close();
      command.run();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Command palette"
      size="md"
      className="command-dialog"
    >
      <div className="command-palette">
        <div className="command-palette__search">
          <Icon name="search" size={16} />
          <input
            className="command-palette__input"
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              current ? `${listId}-${current.id}` : undefined
            }
            aria-label="Search commands"
            placeholder="Type a command, e.g. “export” or “circle”"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(enabled.length - 1, index + 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                run(Math.min(active, enabled.length - 1));
              }
            }}
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          className="command-palette__list"
          aria-label="Commands"
        >
          {enabled.length === 0 && (
            <li className="command-palette__empty">No matching commands</li>
          )}
          {enabled.map((command, index) => (
            <li
              key={command.id}
              id={`${listId}-${command.id}`}
              role="option"
              aria-selected={command === current}
              className={`command-palette__item${command === current ? ' command-palette__item--active' : ''}`}
              onPointerEnter={() => {
                setActive(index);
              }}
              onClick={() => {
                run(index);
              }}
            >
              <span className="command-palette__group">{command.group}</span>
              <span className="command-palette__label">{command.label}</span>
              {command.shortcut && (
                <kbd className="kbd">{command.shortcut}</kbd>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
