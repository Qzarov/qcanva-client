<template>
<!-- Mobile tag multi-select: replaces the old popover-that-quietly-
     appears-at-the-bottom with a proper sheet - visible backdrop, stays
     open across multiple taps, and only ever commits to selectedTags on
     Apply (see openTagSheet/applyTagSheet). -->
<div v-if="tagSheetOpen" class="dashboard-modal-backdrop dashboard-tag-sheet-backdrop" @click.self="closeTagSheet">
  <div class="dashboard-modal dashboard-tag-sheet" role="dialog" aria-modal="true" :aria-label="t('filterByTags')">
    <div class="dashboard-tag-sheet-grabber" aria-hidden="true"></div>
    <div class="dashboard-modal-head">
      <div>
        <h3>{{ t('filterByTags') }}</h3>
        <p class="dashboard-tag-sheet-subtitle">{{ t('selectMultipleTags') }}</p>
      </div>
      <button class="dashboard-modal-close" :aria-label="t('close')" @click="closeTagSheet">
        <X :size="16" aria-hidden="true" />
      </button>
    </div>
    <div class="dashboard-tag-sheet-list">
      <button
        v-for="tag in allTagNames"
        :key="tag"
        type="button"
        class="dashboard-tag-sheet-item"
        :class="{ active: tagSheetDraft.includes(tag) }"
        @click="toggleDraftTag(tag)"
      >
        <span>#{{ tag }}</span>
        <Check v-if="tagSheetDraft.includes(tag)" :size="14" aria-hidden="true" />
      </button>
    </div>
    <div class="dashboard-modal-actions dashboard-tag-sheet-actions">
      <button type="button" class="btn-ghost" @click="resetTagSheetDraft">{{ t('reset') }}</button>
      <button type="button" class="btn-primary" @click="applyTagSheet">{{ t('apply') }} ({{ tagSheetDraft.length }})</button>
    </div>
  </div>
</div>

<div v-if="folderModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>{{ folderModal.bulk?.length ? t('moveSelectedTitle').replace('{n}', String(folderModal.bulk.length)) : folderModal.resourceId ? t('moveToGroupTitle') : t('createGroup') }}</h3>
      <button class="dashboard-modal-close" @click="closeFolderModal">x</button>
    </div>
    <input
      v-if="!folderModalMoves"
      v-model.trim="folderModal.value"
      class="dashboard-modal-input"
      :placeholder="t('groupNameTitle')"
      @input="folderModal.folderId = ''"
      @keydown.enter.prevent="saveFolderModal"
    />
    <div v-if="folderModalMoves" class="dashboard-modal-note">{{ t('chooseFolder') }}</div>
    <div v-if="folderModalMoves && folderOptions.length" class="folder-parent-list">
      <button
        v-for="folder in folderOptions"
        :key="folder.id"
        class="folder-parent-option folder-destination"
        :class="{ active: folderModal.folderId === folder.id }"
        :style="{ paddingLeft: 12 + folder.depth * 16 + 'px' }"
        @click="folderModal.folderId = folder.id; folderModal.value = folder.name"
      >
        <span class="folder-destination-name">
          <span v-if="folder.depth" class="folder-destination-branch" aria-hidden="true">└</span>
          {{ folder.name }}
        </span>
        <span class="folder-destination-path">{{ folder.path || t('inRoot') }}</span>
      </button>
    </div>
    <div class="dashboard-modal-actions dashboard-modal-actions-row" data-folder-modal-actions>
      <button class="btn-ghost" @click="closeFolderModal" :disabled="isBusy">{{ t('cancel') }}</button>
      <button class="btn-primary" @click="saveFolderModal" :disabled="isBusy || !canSaveFolderModal">
        {{ actionLabel(folderModalMoves ? 'move-folder' : 'create-folder', folderModalMoves ? t('move') : t('create')) }}
      </button>
    </div>
  </div>
</div>

