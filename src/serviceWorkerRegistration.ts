import { logInfo, logWarn } from './log.ts';

// Registers the app-shell service worker (public/sw.js, baked at build time
// by the `localaction-sw` Vite plugin) and narrates the standard PWA
// lifecycle. Production builds only: in dev the SW would precache nothing
// meaningful and a stale registration could shadow HMR.
//
// Dev additionally PURGES any service worker on the origin. SWs persist per
// origin across server restarts, so a prod build once served on the
// same port leaves a worker that keeps serving its precached shell over the
// dev server. The dev server's /sw.js cleanup worker (see the
// localaction-sw-dev-cleanup plugin in vite.config.ts) normally handles the
// handover on its own; this branch is the belt-and-braces pass for the first
// dev page load (e.g. the cleanup worker hasn't activated yet).
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) {
    purgeServiceWorker();
    return;
  }
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

// Dev-only counterpart of registerServiceWorker: unregister every SW on this
// origin and delete the app's Cache Storage buckets so nothing stands
// between the browser and the dev server. Never runs in prod builds
// (import.meta.env.PROD is statically replaced, so this is tree-shaken out).
function purgeServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      logInfo('sw', `dev: unregistering service worker (scope ${registration.scope})`);
      void registration.unregister();
    }
  });
  if (typeof caches === 'undefined') return;
  void caches.keys().then((keys) => {
    for (const key of keys) {
      if (!key.startsWith('localaction-')) continue;
      logInfo('sw', `dev: deleting cache ${key}`);
      void caches.delete(key);
    }
  });
}
