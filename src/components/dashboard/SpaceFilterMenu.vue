<template>
  <!-- A space's feed narrowed by kind of file and by who added the folder:
       any number of each, behind one icon - as the dashboard's own filters. -->
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
          class="mobile-action-popover dashboard-filter-popover"
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

          <div class="dashboard-filter-group" role="group" :aria-label="t('filterTypes')">
            <span class="dashboard-filter-label">{{ t('filterTypes') }}</span>
            <label v-for="option in TYPE_OPTIONS" :key="option.value" class="dashboard-filter-option" :data-space-filter-type="option.value">
              <input type="checkbox" :checked="types.includes(option.value)" @change="emit('toggle-type', option.value)" />
              <component :is="option.icon" :size="16" aria-hidden="true" />
              <span>{{ t(option.label) }}</span>
            </label>
          </div>

          <div v-if="people.length > 1" class="dashboard-filter-group" role="group" :aria-label="t('spaceFilterAddedBy')">
            <span class="dashboard-filter-label">{{ t('spaceFilterAddedBy') }}</span>
            <label v-for="person in people" :key="person.id" class="dashboard-filter-option" :data-space-filter-person="person.id">
              <input type="checkbox" :checked="addedBy.includes(person.id)" @change="emit('toggle-person', person.id)" />
              <span class="space-filter-avatar" aria-hidden="true">{{ (person.name || '?').trim().charAt(0).toUpperCase() }}</span>
              <span>{{ person.name || t('untitled') }}</span>
            </label>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { File as FileIcon, FileText, Image as ImageIcon, LayoutTemplate, Music, SlidersHorizontal, Video } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';
import type { SpaceFeedType } from '../../api/spaces';

type MessageKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

const props = defineProps<{
  open: boolean;
  /** Selected kinds; none selected means every kind. */
  types: readonly SpaceFeedType[];
  addedBy: readonly string[];
  /** Who added the space's folders. Shown when there is more than one. */
  people: ReadonlyArray<{ id: string; name: string | null }>;
  /** Open as a sheet over the page (a phone), not under the icon. */
  sheet?: boolean;
}>();
const emit = defineEmits<{
  toggle: [];
  reset: [];
  'toggle-type': [type: SpaceFeedType];
  'toggle-person': [id: string];
}>();

const { t } = useI18n();

const TYPE_OPTIONS: { value: SpaceFeedType; label: MessageKey; icon: Component }[] = [
  { value: 'canva', label: 'spaceTypeCanva', icon: LayoutTemplate },
  { value: 'document', label: 'spaceTypeDocument', icon: FileText },
  { value: 'image', label: 'spaceTypeImage', icon: ImageIcon },
  { value: 'video', label: 'spaceTypeVideo', icon: Video },
  { value: 'audio', label: 'spaceTypeAudio', icon: Music },
  { value: 'other', label: 'spaceTypeOther', icon: FileIcon },
];

const activeCount = computed(() => props.types.length + props.addedBy.length);
</script>

<style scoped>
.space-filter-avatar {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--ui-brand-soft, var(--ui-surface-subtle));
  color: var(--ui-text);
  font-size: 11px;
  font-weight: 700;
}
</style>
