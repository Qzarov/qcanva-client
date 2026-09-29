// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';
import DndCharacterSheet from './DndCharacterSheet.vue';
import { createDndCharacterSheet } from '../dnd/characterSheet';

const mountSheet = () => {
  const data = reactive(createDndCharacterSheet());
  const wrapper = mount(DndCharacterSheet, { props: { data, readonly: false } });
  return { data, wrapper };
};

describe('DndCharacterSheet interactions', () => {
  it('renders all 6 abilities, 18 skills and 7 tabs', () => {
    const { wrapper } = mountSheet();
    expect(wrapper.findAll('.dnd-cs-ability')).toHaveLength(6);
    expect(wrapper.findAll('.dnd-cs-skills li')).toHaveLength(18);
    expect(wrapper.findAll('.dnd-cs-tabs button')).toHaveLength(7);
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
    const featuresTab = wrapper.findAll('.dnd-cs-tabs button').find((b) => b.text() === 'Умения')!;
    await featuresTab.trigger('click');
    await wrapper.get('.dnd-cs-add').trigger('click');
    const feature = data.features[0]!;
    feature.maxUses = 2;
    feature.currentUses = 1;
    await wrapper.vm.$nextTick();
    const useBtns = wrapper.findAll('.dnd-cs-uses .dnd-cs-hp-btn');
    const minus = useBtns[0]!;
    const plus = useBtns[1]!;
    await plus.trigger('click');
    expect(feature.currentUses).toBe(2);
    await plus.trigger('click'); // clamped at max
    expect(feature.currentUses).toBe(2);
    await minus.trigger('click');
    await minus.trigger('click');
    await minus.trigger('click'); // clamped at 0
    expect(feature.currentUses).toBe(0);
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

  it('quick-changes HP and toggles inspiration', async () => {
    const { data, wrapper } = mountSheet();
    data.combat.currentHp = 5;
    await wrapper.vm.$nextTick();
    const hpBtns = wrapper.findAll('.dnd-cs-hp .dnd-cs-hp-btn');
    await hpBtns[1]!.trigger('click'); // +
    expect(data.combat.currentHp).toBe(6);
    await wrapper.get('.dnd-cs-toggle').trigger('click');
    expect(data.combat.inspiration).toBe(true);
  });

  it('hides edit controls in readonly mode', () => {
    const data = reactive(createDndCharacterSheet());
    const wrapper = mount(DndCharacterSheet, { props: { data, readonly: true } });
    expect(wrapper.find('.dnd-cs-add').exists()).toBe(false);
  });
});
