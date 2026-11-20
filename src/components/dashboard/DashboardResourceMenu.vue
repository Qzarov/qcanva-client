<template>
  <div class="card-menu" :data-card-menu="menuId" :style="menuStyle" @click.stop>
    <button
      v-for="action in visibleActions"
      :key="action.key"
      type="button"
      class="card-menu-item"
      :class="{ danger: action.danger }"
      :data-action="action.key"
      :disabled="disabled || action.disabled"
      @click="emit('select', action.key)"
    >
      {{ action.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DashboardResourceAction, DashboardResourceActionItem } from './resource-card.types';

const props = withDefaults(defineProps<{
  actions: DashboardResourceActionItem[];
  disabled?: boolean;
  menuId?: string;
  menuStyle?: Record<string, string> | null;
}>(), {
  disabled: false,
  menuId: undefined,
  menuStyle: null,
});

const emit = defineEmits<{
  select: [action: DashboardResourceAction];
}>();

const visibleActions = computed(() => props.actions.filter((action) => action.visible !== false));
</script>
