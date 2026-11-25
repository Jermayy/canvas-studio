import { usePreferences } from '@/app/services';
import type { Box } from '@/modules/document/domain/geometry';
import { findPreset, PRESET_MIME } from '@/modules/library/presets';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { SelectionOverlay } from '@/modules/studio/components/SelectionOverlay';
import { TextEditor } from '@/modules/studio/components/TextEditor';
import { useCanvasGestures } from '@/modules/studio/hooks/useCanvasGestures';
import { useImageUpload } from '@/modules/studio/hooks/useImageUpload';
import { useStudio, useStudioContext } from '@/modules/studio/studioContext';
import { useAssetUrls } from '@/modules/workspace/hooks/useAssetUrls';
import { Spinner } from '@/shared/ui/feedback';
import { useEffect, useRef, useState } from 'react';

const FIT_PADDING = 64;

/** The scrollable canvas area: artboard, overlay, in-place text editor. */
export function CanvasViewport() {
  const { store } = useStudioContext();
  const { preferences } = usePreferences();
  const document = useStudio((state) => state.history.present);
  const zoom = useStudio((state) => state.zoom);
  const fitToScreen = useStudio((state) => state.fitToScreen);
  const editingTextId = useStudio((state) => state.editingTextId);
  const assetUrls = useAssetUrls(document);
  const viewportRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const { upload, pending } = useImageUpload();
  const gestures = useCanvasGestures({
    store,
    artboardRef,
    snapping: preferences.snapping,
    onMarquee: setMarquee,
  });
  const { width, height } = document.format;

  // Keep "fit to screen" in step with the viewport size.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !fitToScreen) {
      return;
    }
    const fit = () => {
      const available = {
        width: viewport.clientWidth - FIT_PADDING * 2,
        height: viewport.clientHeight - FIT_PADDING * 2,
      };
      if (available.width > 0 && available.height > 0) {
        store
          .getState()
          .setFitZoom(
            Math.min(available.width / width, available.height / height),
          );
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [fitToScreen, width, height, store]);

  // Pinch / Ctrl+wheel zoom. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        store.getState().zoomBy(Math.exp(-event.deltaY * 0.01));
      }
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [store]);

  const editing = document.elements.find(
    (element) => element.id === editingTextId && element.type === 'text',
  );

  return (
    <div
      ref={viewportRef}
      className={`viewport viewport--${preferences.canvasBackdrop}${dropActive ? ' viewport--drop' : ''}`}
      role="application"
      aria-label={`Canvas: ${document.name}, ${width} by ${height} pixels. Use the Layers panel or Tab to reach elements; arrow keys move the selection.`}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerCancel}
      onPointerLeave={gestures.onPointerLeave}
      onDoubleClick={gestures.onDoubleClick}
      onDragOver={(event) => {
        const types = [...event.dataTransfer.types];
        if (types.includes(PRESET_MIME) || types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDropActive(true);
        }
      }}
      onDragLeave={() => {
        setDropActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDropActive(false);
        const at = gestures.toDocument(event);
        const preset = findPreset(event.dataTransfer.getData(PRESET_MIME));
        if (preset) {
          store.getState().insert(preset.build, at);
          return;
        }
        const files = [...event.dataTransfer.files];
        if (files.length > 0) {
          void upload(files, { place: true, at });
        }
      }}
    >
      <div
        className="viewport__stage"
        style={{
          width: width * zoom + FIT_PADDING * 2,
          height: height * zoom + FIT_PADDING * 2,
        }}
      >
        <div
          ref={artboardRef}
          className="artboard"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <DesignSvg
            document={document}
            assetUrls={assetUrls}
            width={width * zoom}
            height={height * zoom}
            interactive
            skipIds={editing ? new Set([editing.id]) : undefined}
            className="artboard__design"
          />
          <SelectionOverlay marquee={marquee} />
          {editing?.type === 'text' && (
            <TextEditor
              key={editing.id}
              element={editing}
              zoom={zoom}
              onFinish={(text) => {
                store.getState().finishTextEdit(text);
              }}
            />
          )}
        </div>
      </div>
      {pending > 0 && (
        <div className="viewport__busy">
          <Spinner label="Processing images" size={16} />
          <span>
            Processing {pending} image{pending === 1 ? '' : 's'}…
          </span>
        </div>
      )}
    </div>
  );
}
