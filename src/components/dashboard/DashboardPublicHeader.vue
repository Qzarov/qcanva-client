<template>
  <header class="app-header app-header-public">
    <div class="app-header-inner">
      <div class="dashboard-brand">
        <img src="/qcanva-logo.png" alt="QCanva" />
        <div>
          <h1>QCanva</h1>
          <p class="dash-subtitle">{{ t('publicResources') }}</p>
        </div>
      </div>
      <div class="header-user-slot">
        <LanguageToggle />
        <router-link to="/login" class="btn-ghost">{{ t('login') }}</router-link>
        <router-link to="/register" class="btn-primary">{{ t('register') }}</router-link>
      </div>
      <input
        v-model.trim="searchQuery"
        class="dash-search dash-search-header-mobile"
        :placeholder="folderSearchPlaceholder"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import LanguageToggle from '../LanguageToggle.vue';
import { useI18n } from '../../composables/useI18n';

const searchQuery = defineModel<string>('searchQuery', { required: true });
defineProps<{ folderSearchPlaceholder: string }>();
const { t } = useI18n();
</script>
