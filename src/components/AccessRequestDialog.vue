<template>
  <div
    class="access-request-backdrop"
    role="presentation"
    @mousedown.self="close"
    @keydown.esc="close"
  >
    <section
      class="access-request-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
    >
      <button type="button" class="access-request-dialog-close" :aria-label="t('close')" @click="close">×</button>

      <div class="access-request-dialog-icon" aria-hidden="true">
        <Lock :size="28" :stroke-width="1.5" />
      </div>

      <!--
        R4: title and role choice only - deliberately no owner field. The
        endpoints this dialog is fed by (mention resolution, backlinks) never
        return an owner identity, and the request still reaches the right
        person because the server resolves the owner when it creates the
        request. Do not add an owner/email/name field here without revisiting
        that ruling first (docs/superpowers/plans/2026-09-06-mentions-and-backlinks.md).
      -->
      <h2 class="access-request-dialog-title">{{ title }}</h2>
      <p class="access-request-dialog-sub">{{ t('accessRequestDialogSub') }}</p>

      <div class="access-request-dialog-row">
        <select v-model="requestedRole" class="access-gate-select" data-access-request-role :disabled="busy">
          <option value="read">{{ t('canView') }}</option>
          <option value="edit">{{ t('canEdit') }}</option>
        </select>
        <button
          type="button"
          class="access-gate-btn access-gate-btn-primary"
          data-access-request-submit
          :disabled="busy"
          @click="submit"
        >
          {{ buttonLabel }}
        </button>
      </div>

      <p v-if="status === 'error'" class="access-request-dialog-error" role="alert">{{ errorMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Lock } from '@lucide/vue';
import { accessRequests, ApiError, type ResourceType } from '../api/client';
import { useI18n } from '../composables/useI18n';

/**
 * The access-request dialog (ruling R3): extracted so mentions and backlinks
 * share one implementation instead of each surface growing its own modal.
 * Unlike the three full-page `.access-gate` states (own-load 403, left
 * alone by this plan), this opens for a DIFFERENT resource while the reader
 * stays on the page they were reading - so it takes the target as props
 * rather than reading anything off the current route.
 */
const props = defineProps<{
  resourceType: ResourceType;
  resourceId: string;
  /** The target document's title. Never an owner - see the template comment (R4). */
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();

type Status = 'idle' | 'submitting' | 'sent' | 'already-requested' | 'error';

const requestedRole = ref<'read' | 'edit'>('read');
const status = ref<Status>('idle');
const errorMessage = ref('');

/** True while a request is in flight or has already landed - the guard against a double-fire click. */
const busy = computed(() => status.value === 'submitting' || status.value === 'sent' || status.value === 'already-requested');

const buttonLabel = computed(() => {
  switch (status.value) {
    case 'submitting':
      return t('accessRequestDialogSending');
    case 'sent':
      return t('accessRequestDialogSent');
    case 'already-requested':
      return t('accessRequestDialogAlready');
    default:
      return t('accessRequestDialogSend');
  }
});

function close() {
  emit('close');
}

async function submit() {
  // Re-entrancy guard: `busy` already disables the button, but a click
  // queued before Vue re-renders (e.g. a fast double mousedown) must not
  // reach `accessRequests.create` twice - checked again here, not just left
  // to the DOM's `disabled` attribute.
  // Re-entrancy guard: `busy` already disables the button, but a click
  // queued before Vue re-renders (e.g. a fast double mousedown) must not
  // reach `accessRequests.create` twice - checked again here, not just left
  // to the DOM's `disabled` attribute.
  if (busy.value) return;
  status.value = 'submitting';
  errorMessage.value = '';
  try {
    await accessRequests.create({
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      requestedRole: requestedRole.value,
    });
    status.value = 'sent';
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      status.value = 'already-requested';
      return;
    }
    status.value = 'error';
    errorMessage.value = (e instanceof Error && e.message) || t('accessRequestDialogFailed');
  }
}
</script>
