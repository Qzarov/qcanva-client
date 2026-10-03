<template>
  <!--
    The Share sheet for a canvas or a text document - one markup for both, so
    they look and behave the same. Purely presentational: text fields are
    v-models, while access switches only REPORT a change (update:* events)
    and leave saving - one request for a document, one per field for a canvas
    - to the view that owns the resource.

    One markup for both breakpoints: the mobile media query turns it into a
    bottom sheet, desktop keeps a floating panel. The class names are the
    ones the document sheet has always used (style.css), shared as they are.
  -->
  <Teleport to="body" :disabled="teleportDisabled">
    <div v-if="open" class="text-doc-share-backdrop" :class="{ 'share-backdrop-glass': glass }" @click="emit('close')"></div>
    <section
      v-if="open"
      class="share-panel text-doc-share-panel"
      :class="{ 'share-panel-glass': glass }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @keydown.esc.stop="emit('close')"
      @click.stop
    >
      <div class="text-doc-share-grabber" aria-hidden="true"></div>
      <div class="share-panel-header">
        <h3>{{ title }}</h3>
        <button type="button" class="text-doc-share-close" :aria-label="t('close')" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
      </div>

      <div class="share-panel-body">
        <!-- Copying the link is what people open this for: first. -->
        <div class="share-section">
          <div class="share-section-title">{{ t('shareLinkSection') }}</div>
          <button
            type="button"
            class="share-link-row"
            :class="{ 'share-link-row-copied': linkCopied }"
            :aria-label="t('copyLink')"
            @click="copyFromRow"
          >
            <Link2 :size="15" class="share-link-icon" aria-hidden="true" />
            <span class="share-link-url" :title="url">{{ url }}</span>
            <span v-if="linkCopied" class="share-link-copied">
              <Check :size="15" aria-hidden="true" /> {{ t('copied') }}
            </span>
            <Copy v-else :size="15" class="share-link-copy-icon" aria-hidden="true" />
          </button>
        </div>

        <div class="share-section-divider" aria-hidden="true"></div>

        <div class="share-section">
          <div class="share-section-title">{{ t('generalAccessSection') }}</div>
          <select
            class="share-visibility-select"
            :value="visibility"
            @change="emit('update:visibility', ($event.target as HTMLSelectElement).value as ShareVisibility)"
          >
            <option value="private">{{ t('visibilityPrivateDash') }}</option>
            <option value="authenticated">{{ t('visibilityAuthOnlyDash') }}</option>
            <option value="public">{{ t('visibilityPublicDash') }}</option>
          </select>
          <label class="share-checkbox">
            <input
              type="checkbox"
              :checked="allowPublicEdit"
              @change="emit('update:allowPublicEdit', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('allowPublicEditing') }}</span>
          </label>
          <label class="share-checkbox">
            <input
              type="checkbox"
              :checked="listedInPublic"
              :disabled="visibility !== 'public'"
              @change="emit('update:listedInPublic', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('showInPublic') }}</span>
          </label>
          <label class="share-checkbox">
            <input v-model="passwordAccessEnabled" type="checkbox" />
            <span>{{ t('enablePasswordAccess') }}</span>
          </label>
          <div v-if="passwordAccessEnabled" class="share-form share-password-form">
            <input v-model="passwordAccessPassword" type="password" :placeholder="t('newPasswordPlaceholder')" />
            <select v-model="passwordAccessRole">
              <option value="read">{{ t('canView') }}</option>
              <option value="edit">{{ t('canEdit') }}</option>
            </select>
            <button type="button" class="btn-primary" @click="emit('save-password')">{{ t('save') }}</button>
          </div>
        </div>

        <div class="share-section-divider" aria-hidden="true"></div>

        <div class="share-section">
          <div class="share-section-title">{{ t('customLinkSection') }}</div>
          <div class="slug-row">
            <span class="slug-prefix">{{ slugPrefix }}</span>
            <input
              v-model="slug"
              class="slug-input"
              :placeholder="slugPlaceholder"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              @keydown.enter.prevent="saveSlug"
            />
          </div>
          <div v-if="slugError || slugFormatError" class="slug-error" role="alert">{{ slugError || slugFormatError }}</div>
          <div v-else class="slug-hint">{{ t('slugHint') }}</div>
          <button
            type="button"
            class="btn-primary share-save-slug-btn"
            :disabled="savingSlug || !!slugFormatError"
            @click="saveSlug"
          >{{ t('save') }}</button>
        </div>

        <div class="share-section-divider" aria-hidden="true"></div>

        <div class="share-section">
          <div class="share-section-title">{{ t('invitePeople') }}</div>
          <div class="share-form">
            <input v-model.trim="shareEmail" :placeholder="t('email')" type="email" />
            <select v-model="shareRole">
              <option value="read">{{ t('canView') }}</option>
              <option value="edit">{{ t('canEdit') }}</option>
            </select>
            <button type="button" class="btn-primary share-invite-btn" @click="emit('invite')">{{ t('inviteBtn') }}</button>
          </div>
          <div v-if="permissions.length" class="share-list">
            <div v-for="p in permissions" :key="p.id" class="share-item">
              <span>{{ p.user?.email || p.userId }}</span>
              <span class="share-item-role">{{ p.role === 'edit' ? t('canEdit') : t('canView') }}</span>
              <button type="button" :aria-label="t('delete')" @click="emit('revoke', p.userId)">x</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Check, Copy, Link2, X } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';
