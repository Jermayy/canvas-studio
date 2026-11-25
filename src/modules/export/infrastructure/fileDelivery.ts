/**
 * Getting a finished file to the user: download, the native share sheet,
 * the clipboard, or an email draft. The browser objects are injected so
 * every branch (supported, unsupported, cancelled) is unit-testable.
 */

export type ShareOutcome = 'shared' | 'cancelled';

export interface FileDelivery {
  download: (blob: Blob, fileName: string) => void;
  canShareFiles: (file: File) => boolean;
  share: (input: {
    file: File;
    title: string;
    text: string;
  }) => Promise<ShareOutcome>;
  canCopyImage: () => boolean;
  copyImage: (png: Blob) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  openEmailDraft: (mailtoUrl: string) => void;
}

export interface DeliveryEnvironment {
  navigator: Pick<Navigator, 'share' | 'canShare' | 'clipboard'>;
  document: Pick<Document, 'createElement' | 'body'>;
  openUrl: (url: string) => void;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  hasClipboardItem: boolean;
  later: (run: () => void, ms: number) => void;
}

export function browserDeliveryEnvironment(): DeliveryEnvironment {
  return {
    navigator: window.navigator,
    document: window.document,
    openUrl: (url) => {
      window.location.href = url;
    },
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => {
      URL.revokeObjectURL(url);
    },
    hasClipboardItem: typeof ClipboardItem !== 'undefined',
    later: (run, ms) => {
      setTimeout(run, ms);
    },
  };
}

export function createFileDelivery(env: DeliveryEnvironment): FileDelivery {
  return {
    download: (blob, fileName) => {
      const url = env.createObjectUrl(blob);
      const link = env.document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      env.document.body.append(link);
      link.click();
      link.remove();
      // Revoking straight away can cancel the download in some browsers.
      env.later(() => {
        env.revokeObjectUrl(url);
      }, 30_000);
    },

    canShareFiles: (file) =>
      typeof env.navigator.share === 'function' &&
      typeof env.navigator.canShare === 'function' &&
      env.navigator.canShare({ files: [file] }),

    share: async ({ file, title, text }) => {
      try {
        await env.navigator.share({ files: [file], title, text });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'cancelled';
        }
        throw error;
      }
    },

    canCopyImage: () =>
      env.hasClipboardItem &&
      typeof env.navigator.clipboard.write === 'function',

    copyImage: async (png) => {
      await env.navigator.clipboard.write([
        new ClipboardItem({ 'image/png': png }),
      ]);
    },

    copyText: async (text) => {
      await env.navigator.clipboard.writeText(text);
    },

    openEmailDraft: (mailtoUrl) => {
      if (!mailtoUrl.startsWith('mailto:')) {
        throw new Error('Only mailto: links can be opened as email drafts');
      }
      env.openUrl(mailtoUrl);
    },
  };
}
