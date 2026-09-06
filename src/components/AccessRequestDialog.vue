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
        <select v-model="requestedRole" class="access-gate-select" data-access-request-role :disabled="status === 'submitting'">
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
import { accessRequests, type ResourceType } from '../api/client';
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

type Status = 'idle' | 'submitting' | 'sent' | 'error';

const requestedRole = ref<'read' | 'edit'>('read');
const status = ref<Status>('idle');
const errorMessage = ref('');

/**
 * True only while a request is actually in flight - the guard against a
 * double-fire click for the SAME click. `sent` deliberately does NOT count
 * as busy: `AccessRequestsService.create` on the backend does not reject a
 * repeat request from the same user for the same resource - it finds the
 * existing PENDING row and updates its `requestedRole`, returning success.
 * So submitting again (e.g. after changing the role selector from "view" to
 * "edit") is a legitimate second action, not a duplicate to be blocked -
 * disabling the button forever after the first success would make that
 * legitimate role change unreachable from this dialog.
 */
const busy = computed(() => status.value === 'submitting');

const buttonLabel = computed(() => {
  switch (status.value) {
    case 'submitting':
      return t('accessRequestDialogSending');
    case 'sent':
      return t('accessRequestDialogSent');
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
  if (busy.value) return;
  status.value = 'submitting';
  errorMessage.value = '';
  try {
    // No conflict branch here on purpose: the backend never returns one for
    // this call (verified against AccessRequestsService.create) - a repeat
    // request for a resource the caller still has no access to just updates
    // the pending row and comes back as an ordinary success, same as a first
    // request. The one case that DOES throw - the resource's owner asking
    // for access to their own resource (403 "Owner already has access") -
    // cannot reach this dialog: it only opens from a mention/backlink
    // resolution already marked `accessible: false`, which an owner's own
    // resource is not. An unexpected failure of either kind still lands in
    // the generic catch below rather than crashing.
    await accessRequests.create({
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      requestedRole: requestedRole.value,
    });
    status.value = 'sent';
  } catch (e: unknown) {
    status.value = 'error';
    errorMessage.value = (e instanceof Error && e.message) || t('accessRequestDialogFailed');
  }
}
</script>
