<template>
  <Teleport to="body">
    <div class="dnd-roll-log-backdrop" @click.self="emit('close')">
      <section class="dnd-roll-log" role="dialog" aria-modal="true" aria-label="Журнал бросков" @keydown.esc.prevent.stop="emit('close')">
        <header>
          <h2>Журнал бросков</h2>
          <button ref="closeButton" type="button" class="dnd-roll-log-close" aria-label="Закрыть журнал" @click="emit('close')">×</button>
        </header>
        <p v-if="!history.length" class="dnd-roll-log-empty">Бросков пока не было.</p>
        <ol v-else>
          <li v-for="roll in history" :key="roll.id" :class="{ 'is-crit': roll.natural === 'max', 'is-fumble': roll.natural === 'min' }">
            <div class="dnd-roll-log-head"><span>{{ ROLL_KIND_LABEL[roll.kind] }} · {{ roll.label }}<template v-if="roll.damageType"> · {{ roll.damageType }}</template></span><time>{{ time(roll.at) }}</time></div>
            <div class="dnd-roll-log-detail">{{ describeRoll(roll) }} = <strong>{{ roll.total }}</strong></div>
          </li>
        </ol>
        <p class="dnd-roll-log-note">Последние 30 бросков этой вкладки. Скоро броски можно будет отправлять в чат канваса.</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { describeRoll, ROLL_KIND_LABEL, type SheetRoll } from '../dnd/useSheetRolls';
import { useBackHandler } from '../composables/useBackHandler';

defineProps<{ history: SheetRoll[] }>();
const emit = defineEmits<{ close: [] }>();
const closeButton = ref<HTMLButtonElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
const time = (at: number) => new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
onMounted(() => closeButton.value?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
</script>

<style scoped>
.dnd-roll-log-backdrop { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.45); }
.dnd-roll-log { width:min(440px,100%); max-height:85dvh; overflow-y:auto; padding:18px; border-radius:16px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); color:var(--ui-text); box-shadow:var(--ui-glass-shadow); }
.dnd-roll-log header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.dnd-roll-log h2 { margin:0; font-size:18px; }
.dnd-roll-log-close { width:32px; height:32px; border:0; border-radius:999px; background:var(--ui-surface-subtle); color:var(--ui-text); font-size:18px; cursor:pointer; }
.dnd-roll-log ol { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.dnd-roll-log li { padding:8px 10px; border:1px solid var(--ui-border); border-radius:10px; background:var(--ui-surface-subtle); }
.dnd-roll-log li.is-crit { border-color:rgba(0,200,0,.6); }
.dnd-roll-log li.is-fumble { border-color:rgba(230,70,70,.6); }
.dnd-roll-log-head { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:var(--ui-text-secondary); }
.dnd-roll-log-head time { font-variant-numeric:tabular-nums; flex:none; }
.dnd-roll-log-detail { margin-top:3px; font-size:14px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.dnd-roll-log-detail strong { font-size:16px; }
.dnd-roll-log-empty, .dnd-roll-log-note { font-size:13px; color:var(--ui-text-secondary); }
.dnd-roll-log-note { margin:12px 0 0; }
</style>
