import { expect, test } from '@playwright/test';
import { serveDashboard } from './support/fake-dashboard-server';

test('mobile sidebar moves focus into the drawer and restores the opener after Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await serveDashboard(page);
  await page.goto('/dashboard');
  await page.waitForSelector('[data-dashboard-view="recent"]', { timeout: 15000 });

  const opener = page.locator('[data-mobile-sidebar-open]');
  await opener.focus();
  await opener.click();

  const sidebar = page.locator('.dashboard-sidebar');
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar.locator('[data-sidebar-close]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sidebar).not.toHaveAttribute('role', 'dialog');
  await expect(opener).toBeFocused();
});
