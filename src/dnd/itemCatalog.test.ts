import { describe, expect, it } from 'vitest';
import { catalogItem, catalogListItem, catalogPickContents, ITEM_CATALOG, ITEM_CATEGORIES, searchItemCatalog } from './itemCatalog';
import { WEAPON_CATALOG } from './weaponCatalog';

describe('item catalog', () => {
  it('has unique keys, a known category and a name for every entry', () => {
    expect(new Set(ITEM_CATALOG.map((item) => item.key)).size).toBe(ITEM_CATALOG.length);
    const categories = new Set(ITEM_CATEGORIES.map((entry) => entry.key));
    for (const item of ITEM_CATALOG) {
      expect(categories.has(item.category)).toBe(true);
      expect(item.name.trim()).not.toBe('');
      expect(item.quantity).toBeGreaterThan(0);
    }
    for (const category of categories) expect(ITEM_CATALOG.some((item) => item.category === category)).toBe(true);
  });

  it('holds every weapon of the weapon list, with its stats', () => {
    expect(ITEM_CATALOG.filter((item) => item.category === 'weapon')).toHaveLength(WEAPON_CATALOG.length);
    const longsword = catalogListItem(catalogItem('weapon:longsword')!, 'x');
    expect(longsword).toMatchObject({ name: 'Длинный меч', catalogKey: 'weapon:longsword', equipped: false, weapon: { damage: '1d8', versatile: '1d10', category: 'martial' } });
  });

  it('packs list existing items and add them, not themselves', () => {
    for (const pack of ITEM_CATALOG.filter((item) => item.category === 'pack')) {
      expect(pack.contents!.length).toBeGreaterThan(0);
      for (const { key } of pack.contents!) expect(catalogItem(key)).toBeDefined();
      expect(catalogPickContents(pack).some(({ item }) => item.key === pack.key)).toBe(false);
    }
    const explorer = catalogPickContents(catalogItem('pack:explorer')!);
    expect(explorer.find(({ item }) => item.key === 'gear:torch')?.quantity).toBe(10);
  });

  it('stores only the fields the sheet shows', () => {
    expect(catalogListItem(catalogItem('consumable:potion-healing')!, 'p', 3)).toEqual({
      id: 'p', name: 'Зелье лечения', quantity: 3, equipped: false, description: 'Выпить действием: восстанавливает 2d4+2 HP', catalogKey: 'consumable:potion-healing',
    });
  });

  it('searches ignoring case and ё, inside a category', () => {
    expect(searchItemCatalog('ЗЕЛЬЕ', 'consumable').flatMap((group) => group.items.map((item) => item.key))).toContain('consumable:potion-healing');
    expect(searchItemCatalog('стеганый').flatMap((group) => group.items.map((item) => item.name))).toEqual(['Стёганый доспех']);
    expect(searchItemCatalog('', 'weapon').flatMap((group) => group.items).every((item) => item.category === 'weapon')).toBe(true);
    expect(searchItemCatalog('нет такого предмета')).toEqual([]);
  });
});