import { slugFormatIsValid } from '../sharing/slug';

export type ShareVisibility = 'private' | 'authenticated' | 'public';
export type ShareRole = 'read' | 'edit';
export type SharePermission = { id: string; userId: string; role: ShareRole | string; user?: { email?: string } | null };

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  /** The public link the "copy" row shows and copies. */
  url: string;
  /** Copies `url` (the view owns clipboard + toast); the row then shows "Copied". */
  copyLink: () => Promise<unknown> | unknown;
  /** e.g. "/canvas/" or "/docs/" in front of the custom-link input. */
  slugPrefix: string;
  slugPlaceholder?: string;
  /** The server's own answer to the last save (conflict, reserved word...). */
  slugError?: string;
  savingSlug?: boolean;
  visibility: ShareVisibility;
  allowPublicEdit: boolean;
  listedInPublic: boolean;
  permissions: SharePermission[];
  /** Liquid Glass surface (the canvas); the document keeps its plain sheet. */
  glass?: boolean;
  /** Keep the sheet inside its parent when that parent is a fullscreen root. */
  teleportDisabled?: boolean;
}>(), {
  slugPlaceholder: '',
  slugError: '',
  savingSlug: false,
  glass: false,
  teleportDisabled: false,
});

const emit = defineEmits<{
  close: [];
  'update:visibility': [value: ShareVisibility];
  'update:allowPublicEdit': [value: boolean];
  'update:listedInPublic': [value: boolean];
  'save-password': [];
  'save-slug': [];
  invite: [];
  revoke: [userId: string];
}>();

const slug = defineModel<string>('slug', { required: true });
const shareEmail = defineModel<string>('shareEmail', { required: true });
const shareRole = defineModel<ShareRole>('shareRole', { required: true });
const passwordAccessEnabled = defineModel<boolean>('passwordAccessEnabled', { required: true });
const passwordAccessPassword = defineModel<string>('passwordAccessPassword', { required: true });
const passwordAccessRole = defineModel<ShareRole>('passwordAccessRole', { required: true });

const { t } = useI18n();

/** Instant format feedback while typing; uniqueness only the server can answer. */
const slugFormatError = computed(() => (slugFormatIsValid(slug.value) ? '' : t('slugInvalidFormat')));

const saveSlug = () => {
  if (props.savingSlug || slugFormatError.value) return;
  emit('save-slug');
};

const linkCopied = ref(false);
let linkCopiedTimer: ReturnType<typeof setTimeout> | null = null;
const copyFromRow = async () => {
  await props.copyLink();
  linkCopied.value = true;
  if (linkCopiedTimer) clearTimeout(linkCopiedTimer);
  linkCopiedTimer = setTimeout(() => { linkCopied.value = false; }, 1500);
};

/**
 * The sheet is teleported to <body>, away from its trigger, so a template
 * `@keydown.esc` only fires while focus is inside it - which nothing moves
 * focus into. A window listener, only while open, closes it from anywhere.
 */
const onEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};
watch(() => props.open, (open) => {
  if (open) window.addEventListener('keydown', onEscape);
  else window.removeEventListener('keydown', onEscape);
}, { immediate: true });
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape);
  if (linkCopiedTimer) clearTimeout(linkCopiedTimer);
});
</script>
