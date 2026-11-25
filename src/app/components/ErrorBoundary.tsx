import type { Logger } from '@/shared/logger';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  logger: Logger;
  children: ReactNode;
  /** Smaller inline fallback for a single panel instead of the whole page. */
  inline?: boolean;
}

interface State {
  error: Error | null;
}

/** Keeps one failing view from blanking the app; logs the failure. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.logger.error('ui.render_failed', {
      error,
      componentStack: info.componentStack ?? undefined,
    });
  }

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div
        className={this.props.inline ? 'error-panel' : 'error-screen'}
        role="alert"
      >
        <h1>Something went wrong</h1>
        <p>
          {this.props.inline
            ? 'This panel failed to load. Your design is safe.'
            : 'The page hit an unexpected error. Your saved work is safe on this device.'}
        </p>
        <button
          type="button"
          className="btn btn--primary btn--md"
          onClick={() => {
            this.setState({ error: null });
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
