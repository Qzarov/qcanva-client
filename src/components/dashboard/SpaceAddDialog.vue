<template>
  <!-- Adding a folder to a space, on a computer: the Add window's look - a
       heading and square tiles, one per place the folder comes from. -->
  <div class="dashboard-modal-backdrop dashboard-add-backdrop" @click.self="emit('close')">
    <section
      class="dashboard-modal dashboard-add-dialog space-add-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('spaceAddFolder')"
      data-space-add-dialog
      tabindex="-1"
      @keydown.esc.prevent.stop="emit('close')"
    >
      <header class="dashboard-modal-head dashboard-add-head">
        <h3>{{ t('spaceAddFolder') }}</h3>
        <button type="button" class="dashboard-modal-close" :aria-label="t('close')" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
      </header>
      <div class="dashboard-add-grid">
        <button type="button" class="dashboard-add-option" data-space-add-qspace @click="emit('pick', 'qspace')">
          <span class="dashboard-add-option-icon" aria-hidden="true"><HardDrive :size="22" /></span>
          <strong>{{ t('qSpace') }}</strong>
        </button>
        <button type="button" class="dashboard-add-option" data-space-add-yandex @click="emit('pick', 'yandex')">
          <span class="dashboard-add-option-icon" aria-hidden="true"><Cloud :size="22" /></span>
          <strong>{{ t('yandexDisk') }}</strong>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Cloud, HardDrive, X } from '@lucide/vue';
import { useI18n } from '../../composables/useI18n';

const emit = defineEmits<{ pick: [source: 'qspace' | 'yandex']; close: [] }>();
const { t } = useI18n();
onMounted(() => {
  // Esc closes it: the dialog takes the focus.
  (document.querySelector('[data-space-add-dialog]') as HTMLElement | null)?.focus();
});
</script>

<style scoped>
/* Two tiles, not the Add window's row: as wide as they are. */
.space-add-dialog {
  width: auto;
  min-width: min(320px, calc(100vw - 32px));
}
</style>
