<template>
  <!-- A space's filters: the icon in its header opens a window in the Add
       window's look - the kinds of file as square tiles, any number picked;
       then whose things, who added the folder, and any extension under More.
       Each change narrows the feed at once. -->
  <button
    type="button"
    class="btn-ghost dashboard-icon-button dashboard-filter-trigger space-filter-trigger"
    :class="{ active: activeCount > 0 }"
    :aria-label="activeCount ? `${t('filters')}: ${activeCount}` : t('filters')"
    :title="t('filters')"
    aria-haspopup="dialog"
    :aria-expanded="open"
    data-space-filter-trigger
    @click.stop="emit('toggle')"
  >
    <SlidersHorizontal :size="17" aria-hidden="true" />
    <span v-if="activeCount" class="dashboard-filter-badge" data-space-filter-count>{{ activeCount }}</span>
  </button>

  <Transition name="yandex-picker">
    <div v-if="open" class="dashboard-modal-backdrop dashboard-add-backdrop" data-space-filter-backdrop @click.self="emit('toggle')">
      <section
        class="dashboard-modal dashboard-add-dialog space-filter-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('filters')"
        tabindex="-1"
        data-space-filter-menu
        @keydown.esc.prevent.stop="emit('toggle')"
      >
        <header class="dashboard-modal-head dashboard-add-head">
          <h3>{{ t('filters') }}</h3>
          <button v-if="activeCount" type="button" class="space-filter-reset" data-space-filter-reset @click="emit('reset')">{{ t('resetFilters') }}</button>
          <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="emit('toggle')"><X :size="16" aria-hidden="true" /></button>
        </header>

        <!-- The kinds: square tiles, as the Add window's. -->
        <div class="dashboard-add-grid" role="group" :aria-label="t('spaceTypes')" data-space-filter-types>
          <button
            v-for="option in SPACE_FEED_TYPES"
            :key="option.value"
            type="button"
            class="dashboard-add-option space-filter-type-tile"
            :class="{ active: types.includes(option.value) }"
            :aria-pressed="types.includes(option.value)"
            :data-space-filter-type="option.value"
            v-hint="extensionsOf(option.value).join(', ')"
            @click="emit('toggle-type', option.value)"
          >
            <span class="dashboard-add-option-icon" aria-hidden="true">
              <component :is="option.icon" :size="22" />
              <span v-if="types.includes(option.value)" class="space-filter-type-check"><Check :size="11" /></span>
            </span>
            <strong>{{ t(option.label as MessageKey) }}</strong>
            <small data-space-filter-type-count>{{ typeCounts[option.value] ?? 0 }}</small>
          </button>
        </div>

        <div v-if="ownerPeople.length" class="dashboard-filter-group" role="group" :aria-label="t('spaceFilterOwner')">
          <span class="dashboard-filter-label">{{ t('spaceFilterOwner') }}</span>
          <div class="space-filter-people">
            <button
              v-for="person in ownerPeople"
              :key="person.id"
              type="button"
              class="tag-filter space-filter-person"
              :class="{ active: owners.includes(person.id) }"
              :aria-pressed="owners.includes(person.id)"
              :data-space-filter-owner="person.id"
              @click="emit('toggle-owner', person.id)"
            >
              <span class="space-filter-avatar" aria-hidden="true">{{ initial(person.name) }}</span>{{ person.name || t('untitled') }}
            </button>
          </div>
        </div>

        <div v-if="people.length" class="dashboard-filter-group" role="group" :aria-label="t('spaceFilterAddedBy')">
          <span class="dashboard-filter-label">{{ t('spaceFilterAddedBy') }}</span>
          <div class="space-filter-people">
            <button
              v-for="person in people"
              :key="person.id"
              type="button"
              class="tag-filter space-filter-person"
              :class="{ active: addedBy.includes(person.id) }"
              :aria-pressed="addedBy.includes(person.id)"
              :data-space-filter-person="person.id"
              @click="emit('toggle-person', person.id)"
            >
              <span class="space-filter-avatar" aria-hidden="true">{{ initial(person.name) }}</span>{{ person.name || t('untitled') }}
            </button>
          </div>
        </div>

        <!-- More: any extension, typed in. -->
        <div class="dashboard-filter-group space-filter-advanced">
          <button
            type="button"
            class="space-filter-advanced-toggle"
            :aria-expanded="advancedOpen"
            data-space-filter-advanced
            @click="advancedOpen = !advancedOpen"
          >
            <span>{{ t('spaceFilterAdvanced') }}</span>
            <span v-if="exts.length" class="space-filter-advanced-count">{{ exts.length }}</span>
            <ChevronDown class="space-filter-chevron" :class="{ open: advancedOpen }" :size="15" aria-hidden="true" />
          </button>
          <Transition :css="false" @enter="heightTransitionHooks.onEnter" @leave="heightTransitionHooks.onLeave">
            <div v-if="advancedOpen" class="space-filter-advanced-body">
              <span class="dashboard-filter-label">{{ t('spaceFilterExtensions') }}</span>
              <div class="space-filter-ext-chips">
                <span v-for="ext in exts" :key="ext" class="tag-filter active space-filter-ext-chip" :data-space-filter-ext="ext">
                  .{{ ext }}
                  <button type="button" :aria-label="`${t('delete')} .${ext}`" @click="removeExt(ext)"><X :size="11" aria-hidden="true" /></button>
                </span>
                <input
                  v-model="extDraft"
                  class="space-filter-ext-input"
                  type="text"
                  autocapitalize="off"
                  autocomplete="off"
                  spellcheck="false"
                  :placeholder="t('spaceFilterExtensionsPlaceholder')"
                  :aria-label="t('spaceFilterExtensions')"
                  data-space-filter-ext-input
                  @keydown.enter.prevent="commitExts"
                  @keydown.backspace="onBackspace"
                  @blur="commitExts"
                />
              </div>
            </div>
          </Transition>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Check, ChevronDown, SlidersHorizontal, X } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import { heightTransitionHooks } from '../../dashboard/motion';