<div v-if="subfolderModal.open" class="dashboard-modal-backdrop" @click.self="closeSubfolderModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>{{ t('addFolderTitle') }}: {{ subfolderModal.parentName }}</h3>
      <button class="dashboard-modal-close" @click="closeSubfolderModal">x</button>
    </div>
    <input
      v-model.trim="subfolderModal.value"
      class="dashboard-modal-input"
      :placeholder="t('folderName')"
      @keydown.enter.prevent="saveSubfolderModal"
    />
    <div class="dashboard-modal-actions">
      <button class="btn-ghost" @click="closeSubfolderModal" :disabled="isBusy">{{ t('cancel') }}</button>
      <button
        class="btn-primary"
        @click="saveSubfolderModal"
        :disabled="isBusy || !subfolderModal.value.trim()"
      >{{ actionLabel('create-subfolder', t('createFolder')) }}</button>
    </div>
  </div>
</div>

<div v-if="folderParentModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderParentModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>{{ t('moveFolderIntoTitle') }}: {{ folderParentModal.name }}</h3>
      <button class="dashboard-modal-close" @click="closeFolderParentModal">x</button>
    </div>
    <div class="dashboard-modal-note">{{ t('moveFolderIntoNote') }}</div>
    <div v-if="folderParentOptions.length" class="folder-parent-list">
      <button
        v-for="option in folderParentOptions"
        :key="option.id"
        class="folder-parent-option folder-destination"
        :class="{ active: folderParentModal.targetId === option.id }"
        :style="{ paddingLeft: 12 + option.depth * 16 + 'px' }"
        :data-folder-parent-option="option.id"
        @click="folderParentModal.targetId = option.id"
      >
        <span class="folder-destination-name">
          <span v-if="option.depth" class="folder-destination-branch" aria-hidden="true">└</span>
          {{ option.id === 'root' ? t('moveFolderToRoot') : option.name }}
        </span>
        <span v-if="option.id !== 'root'" class="folder-destination-path">{{ option.path || t('inRoot') }}</span>
      </button>
    </div>
    <div v-else class="dashboard-modal-note">{{ t('moveFolderNoTargets') }}</div>
    <div class="dashboard-modal-actions dashboard-modal-actions-row">
      <button class="btn-ghost" @click="closeFolderParentModal" :disabled="isBusy">{{ t('cancel') }}</button>
      <button
        class="btn-primary"
        data-folder-parent-save
        @click="saveFolderParentModal"
        :disabled="isBusy || !folderParentModal.targetId"
      >{{ actionLabel('move-folder-parent', t('move')) }}</button>
    </div>
  </div>
</div>

<div v-if="descriptionModal.open" class="dashboard-modal-backdrop" @click.self="closeDescriptionModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>{{ descriptionModal.title || t('description') }}</h3>
      <button class="dashboard-modal-close" @click="closeDescriptionModal">x</button>
    </div>
    <textarea
      v-if="descriptionModal.canEdit"
      v-model="descriptionModal.value"
      class="dashboard-modal-textarea"
      :maxlength="MAX_DESCRIPTION_LENGTH"
      :placeholder="t('descriptionPlaceholder')"
    ></textarea>
    <p v-else-if="descriptionModal.value" class="description-readonly">{{ descriptionModal.value }}</p>
    <p v-else class="dashboard-modal-note">{{ t('descriptionEmpty') }}</p>
    <p v-if="descriptionModal.canEdit" class="dashboard-modal-note">
      {{ descriptionModal.value.length }} / {{ MAX_DESCRIPTION_LENGTH }}
    </p>
    <div class="dashboard-modal-actions">
      <button class="btn-ghost" @click="closeDescriptionModal" :disabled="isBusy">
        {{ descriptionModal.canEdit ? t('cancel') : t('close') }}
      </button>
      <button
        v-if="descriptionModal.canEdit"
        class="btn-primary"
        @click="saveDescriptionModal"
        :disabled="isBusy"
      >{{ actionLabel('save-description', t('save')) }}</button>
    </div>
  </div>
</div>

