<template>
  <div class="ui-menu" :class="{ 'ui-menu--open': open }">
    <slot name="trigger" :toggle="() => emit('toggle')" />
    <Teleport to="body" :disabled="!sheet">
      <div
        v-if="open"
        class="ui-menu__panel"
        :class="[panelClass, { 'ui-menu__panel--sheet': sheet }]"
        :role="role"
        v-bind="panelAttrs"
        @click.stop
      >
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  open: boolean;
  sheet?: boolean;
  panelClass?: string | string[] | Record<string, boolean>;
  panelAttrs?: Record<string, string | undefined>;
  role?: 'menu' | 'dialog';
}>(), { sheet: false, panelClass: '', panelAttrs: () => ({}), role: 'menu' });
const emit = defineEmits<{ toggle: []; close: [] }>();
</script>
