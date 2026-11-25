import { fontById } from '@/modules/document/domain/catalog';
import type { TextElement } from '@/modules/document/domain/schema';

/**
 * Word wrapping for text boxes. SVG has no automatic wrapping, so the same
 * layout feeds the canvas, thumbnails and every export.
 *
 * Measuring needs a browser canvas; `main.tsx` installs one with
 * `configureTextMeasure`. Until then (and in tests) an average-glyph-width
 * estimate keeps the layout deterministic.
 */

export interface FontSpec {
  stack: string;
  size: number;
  weight: number;
  italic: boolean;
  letterSpacing: number;
}

export type MeasureText = (text: string, font: FontSpec) => number;

const AVERAGE_GLYPH_WIDTH = 0.56;

export const estimateTextWidth: MeasureText = (text, font) =>
  text.length * (font.size * AVERAGE_GLYPH_WIDTH + font.letterSpacing);

let measure: MeasureText = estimateTextWidth;

export function configureTextMeasure(next: MeasureText): void {
  measure = next;
}

export function fontSpec(element: TextElement): FontSpec {
  return {
    stack: fontById(element.fontFamily).stack,
    size: element.fontSize,
    weight: element.fontWeight,
    italic: element.italic,
    letterSpacing: element.letterSpacing,
  };
}

export function cssFont(font: FontSpec): string {
  return `${font.italic ? 'italic ' : ''}${font.weight} ${font.size}px ${font.stack}`;
}

function breakLongWord(
  word: string,
  maxWidth: number,
  font: FontSpec,
): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const character of word) {
    const candidate = current + character;
    if (current.length > 0 && measure(candidate, font) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  pieces.push(current);
  return pieces;
}

function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  font: FontSpec,
): string[] {
  const words = paragraph.split(/ +/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (measure(candidate, font) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
    }
    if (measure(word, font) > maxWidth) {
      const pieces = breakLongWord(word, maxWidth, font);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? '';
    } else {
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export interface TextLayout {
  lines: string[];
  lineHeight: number;
  height: number;
}

export function layoutText(element: TextElement): TextLayout {
  const font = fontSpec(element);
  const source = element.uppercase ? element.text.toUpperCase() : element.text;
  const lines = source
    .split('\n')
    .flatMap((paragraph) => wrapParagraph(paragraph, element.width, font));
  const lineHeight = element.fontSize * element.lineHeight;
  return {
    lines,
    lineHeight,
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
}

/** Text boxes grow and shrink vertically with their content. */
export function withAutoHeight(element: TextElement): TextElement {
  const height = Math.ceil(layoutText(element).height);
  return height === element.height ? element : { ...element, height };
}
