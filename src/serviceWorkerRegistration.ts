import { logInfo, logWarn } from './log.ts';

// Registers the app-shell service worker (public/sw.js, baked at build time
// by the `localaction-sw` Vite plugin) and narrates the standard PWA
// lifecycle. Production builds only: in dev the SW would precache nothing
// meaningful and a stale registration could shadow HMR. Dev and prod/preview
// also run on different ports, hence different origins, so registrations
// never cross over.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    logWarn('sw', 'service workers not supported in this browser');
    return;
  }
  window.addEventListener('load', () => {
    logInfo('sw', 'registering /sw.js');
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        logInfo('sw', `registered (scope ${registration.scope})`);

        // Narrate a newly installing worker's state transitions.
        const watchInstalling = (worker: ServiceWorker | null): void => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'redundant') {
              logWarn('sw', 'state: redundant (worker discarded)');
            } else {
              logInfo('sw', `state: ${worker.state}`);
            }
          });
        };
        watchInstalling(registration.installing);
        registration.addEventListener('updatefound', () => {
          logInfo('sw', 'update found, installing new version');
          watchInstalling(registration.installing);
        });

        void navigator.serviceWorker.ready.then(() => {
          logInfo('sw', 'activated and ready');
        });
      })
      .catch((err: unknown) => {
        logWarn('sw', `registration failed: ${err instanceof Error ? err.message : String(err)}`);
      });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      logInfo('sw', 'controller changed, new version now controls this page');
    });
  });

  // Standard PWA install-prompt lifecycle. No custom UX: the prompt is not
  // deferred or intercepted, just observed.
  window.addEventListener('beforeinstallprompt', () => {
    logInfo('pwa', 'install prompt available');
  });
  window.addEventListener('appinstalled', () => {
    logInfo('pwa', 'app installed');
  });
}
