import { fontById } from '@/modules/document/domain/catalog';
import type { TextElement } from '@/modules/document/domain/schema';
import { useEffect, useRef, useState } from 'react';

/**
 * In-place text editing: a textarea styled like the text it replaces.
 * ⌘/Ctrl+Enter or clicking away commits; Escape cancels.
 */
export function TextEditor({
  element,
  zoom,
  onFinish,
}: {
  element: TextElement;
  zoom: number;
  onFinish: (text: string | null) => void;
}) {
  const [value, setValue] = useState(element.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const lines = Math.max(1, value.split('\n').length);
  return (
    <textarea
      ref={ref}
      data-text-editor="true"
      className="text-editor"
      aria-label="Edit text"
      value={value}
      spellCheck
      style={{
        left: element.x * zoom,
        top: element.y * zoom,
        width: element.width * zoom,
        minHeight:
          Math.max(
            element.height,
            lines * element.fontSize * element.lineHeight,
          ) * zoom,
        transform: element.rotation
          ? `rotate(${element.rotation}deg)`
          : undefined,
        fontFamily: fontById(element.fontFamily).stack,
        fontSize: element.fontSize * zoom,
        fontWeight: element.fontWeight,
        fontStyle: element.italic ? 'italic' : 'normal',
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing * zoom,
        textAlign: element.align,
        textTransform: element.uppercase ? 'uppercase' : 'none',
        color: element.color,
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onBlur={() => {
        onFinish(value);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onFinish(null);
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onFinish(value);
        }
      }}
    />
  );
}
