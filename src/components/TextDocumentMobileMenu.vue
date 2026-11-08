<template>
  <div class="control-menu text-doc-menu-mobile">
    <button
      type="button"
      class="btn-ghost btn-sm text-doc-menu-trigger"
      :aria-label="t('documentActionsAria')"
      :title="t('documentActionsAria')"
      @click.stop="emit('toggle', $event)"
    ><MoreVertical :size="18" aria-hidden="true" /></button>
    <Teleport to="body">
      <div v-if="open" class="text-doc-menu-backdrop" @click="emit('close')"></div>
      <div v-if="open" class="text-doc-menu-popover" :style="style" @click.stop>
        <button v-if="isOwner" type="button" class="text-doc-menu-item" @click="emit('share')">{{ t('share') }}</button>
        <button type="button" class="text-doc-menu-item" @click="emit('history')">{{ t('history') }}</button>
        <button type="button" class="text-doc-menu-item" @click="emit('copy-link')">{{ t('copyLink') }}</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { MoreVertical } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';

defineProps<{
  open: boolean;
  style?: Record<string, string> | null;
  isOwner: boolean;
}>();

const emit = defineEmits<{
  toggle: [event: MouseEvent];
  close: [];
  share: [];
  history: [];
  'copy-link': [];
}>();

const { t } = useI18n();
</script>
