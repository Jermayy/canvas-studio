import {
  describeElement,
  stackPositionLabel,
} from '@/modules/document/domain/layers';
import { iconLabel } from '@/modules/library/iconCatalog';
import { useStudio } from '@/modules/studio/studioContext';

/** Live readout of the selection, for precision and for screen readers. */
export function StatusBar() {
  const document = useStudio((state) => state.history.present);
  const selection = useStudio((state) => state.selection);
  const zoom = useStudio((state) => state.zoom);
  const gesturing = useStudio((state) => state.gestureStart !== null);
  const index = document.elements.findIndex(
    (element) => element.id === selection[0],
  );
  const element = document.elements[index];

  let summary: string;
  let hint: string;
  if (selection.length > 1) {
    summary = `${selection.length} layers selected`;
    hint = 'Drag to move together · Align and distribute in the Design panel';
  } else if (element) {
    const description = describeElement(element, iconLabel);
    summary = `${description.title} · ${description.kind} · ${Math.round(element.width)}×${Math.round(element.height)} at ${Math.round(element.x)}, ${Math.round(element.y)}${element.rotation ? ` · ${Math.round(element.rotation)}°` : ''} · ${stackPositionLabel(index, document.elements.length)}`;
    hint = element.locked
      ? 'Locked: unlock it in Layers to move or resize'
      : element.type === 'text'
        ? 'Double-click or press Enter to edit text · Shift-drag a corner to resize'
        : 'Shift keeps proportions · Alt drags without snapping';
  } else {
    summary = `${document.elements.length} layer${document.elements.length === 1 ? '' : 's'}`;
    hint =
      'Click to select · Drag on empty space to box-select · ⌘K for commands';
  }

  return (
    <footer className="status-bar">
      <span
        className="status-bar__summary"
        aria-live={gesturing ? 'off' : 'polite'}
      >
        {summary}
      </span>
      <span className="status-bar__hint">{hint}</span>
      <span className="status-bar__meta">
        {document.format.width} × {document.format.height} px ·{' '}
        {Math.round(zoom * 100)}%
      </span>
    </footer>
  );
}
