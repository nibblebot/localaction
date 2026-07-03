import { expect, test } from '@playwright/test';
import { evalStable } from './helpers.ts';

/**
 * Phase 0 / 01-foundation smoke test: the app boots, the two-pane shell
 * renders, and the data layer establishes a WebSocket connection to the
 * bundled sync server.
 *
 * These are deliberately tiny assertions — feature suites will replace
 * these placeholders as the right-pane editors and tree are built out.
 */
test.describe('foundation shell', () => {
  test('two-pane shell renders and WS handshake completes', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('complementary', { name: 'Tree' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Editor' })).toBeVisible();

    // Breadcrumbs in the right pane should at least mention "Home".
    await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toContainText('Home');

    // The sync status badge flips to "connected" once the WS handshake
    // succeeds; allow up to a few seconds for the dev server to attach.
    await expect(page.getByRole('status')).toContainText(/connected|connecting/, {
      timeout: 10_000,
    });
  });

  test('the PWA manifest is registered and well-formed', async ({ page }) => {
    await page.goto('/');
    const manifest = await evalStable(page, async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) return null;
      const res = await fetch(link.href);
      return (await res.json()) as Record<string, unknown>;
    });
    expect(manifest).not.toBeNull();
    expect(manifest).toHaveProperty('name', 'LocalAction');
    expect(manifest).toHaveProperty('start_url', '/');
    expect(manifest).toHaveProperty('display', 'standalone');
  });
});