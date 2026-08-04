<template>
  <button class="language-toggle btn-ghost btn-sm" type="button" :title="t('language')" @click="toggleLocale">
    {{ locale === 'ru' ? 'EN' : 'РУ' }}
  </button>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useI18n } from '../composables/useI18n';

export default defineComponent({
  setup() {
    const { locale, t, toggleLocale } = useI18n();
    return { locale, t, toggleLocale };
  },
});
</script>
