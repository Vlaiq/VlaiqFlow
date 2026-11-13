export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let installPrompt: InstallPromptEvent | null = null;
let initialized = false;
export const getInstallPrompt = () => installPrompt;
export const clearInstallPrompt = () => { installPrompt = null; };

/** Register once; no update activation/reload while a journey or activity is running. */
export function registerPwa() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    window.dispatchEvent(new Event('vlaiq-install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    window.dispatchEvent(new Event('vlaiq-install-ready'));
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  const start = () => {
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        const notify = () => {
          if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new Event('vlaiq-update-ready'));
        };
        notify();
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', notify);
        });
      }).catch(() => {
        // The online app still works when offline preparation or storage is unavailable.
      });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
