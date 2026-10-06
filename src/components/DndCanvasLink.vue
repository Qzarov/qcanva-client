<template>
  <button v-if="canvasId || !readonly" ref="trigger" type="button" class="dnd-link-button" :class="{ 'is-on': state === 'ok', 'is-warning': warning }" :aria-label="buttonHint" :title="buttonHint" aria-haspopup="dialog" @click="open = true">
    <span class="dnd-link-dot" aria-hidden="true"></span>
    <span class="dnd-link-text">{{ buttonText }}</span>
  </button>
  <Teleport to="body">
    <div v-if="open" class="dnd-link-backdrop" @click.self="close">
      <section class="dnd-link-dialog" role="dialog" aria-modal="true" aria-label="Канвас для бросков">
        <header>
          <h2>Канвас для бросков</h2>
          <button ref="closeButton" type="button" class="dnd-link-close" aria-label="Закрыть" @click="close">×</button>
        </header>

        <p class="dnd-link-status" :class="{ 'is-warning': warning }" role="status">{{ statusText }}</p>
        <div v-if="canvasId" class="dnd-link-current">
          <RouterLink v-if="state === 'ok' || state === 'plugin_disabled'" class="btn-ghost" :to="{ name: 'canvas', params: { id: canvasId } }">Открыть канвас</RouterLink>
          <button v-if="!readonly" type="button" class="btn-ghost dnd-link-unlink" @click="unlink">Отключить</button>
        </div>

        <template v-if="!readonly">
          <input ref="search" v-model="query" type="search" class="dnd-link-search" placeholder="Поиск канваса" aria-label="Поиск канваса" autocomplete="off" />
          <p v-if="loading" class="dnd-link-empty" role="status">Загружаем канвасы…</p>
          <p v-else-if="failed" class="dnd-link-empty" role="alert">Не удалось загрузить список канвасов.</p>
          <p v-else-if="!matches.length" class="dnd-link-empty">{{ canvases.length ? 'Ничего не нашлось.' : 'Нет канвасов, которые вы можете редактировать.' }}</p>
          <ul v-else class="dnd-link-list">
            <li v-for="item in matches" :key="item.id">
              <button type="button" class="dnd-link-item" :class="{ 'is-current': item.id === canvasId }" :aria-disabled="item.id === canvasId" :aria-label="(item.id === canvasId ? 'Подключён: ' : 'Подключить: ') + item.title" @click="pick(item.id)">
                <span class="dnd-link-item-title">{{ item.title }}</span>
                <span class="dnd-link-item-mark">{{ item.id === canvasId ? 'подключён' : item.own ? 'мой' : 'общий' }}</span>
              </button>
            </li>
          </ul>
        </template>
        <p class="dnd-link-note">Пока персонаж подключён, кости бросает сервер, а бросок появляется в чате канваса от вашего имени. Для этого нужен доступ на редактирование канваса и включённый на нём плагин «Кубики» или «Интерактивные шаблоны».</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { canvas as canvasApi } from '../api/client';
import type { RollTarget } from '../composables/useCharacterSheetSocket';
import { registerBackHandler } from '../composables/useBackHandler';

/**
 * Connects a character to a canvas, so its rolls go to that canvas's chat.
 * The button in the page header says where rolls go now; the dialog explains
 * it and lets an editor of the sheet pick another canvas or disconnect.
 */
const props = defineProps<{ canvasId: string; target: RollTarget | null; readonly: boolean }>();
const emit = defineEmits<{ link: [canvasId: string]; unlink: [] }>();

type State = 'none' | 'checking' | RollTarget['status'];
const state = computed<State>(() => {
  if (!props.canvasId) return 'none';
  // An answer about another canvas is stale: the connection has just changed.
  if (!props.target || (props.target.canvasId && props.target.canvasId !== props.canvasId)) return 'checking';
  return props.target.status === 'not_linked' ? 'checking' : props.target.status;
});
const warning = computed(() => state.value === 'forbidden' || state.value === 'plugin_disabled' || state.value === 'canvas_missing');
const title = computed(() => props.target?.title?.trim() || 'канвас');

const buttonText = computed(() => {
  if (state.value === 'none') return 'Подключить канвас';
  if (state.value === 'ok') return title.value;
  if (state.value === 'checking') return 'Канвас…';
  return 'Броски только у вас';
});
const buttonHint = computed(() => {
  if (state.value === 'none') return 'Подключить персонажа к канвасу: броски пойдут в его чат';
  if (state.value === 'ok') return `Броски уходят в чат канваса «${title.value}»`;
  if (state.value === 'checking') return 'Проверяем подключение к канвасу';
  return 'Броски не попадают в чат канваса — нажмите, чтобы узнать почему';
});
const statusText = computed(() => {
  switch (state.value) {
    case 'none': return 'Персонаж не подключён к канвасу. Броски видите только вы.';
    case 'checking': return 'Проверяем подключение…';
    case 'ok': return `Броски уходят в чат канваса «${title.value}».`;
    case 'forbidden': return 'У вас нет права писать в чат подключённого канваса: нужен доступ на редактирование. Ваши броски видите только вы.';
    case 'plugin_disabled': return `На канвасе «${title.value}» выключены кубики. Владелец канваса может включить плагин «Кубики» или «Интерактивные шаблоны». Пока броски видите только вы.`;
    default: return 'Подключённый канвас удалён или недоступен. Броски видите только вы.';
  }
});

