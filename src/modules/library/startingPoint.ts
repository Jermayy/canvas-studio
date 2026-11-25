import type { DesignDocument } from '@/modules/document/domain/schema';
import type { StartingPoint } from '@/modules/library/components/TemplatePicker';
import {
  blankDocument,
  documentFromTemplate,
} from '@/modules/library/templates';

export function startingPointKey(start: StartingPoint): string {
  return start.kind === 'template'
    ? `template-${start.template.id}`
    : `blank-${start.formatId}`;
}

export function createFromStartingPoint(
  start: StartingPoint,
  options: { createId: () => string; now: number },
): DesignDocument {
  const now = new Date(options.now).toISOString();
  return start.kind === 'template'
    ? documentFromTemplate(start.template, {
        id: options.createId(),
        now,
        createId: options.createId,
      })
    : blankDocument({ id: options.createId(), now, formatId: start.formatId });
}