<div v-if="renameFolderModal.open" class="dashboard-modal-backdrop" @click.self="closeRenameFolderModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>{{ t('editGroup') }}</h3>
      <button class="dashboard-modal-close" @click="closeRenameFolderModal">x</button>
    </div>
    <input
      v-model.trim="renameFolderModal.value"
      class="dashboard-modal-input"
      :placeholder="t('groupNameTitle')"
      @keydown.enter.prevent="saveRenameFolderModal"
    />
    <p class="dashboard-modal-note">{{ t('renameGroupNote') }}</p>
    <div class="dashboard-modal-actions">
      <button class="btn-ghost" @click="closeRenameFolderModal" :disabled="isBusy">{{ t('cancel') }}</button>
      <button class="btn-primary" @click="saveRenameFolderModal" :disabled="isBusy || !renameFolderModal.value.trim()">
        {{ actionLabel('rename-folder', t('save')) }}
      </button>
    </div>
  </div>
</div>

<div v-if="folderShareModal.open" class="dashboard-modal-backdrop" @click.self="closeFolderShareModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>Share group</h3>
      <button class="dashboard-modal-close" @click="closeFolderShareModal">x</button>
    </div>
    <p class="dashboard-modal-note">Sharing "{{ folderShareModal.name }}" grants access to all resources in this Group.</p>
    <div class="share-section">
      <div class="share-section-title">Invite people</div>
      <div class="share-form">
        <ContactEmailInput v-model.trim="folderShareModal.email" placeholder="Email" :exclude="folderShareModal.permissions.map((p: any) => p.user?.email ?? '')" />
        <select v-model="folderShareModal.role">
          <option value="read">Can view</option>
          <option value="edit">Can edit</option>
        </select>
        <button @click="shareFolder" :disabled="isBusy || !folderShareModal.email.trim()">
          {{ actionLabel('share-folder', 'Invite') }}
        </button>
      </div>
      <div v-if="folderShareModal.loading" class="dashboard-modal-note">Loading access...</div>
      <div v-else-if="!folderShareModal.permissions.length" class="dashboard-modal-note">No invited people yet.</div>
      <div v-else class="share-list">
        <div v-for="permission in folderShareModal.permissions" :key="permission.id || permission.userId" class="share-item">
          <span>{{ permission.user?.email || permission.userId }}</span>
          <span class="share-item-role">{{ permission.role === 'edit' ? 'Can edit' : 'Can view' }}</span>
          <button @click="revokeFolderAccess(permission.userId)" :disabled="isBusy">x</button>
        </div>
      </div>
    </div>
    <div class="dashboard-modal-actions">
      <button class="btn-ghost" @click="closeFolderShareModal" :disabled="isBusy">Close</button>
    </div>
  </div>
</div>

<div v-if="tagsModal.open" class="dashboard-modal-backdrop" @click.self="closeTagsModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>Edit tags</h3>
      <button class="dashboard-modal-close" @click="closeTagsModal">x</button>
    </div>
    <div v-if="tagSuggestions.length" class="tag-filter-list">
      <button
        v-for="tag in tagSuggestions"
        :key="tag.name"
        class="tag-filter color-tag"
        :style="{ '--tag-color': tag.color }"
        @click="addSuggestedTag(tag)"
      >#{{ tag.name }}</button>
    </div>
    <div class="tag-editor-list">
      <div v-for="(tag, index) in tagsModal.tags" :key="tag.id" class="tag-editor-row">
        <input v-model.trim="tag.name" class="dashboard-modal-input tag-name-input" placeholder="Tag" />
        <div class="tag-color-palette">
          <button
            v-for="color in tagColors"
            :key="color"
            class="tag-color-option"
            :class="{ active: tag.color === color }"
            :style="{ background: color }"
            @click="tag.color = color"
            :disabled="isBusy"
          ></button>
        </div>
        <button class="tag-remove-btn" @click="removeTag(index)" :disabled="isBusy">x</button>
      </div>
    </div>
    <button class="btn-ghost tag-add-btn" @click="addTag" :disabled="isBusy">+ Add tag</button>
    <div class="dashboard-modal-actions">
      <button class="btn-ghost" @click="closeTagsModal" :disabled="isBusy">Cancel</button>
      <button class="btn-primary" @click="saveTagsModal" :disabled="isBusy">
        {{ actionLabel('save-tags', 'Save tags') }}
      </button>
    </div>
  </div>
</div>

