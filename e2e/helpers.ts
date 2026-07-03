import type { Page } from '@playwright/test';

/**
 * Run `page.evaluate(fn, arg)` and retry it if the execution context is
 * destroyed by a navigation. The dev build can fire one or more reloads
 * (the `vite-plugin-pwa` dev service-worker registration races the HMR
 * WebSocket and triggers a `SendBeforeConnectError` reload loop in a fresh
 * browser context); rather than race them, we retry the evaluate across the
 * reload window until the page stabilises. "Execution context was
 * destroyed" / "Target closed" / "frame was detached" are the retryable
 * signals; everything else propagates.
 */
export async function evalStable<T, A = undefined>(
  page: Page,
  fn: (arg: A) => T | PromiseLike<T>,
  arg?: A,
): Promise<T> {
  const deadline = Date.now() + 15_000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      return await page.evaluate(fn, arg as A);
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? '';
      if (
        /Execution context was destroyed|Target closed|frame was detached/i.test(
          msg,
        )
      ) {
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('evalStable timed out');
}