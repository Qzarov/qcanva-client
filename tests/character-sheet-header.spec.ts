import { expect, test, type Page } from '@playwright/test';
import { createDndCharacterSheet } from '../src/dnd/characterSheet';

const longName = 'Элеонора Серебряная Звезда из Далёкого Лунного Леса Хранительница Древних Преданий';
async function openSheet(page: Page) {
  const data = createDndCharacterSheet();
  data.identity = { ...data.identity, name: longName, race: 'Эльф', className: 'Волшебник', experience: 350, nextLevelExperience: 900 };
  let template = { id: 'hero', title: 'Старое название', templateType: 'dnd-character', data, createdAt: '', updatedAt: '', role: 'owner' };
  await page.addInitScript(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'test-user', role: 'user' }));
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/interactive-templates/hero') {
      if (route.request().method() === 'PUT') template = { ...template, ...route.request().postDataJSON() };
      return route.fulfill({ json: template });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/templates/hero');
  await expect(page.getByRole('textbox', { name: 'Имя персонажа', exact: true })).toHaveValue(longName);
  return () => template;
}

for (const width of [320, 390, 760, 1280]) {
  test(`character header and full ability tiles fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await openSheet(page);
    const name = page.getByRole('textbox', { name: 'Имя персонажа', exact: true });
    expect(await name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
    expect((await name.boundingBox())!.height).toBeGreaterThan(45);
    await expect(page.getByText('Название в дашборде')).toHaveCount(0);
    const race = await page.getByRole('textbox', { name: 'Раса', exact: true }).boundingBox();
    const nameBox = (await name.boundingBox())!;
    expect(race!.y).toBeLessThan(nameBox.y + nameBox.height);
    const level = (await page.getByLabel('Уровень', { exact: true }).boundingBox())!;
    const xp = (await page.locator('.dnd-cs-xp-bar').boundingBox())!;
    expect(xp.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height);
    const badge = (await page.locator('.dnd-cs-level').boundingBox())!;
    expect(Math.abs(badge.x + badge.width - xp.x)).toBeLessThanOrEqual(1);
    expect(level.y).toBeLessThan(xp.y + xp.height);
    await expect(page.locator('.dnd-cs-xp-bar').getByLabel('Опыт', { exact: true })).toHaveValue('350');
    const ac = (await page.getByLabel('Класс доспеха', { exact: true }).boundingBox())!;
    if (width > 760) expect(ac.x).toBeGreaterThan(nameBox.x + nameBox.width);
    else expect(ac.y).toBeGreaterThan(xp.y + xp.height);

    const tiles = await page.locator('.dnd-cs-ability').evaluateAll(elements => elements.map(element => {
      const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right };
    }));
    expect(tiles).toHaveLength(6);
    expect(Math.abs(tiles[0]!.y - tiles[1]!.y)).toBeLessThanOrEqual(1);
    expect(tiles[1]!.x).toBeGreaterThan(tiles[0]!.x);
    for (const label of ['Сила', 'Ловкость', 'Телосложение', 'Интеллект', 'Мудрость', 'Харизма']) {
      const title = page.locator('.dnd-cs-ability-name').getByText(label, { exact: true });
      await expect(title).toHaveCount(1);
      expect(await title.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    const overflows = await page.locator('.dnd-cs-topcard input, .dnd-cs-topcard textarea, .dnd-cs-ability button, .dnd-cs-ability input').evaluateAll(elements => elements.filter(element => {
      const bounds = element.getBoundingClientRect();
      const parent = element.closest('.dnd-cs-ability, .dnd-cs-topcard')!.getBoundingClientRect();
      return bounds.x < parent.x || bounds.right > parent.right || bounds.x < 0 || bounds.right > innerWidth;
    }).map(element => element.outerHTML));
    expect(overflows).toEqual([]);
    await page.screenshot({ path: `/tmp/qcanva-character-header-long-${width}.png`, fullPage: true });
    await name.fill('Короткое имя');
    await name.blur();
    await expect.poll(() => saved().title).toBe('Короткое имя');
    expect(await name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
    await page.screenshot({ path: `/tmp/qcanva-character-header-${width}.png`, fullPage: true });
  });
}

test('name height follows viewport changes and reloading keeps the name and title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const saved = await openSheet(page);
  const name = page.getByRole('textbox', { name: 'Имя персонажа', exact: true });
  const height = (await name.boundingBox())!.height;
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(async () => (await name.boundingBox())!.height).toBeGreaterThan(height);
  expect(await name.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  await name.fill('Лира'); await name.blur();
  await expect.poll(() => saved().title).toBe('Лира');
  await page.reload();
  await expect(name).toHaveValue('Лира');
  await expect(page.getByLabel('Опыт', { exact: true })).toHaveValue('350');
});
