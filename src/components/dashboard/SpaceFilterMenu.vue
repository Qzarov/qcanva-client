<template>
  <!-- A space's feed narrowed by kind of file, whose it is and who added the
       folder - any number of each - and, under "More", by any extension.
       Behind one icon, as the dashboard's own filters. -->
  <div class="control-menu dashboard-filter-menu space-filter-menu">
    <button
      type="button"
      class="btn-ghost dashboard-icon-button dashboard-filter-trigger"
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
    <Teleport to="body" :disabled="!sheet">
      <Transition name="card-menu-pop">
        <div
          v-if="open"
          class="mobile-action-popover dashboard-filter-popover space-filter-popover"
          :class="{ 'dashboard-menu-sheet': sheet }"
          role="dialog"
          :aria-label="t('filters')"
          data-space-filter-menu
          @click.stop
        >
          <div class="dashboard-filter-head">
            <strong>{{ t('filters') }}</strong>
            <button v-if="activeCount" type="button" class="dashboard-filter-reset" data-space-filter-reset @click="emit('reset')">{{ t('resetFilters') }}</button>
          </div>

          <div v-if="withTypes" class="dashboard-filter-group" role="group" :aria-label="t('filterTypes')">
            <span class="dashboard-filter-label">{{ t('filterTypes') }}</span>
            <label v-for="option in TYPE_OPTIONS" :key="option.value" class="dashboard-filter-option space-filter-type" :data-space-filter-type="option.value">
              <input type="checkbox" :checked="types.includes(option.value)" @change="emit('toggle-type', option.value)" />
              <component :is="option.icon" :size="16" aria-hidden="true" />
              <span class="space-filter-type-text">
                <span>{{ t(option.label) }}</span>
                <!-- What the kind takes, so "Documents" is not a guess. -->
                <small v-if="extensionsOf(option.value).length" class="space-filter-exts" data-space-filter-exts>{{ extensionsOf(option.value).join(', ') }}</small>
              </span>
            </label>
          </div>

          <div v-if="ownerPeople.length" class="dashboard-filter-group" role="group" :aria-label="t('spaceFilterOwner')">
            <span class="dashboard-filter-label">{{ t('spaceFilterOwner') }}</span>
            <label v-for="person in ownerPeople" :key="person.id" class="dashboard-filter-option" :data-space-filter-owner="person.id">
              <input type="checkbox" :checked="owners.includes(person.id)" @change="emit('toggle-owner', person.id)" />
              <span class="space-filter-avatar" aria-hidden="true">{{ initial(person.name) }}</span>
              <span>{{ person.name || t('untitled') }}</span>
            </label>
          </div>

          <div v-if="people.length" class="dashboard-filter-group" role="group" :aria-label="t('spaceFilterAddedBy')">
            <span class="dashboard-filter-label">{{ t('spaceFilterAddedBy') }}</span>
            <label v-for="person in people" :key="person.id" class="dashboard-filter-option" :data-space-filter-person="person.id">
              <input type="checkbox" :checked="addedBy.includes(person.id)" @change="emit('toggle-person', person.id)" />
              <span class="space-filter-avatar" aria-hidden="true">{{ initial(person.name) }}</span>
              <span>{{ person.name || t('untitled') }}</span>
            </label>
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
                    inputmode="text"
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
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { ChevronDown, SlidersHorizontal, X } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import { heightTransitionHooks } from '../../dashboard/motion';
import type { SpaceFeedType } from '../../api/spaces';
import { SPACE_FEED_TYPES, useSpaceFeedTypes } from '../../dashboard/space-feed-types';

type MessageKey = Parameters<ReturnType<typeof useI18n>['t']>[0];
type Person = { id: string; name: string | null };

const props = withDefaults(defineProps<{
  open: boolean;
  /** Selected kinds; none selected means every kind. */
  types: readonly SpaceFeedType[];
  /** Who added the folders: those picked, and everyone who did. */
  addedBy: readonly string[];
  people: readonly Person[];
  /** Whose things: those picked, and everyone whose things are in the space. */
  owners: readonly string[];
  ownerPeople: readonly Person[];
  /** Extensions typed in under "More", lower case, no dot. */
  exts: readonly string[];
  /** Open as a sheet over the page (a phone), not under the icon. */
  sheet?: boolean;
  /** The kinds as a group here; off where they are tiles of their own (the space). */
  withTypes?: boolean;
}>(), { sheet: false, withTypes: true });
const emit = defineEmits<{
  toggle: [];
  reset: [];
  'toggle-type': [type: SpaceFeedType];
  'toggle-person': [id: string];
  'toggle-owner': [id: string];
  'update:exts': [exts: string[]];
}>();

const { t } = useI18n();

const TYPE_OPTIONS = SPACE_FEED_TYPES as ReadonlyArray<{ value: SpaceFeedType; label: MessageKey; icon: Component }>;
const { extensionsOf } = useSpaceFeedTypes();

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
const activeCount = computed(() => (props.withTypes ? props.types.length : 0) + props.addedBy.length + props.owners.length + props.exts.length);
</script>

<style scoped>
.space-filter-avatar {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ui-brand-soft, var(--ui-surface-subtle));
  color: var(--ui-text);
  font-size: 11px;
  font-weight: 700;
}
.space-filter-type { align-items: flex-start; }
.space-filter-type-text {
  display: grid;
  min-width: 0;
  gap: 1px;
}
.space-filter-exts {
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.space-filter-popover {
  max-width: min(340px, calc(100vw - 24px));
  /* Taller than the window with "More" open: it scrolls, nothing is cut. */
  max-height: min(72vh, 620px);
  overflow-y: auto;
  overscroll-behavior: contain;
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
.space-filter-ext-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
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
