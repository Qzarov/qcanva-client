import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';

async function useLightTheme(page: Page) {
  await page.addInitScript(() => localStorage.setItem('qcanva:theme:v1', 'light'));
}

async function useAuthenticatedLightTheme(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'visual-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('accessMode', 'user');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'visual-user',
      email: 'visual@example.com',
      name: 'Visual test',
      role: 'user',
      accessMode: 'user',
    }));
  });
}

test('light login remains visually stable', async ({ page }) => {
  await useLightTheme(page);
  await page.goto('/login');
  await expect(page.locator('.auth-card')).toBeVisible();
  await expect(page).toHaveScreenshot('light-login.png', { fullPage: true });
});

test('light mobile dashboard keeps controls readable without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useAuthenticatedLightTheme(page);
  await page.route(API, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith('/canvas')) body = { own: [], shared: [], public: [] };
    else if (path.endsWith('/resource-folders')) body = { own: [], shared: [] };
    else if (path.endsWith('/html-documents') || path.endsWith('/text-documents') || path.endsWith('/html-documents/public') || path.endsWith('/text-documents/public')) body = { documents: [] };
    else if (path.endsWith('/interactive-templates')) body = { templates: [], own: [], shared: [] };
    else if (path.endsWith('/access-requests/incoming') || path.endsWith('/recent-resources')) body = [];
    else if (path.endsWith('/tags')) body = { tags: [] };
    await route.fulfill({ json: body });
  });

  await page.goto('/dashboard');
  const sortSelect = page.locator('.dash-sort-select');
  await expect(sortSelect).toBeVisible();
  const sortBox = await sortSelect.boundingBox();
  expect(sortBox?.width).toBeGreaterThan(300);
  await expect(page).toHaveScreenshot('light-dashboard-mobile.png', { fullPage: true });
});

test('light canvas uses light default and interactive blocks', async ({ page }) => {
  await useAuthenticatedLightTheme(page);
  await page.route(API, async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/canvas/theme-preview') {
      body = {
        canvas: {
          id: 'theme-preview',
          title: 'Theme preview',
          ownerId: 'visual-user',
          revision: 1,
          isPublic: false,
          visibility: 'private',
          listedInPublic: true,
          data: JSON.stringify({
            nodes: [
              { id: 'text', type: 'text', text: '# Light block\nDefault canvas content', x: 90, y: 120, width: 280, height: 170 },
              { id: 'dnd', type: 'template', templateId: 'dnd-character', templateData: {}, x: 500, y: 100, width: 720, height: 480 },
            ],
            edges: [],
          }),
        },
        role: 'owner',
      };
    } else if (path.includes('/plugins/')) body = [];
    else if (path.endsWith('/permissions') || path.endsWith('/messages')) body = [];
    await route.fulfill({ json: body });
  });

  await page.goto('/canvas/theme-preview');
  await expect(page.locator('[data-node-id="text"]')).toBeVisible();
  await expect(page.locator('.dnd-sheet')).toBeVisible();
  await expect(page.locator('[data-node-id="text"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.dnd-sheet')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page).toHaveScreenshot('light-canvas-content.png', { fullPage: true });
});