import { vHint } from '../../directives/hint';
import type { SpaceFeedType } from '../../api/spaces';
import { SPACE_FEED_TYPES, useSpaceFeedTypes } from '../../dashboard/space-feed-types';

type MessageKey = Parameters<ReturnType<typeof useI18n>['t']>[0];
type Person = { id: string; name: string | null };

const props = defineProps<{
  open: boolean;
  /** Selected kinds; none selected means every kind. */
  types: readonly SpaceFeedType[];
  /** How many of each kind the other filters leave. */
  typeCounts: Partial<Record<SpaceFeedType, number>>;
  /** Who added the folders: those picked, and everyone who did. */
  addedBy: readonly string[];
  people: readonly Person[];
  /** Whose things: those picked, and everyone whose things are in the space. */
  owners: readonly string[];
  ownerPeople: readonly Person[];
  /** Extensions typed in under "More", lower case, no dot. */
  exts: readonly string[];
}>();
const emit = defineEmits<{
  toggle: [];
  reset: [];
  'toggle-type': [type: SpaceFeedType];
  'toggle-person': [id: string];
  'toggle-owner': [id: string];
  'update:exts': [exts: string[]];
}>();

const { t } = useI18n();
const { extensionsOf } = useSpaceFeedTypes();

// Esc closes it: the window takes the focus when it opens.
watch(() => props.open, async (open) => {
  if (!open) return;
  await nextTick();
  (document.querySelector('[data-space-filter-menu]') as HTMLElement | null)?.focus();
});

const advancedOpen = ref(props.exts.length > 0);
const extDraft = ref('');
/** "pdf, .MP4 h3m" -> ["pdf", "mp4", "h3m"]: letters and digits, lower case, no dot. */
const parseExts = (text: string) => text.split(/[\s,;]+/).map((part) => part.trim().toLowerCase().replace(/^\.+/, '')).filter((part) => /^[a-z0-9]{1,12}$/.test(part));
function commitExts() {
  const added = parseExts(extDraft.value);
  extDraft.value = '';
  if (!added.length) return;
  const next = [...new Set([...props.exts, ...added])];
  if (next.length !== props.exts.length) emit('update:exts', next);
}
function removeExt(ext: string) {
  emit('update:exts', props.exts.filter((other) => other !== ext));
}
function onBackspace() {
  if (!extDraft.value && props.exts.length) removeExt(props.exts[props.exts.length - 1]!);
}

const initial = (name: string | null) => (name || '?').trim().charAt(0).toUpperCase();
const activeCount = computed(() => props.types.length + props.addedBy.length + props.owners.length + props.exts.length);
</script>

<style scoped>
.space-filter-dialog { width: min(560px, 100%); }
.space-filter-dialog .dashboard-add-head { display: flex; align-items: center; gap: 12px; }
.space-filter-dialog .dashboard-add-head h3 { flex: 1; }
.space-filter-reset {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-brands);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.space-filter-type-tile .dashboard-add-option-icon { position: relative; }
.space-filter-type-check {
  position: absolute;
  right: -6px;
  bottom: -6px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-brands);
  color: var(--color-brand-on, #fff);
}
.space-filter-people { display: flex; flex-wrap: wrap; gap: 6px; }
.space-filter-person { display: inline-flex; align-items: center; gap: 6px; }
.space-filter-avatar {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ui-brand-soft, var(--ui-surface-subtle));
  color: var(--ui-text);
  font-size: 10px;
  font-weight: 700;
}
.space-filter-advanced { border-top: 1px solid var(--ui-glass-border, var(--ui-border)); padding-top: 6px; }
.space-filter-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 2px;
  border: none;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.space-filter-advanced-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-brands);
  color: var(--color-brand-on, #fff);
  font-size: 11px;
  font-weight: 700;
}
.space-filter-chevron { margin-left: auto; transition: transform 0.2s; }
.space-filter-chevron.open { transform: rotate(180deg); }
.space-filter-advanced-body { display: grid; gap: 6px; overflow: hidden; }
.space-filter-ext-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  border-radius: 10px;
}
.space-filter-ext-chip { display: inline-flex; align-items: center; gap: 2px; }
.space-filter-ext-chip button {
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.space-filter-ext-input {
  flex: 1 1 80px;
  min-width: 80px;
  padding: 4px 6px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
}
</style>
