<template>
  <div ref="root" class="dnd-roll-bar">
    <div class="dnd-roll-mode" role="group" aria-label="Режим следующего броска d20">
      <button v-for="option in modes" :key="option.key" type="button" :class="{ on: mode === option.key }" :aria-pressed="mode === option.key" :title="option.title" @click="emit('set-mode', option.key)">{{ option.label }}</button>
    </div>
    <button type="button" class="dnd-roll-attack" :disabled="!weapons.length" :title="weapons.length ? 'Атака экипированным оружием' : 'Нет экипированного оружия'" :aria-expanded="weapons.length > 1 ? Boolean(open) : undefined" @click="attack">⚔ Атака</button>
    <button type="button" class="dnd-roll-log-button" :aria-label="'Журнал бросков: ' + historyCount" @click="emit('open-log')">Журнал<span v-if="historyCount"> · {{ historyCount }}</span></button>
    <Teleport to="body">
      <div v-if="open" ref="popup" class="dnd-roll-weapon-menu" role="menu" aria-label="Чем атаковать" :style="menuStyle">
        <button v-for="weapon in weapons" :key="weapon.itemId" type="button" role="menuitem" @click="choose(weapon)">
          {{ weapon.name }} <b>{{ formatSigned(weapon.attackBonus) }}</b>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { formatSigned, type RollMode } from '../dnd/dice';
import type { WeaponAttack } from '../dnd/weapons';
import { useSheetPopup } from '../composables/useSheetPopup';

const props = defineProps<{ mode: RollMode; weapons: WeaponAttack[]; historyCount: number }>();
const emit = defineEmits<{ 'set-mode': [mode: RollMode]; attack: [weapon: WeaponAttack]; 'open-log': [] }>();

const modes: Array<{ key: RollMode; label: string; title: string }> = [
  { key: 'advantage', label: 'Преим.', title: 'Преимущество на следующий бросок d20: два кубика, берётся больший' },
  { key: 'disadvantage', label: 'Помеха', title: 'Помеха на следующий бросок d20: два кубика, берётся меньший' },
];

const { root, popup, open, toggle, close } = useSheetPopup();
const anchor = ref<DOMRect | null>(null);
const menuStyle = computed(() => anchor.value
  ? { left: `${Math.max(12, Math.min(window.innerWidth - 232, anchor.value.left))}px`, top: `${anchor.value.bottom + 6}px` }
  : { visibility: 'hidden' as const });

const attack = (event: Event) => {
  if (props.weapons.length === 1) emit('attack', props.weapons[0]!);
  else if (props.weapons.length > 1) {
    anchor.value = (event.currentTarget as HTMLElement).getBoundingClientRect();
    toggle('weapons', event);
  }
};
const choose = (weapon: WeaponAttack) => { close(true); emit('attack', weapon); };
watch(open, async (value) => { if (value) { await nextTick(); popup.value?.querySelector<HTMLElement>('button')?.focus(); } });
</script>

<style scoped>
.dnd-roll-bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.dnd-roll-mode { display:inline-flex; border:1px solid var(--dnd-glass-border); border-radius:999px; overflow:hidden; }
.dnd-roll-mode button { padding:6px 10px; border:0; background:transparent; color:var(--dnd-text-dim); font:inherit; font-size:12px; cursor:pointer; }
.dnd-roll-mode button + button { border-left:1px solid var(--dnd-glass-border); }
.dnd-roll-mode button.on { background:var(--dnd-glass-accent-soft); color:var(--ui-text); box-shadow:inset 0 0 0 1px var(--dnd-glass-accent); }
.dnd-roll-attack, .dnd-roll-log-button { padding:7px 12px; border:1px solid var(--dnd-glass-border); border-radius:8px; background:var(--dnd-glass-accent-soft); color:var(--ui-text); font:inherit; font-size:12px; cursor:pointer; }
.dnd-roll-attack { margin-left:auto; border-color:var(--dnd-glass-accent); font-weight:700; }
.dnd-roll-attack:disabled { opacity:.45; cursor:default; }
.dnd-roll-log-button { background:transparent; }
.dnd-roll-weapon-menu { position:fixed; z-index:1000; display:grid; gap:4px; width:220px; padding:6px; border-radius:12px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); box-shadow:var(--ui-glass-shadow); }
.dnd-roll-weapon-menu button { display:flex; justify-content:space-between; gap:8px; padding:8px 10px; border:0; border-radius:8px; background:transparent; color:var(--ui-text); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
.dnd-roll-weapon-menu button:hover, .dnd-roll-weapon-menu button:focus-visible { background:var(--ui-surface-subtle); }
</style>
