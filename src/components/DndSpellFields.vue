<template>
  <div class="dnd-spell-fields" role="group" :aria-label="'Параметры заклинания: ' + (item.name || 'без названия')">
    <label class="dnd-spell-wide">Бросок
      <DndSelect :value="rollKind" :options="SPELL_ROLL_OPTIONS" label="Бросок заклинания" :disabled="readonly" @change="set('rollKind', $event)" />
    </label>
    <label v-if="rollKind === 'save'" class="dnd-spell-wide">Спасбросок
      <DndSelect :value="saveAbility" :options="saveOptions" label="Характеристика спасброска" :disabled="readonly" @change="set('saveAbility', $event)" />
    </label>
    <label class="dnd-spell-wide">Урон или лечение
      <input :readonly="readonly" :value="item.damage || ''" placeholder="например 3d6" aria-label="Формула заклинания" :class="{ invalid: invalidDamage }" @change="set('damage', text($event))" />
    </label>
    <label class="dnd-spell-wide">Тип урона
      <input :readonly="readonly" :value="item.damageType || ''" placeholder="огонь" aria-label="Тип урона заклинания" @change="set('damageType', text($event))" />
    </label>
    <p v-if="invalidDamage" class="dnd-spell-error" role="status">{{ (damageParse as { reason: string }).reason }} {{ FORMULA_HINT }}</p>
    <p v-else-if="needsAbility" class="dnd-spell-error" role="status">Выберите заклинательную характеристику — без неё не посчитать {{ rollKind === 'save' ? 'Сл спасброска' : 'бонус атаки' }}.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FORMULA_HINT, parseFormula } from '../dnd/dice';
import { DND_ABILITIES, type DndListItem } from '../dnd/characterSheet';
import { SPELL_ROLL_OPTIONS, spellRollKind, spellSaveAbility } from '../dnd/spells';
import DndSelect from './DndSelect.vue';

const saveOptions = [{ value: '', label: '—' }, ...DND_ABILITIES.map((ability) => ({ value: ability.key as string, label: ability.label as string }))];

/** How one spell is rolled: attack or save, and the damage (or healing) formula. */
const props = defineProps<{ item: DndListItem; hasAbility: boolean; readonly?: boolean }>();
const emit = defineEmits<{ change: [] }>();

const rollKind = computed(() => spellRollKind(props.item));
const saveAbility = computed(() => spellSaveAbility(props.item));
const damageParse = computed(() => parseFormula(props.item.damage || ''));
const invalidDamage = computed(() => Boolean(props.item.damage?.trim()) && !damageParse.value.ok);
const needsAbility = computed(() => Boolean(rollKind.value) && !props.hasAbility);

const text = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;
const set = (key: 'rollKind' | 'saveAbility' | 'damage' | 'damageType', value: string) => {
  (props.item as Record<string, unknown>)[key] = value;
  emit('change');
};
</script>

<style scoped>
.dnd-spell-fields { grid-column:1 / -1; display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px 8px; padding:8px; border-radius:10px; background:rgba(var(--dnd-fill-rgb, 255, 255, 255), .03); border:1px dashed var(--dnd-glass-border); }
.dnd-spell-fields label { display:flex; flex-direction:column; gap:3px; min-width:0; font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:var(--dnd-text-dim); }
.dnd-spell-fields .dnd-spell-wide { grid-column:span 2; }
/* Child component: the sheet's scoped input styles do not reach here. */
.dnd-spell-fields input, .dnd-spell-fields select { width:100%; min-width:0; box-sizing:border-box; padding:5px 7px; border:1px solid var(--dnd-glass-border); border-radius:8px; background:rgba(var(--dnd-fill-rgb, 255, 255, 255), .045); color:var(--ui-text); font:inherit; font-size:13px; text-transform:none; letter-spacing:0; }
.dnd-spell-fields input:focus, .dnd-spell-fields select:focus { outline:none; border-color:color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent); box-shadow:0 0 0 3px var(--dnd-glass-accent-soft); }
.dnd-spell-fields input[readonly], .dnd-spell-fields select:disabled { background:transparent; }
.dnd-spell-fields select option { background:var(--ui-surface-solid); color:var(--ui-text); }
.dnd-spell-fields input.invalid { border-color:var(--ui-danger-foreground); }
.dnd-spell-fields .dnd-select { display:flex; width:100%; font-size:13px; }
.dnd-spell-error { grid-column:1 / -1; margin:0; font-size:12px; color:var(--ui-danger-foreground); }
@media (max-width:760px) {
  .dnd-spell-fields { grid-template-columns:repeat(2, minmax(0,1fr)); }
}
</style>
