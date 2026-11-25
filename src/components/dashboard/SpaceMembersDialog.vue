<template>
  <!-- Delegates to AlbumShareDialog for full album share parity while keeping SpaceMembersDialog imports intact. -->
  <AlbumShareDialog
    :space="space"
    :me-id="meId"
    :initial-public-link="initialPublicLink"
    @changed="emit('changed', $event)"
    @close="emit('close')"
    @toggle-public="emit('toggle-public', $event)"
  />
</template>

<script setup lang="ts">
import type { SpaceDetails } from '../../api/spaces';
import AlbumShareDialog from './AlbumShareDialog.vue';

defineProps<{ space: SpaceDetails; meId: string; initialPublicLink?: boolean }>();
const emit = defineEmits<{
  /** The space as it is now; null when the user left it. */
  changed: [space: SpaceDetails | null];
  close: [];
  'toggle-public': [enabled: boolean];
}>();
</script>
