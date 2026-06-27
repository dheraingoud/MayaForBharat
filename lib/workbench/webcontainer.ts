// Source: bolt.diy/app/lib/webcontainer/index.ts
// Ported: Removed import.meta.hot (Vite HMR) — Next.js handles HMR differently
// Ported: typeof window === 'undefined' → typeof window check
// Ported: ~/utils → @/lib/workbench/utils

import { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '@/lib/workbench/utils/constants';
import { cleanStackTrace } from '@/lib/workbench/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = {
  loaded: false,
};

// Singleton promise — resolved once per browser session
let _webcontainerPromise: Promise<WebContainer> | null = null;

/**
 * Get the WebContainer instance. Returns a promise that resolves to the booted container.
 * Safe to call multiple times — will return the same instance.
 *
 * IMPORTANT: Only call this from client-side code ("use client" components).
 * WebContainer cannot run on the server (Node.js).
 */
export function getWebContainer(): Promise<WebContainer> {
  if (typeof window === 'undefined') {
    // SSR: return a never-resolving promise (same as bolt.diy)
    return new Promise(() => {});
  }

  if (!_webcontainerPromise) {
    _webcontainerPromise = bootWebContainer();
  }

  return _webcontainerPromise;
}

async function bootWebContainer(): Promise<WebContainer> {
  const container = await WebContainer.boot({
    coep: 'credentialless',
    workdirName: WORK_DIR_NAME,
    forwardPreviewErrors: true,
  });

  webcontainerContext.loaded = true;

  // Inject the inspector script into all previews
  // This script catches runtime errors in preview iframes and forwards them back
  try {
    const response = await fetch('/inspector-script.js');
    const inspectorScript = await response.text();
    await container.setPreviewScript(inspectorScript);
  } catch (error) {
    console.warn('[WebContainer] Failed to load inspector script:', error);
  }

  // Listen for preview errors and forward to workbench store
  container.on('preview-message', (message) => {
    console.log('[WebContainer] Preview message:', message);

    if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
      const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
      const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';

      // Emit custom event so workbench store can pick it up
      // (avoids circular dependency with workbench store)
      window.dispatchEvent(
        new CustomEvent('webcontainer:preview-error', {
          detail: {
            type: 'preview',
            title,
            description: 'message' in message ? message.message : 'Unknown error',
            content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
            source: 'preview' as const,
          },
        }),
      );
    }
  });

  return container;
}

// Legacy export for compatibility with bolt.diy patterns that expect a module-level promise
export const webcontainer: Promise<WebContainer> = typeof window !== 'undefined'
  ? getWebContainer()
  : new Promise(() => {});
