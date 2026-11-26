<template>
  <nav
    class="explorer-mobile-tabbar mobile-tabbar"
    :aria-label="t('dashboardSections')"
    data-mobile-tabbar
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="m-tab"
      :class="{ active: activeActivity === tab.id }"
      :aria-label="tab.label"
      :aria-current="activeActivity === tab.id ? 'page' : undefined"
      :data-mobile-tab="tab.id"
      @click="emit('select-activity', tab.id)"
    >
      <component :is="tab.icon" :size="18" aria-hidden="true" />
      <span>{{ tab.label }}</span>
    </button>

    <button
      type="button"
      class="m-tab m-tab-menu"
      :aria-label="t('openNavigation')"
      data-mobile-tab="menu"
      @click="emit('open-menu')"
    >
      <Menu :size="18" aria-hidden="true" />
      <span>{{ locale === 'ru' ? 'Меню' : 'Menu' }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { FolderTree, House, Images, Menu } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

export type ExplorerMobileTabId = 'home' | 'explorer' | 'gallery';

defineProps<{
  activeActivity: ExplorerMobileTabId;
}>();

const emit = defineEmits<{
  'select-activity': [activity: ExplorerMobileTabId];
  'open-menu': [];
}>();

const { t, locale } = useI18n();

const tabs = computed<Array<{ id: ExplorerMobileTabId; label: string; icon: Component }>>(() => [
  { id: 'home', label: t('home'), icon: House },
  { id: 'explorer', label: locale.value === 'ru' ? 'Файлы' : 'Files', icon: FolderTree },
  { id: 'gallery', label: locale.value === 'ru' ? 'Медиа' : 'Media', icon: Images },
]);
</script>
