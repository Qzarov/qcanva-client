<template>
  <Teleport to="body">
    <div class="dnd-catalog-backdrop" @click.self="emit('close')">
      <section class="dnd-catalog" role="dialog" aria-modal="true" aria-label="Добавить в снаряжение">
        <header>
          <h2>Добавить в снаряжение</h2>
          <button ref="closeButton" type="button" class="dnd-catalog-close" aria-label="Закрыть" @click="emit('close')">×</button>
        </header>
        <div class="dnd-catalog-custom">
          <button type="button" @click="emit('custom', 'item')">+ Свой предмет</button>
          <button type="button" @click="emit('custom', 'weapon')">+ Своё оружие</button>
        </div>
        <input ref="search" v-model="query" type="search" class="dnd-catalog-search" placeholder="Поиск: меч, факел, зелье…" aria-label="Поиск предмета" autocomplete="off" />
        <div class="dnd-catalog-filters" role="group" aria-label="Что показывать">
          <button v-for="option in filters" :key="option.key ?? 'all'" type="button" :class="{ on: category === option.key }" :aria-pressed="category === option.key" @click="category = option.key">{{ option.label }}</button>
        </div>
        <p v-if="!groups.length" class="dnd-catalog-empty">Ничего не нашлось. Добавьте свой предмет кнопкой выше.</p>
        <section v-for="group in groups" :key="group.title" class="dnd-catalog-group">
          <h3>{{ group.title }}</h3>
          <button v-for="item in group.items" :key="item.key" type="button" class="dnd-catalog-item" :aria-label="'Добавить: ' + item.name" @click="emit('pick', item)">
            <span class="dnd-catalog-name">{{ item.name }}</span>
            <span class="dnd-catalog-mark">{{ added.get(item.key) ? 'в листе ×' + added.get(item.key) : '+ добавить' }}</span>
            <span v-if="item.facts || item.description" class="dnd-catalog-props">{{ [item.facts, item.description].filter(Boolean).join(' · ') }}</span>
          </button>
        </section>
        <p class="dnd-catalog-note">Вещи «Книги игрока» D&amp;D 5e. Повторное нажатие прибавляет количество, набор кладёт своё содержимое. Добавленное можно поправить в снаряжении; надетый доспех КД не меняет — КД задаётся в листе.</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ITEM_CATEGORIES, searchItemCatalog, type CatalogItem, type ItemCategory } from '../dnd/itemCatalog';
import { useBackHandler } from '../composables/useBackHandler';
import { isCoarsePointer } from '../composables/pointer';

/**
 * The one way to add to the equipment: catalog items under filter chips,
 * or a blank item or weapon of one's own. Picking keeps the dialog open,
 * since a backpack is filled several things at a time.
 */
const props = withDefaults(defineProps<{ added?: Map<string, number> }>(), { added: () => new Map() });
const emit = defineEmits<{ close: []; pick: [item: CatalogItem]; custom: [kind: 'item' | 'weapon'] }>();
const query = ref('');
const category = ref<ItemCategory | null>(null);
const filters = [{ key: null, label: 'Все' }, ...ITEM_CATEGORIES];
const groups = computed(() => searchItemCatalog(query.value, category.value));
const added = computed(() => props.added);
// Escape is heard on the document, so it closes the dialog wherever the focus is.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  emit('close');
};
const search = ref<HTMLInputElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => {
  document.addEventListener('keydown', onKeydown, true);
  // On a touch screen focusing the search would raise the keyboard over the list.
  (isCoarsePointer() ? closeButton.value : search.value)?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  if (previousFocus?.isConnected) previousFocus.focus();
});
useBackHandler(() => { emit('close'); return true; });
</script>

<style scoped>
.dnd-catalog-backdrop { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.45); }
.dnd-catalog { width:min(560px,100%); height:min(720px,90dvh); overflow-y:auto; padding:18px; border-radius:16px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); color:var(--ui-text); box-shadow:var(--ui-glass-shadow); box-sizing:border-box; }
.dnd-catalog header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.dnd-catalog h2 { margin:0; font-size:18px; }
.dnd-catalog-close { width:36px; height:36px; border:0; border-radius:999px; background:var(--ui-surface-subtle); color:var(--ui-text); font-size:18px; cursor:pointer; }
.dnd-catalog-custom { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.dnd-catalog-custom button { min-height:40px; padding:6px 10px; border:1px dashed var(--ui-border); border-radius:12px; background:transparent; color:var(--ui-text); font:inherit; font-size:13px; cursor:pointer; }
.dnd-catalog-custom button:hover, .dnd-catalog-custom button:focus-visible { border-style:solid; background:var(--ui-surface-subtle); }
.dnd-catalog-search { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--ui-border); border-radius:10px; background:var(--ui-surface-subtle); color:var(--ui-text); font:inherit; }
.dnd-catalog-filters { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.dnd-catalog-filters button { min-height:32px; padding:4px 12px; border:1px solid var(--ui-border); border-radius:999px; background:transparent; color:var(--ui-text-secondary); font:inherit; font-size:12px; cursor:pointer; }
.dnd-catalog-filters button.on { border-color:var(--ui-glass-accent-border); background:var(--ui-glass-accent-bg); color:var(--ui-glass-accent-text); }
.dnd-catalog-group h3 { margin:14px 0 6px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-text-secondary); }
.dnd-catalog-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 10px; width:100%; min-height:44px; padding:8px 10px; border:0; border-radius:10px; background:transparent; color:var(--ui-text); font:inherit; text-align:left; cursor:pointer; }
.dnd-catalog-item:hover, .dnd-catalog-item:focus-visible { background:var(--ui-surface-subtle); }
.dnd-catalog-name { font-weight:600; overflow-wrap:anywhere; }
.dnd-catalog-mark { font-size:12px; color:var(--ui-text-secondary); white-space:nowrap; }
.dnd-catalog-props { grid-column:1 / -1; font-size:12px; color:var(--ui-text-secondary); }
.dnd-catalog-empty, .dnd-catalog-note { font-size:13px; color:var(--ui-text-secondary); }
.dnd-catalog-note { margin:14px 0 0; }
@media (max-width:760px) {
  .dnd-catalog-custom button, .dnd-catalog-filters button { min-height:44px; }
}
</style>
