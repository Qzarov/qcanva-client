<template>
  <Teleport to="body">
    <div class="dnd-spellbook-backdrop" @click.self="emit('close')">
      <section class="dnd-spellbook" role="dialog" aria-modal="true" aria-label="Заклинания из списка">
        <header>
          <h2>Заклинания из списка</h2>
          <button type="button" class="dnd-spellbook-close" aria-label="Закрыть список заклинаний" @click="emit('close')">×</button>
        </header>
        <input ref="search" v-model="query" type="search" class="dnd-spellbook-search" placeholder="Поиск: огненный шар, fireball, иллюзия…" aria-label="Поиск заклинания" autocomplete="off" />
        <div class="dnd-spellbook-levels" role="group" aria-label="Уровень заклинания">
          <button v-for="option in levelOptions" :key="String(option.value)" type="button" :class="{ on: level === option.value }" :aria-pressed="level === option.value" @click="level = option.value">{{ option.label }}</button>
        </div>
        <label v-if="caster" class="dnd-spellbook-only">
          <input v-model="onlyAvailable" type="checkbox" /> Только доступные: {{ caster.label }}, {{ availableText }}
        </label>
        <p v-if="loading" class="dnd-spellbook-empty" role="status">Загружаем список…</p>
        <p v-else-if="failed" class="dnd-spellbook-empty" role="alert">Не удалось загрузить список. Заклинание можно добавить вручную.</p>
        <p v-else-if="!groups.length" class="dnd-spellbook-empty">Ничего не нашлось. Заклинание можно добавить вручную кнопкой «+ Добавить заклинание».</p>
        <section v-for="group in groups" :key="group.level" class="dnd-spellbook-group">
          <h3>{{ spellLevelLabel(group.level) }}</h3>
          <button v-for="spell in group.spells" :key="spell.key" type="button" class="dnd-spellbook-item" :class="{ 'is-added': added.has(spell.key) }" :aria-disabled="added.has(spell.key)" :aria-label="(added.has(spell.key) ? 'Уже в листе: ' : 'Добавить: ') + spell.name" @click="pick(spell)">
            <span class="dnd-spellbook-name">{{ spell.name }} <small>{{ spell.en }}</small></span>
            <span class="dnd-spellbook-mark">{{ added.has(spell.key) ? 'в листе' : '+ добавить' }}</span>
            <span class="dnd-spellbook-facts">{{ catalogSpellFacts(spell) }}</span>
            <span class="dnd-spellbook-summary">{{ spell.summary }}</span>
          </button>
        </section>
        <p class="dnd-spellbook-note">Заклинания SRD 5.1 (Wizards of the Coast, лицензия CC BY 4.0): механика и короткая суть, без полных описаний. Добавленное можно поправить в листе.</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DndCharacterSheetData } from '../dnd/characterSheet';
import { spellLevelLabel } from '../dnd/spells';
import {
  catalogSpellFacts, loadSpellCatalog, maxSpellLevel, searchSpellCatalog, spellcasterClass,
  type CatalogSpell,
} from '../dnd/spellCatalog';
import { useBackHandler } from '../composables/useBackHandler';

/**
 * Picks spells from the SRD catalog. With a spellcasting class chosen it
 * offers what that class can cast at the character's level; picking keeps
 * the dialog open, since a spell list is filled several spells at a time.
 */
const props = defineProps<{ sheet: DndCharacterSheetData }>();
const emit = defineEmits<{ close: []; pick: [spell: CatalogSpell] }>();

const catalog = ref<CatalogSpell[]>([]);
const loading = ref(true);
const failed = ref(false);
const query = ref('');
const level = ref<number | null>(null);
const onlyAvailable = ref(true);

