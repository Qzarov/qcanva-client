<template>
  <div class="dnd-weapon-fields" role="group" :aria-label="'Оружие: ' + (item.name || 'без названия')">
    <label class="dnd-weapon-wide">Урон
      <input :readonly="readonly" :value="weapon.damage" placeholder="1d8" aria-label="Кость урона" :class="{ invalid: !damageParse.ok }" @change="set('damage', text($event))" />
    </label>
    <label class="dnd-weapon-wide">Тип урона
      <input :readonly="readonly" :value="weapon.damageType" placeholder="рубящий" aria-label="Тип урона оружия" @change="set('damageType', text($event))" />
    </label>
    <label>Категория
      <DndSelect :value="weapon.category" :options="CATEGORY_OPTIONS" label="Категория оружия" :disabled="readonly" @change="set('category', $event === 'martial' ? 'martial' : 'simple')" />
    </label>
    <label>Магия +
      <input type="number" min="0" max="5" :readonly="readonly" :value="weapon.magicBonus" aria-label="Магический бонус" @change="set('magicBonus', Math.max(0, Math.min(5, Number(text($event)) || 0)))" />
    </label>
    <label class="dnd-weapon-check"><input type="checkbox" :disabled="readonly" :checked="weapon.finesse" aria-label="Фехтовальное" @change="set('finesse', checked($event))" /> Фехтовальное</label>
    <label class="dnd-weapon-check"><input type="checkbox" :disabled="readonly" :checked="weapon.ranged" aria-label="Дальнобойное" @change="set('ranged', checked($event))" /> Дальнобойное</label>
    <label class="dnd-weapon-wide">Двумя руками (универсальное)
      <input :readonly="readonly" :value="weapon.versatile" placeholder="например 1d10" aria-label="Урон двумя руками" :class="{ invalid: Boolean(weapon.versatile.trim()) && !versatileParse.ok }" @change="set('versatile', text($event))" />
    </label>
    <label>Попадание вручную
      <input type="number" :readonly="readonly" :value="weapon.attackBonusOverride ?? ''" :placeholder="'авто ' + autoAttack" aria-label="Бонус попадания вручную" @change="set('attackBonusOverride', optionalNumber($event))" />
    </label>
    <label>Бонус урона вручную
      <input type="number" :readonly="readonly" :value="weapon.damageBonusOverride ?? ''" :placeholder="'авто ' + autoDamage" aria-label="Бонус урона вручную" @change="set('damageBonusOverride', optionalNumber($event))" />
    </label>
    <p v-if="!damageParse.ok || (weapon.versatile.trim() && !versatileParse.ok)" class="dnd-weapon-error" role="status">
      {{ (!damageParse.ok ? damageParse : versatileParse as { reason: string }).reason }} {{ FORMULA_HINT }}
    </p>
    <p class="dnd-weapon-summary">{{ summary }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FORMULA_HINT, formatSigned, parseFormula } from '../dnd/dice';
import type { DndCharacterSheetData, DndListItem } from '../dnd/characterSheet';
import { automaticWeaponAttack, normalizeWeapon, weaponAttack, type DndWeapon } from '../dnd/weapons';
import DndSelect from './DndSelect.vue';

const CATEGORY_OPTIONS = [{ value: 'simple', label: 'Простое' }, { value: 'martial', label: 'Воинское' }];

const props = defineProps<{ item: DndListItem; sheet: DndCharacterSheetData; readonly?: boolean }>();
const emit = defineEmits<{ change: [] }>();

const weapon = computed(() => normalizeWeapon((props.item as { weapon?: unknown }).weapon));
const damageParse = computed(() => parseFormula(weapon.value.damage));
const versatileParse = computed(() => parseFormula(weapon.value.versatile));
const attack = computed(() => weaponAttack(props.sheet, props.item));
const automatic = computed(() => automaticWeaponAttack(props.sheet, props.item));
const autoAttack = computed(() => formatSigned(automatic.value.attackBonus));
const autoDamage = computed(() => formatSigned(automatic.value.damageBonus));
const summary = computed(() => {
  const a = attack.value;
  const parts = [`Атака ${formatSigned(a.attackBonus)} (${a.abilityLabel}${a.proficient ? ', владение' : ', без владения'})`];
  for (const entry of a.damage) if (entry.formula.ok) parts.push(`${entry.label.toLowerCase()} ${entry.formula.text}`);
  return parts.join(' · ');
});

const text = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
const optionalNumber = (event: Event) => {
  const value = text(event).trim();
  return value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
};
const set = <K extends keyof DndWeapon>(key: K, value: DndWeapon[K]) => {
  const target = props.item as DndListItem & { weapon?: DndWeapon };
  target.weapon = { ...weapon.value, [key]: value };
  emit('change');
};
</script>

<style scoped>
.dnd-weapon-fields { grid-column:1 / -1; display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px 8px; padding:8px; border-radius:10px; background:rgba(var(--dnd-fill-rgb, 255, 255, 255), .03); border:1px dashed var(--dnd-glass-border); }
.dnd-weapon-fields label { display:flex; flex-direction:column; gap:3px; min-width:0; font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:var(--dnd-text-dim); }
.dnd-weapon-fields .dnd-weapon-wide { grid-column:span 2; }
.dnd-weapon-fields .dnd-weapon-check { flex-direction:row; align-items:center; gap:6px; font-size:12px; text-transform:none; letter-spacing:0; color:var(--ui-text); }
/* Child component: the sheet's scoped input styles do not reach here. */
.dnd-weapon-fields input:not([type='checkbox']), .dnd-weapon-fields select { width:100%; min-width:0; box-sizing:border-box; padding:5px 7px; border:1px solid var(--dnd-glass-border); border-radius:8px; background:rgba(var(--dnd-fill-rgb, 255, 255, 255), .045); color:var(--ui-text); font:inherit; font-size:13px; text-transform:none; letter-spacing:0; }
.dnd-weapon-fields input:not([type='checkbox']):focus, .dnd-weapon-fields select:focus { outline:none; border-color:color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent); box-shadow:0 0 0 3px var(--dnd-glass-accent-soft); }
.dnd-weapon-fields input[readonly], .dnd-weapon-fields select:disabled { background:transparent; }
.dnd-weapon-fields select option { background:var(--ui-surface-solid); color:var(--ui-text); }
.dnd-weapon-fields input.invalid { border-color:var(--ui-danger-foreground); }
.dnd-weapon-fields .dnd-select { display:flex; width:100%; font-size:13px; }
.dnd-weapon-error { grid-column:1 / -1; margin:0; font-size:12px; color:var(--ui-danger-foreground); }
.dnd-weapon-summary { grid-column:1 / -1; margin:0; font-size:12px; color:var(--dnd-text-dim); font-variant-numeric:tabular-nums; }
@media (max-width:760px) {
  .dnd-weapon-fields { grid-template-columns:repeat(2, minmax(0,1fr)); }
}
</style>
