import type { DesignElement } from '@/modules/document/domain/schema';
import { iconById } from '@/modules/library/iconCatalog';
import { Icon, IconGlyph } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';

const KIND_ICONS: Record<Exclude<DesignElement['type'], 'icon'>, UiIconName> = {
  text: 'text',
  shape: 'shapes',
  line: 'minus',
  image: 'image',
};

/** Small type badge for a layer; icon layers show their own glyph. */
export function LayerKindIcon({ element }: { element: DesignElement }) {
  const node =
    element.type === 'icon' ? iconById(element.icon)?.node : undefined;
  return (
    <span
      className={`layer-kind layer-kind--${element.type}`}
      aria-hidden="true"
    >
      {node ? (
        <IconGlyph node={node} size={15} />
      ) : (
        <Icon
          name={element.type === 'icon' ? 'star' : KIND_ICONS[element.type]}
          size={15}
        />
      )}
    </span>
  );
}
