<template>
  <router-link :to="to" class="back-btn" :aria-label="label" :title="label">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </router-link>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export default defineComponent({
  name: 'BackButton',
  props: {
    to: { type: Object as PropType<RouteLocationRaw>, required: true },
    label: { type: String, default: 'Back' },
  },
});
</script>