const open = ref(false);
const query = ref('');
const loading = ref(false);
const failed = ref(false);
const canvases = ref<Array<{ id: string; title: string; own: boolean }>>([]);
const normalize = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е');
const matches = computed(() => {
  const needle = normalize(query.value.trim());
  return needle ? canvases.value.filter((item) => normalize(item.title).includes(needle)) : canvases.value;
});

const trigger = ref<HTMLButtonElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const search = ref<HTMLInputElement | null>(null);

const load = async () => {
  loading.value = true;
  failed.value = false;
  try {
    const list = await canvasApi.list();
    const entry = (item: any, own: boolean) => ({ id: String(item.id), title: String(item.title || 'Без названия'), own });
    canvases.value = [
      ...(list.own || []).map((item) => entry(item, true)),
      // Posting to a chat needs edit access; read-only canvases are not offered.
      ...(list.shared || []).filter((item) => item.role === 'edit').map((item) => entry(item, false)),
    ];
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
};

const close = () => { open.value = false; };
const pick = (id: string) => {
  if (id === props.canvasId) return;
  emit('link', id);
  close();
};
const unlink = () => { emit('unlink'); close(); };

// Escape is heard on the document, so it closes the dialog wherever the focus is.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  close();
};
let unregisterBack: (() => void) | null = null;
const release = () => {
  document.removeEventListener('keydown', onKeydown, true);
  unregisterBack?.();
  unregisterBack = null;
};
watch(open, async (value) => {
  if (!value) {
    release();
    trigger.value?.focus();
    return;
  }
  document.addEventListener('keydown', onKeydown, true);
  unregisterBack = registerBackHandler(() => { close(); return true; });
  query.value = '';
  if (!props.readonly) void load();
  await nextTick();
  (search.value ?? closeButton.value)?.focus();
});
watch(() => props.readonly, (value) => { if (value && !props.canvasId) close(); });
onBeforeUnmount(release);
</script>

<style scoped>
/* The header button: the same glass pill as the back button and the account menu next to it. */
.dnd-link-button { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: min(240px, 42vw); height: 36px; padding: 0 12px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text-secondary); font: inherit; font-size: 13px; cursor: pointer; transition: border-color 150ms ease, color 150ms ease; }
.dnd-link-button:hover, .dnd-link-button:focus-visible { color: var(--ui-text); border-color: var(--ui-glass-accent-border); }
.dnd-link-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.dnd-link-button.is-on { color: var(--ui-text); }
.dnd-link-button.is-warning { color: var(--ui-danger-foreground); }
.dnd-link-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid currentColor; box-sizing: border-box; }
.dnd-link-button.is-on .dnd-link-dot { border-color: var(--ui-glass-accent-text); background: var(--ui-glass-accent-text); }
.dnd-link-button.is-warning .dnd-link-dot { background: currentColor; }
.dnd-link-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dnd-link-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.45); }
.dnd-link-dialog { width: min(480px, 100%); max-height: 85dvh; overflow-y: auto; box-sizing: border-box; padding: 18px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.dnd-link-dialog header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dnd-link-dialog h2 { margin: 0; font-size: 18px; }
.dnd-link-close { width: 36px; height: 36px; border: 0; border-radius: 999px; background: var(--ui-surface-subtle); color: var(--ui-text); font-size: 18px; cursor: pointer; }
.dnd-link-status { margin: 0 0 10px; font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
.dnd-link-status.is-warning { color: var(--ui-danger-foreground); }
.dnd-link-current { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
/* width:auto - the app's phone rule stretches .btn-ghost to 100%. */
.dnd-link-current :is(a, button) { display: inline-flex; align-items: center; justify-content: center; width: auto; min-width: 96px; text-decoration: none; }
.dnd-link-search { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface-subtle); color: var(--ui-text); font: inherit; }
.dnd-link-list { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 2px; }
.dnd-link-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ui-text); font: inherit; text-align: left; cursor: pointer; }
.dnd-link-item:hover:not(.is-current), .dnd-link-item:focus-visible { background: var(--ui-surface-subtle); }
.dnd-link-item.is-current { cursor: default; background: var(--ui-glass-accent-bg); }
.dnd-link-item-title { font-weight: 600; overflow-wrap: anywhere; }
.dnd-link-item-mark { font-size: 12px; color: var(--ui-text-secondary); white-space: nowrap; }
.dnd-link-empty, .dnd-link-note { font-size: 13px; color: var(--ui-text-secondary); }
.dnd-link-empty { margin: 10px 0 0; }
.dnd-link-note { margin: 14px 0 0; line-height: 1.4; }
@media (max-width: 760px) {
  .dnd-link-button { max-width: 38vw; padding: 0 10px; font-size: 12px; }
}
</style>
