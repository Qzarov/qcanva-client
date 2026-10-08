// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { applySheetOperation, type SheetOperation } from '../dnd/sheetOperations';
import { createDndCharacterSheet } from '../dnd/characterSheet';
import { runBackHandlers } from '../composables/useBackHandler';

const mountSheet = () => {
  const data = reactive(createDndCharacterSheet());
  const wrapper = mount(DndCharacterSheet, { props: { data, readonly: false }, global: { stubs: { Teleport: true } } });
  return { data, wrapper };
};

describe('DndCharacterSheet interactions', () => {
  it('adds and removes conditions without duplicating them or changing roll modifiers', async () => {
    const { data, wrapper } = mountSheet();
    try {
      const states = wrapper.get('[aria-label="Состояния"]');
      expect(states.text()).toContain('Вдохновение');
      await states.get('[aria-label="Добавить состояние"]').trigger('click');
      await states.get('[aria-label="Добавить: Отравлен"]').trigger('click');
      expect(data.combat.conditions).toEqual(['poisoned']);
      expect(data.abilities.strength.score).toBe(10);
      expect(wrapper.emitted('change')).toHaveLength(1);
      await states.get('[aria-label="Добавить состояние"]').trigger('click');
      expect(states.find('[aria-label="Добавить: Отравлен"]').exists()).toBe(false);
      await states.get('[aria-label="Удалить состояние: Отравлен"]').trigger('click');
      expect(data.combat.conditions).toEqual([]);
      expect(wrapper.emitted('change')).toHaveLength(2);
    } finally { wrapper.unmount(); }
  });

  it('system Back closes condition choices and passive help without changing the sheet', async () => {
    const wrapper = mount(DndCharacterSheet, { props: { data: reactive(createDndCharacterSheet()) }, global: { stubs: { Teleport: true } } });
    try {
      await wrapper.get('[aria-label="Добавить состояние"]').trigger('click');
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[aria-label="Доступные состояния"]').exists()).toBe(false);
      await wrapper.get('[aria-label="О пассивном восприятии"]').trigger('click');
      expect(wrapper.get('[role="tooltip"]').text()).toContain('без броска');
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[role="tooltip"]').exists()).toBe(false);
      expect(wrapper.emitted('change')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });

  it('preserves unknown saved conditions and disables state mutations in readonly mode', async () => {
    const data = reactive(createDndCharacterSheet());
    data.combat.conditions = ['Магическая метка'];
    const wrapper = mount(DndCharacterSheet, { props: { data, readonly: true } });
    try {
      expect(wrapper.get('[aria-label="Состояния"]').text()).toContain('Магическая метка');
      expect(wrapper.get('[aria-label="Добавить состояние"]').attributes('disabled')).toBeDefined();
      expect(wrapper.get('[aria-label="Удалить состояние: Магическая метка"]').attributes('disabled')).toBeDefined();
      await wrapper.get('[aria-label="Удалить состояние: Магическая метка"]').trigger('click');
      expect(data.combat.conditions).toEqual(['Магическая метка']);
    } finally { wrapper.unmount(); }
  });
  it.each([
    { mode: 'Лечение', amount: '7', hp: 17, temp: 5 },
    { mode: 'Лечение', amount: '100', hp: 20, temp: 5 },
    { mode: 'Урон', amount: '3', hp: 10, temp: 2 },
    { mode: 'Урон', amount: '8', hp: 7, temp: 0 },
    { mode: 'Урон', amount: '100', hp: 0, temp: 0 },
  ])('$mode $amount applies once, respects temporary HP and limits', async ({ mode, amount, hp, temp }) => {
    const data = reactive(createDndCharacterSheet());
    Object.assign(data.combat, { currentHp: 10, maxHp: 20, temporaryHp: 5, exhaustion: 3 });
    const wrapper = mount(DndCharacterSheet, { props: { data }, global: { stubs: { Teleport: true } } });
    try {
      await wrapper.get(`button[aria-label="${mode}"]`).trigger('click');
      await wrapper.get('[aria-label="Количество HP"]').setValue(amount);
      expect(data.combat.currentHp).toBe(10);
      await wrapper.get('.dnd-hp-dialog form').trigger('submit');
      // HP travels as a delta so the DM's and the player's damage add up;
      // the sheet itself is updated by whoever applies the operation.
      const ops = wrapper.emitted('op') as [SheetOperation][];
      expect(ops).toEqual([[{ type: 'hp-change', mode: mode === 'Лечение' ? 'heal' : 'damage', amount: Number(amount) }]]);
      expect(wrapper.emitted('change')).toBeUndefined();
      const applied = applySheetOperation(data as unknown as Record<string, unknown>, ops[0]![0]) as unknown as typeof data;
      expect(applied.combat.currentHp).toBe(hp);
      expect(applied.combat.temporaryHp).toBe(temp);
      expect(applied.combat.exhaustion).toBe(3);
      expect(wrapper.find('.dnd-hp-dialog').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Истощение');
    } finally { wrapper.unmount(); }
  });

  it('rejects invalid HP amounts and cancels without mutating HP', async () => {
    const data = reactive(createDndCharacterSheet());
    const wrapper = mount(DndCharacterSheet, { props: { data }, global: { stubs: { Teleport: true } } });
    try {
      await wrapper.get('[aria-label="Урон"]').trigger('click');
      for (const amount of ['', '0', '-1', '1.5', 'Infinity', '9007199254740992']) {
        await wrapper.get('[aria-label="Количество HP"]').setValue(amount);
        expect(wrapper.get('.dnd-hp-apply').attributes('disabled')).toBeDefined();
        await wrapper.get('.dnd-hp-dialog form').trigger('submit');
        expect(data.combat.currentHp).toBe(10);
      }
      await wrapper.get('.dnd-hp-cancel').trigger('click');
      expect(wrapper.find('.dnd-hp-dialog').exists()).toBe(false);
      expect(wrapper.emitted('change')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
  it('system Back closes the HP dialog without applying the draft amount', async () => {
    const data = reactive(createDndCharacterSheet());
    const wrapper = mount(DndCharacterSheet, { props: { data }, global: { stubs: { Teleport: true } } });
    try {
      await wrapper.get('[aria-label="Урон"]').trigger('click');
      await wrapper.get('[aria-label="Количество HP"]').setValue('5');
      expect(runBackHandlers()).toBe(true);
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.dnd-hp-dialog').exists()).toBe(false);
      expect(data.combat.currentHp).toBe(10);
      expect(wrapper.emitted('change')).toBeUndefined();
    } finally { wrapper.unmount(); }
  });
  it.each([
    { dexterity: 16, bonus: 2, readonly: false, modifier: '+5', formula: '+ 5', total: '16' },
    { dexterity: 8, bonus: 0, readonly: true, modifier: '-1', formula: '− 1', total: '10' },
  ])('rolls initiative with the existing modifier (dexterity $dexterity, readonly $readonly)', async ({ dexterity, bonus, readonly, modifier, formula, total }) => {
    const data = reactive(createDndCharacterSheet());
    data.abilities.dexterity.score = dexterity;
    data.combat.customInitiativeBonus = bonus;
    const wrapper = mount(DndCharacterSheet, { props: { data, readonly } });
    // Dice use crypto.getRandomValues: 0.5 of the range is a d20 face of 11.
    const rng = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView>(array: T) => {
      (array as unknown as Uint32Array)[0] = 2 ** 31;
      return array;
    });
    try {
      const button = wrapper.get('button[aria-label="Бросить инициативу"]');
      expect(button.text()).toContain(modifier);
      await button.trigger('click');
      const toast = document.querySelector('.dnd-cs-toast')!;
      expect(toast.textContent).toContain('Инициатива');
      expect(toast.querySelector('.dnd-cs-toast-formula')!.textContent).toContain(`d20 (11) ${formula} = ${total}`);
      expect(data.combat.customInitiativeBonus).toBe(bonus);
      expect(wrapper.emitted('change')).toBeUndefined();
      expect(wrapper.find('[aria-label="Бонус инициативы"]').exists()).toBe(false);
    } finally { rng.mockRestore(); wrapper.unmount(); }
  });
  it('labels every ability with its full name', () => {
    const { wrapper } = mountSheet();
    expect(wrapper.findAll('.dnd-cs-ability-name').map(node => node.text())).toEqual([
      'Сила', 'Телосложение', 'Ловкость', 'Интеллект', 'Мудрость', 'Харизма',
    ]);
  });
  it('edits a multiline character name without losing its full value', async () => {
    const { data, wrapper } = mountSheet();
    const name = wrapper.get('textarea[aria-label="Имя персонажа"]');
    await name.setValue('Очень длинное имя персонажа\nс продолжением');
    expect(data.identity.name).toBe('Очень длинное имя персонажа\nс продолжением');
    expect(wrapper.emitted('change')).toBeTruthy();
  });

  it('edits experience inside the progress track and updates its fill', async () => {
    const { data, wrapper } = mountSheet();
    const track = wrapper.get('.dnd-cs-xp-bar');
    await track.get('[aria-label="Опыт до следующего уровня"]').setValue('900');
    await track.get('[aria-label="Опыт"]').setValue('450');
    expect(data.identity.experience).toBe(450);
    expect(data.identity.nextLevelExperience).toBe(900);
    expect(track.attributes('aria-valuenow')).toBe('50');
    await track.get('[aria-label="Опыт"]').setValue('1200');
    expect(track.attributes('aria-valuenow')).toBe('100');
    // Clearing the hand-set value goes back to the rule for the level (300 at level 1).
    await track.get('[aria-label="Опыт до следующего уровня"]').setValue('0');
    expect(data.identity.nextLevelExperience).toBe(0);
    expect((track.get('[aria-label="Опыт до следующего уровня"]').element as HTMLInputElement).value).toBe('300');
    expect(track.attributes('aria-valuenow')).toBe('100');
  });

  it('takes the experience for the next level from the level, unless it was set by hand', async () => {
    const { data, wrapper } = mountSheet();
    const next = () => (wrapper.get('[aria-label="Опыт до следующего уровня"]').element as HTMLInputElement).value;
    expect(next()).toBe('300');
    data.identity.level = 5;
    await wrapper.vm.$nextTick();
    expect(next()).toBe('14000');
    data.identity.level = 20;
    await wrapper.vm.$nextTick();
    expect(next()).toBe('355000');
    // The rule's own number, typed in, is not stored - it must keep following the level.
    data.identity.level = 2;
    await wrapper.vm.$nextTick();
    await wrapper.get('[aria-label="Опыт до следующего уровня"]').setValue('900');
    expect(data.identity.nextLevelExperience).toBe(0);
    data.identity.level = 3;
    await wrapper.vm.$nextTick();
    expect(next()).toBe('2700');
    // A hand-set value stays through a level change.
    await wrapper.get('[aria-label="Опыт до следующего уровня"]').setValue('5000');
    data.identity.level = 4;
    await wrapper.vm.$nextTick();
    expect(next()).toBe('5000');
  });

  it('renders all 6 abilities, 18 skills and 4 sections', () => {
    const { wrapper } = mountSheet();
    expect(wrapper.findAll('.dnd-cs-ability')).toHaveLength(6);
    expect(wrapper.findAll('.dnd-cs-skills li')).toHaveLength(18);
    expect(wrapper.findAll('.dnd-cs-tabs button').map((b) => b.attributes('data-tab'))).toEqual(['main', 'equipment', 'spells', 'info']);
  });

  // Regression: the input @change handlers referenced a `$ev(...)` helper, but
  // Vue strips `$`-prefixed setup returns, so every text/number edit threw and
  // nothing saved. This drives the real @change path (not a button) and asserts
  // the model mutates AND `change` fires, which is what triggers the parent save.
  it('persists text/number input edits and emits change', async () => {
    const { data, wrapper } = mountSheet();
    const score = wrapper.get('.dnd-cs-ability-score');
    (score.element as HTMLInputElement).value = '18';
    await score.trigger('change');
    expect(data.abilities.strength.score).toBe(18);

    const equipTab = wrapper.get('.dnd-cs-tabs [data-tab="info"]');
    await equipTab.trigger('click');
    const traits = wrapper.get('.dnd-cs-tab-panel textarea');
    (traits.element as HTMLTextAreaElement).value = 'Храбрый';
    await traits.trigger('change');
    expect(data.personality.traits).toBe('Храбрый');

    expect(wrapper.emitted('change')).toBeTruthy();
  });

  it('adds and removes an attack and emits change', async () => {
    const { data, wrapper } = mountSheet();
    await wrapper.get('.dnd-cs-add').trigger('click'); // Attacks tab is default
    expect(data.attacks).toHaveLength(1);
    expect(wrapper.emitted('change')).toBeTruthy();
    await wrapper.get('.dnd-cs-attack-row .dnd-cs-row-remove').trigger('click');
    expect(data.attacks).toHaveLength(0);
  });

  it('switches tabs', async () => {
    const { data, wrapper } = mountSheet();
    const equipTab = wrapper.findAll('.dnd-cs-tabs button').find((b) => b.text() === 'Снаряжение')!;
    await equipTab.trigger('click');
    expect(data.activeTab).toBe('equipment');
    await wrapper.get('.dnd-cs-add').trigger('click');
    expect(data.equipment).toHaveLength(1);
  });

  it('clamps feature uses between 0 and max', async () => {
    const { data, wrapper } = mountSheet();
    // Features share the first section with the attacks.
    await wrapper.findAll('.dnd-cs-add').find((b) => b.text() === '+ Добавить умение')!.trigger('click');
    const feature = data.features[0]!;
    feature.maxUses = 2;
    feature.currentUses = 1;
    await wrapper.vm.$nextTick();
    const useBtns = wrapper.findAll('.dnd-cs-uses .dnd-cs-hp-btn');
    const minus = useBtns[0]!;
    const plus = useBtns[1]!;
    // Each click is a delta operation; applying them clamps to 0..max.
    let sheet = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
    const click = async (button: typeof plus) => {
      await button.trigger('click');
      const ops = wrapper.emitted('op') as [SheetOperation][];
      sheet = applySheetOperation(sheet, ops[ops.length - 1]![0]);
      return (sheet.features as Array<{ currentUses: number }>)[0]!.currentUses;
    };
    expect(await click(plus)).toBe(2);
    expect(await click(plus)).toBe(2); // clamped at max
    await click(minus);
    await click(minus);
    expect(await click(minus)).toBe(0); // clamped at 0
    expect(wrapper.emitted('op')![0]).toEqual([{ type: 'uses-change', itemId: feature.id, delta: 1 }]);
  });

  it('cycles a skill proficiency none → proficient → expertise → none', async () => {
    const { data, wrapper } = mountSheet();
    const pip = wrapper.get('.dnd-cs-skill-pip');
    await pip.trigger('click');
    const firstSkillKey = Object.keys(data.skills)[0]!;
    expect(data.skills[firstSkillKey]!.proficiency).toBe('proficient');
    await pip.trigger('click');
    expect(data.skills[firstSkillKey]!.proficiency).toBe('expertise');
    await pip.trigger('click');
    expect(data.skills[firstSkillKey]!.proficiency).toBe('none');
  });

  it('toggles inspiration', async () => {
    const { data, wrapper } = mountSheet();
    data.combat.currentHp = 5;
    await wrapper.vm.$nextTick();
    await wrapper.get('.dnd-cs-toggle').trigger('click');
    expect(data.combat.inspiration).toBe(true);
  });

  it('hides edit controls in readonly mode', () => {
    const data = reactive(createDndCharacterSheet());
    const wrapper = mount(DndCharacterSheet, { props: { data, readonly: true } });
    expect(wrapper.find('.dnd-cs-add').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Лечение"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Урон"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
