<template>
  <div v-if="requests.length" class="dash-section access-requests-section">
    <div class="dash-section-head">
      <h2>{{ t('accessRequests') }}</h2>
      <button class="btn-ghost btn-sm" @click.stop="emit('refresh')" :disabled="isBusy">{{ t('refresh') }}</button>
    </div>
    <div class="access-request-list">
      <div v-for="request in requests" :key="request.id" class="access-request-row">
        <div>
          <div class="access-request-title">{{ request.resourceTitle || request.resourceId }}</div>
          <div class="access-request-meta">{{ request.requesterEmail || request.requesterName || request.requesterId }} asks for {{ request.requestedRole }} on {{ request.resourceType === 'canvas' ? 'canvas' : request.resourceType === 'text-document' ? 'document' : 'HTML' }}</div>
        </div>
        <div class="access-request-actions">
          <button class="btn-ghost btn-sm" :disabled="isBusy" @click.stop="emit('resolve', request.id, 'declined')">{{ t('decline') }}</button>
          <button class="btn-primary btn-sm" :disabled="isBusy" @click.stop="emit('resolve', request.id, 'approved')">{{ t('approve') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';

defineProps<{ requests: Array<{ id: string; resourceTitle?: string; resourceId: string; requesterEmail?: string; requesterName?: string; requesterId?: string; requestedRole: string; resourceType: string }>; isBusy: boolean }>();
const emit = defineEmits<{ refresh: []; resolve: [id: string, outcome: 'declined' | 'approved'] }>();
const { t } = useI18n();
</script>
