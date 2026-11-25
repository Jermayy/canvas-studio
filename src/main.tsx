import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/pages.css';
import '@/styles/studio.css';
import { App } from '@/app/App';
import { composeBrowserServices } from '@/app/composeServices';
import { parseConfig } from '@/app/config';
import {
  configureTextMeasure,
  cssFont,
} from '@/modules/document/domain/textLayout';
import { createLogger } from '@/shared/logger';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const version = import.meta.env.VITE_APP_VERSION;
const logger = createLogger({
  service: 'canvas-studio-web',
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  baseContext: { env: import.meta.env.MODE, version },
});

window.addEventListener('error', (event) => {
  logger.error('window.error', { message: event.message });
});
window.addEventListener('unhandledrejection', (event) => {
  logger.error('window.unhandled_rejection', { reason: String(event.reason) });
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}
const root = createRoot(rootElement);

// Real glyph metrics for text wrapping (the domain falls back to an estimate).
const measureContext = document.createElement('canvas').getContext('2d');
if (measureContext) {
  configureTextMeasure((text, font) => {
    measureContext.font = cssFont(font);
    return (
      measureContext.measureText(text).width + text.length * font.letterSpacing
    );
  });
}

async function start(): Promise<void> {
  // Fails fast on a half-configured or unsafe build (playbook 02).
  const config = parseConfig(import.meta.env);
  const services = await composeBrowserServices({ config, logger, version });
  root.render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  logger.error('app.startup_failed', { error });
  root.render(
    <div className="error-screen" role="alert">
      <h1>Canvas Studio can’t start</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </div>,
  );
});