const caster = computed(() => spellcasterClass(props.sheet.spellcasting.casterClass));
const highest = computed(() => (caster.value ? maxSpellLevel(caster.value.key, props.sheet.identity.level) : 9));
const availableText = computed(() => (highest.value ? `до ${highest.value} уровня` : 'только заговоры'));
const restricted = computed(() => Boolean(caster.value) && onlyAvailable.value);
const levelOptions = computed(() => {
  const top = restricted.value ? highest.value : 9;
  const options: Array<{ value: number | null; label: string }> = [{ value: null, label: 'Все' }, { value: 0, label: 'Заговоры' }];
  for (let value = 1; value <= top; value += 1) options.push({ value, label: String(value) });
  return options;
});
const groups = computed(() => searchSpellCatalog(catalog.value, {
  query: query.value,
  level: level.value !== null && level.value > (restricted.value ? highest.value : 9) ? null : level.value,
  classKey: restricted.value ? caster.value!.key : '',
  maxLevel: restricted.value ? highest.value : undefined,
}));
const added = computed(() => new Set(props.sheet.spells.map((spell) => spell.catalogKey).filter((key): key is string => Boolean(key))));

// An added spell stays focusable (aria-disabled, not disabled): a disabled
// button would drop the focus out of the dialog right after the click.
const pick = (spell: CatalogSpell) => { if (!added.value.has(spell.key)) emit('pick', spell); };
// Escape is heard on the document, so it closes the dialog wherever the focus is.
const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  emit('close');
};

const search = ref<HTMLInputElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(() => {
  document.addEventListener('keydown', onKeydown, true);
  search.value?.focus();
  loadSpellCatalog()
    .then((spells) => { catalog.value = spells; })
    .catch(() => { failed.value = true; })
    .finally(() => { loading.value = false; });
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  if (previousFocus?.isConnected) previousFocus.focus();
});
useBackHandler(() => { emit('close'); return true; });
</script>

<style scoped>
.dnd-spellbook-backdrop { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.45); }
.dnd-spellbook { width:min(560px,100%); height:min(720px,90dvh); overflow-y:auto; padding:18px; border-radius:16px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); color:var(--ui-text); box-shadow:var(--ui-glass-shadow); box-sizing:border-box; }
.dnd-spellbook header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.dnd-spellbook h2 { margin:0; font-size:18px; }
.dnd-spellbook-close { width:36px; height:36px; border:0; border-radius:999px; background:var(--ui-surface-subtle); color:var(--ui-text); font-size:18px; cursor:pointer; }
.dnd-spellbook-search { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--ui-border); border-radius:10px; background:var(--ui-surface-subtle); color:var(--ui-text); font:inherit; }
.dnd-spellbook-levels { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.dnd-spellbook-levels button { min-width:36px; min-height:32px; padding:4px 10px; border:1px solid var(--ui-border); border-radius:999px; background:transparent; color:var(--ui-text-secondary); font:inherit; font-size:12px; cursor:pointer; }
.dnd-spellbook-levels button.on { border-color:var(--ui-glass-accent-border); background:var(--ui-glass-accent-bg); color:var(--ui-glass-accent-text); }
.dnd-spellbook-only { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:13px; color:var(--ui-text-secondary); cursor:pointer; }
.dnd-spellbook-only input { accent-color:var(--ui-brand); }
.dnd-spellbook-group h3 { margin:14px 0 6px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-text-secondary); }
.dnd-spellbook-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 10px; width:100%; min-height:44px; padding:8px 10px; border:0; border-radius:10px; background:transparent; color:var(--ui-text); font:inherit; text-align:left; cursor:pointer; }
.dnd-spellbook-item:hover:not(.is-added), .dnd-spellbook-item:focus-visible { background:var(--ui-surface-subtle); }
.dnd-spellbook-item.is-added { cursor:default; opacity:.55; }
.dnd-spellbook-name { font-weight:600; overflow-wrap:anywhere; }
.dnd-spellbook-name small { font-weight:400; font-size:12px; color:var(--ui-text-secondary); }
.dnd-spellbook-mark { font-size:12px; color:var(--ui-text-secondary); white-space:nowrap; }
.dnd-spellbook-facts { grid-column:1 / -1; font-size:12px; color:var(--ui-text-secondary); }
.dnd-spellbook-summary { grid-column:1 / -1; font-size:13px; }
.dnd-spellbook-empty, .dnd-spellbook-note { font-size:13px; color:var(--ui-text-secondary); }
.dnd-spellbook-note { margin:14px 0 0; }
@media (max-width:760px) {
  .dnd-spellbook-levels button { min-height:40px; min-width:40px; }
}
</style>