<div v-if="transferModal.open" class="dashboard-modal-backdrop" @click.self="closeTransferModal">
  <div class="dashboard-modal">
    <div class="dashboard-modal-head">
      <h3>Transfer ownership</h3>
      <button class="dashboard-modal-close" @click="closeTransferModal">x</button>
    </div>
    <input
      v-model.trim="transferModal.email"
      class="dashboard-modal-input"
      placeholder="User email"
      type="email"
      @keydown.enter.prevent="saveTransferModal"
    />
    <p class="dashboard-modal-note">The current owner will become an editor.</p>
    <div class="dashboard-modal-actions">
      <button class="btn-ghost" @click="closeTransferModal" :disabled="isBusy">Cancel</button>
      <button class="btn-primary" @click="saveTransferModal" :disabled="isBusy || !transferModal.email.trim()">
        {{ actionLabel('transfer-ownership', 'Transfer') }}
      </button>
    </div>
  </div>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Check, X } from '@lucide/vue';
import ContactEmailInput from '../ContactEmailInput.vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const t = computed(() => context.value.t);
const isBusy = computed(() => context.value.isBusy);
const actionLabel = computed(() => context.value.actionLabel);
const MAX_DESCRIPTION_LENGTH = computed(() => context.value.MAX_DESCRIPTION_LENGTH);
const tagSheetOpen = computed(() => context.value.tagSheetOpen);
const closeTagSheet = computed(() => context.value.closeTagSheet);
const allTagNames = computed(() => context.value.allTagNames);
const tagSheetDraft = computed(() => context.value.tagSheetDraft);
const toggleDraftTag = computed(() => context.value.toggleDraftTag);
const resetTagSheetDraft = computed(() => context.value.resetTagSheetDraft);
const applyTagSheet = computed(() => context.value.applyTagSheet);
const folderModal = computed(() => context.value.folderModal);
const closeFolderModal = computed(() => context.value.closeFolderModal);
const folderModalMoves = computed(() => context.value.folderModalMoves);
const folderOptions = computed(() => context.value.folderOptions);
const canSaveFolderModal = computed(() => context.value.canSaveFolderModal);
const saveFolderModal = computed(() => context.value.saveFolderModal);
const subfolderModal = computed(() => context.value.subfolderModal);
const closeSubfolderModal = computed(() => context.value.closeSubfolderModal);
const saveSubfolderModal = computed(() => context.value.saveSubfolderModal);
const folderParentModal = computed(() => context.value.folderParentModal);
const folderParentOptions = computed(() => context.value.folderParentOptions);
const closeFolderParentModal = computed(() => context.value.closeFolderParentModal);
const saveFolderParentModal = computed(() => context.value.saveFolderParentModal);
const descriptionModal = computed(() => context.value.descriptionModal);
const closeDescriptionModal = computed(() => context.value.closeDescriptionModal);
const saveDescriptionModal = computed(() => context.value.saveDescriptionModal);
const renameFolderModal = computed(() => context.value.renameFolderModal);
const closeRenameFolderModal = computed(() => context.value.closeRenameFolderModal);
const saveRenameFolderModal = computed(() => context.value.saveRenameFolderModal);
const folderShareModal = computed(() => context.value.folderShareModal);
const closeFolderShareModal = computed(() => context.value.closeFolderShareModal);
const shareFolder = computed(() => context.value.shareFolder);
const revokeFolderAccess = computed(() => context.value.revokeFolderAccess);
const tagsModal = computed(() => context.value.tagsModal);
const tagSuggestions = computed(() => context.value.tagSuggestions);
const addSuggestedTag = computed(() => context.value.addSuggestedTag);
const tagColors = computed(() => context.value.tagColors);
const removeTag = computed(() => context.value.removeTag);
const addTag = computed(() => context.value.addTag);
const closeTagsModal = computed(() => context.value.closeTagsModal);
const saveTagsModal = computed(() => context.value.saveTagsModal);
const transferModal = computed(() => context.value.transferModal);
const closeTransferModal = computed(() => context.value.closeTransferModal);
const saveTransferModal = computed(() => context.value.saveTransferModal);
</script>
