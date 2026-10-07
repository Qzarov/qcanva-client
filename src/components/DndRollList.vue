<template>
  <p v-if="!history.length" class="dnd-roll-list-empty">Бросков пока не было.</p>
  <ol v-else class="dnd-roll-list">
    <li v-for="roll in history" :key="roll.id" :class="{ 'is-crit': roll.natural === 'max', 'is-fumble': roll.natural === 'min' }">
      <div class="dnd-roll-log-head"><span>{{ ROLL_KIND_LABEL[roll.kind] }}<template v-if="roll.label"> · {{ roll.label }}</template><template v-if="roll.damageType"> · {{ roll.damageType }}</template></span><time>{{ time(roll.at) }}</time></div>
      <div class="dnd-roll-log-detail">{{ describeRoll(roll) }} = <strong>{{ roll.total }}</strong></div>
      <div v-if="awaitsDamage(roll)" class="dnd-roll-log-actions">
        <button v-for="(option, index) in roll.damage" :key="index" type="button" @click="emit('damage', roll.id, index)">
          {{ roll.natural === 'max' ? 'Крит' : 'Урон' }}{{ roll.damage!.length > 1 ? ' · ' + option.label.toLowerCase() : '' }}: {{ option.formula.text }}
        </button>
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { awaitsDamage, describeRoll, ROLL_KIND_LABEL, type SheetRoll } from '../dnd/useSheetRolls';

/**
 * The rolls of this tab, newest first: what was rolled, the dice, the total,
 * and - for an attack still waiting for it - the damage to roll. Shown in the
 * sheet's history panel, and in the sheet's own log where there is no panel.
 */
defineProps<{ history: SheetRoll[] }>();
const emit = defineEmits<{ damage: [rollId: string, option: number] }>();
const time = (at: number) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
</script>

<style scoped>
.dnd-roll-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.dnd-roll-list li { padding: 8px 10px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface-subtle); }
.dnd-roll-list li.is-crit { border-color: var(--ui-glass-accent-border); }
.dnd-roll-list li.is-fumble { border-color: color-mix(in srgb, var(--ui-danger-foreground) 60%, transparent); }
.dnd-roll-log-head { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ui-text-secondary); }
.dnd-roll-log-head time { font-variant-numeric: tabular-nums; flex: none; }
.dnd-roll-log-detail { margin-top: 3px; font-size: 14px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.dnd-roll-log-detail strong { font-size: 16px; }
.dnd-roll-log-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.dnd-roll-log-actions button { padding: 5px 9px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-solid); color: var(--ui-text); font: inherit; font-size: 12px; cursor: pointer; }
.dnd-roll-list-empty { margin: 0; font-size: 13px; color: var(--ui-text-secondary); }
</style>
