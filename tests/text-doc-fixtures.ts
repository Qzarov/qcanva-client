/**
 * Mocked text-document backend for the Playwright specs (no running server
 * needed - see text-document-table.spec.ts's header for why a mocked GET is
 * enough). Kept out of any *.spec.ts file so importing it doesn't re-run
 * that spec's tests.
 */

import type { Page } from '@playwright/test';

const API = 'http://localhost:3001/api/**';

export async function setupTextDocMocks(page: Page, overrides?: { title?: string; role?: string }) {
  await page.addInitScript(() => {
    localStorage.setItem('qcanva:theme:v1', 'light');
    localStorage.setItem('token', 'reg-doc-test-token');
    localStorage.setItem('userRole', 'user');
    localStorage.setItem('accessMode', 'user');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'test-user', email: 'user@example.com', name: 'Test User', role: 'user',
    }));
  });

  await page.route(API, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/api/text-documents/reg-doc') {
      await route.fulfill({ json: {
        document: {
          id: 'reg-doc',
          title: overrides?.title ?? 'Regression Doc',
          revision: 1,
          visibility: 'private',
          listedInPublic: true,
          slug: null,
        },
        role: overrides?.role ?? 'owner',
      }});
    } else if (path.endsWith('/permissions')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/mentions') || path.endsWith('/backlinks')) {
      await route.fulfill({ json: [] });
    } else if (path.endsWith('/plugins')) {
      await route.fulfill({ json: { plugins: [] } });
    } else if (path.endsWith('/tags')) {
      await route.fulfill({ json: { tags: [] } });
    } else {
      await route.fulfill({ json: {} });
    }
  });
}
