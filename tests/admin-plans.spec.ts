/**
 * Plans in the Admin page: made and edited, given to a user, suspended and
 * taken back, the history of it; the analytics; "Plan" in Settings. Mocked
 * API, no backend needed. Screenshots only when SHOT_DIR is set.
 */

import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOT_DIR;
const GB = 1024 ** 3;
const dayAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const series = <T>(make: (day: string, i: number) => T) => Array.from({ length: 30 }, (_, i) => make(dayAgo(29 - i), i));

async function openAdmin(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('token', 'admin-test-token');
    localStorage.setItem('userRole', 'superadmin');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'admin-1', email: 'admin@example.com', name: 'Админ', role: 'superadmin' }));
    localStorage.setItem('qcanva:locale', 'en');
  });
  const base = { description: '', archived: false, users: 3 };
  const plans: any[] = [{ ...base, id: 'p-base', name: 'Basic', priceCents: 0, period: 'month', maxResources: null, maxStorageBytes: null, canCreateSpaces: true, isDefault: true }];
  const history: any[] = [];
  const posted: Array<{ path: string; body: any }> = [];
  const info = () => {
    const running = history.find((grant) => grant.status === 'active');
    const plan = running ? plans.find((p) => p.id === running.planId) : plans[0];
    return { plan: { ...plan, grantId: running?.id ?? null, endsAt: running?.endsAt ?? null }, usage: { resources: 3, storageBytes: GB }, history };
  };
  const event = (action: string, note = '') => ({ action, actorName: 'Админ', note, at: new Date().toISOString() });
  const analytics = {
    days: 30,
    users: { total: 12, active7: 5, active30: 9, signups: series((day, i) => ({ day, count: i % 4 })) },
    plans: [{ planId: 'p-base', name: 'Basic', users: 10, payingUsers: 0, monthlyCents: 0, storageBytes: GB, resources: 40 }],
    revenue: { monthlyCents: 150000, series: series((day, i) => ({ day, monthlyCents: i * 5000 })) },
    usage: {
      storageBytes: 5 * GB,
      resources: 120,
      topByStorage: [{ userId: 'u-1', email: 'ann@example.com', name: 'Ann', planName: 'Basic', maxResources: null, maxStorageBytes: null, resources: 9, storageBytes: 3 * GB }],
      topByResources: [],
      atLimit: [],
      atLimitCount: 0,
    },
    content: { series: series((day, i) => ({ day, canvases: i % 3, documents: i % 5, html: 0, templates: 1, files: i, spaces: 0 })) },
  };
  await page.route('http://localhost:3001/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const method = route.request().method();
    const body = method === 'POST' || method === 'PATCH' ? route.request().postDataJSON() : undefined;
    if (body !== undefined || method === 'POST') posted.push({ path, body });
    if (path === '/admin/users') return route.fulfill({ json: [{ id: 'u-1', name: 'Ann', email: 'ann@example.com', role: 'user', canvasCount: 2, createdAt: dayAgo(9), lastActiveAt: dayAgo(1) }] });
    if (path === '/admin/stats') return route.fulfill({ json: { userCount: 1, canvasCount: 2 } });
    if (path === '/admin/plan-assignments') {
      const running = history.find((grant) => grant.status === 'active');
      return route.fulfill({ json: [{ userId: 'u-1', planId: running?.planId ?? 'p-base', planName: running?.planName ?? 'Basic', isDefault: !running, endsAt: null }] });
    }
    if (path === '/admin/plans' && method === 'GET') return route.fulfill({ json: plans });
    if (path === '/admin/plans') {
      const plan = { ...base, users: 0, id: `p-${plans.length}`, isDefault: false, ...body };
      plans.push(plan);
      return route.fulfill({ json: plan });
    }
    if (path === '/admin/analytics') return route.fulfill({ json: analytics });
    if (path === '/admin/users/u-1/plans' && method === 'GET') return route.fulfill({ json: info() });
    if (path === '/admin/users/u-1/plans') {
      history.forEach((grant) => { if (grant.status === 'active' || grant.status === 'suspended') grant.status = 'replaced'; });
      const plan = plans.find((p) => p.id === body.planId);
      const grant = { id: `g-${history.length}`, planId: plan.id, planName: plan.name, status: 'active', priceCents: plan.priceCents, period: plan.period, startsAt: new Date().toISOString(), endsAt: body.endsAt, events: [event('granted', body.note)] };
      history.unshift(grant);
      return route.fulfill({ json: grant });
    }
    const action = path.match(/^\/admin\/user-plans\/([^/]+)\/(suspend|resume|revoke)$/);
    if (action) {
      const grant = history.find((row) => row.id === action[1]);
      grant.status = { suspend: 'suspended', resume: 'active', revoke: 'revoked' }[action[2]!];
      grant.events.push(event({ suspend: 'suspended', resume: 'resumed', revoke: 'revoked' }[action[2]!]!));
      return route.fulfill({ json: grant });
    }
    if (path === '/me/plan') return route.fulfill({ json: info() });
    return route.fulfill({ json: [] });
  });
  await page.goto('/admin');
  await expect(page.locator('[data-admin-tab="plans"]')).toBeVisible();
  return { posted };
}

