import { CATEGORY_IDS, FONT_IDS } from '@/modules/document/domain/catalog';
import { z } from 'zod';

/**
 * The design document: the single source of truth for a design. Every
 * document read from storage and every element produced by an operation is
 * parsed with these schemas, so bad data can't reach the renderer or an
 * export.
 */

export const SCHEMA_VERSION = 2;
export const MAX_ELEMENTS = 500;
export const MAX_TEXT_LENGTH = 5000;

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'must be a #rrggbb colour');
const coordinate = z.number().min(-20_000).max(20_000);
const length = z.number().min(1).max(20_000);
const unit = z.number().min(0).max(1);

export const fillSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('solid'), color }),
  z.object({
    kind: z.literal('linear'),
    from: color,
    to: color,
    angle: z.number().min(0).max(360),
  }),
]);

export const strokeSchema = z.object({
  color,
  width: z.number().min(0).max(200),
  dash: z.enum(['solid', 'dashed', 'dotted']),
});

export const shadowSchema = z.object({
  color,
  opacity: unit,
  blur: z.number().min(0).max(200),
  offsetX: z.number().min(-500).max(500),
  offsetY: z.number().min(-500).max(500),
});

const baseElement = {
  id: z.string().min(1).max(64),
  name: z.string().max(80),
  x: coordinate,
  y: coordinate,
  width: length,
  height: length,
  rotation: z.number().min(-360).max(360),
  opacity: unit,
  locked: z.boolean(),
  hidden: z.boolean(),
};

export const SHAPE_KINDS = [
  'rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'burst',
  'heart',
] as const;

export const LINE_CAPS = ['none', 'arrow', 'circle'] as const;

export const shapeElementSchema = z.object({
  ...baseElement,
  type: z.literal('shape'),
  shape: z.enum(SHAPE_KINDS),
  fill: fillSchema,
  stroke: strokeSchema.nullable(),
  cornerRadius: z.number().min(0).max(1000),
  shadow: shadowSchema.nullable(),
});

export const lineElementSchema = z.object({
  ...baseElement,
  type: z.literal('line'),
  stroke: strokeSchema,
  startCap: z.enum(LINE_CAPS),
  endCap: z.enum(LINE_CAPS),
});

export const textElementSchema = z.object({
  ...baseElement,
  type: z.literal('text'),
  text: z.string().max(MAX_TEXT_LENGTH),
  fontFamily: z.enum(FONT_IDS),
  fontSize: z.number().min(4).max(1000),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100),
  italic: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
  color,
  lineHeight: z.number().min(0.5).max(4),
  letterSpacing: z.number().min(-20).max(100),
  uppercase: z.boolean(),
  shadow: shadowSchema.nullable(),
});

export const imageElementSchema = z.object({
  ...baseElement,
  type: z.literal('image'),
  assetId: z.string().min(1).max(64),
  fit: z.enum(['cover', 'contain']),
  cornerRadius: z.number().min(0).max(1000),
  stroke: strokeSchema.nullable(),
});

export const iconElementSchema = z.object({
  ...baseElement,
  type: z.literal('icon'),
  icon: z.string().min(1).max(64),
  color,
  strokeWidth: z.number().min(0.5).max(4),
});

export const elementSchema = z.discriminatedUnion('type', [
  shapeElementSchema,
  lineElementSchema,
  textElementSchema,
  imageElementSchema,
  iconElementSchema,
]);

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORY_IDS),
  format: z.object({
    id: z.string().min(1).max(32),
    width: z.number().int().min(16).max(8000),
    height: z.number().int().min(16).max(8000),
  }),
  background: fillSchema,
  elements: z.array(elementSchema).max(MAX_ELEMENTS),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Fill = z.infer<typeof fillSchema>;
export type Stroke = z.infer<typeof strokeSchema>;
export type Shadow = z.infer<typeof shadowSchema>;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
export type LineCap = (typeof LINE_CAPS)[number];
export type ShapeElement = z.infer<typeof shapeElementSchema>;
export type LineElement = z.infer<typeof lineElementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;
export type IconElement = z.infer<typeof iconElementSchema>;
export type DesignElement = z.infer<typeof elementSchema>;
export type ElementType = DesignElement['type'];
export type DesignDocument = z.infer<typeof designDocumentSchema>;

type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type ValueOfUnion<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

/**
 * A change to one or more elements: any element field except identity.
 * The result is re-validated per element kind, which also strips fields
 * that don't belong (e.g. `fontSize` on a shape).
 */
export type ElementPatch = {
  [K in Exclude<KeysOfUnion<DesignElement>, 'id' | 'type'>]?: ValueOfUnion<
    DesignElement,
    K
  >;
};

export class DocumentValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
}

export function parseDocument(input: unknown): DesignDocument {
  const result = designDocumentSchema.safeParse(input);
  if (!result.success) {
    throw new DocumentValidationError(
      'Design document is invalid',
      describeIssues(result.error),
    );
  }
  return result.data;
}

export function parseElement(input: unknown): DesignElement {
  const result = elementSchema.safeParse(input);
  if (!result.success) {
    throw new DocumentValidationError(
      'Element is invalid',
      describeIssues(result.error),
    );
  }
  return result.data;
}
