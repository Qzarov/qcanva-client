// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { applySheetOperation, type SheetOperation } from '../dnd/sheetOperations';
import { createDndCharacterSheet, normalizeDndCharacterSheet, type DndCharacterSheetData } from '../dnd/characterSheet';
import { runBackHandlers } from '../composables/useBackHandler';
import { choose, selectSelector } from './dndSelect.testing';

/** Mounts the sheet and applies every emitted `op` to its data, the way the page does. */
const mountSheet = (setup: (data: DndCharacterSheetData) => void = () => {}, readonly = false) => {
  const initial = createDndCharacterSheet();
  setup(initial);
  const data = reactive(initial);
  const wrapper = mount(DndCharacterSheet, {
    props: {
      data, readonly,
      onOp: (op: SheetOperation) => {
        Object.assign(data, normalizeDndCharacterSheet(applySheetOperation(JSON.parse(JSON.stringify(data)), op)));
      },
    },
    global: { stubs: { Teleport: true } },
  });
  const ops = () => (wrapper.emitted('op') ?? []).map(([op]) => op as SheetOperation);
  return { data, wrapper, ops };
};
const button = (wrapper: ReturnType<typeof mountSheet>['wrapper'], text: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === text)!;

describe('death saves', () => {
  it('are shown only at 0 HP', async () => {
    const { data, wrapper } = mountSheet();
    try {
      expect(wrapper.find('[aria-label="Спасброски от смерти"]').exists()).toBe(false);
      data.combat.currentHp = 0;
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[aria-label="Спасброски от смерти"]').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('a roll sends one death-save operation and fills a pip', async () => {
    const { data, wrapper, ops } = mountSheet((sheet) => { sheet.combat.currentHp = 0; });
    try {
      await button(wrapper, 'Спасбросок от смерти').trigger('click');
      expect(ops()).toHaveLength(1);
      const op = ops()[0] as Extract<SheetOperation, { type: 'death-save' }>;
      expect(op.type).toBe('death-save');
      const { successes, failures } = data.combat.deathSaves;
      if (op.outcome === 'critical-success') expect(data.combat.currentHp).toBe(1);
      else expect(successes + failures).toBe(op.outcome === 'critical-failure' ? 2 : 1);
      expect(wrapper.text()).toContain('Спасбросок от смерти');
    } finally { wrapper.unmount(); }
  });

  it('pips are set by hand, and the result replaces the roll button', async () => {
    const { data, wrapper } = mountSheet((sheet) => { sheet.combat.currentHp = 0; });
    try {
      await wrapper.get('[aria-label="Провал 2 из 3"]').trigger('click');
      expect(data.combat.deathSaves.failures).toBe(2);
      await wrapper.get('[aria-label="Провал 2 из 3"]').trigger('click');
      expect(data.combat.deathSaves.failures).toBe(1);
      expect(wrapper.emitted('change')).toHaveLength(2);
      await wrapper.get('[aria-label="Успех 3 из 3"]').trigger('click');
      expect(wrapper.get('.dnd-cs-death-result').text()).toBe('Стабилен');
      expect(button(wrapper, 'Спасбросок от смерти')).toBeUndefined();
      await wrapper.get('[aria-label="Провал 3 из 3"]').trigger('click');
      expect(wrapper.get('.dnd-cs-death-result').text()).toBe('Мёртв');
    } finally { wrapper.unmount(); }
  });

  it('cannot be changed in read-only mode', async () => {
    const { data, wrapper, ops } = mountSheet((sheet) => { sheet.combat.currentHp = 0; }, true);
    try {
      expect(wrapper.get('[aria-label="Провал 1 из 3"]').attributes('disabled')).toBeDefined();
      expect(button(wrapper, 'Спасбросок от смерти').attributes('disabled')).toBeDefined();
      expect(button(wrapper, 'Длинный отдых').attributes('disabled')).toBeDefined();
      expect(data.combat.deathSaves).toEqual({ successes: 0, failures: 0 });
      expect(ops()).toEqual([]);
    } finally { wrapper.unmount(); }
  });
});

describe('rests', () => {
  const tired = (sheet: DndCharacterSheetData) => {
    sheet.identity.level = 4;
    sheet.abilities.constitution.score = 14;
    sheet.combat = { ...sheet.combat, currentHp: 6, maxHp: 30, temporaryHp: 3, hitDiceSpent: 3, conditions: ['exhaustion'] };
    sheet.features = [
      { id: 's', name: 'Второе дыхание', currentUses: 0, maxUses: 1, recharge: 'short' },
      { id: 'l', name: 'Ярость', currentUses: 0, maxUses: 2, recharge: 'long' },
    ];
  };

  it('a long rest lists what will change and applies it as one operation', async () => {
    const { data, wrapper, ops } = mountSheet(tired);
    try {
      await button(wrapper, 'Длинный отдых').trigger('click');
      const dialog = wrapper.get('[role="dialog"][aria-label="Длинный отдых"]');
      const text = dialog.get('.dnd-rest-effects').text();
      expect(text).toContain('HP: 6 → 30');
      expect(text).toContain('Временные HP: 3 → 0');
      expect(text).toContain('Кости хитов: 1 → 3 из 4');
      expect(text).toContain('Истощение снимается');
      expect(text).toContain('Умения: Второе дыхание, Ярость');
      await dialog.get('form').trigger('submit');
      expect(ops()).toEqual([{ type: 'rest', kind: 'long' }]);
      expect(data.combat).toMatchObject({ currentHp: 30, temporaryHp: 0, hitDiceSpent: 1, conditions: [] });
      expect(data.features.map((item) => item.currentUses)).toEqual([1, 2]);
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('a short rest spends hit dice one roll at a time and restores short-rest features', async () => {
    const { data, wrapper, ops } = mountSheet(tired);
    try {
      await button(wrapper, 'Короткий отдых').trigger('click');
      const dialog = wrapper.get('[role="dialog"][aria-label="Короткий отдых"]');
      expect(dialog.text()).toContain('Кости хитов: 1 из 4');
      const spend = dialog.get('.dnd-rest-spend');
      expect(spend.text()).toBe('Потратить кость: 1d8+2');
      await spend.trigger('click');
      const op = ops()[0] as Extract<SheetOperation, { type: 'hit-die' }>;
      expect(op.type).toBe('hit-die');
      expect(op.heal).toBeGreaterThanOrEqual(3);
      expect(op.heal).toBeLessThanOrEqual(10);
      expect(data.combat).toMatchObject({ hitDiceSpent: 4, currentHp: 6 + op.heal });
      // None left: the button is disabled and the dialog says so. (The stubbed
      // Teleport re-renders its content, so the dialog is looked up again.)
      const after = wrapper.get('[role="dialog"][aria-label="Короткий отдых"]');
      expect(after.get('.dnd-rest-spend').attributes('disabled')).toBeDefined();
      expect(after.text()).toContain('костей не осталось');
      expect(after.get('.dnd-rest-effects').text()).toBe('Умения: Второе дыхание');
      await after.get('form').trigger('submit');
      expect(ops()[1]).toEqual({ type: 'rest', kind: 'short' });
      expect(data.features.map((item) => item.currentUses)).toEqual([1, 0]);
    } finally { wrapper.unmount(); }
  });

  it('changes the hit die and closes on system Back without resting', async () => {
    const { data, wrapper, ops } = mountSheet(tired);
    try {
      await button(wrapper, 'Короткий отдых').trigger('click');
      await choose(wrapper, 'Кость хитов', '12');
      expect(data.combat.hitDie).toBe(12);
      expect(wrapper.get('.dnd-rest-spend').text()).toBe('Потратить кость: 1d12+2');
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      expect(ops()).toEqual([]);
    } finally { wrapper.unmount(); }
  });
});

describe('feature recharge', () => {
  it('is chosen per feature once it has uses', async () => {
    const { data, wrapper } = mountSheet((sheet) => {
      sheet.activeTab = 'features';
      sheet.features = [{ id: 'a', name: 'Ярость', currentUses: 1, maxUses: 2 }, { id: 'b', name: 'Тёмное зрение' }];
    });
    try {
      const selects = wrapper.findAll(selectSelector('Когда восстанавливаются заряды'));
      expect(selects).toHaveLength(1);
      await choose(wrapper, 'Когда восстанавливаются заряды', 'long');
      expect(data.features[0]!.recharge).toBe('long');
      expect(wrapper.emitted('change')).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });
});