test('an admin makes a plan: price, period, limits, spaces', async ({ page }) => {
  const { posted } = await openAdmin(page);
  await page.locator('[data-admin-tab="plans"]').click();
  await expect(page.locator('[data-plan-row="Basic"] [data-plan-default-badge]')).toBeVisible();
  await page.locator('[data-plan-new]').click();
  const form = page.locator('[data-plan-form]');
  await form.locator('[data-plan-field-name]').fill('Pro');
  await form.locator('[data-plan-field-price]').fill('499.50');
  await form.locator('[data-plan-field-period]').selectOption('year');
  await form.locator('[data-plan-field-resources]').fill('100');
  await form.locator('[data-plan-field-storage]').fill('2');
  await form.locator('[data-plan-field-spaces]').uncheck();
  if (SHOTS) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/plan-form.png` });
  }
  await form.locator('[data-plan-save]').click();
  await expect(form).toHaveCount(0);
  const row = page.locator('[data-plan-row="Pro"]');
  await expect(row).toContainText('499.5 ₽ / year');
  await expect(row).toContainText('2 GB');
  expect(posted.find((p) => p.path === '/admin/plans')?.body).toMatchObject({
    name: 'Pro', priceCents: 49950, period: 'year', maxResources: 100, maxStorageBytes: 2 * GB, canCreateSpaces: false,
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/plans-list.png` });
});

test('a plan is given to a user, suspended, resumed, taken back - and the history says so', async ({ page }) => {
  const { posted } = await openAdmin(page);
  await page.locator('[data-admin-tab="plans"]').click();
  await page.locator('[data-plan-new]').click();
  await page.locator('[data-plan-field-name]').fill('Pro');
  await page.locator('[data-plan-save]').click();
  await expect(page.locator('[data-plan-row="Pro"]')).toBeVisible();
  await page.locator('[data-admin-tab="overview"]').click();

  const open = page.locator('[data-admin-user-plan="ann@example.com"]');
  await expect(open).toHaveText('Basic');
  await open.click();
  const dialog = page.locator('[data-user-plan-dialog]');
  await expect(dialog.locator('[data-user-plan-current]')).toHaveText('Basic');
  await expect(dialog.locator('[data-user-plan-usage]')).toContainText('3/∞');
  await expect(dialog.locator('[data-user-plan-empty]')).toBeVisible();

  await dialog.locator('[data-user-plan-select]').selectOption({ label: 'Pro' });
  await dialog.locator('[data-user-plan-note]').fill('a gift');
  await dialog.locator('[data-user-plan-grant]').click();
  await expect(dialog.locator('[data-user-plan-current]')).toHaveText('Pro');
  await expect(dialog.locator('[data-user-plan-history]')).toContainText('a gift');
  expect(posted.find((p) => p.path === '/admin/users/u-1/plans')?.body).toMatchObject({ planId: 'p-1', note: 'a gift', endsAt: null });
  await expect(open).toHaveText('Pro');

  await dialog.locator('[data-user-plan-suspend]').click();
  await expect(dialog.locator('[data-user-plan-grant-row="suspended"]')).toBeVisible();
  await expect(dialog.locator('[data-user-plan-current]')).toHaveText('Basic');
  await dialog.locator('[data-user-plan-resume]').click();
  await expect(dialog.locator('[data-user-plan-grant-row="active"]')).toBeVisible();
  if (SHOTS) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/user-plan-dialog.png` });
  }
  await dialog.locator('[data-user-plan-revoke]').click();
  await expect(dialog.locator('[data-user-plan-grant-row="revoked"]')).toBeVisible();
  await expect(dialog.locator('[data-user-plan-history] li li')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`the analytics: figures, charts, tables (${width}px)`, async ({ page }) => {
    await openAdmin(page, width);
    await page.locator('[data-admin-tab="analytics"]').click();
    const panel = page.locator('[data-admin-analytics]');
    await expect(panel.locator('[data-analytics-users]')).toHaveText('12');
    await expect(panel.locator('[data-analytics-revenue]')).toContainText('1,500');
    await expect(panel.locator('[data-admin-chart]')).toHaveCount(8);
    await expect(panel.locator('[data-analytics-people="storage"]')).toContainText('Ann');
    await expect(panel.locator('[data-analytics-people="at-limit"]')).toContainText('Nobody');
    // No sideways scrolling of the page, whatever the width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const chart = panel.locator('[data-admin-chart="Sign-ups"]');
    await chart.locator('.admin-chart-slot').nth(29).hover();
    await expect(chart.locator('[data-admin-chart-readout]')).toContainText(': 1');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/analytics-${width}.png`, fullPage: false });
  });
}

test('Settings shows the plan, what of it is used and the history', async ({ page }) => {
  await openAdmin(page);
  await page.goto('/settings');
  await page.locator('[data-settings-section="plan"]').click();
  const card = page.locator('[data-settings-plan]');
  await expect(card.locator('[data-settings-plan-name]')).toHaveText('Basic');
  await expect(card.locator('[data-settings-plan-resources]')).toHaveText('3 / ∞');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-plan.png` });
});
