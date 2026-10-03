import { expect, test } from '@playwright/test';
import { setupTextDocMocks } from './text-doc-fixtures';

for (const height of [600, 900]) {
  test(`desktop outline toggle stays at the bottom when collapsed (${height}px)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height });
    await setupTextDocMocks(page);
    await page.goto('/docs/reg-doc');
    await expect(page.locator('.ProseMirror')).toBeVisible();

    const toggle = page.locator('.text-doc-outline-collapse-toggle');
    const expectAtBottom = async () => {
      await expect.poll(async () => {
        const box = await toggle.boundingBox();
        return box ? height - box.y - box.height : null;
      }).toBeGreaterThanOrEqual(0);
      await expect.poll(async () => {
        const box = await toggle.boundingBox();
        return box ? height - box.y - box.height : Infinity;
      }).toBeLessThanOrEqual(16);
    };

    await expectAtBottom();
    await toggle.click();
    await expect(page.locator('.text-doc-outline-panel')).toHaveClass(/text-doc-outline-panel-collapsed/);
    await expectAtBottom();

    // Collapsed state is persisted: opening a document directly must also
    // leave the expansion control at the bottom, not just after a click.
    await page.reload();
    await expect(page.locator('.ProseMirror')).toBeVisible();
    await expect(page.locator('.text-doc-outline-panel')).toHaveClass(/text-doc-outline-panel-collapsed/);
    await expectAtBottom();

    await toggle.click();
    await expect(page.locator('.text-doc-outline-panel-inner')).toBeVisible();
    await expectAtBottom();
  });
}
