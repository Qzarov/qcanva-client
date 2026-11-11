<template>
<!-- Mobile tag multi-select: replaces the old popover-that-quietly-
     appears-at-the-bottom with a proper sheet - visible backdrop, stays
     open across multiple taps, and only ever commits to selectedTags on
     Apply (see openTagSheet/applyTagSheet). -->
<UiModal v-if="tagSheetOpen" class="dashboard-modal dashboard-tag-sheet" backdrop-class="dashboard-tag-sheet-backdrop" :label="t('filterByTags')" @close="closeTagSheet">

    <div class="dashboard-tag-sheet-grabber" aria-hidden="true"></div>
    <div class="dashboard-modal-head">
      <div>
        <h3>{{ t('filterByTags') }}</h3>
        <p class="dashboard-tag-sheet-subtitle">{{ t('selectMultipleTags') }}</p>
      </div>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeTagSheet">
        <X :size="16" aria-hidden="true" />
      </UiIconButton>
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
      <UiButton type="button" class="btn-ghost" variant="ghost" @click="resetTagSheetDraft">{{ t('reset') }}</UiButton>
      <UiButton type="button" class="btn-primary" variant="primary" @click="applyTagSheet">{{ t('apply') }} ({{ tagSheetDraft.length }})</UiButton>
    </div>
</UiModal>

<UiModal v-if="folderModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('moveToGroupTitle')" @close="closeFolderModal">

    <div class="dashboard-modal-head">
      <h3>{{ folderModal.bulk?.length ? t('moveSelectedTitle').replace('{n}', String(folderModal.bulk.length)) : folderModal.resourceId ? t('moveToGroupTitle') : t('createGroup') }}</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeFolderModal">x</UiIconButton>
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
      <UiButton class="btn-ghost" variant="ghost" @click="closeFolderModal" :disabled="isBusy">{{ t('cancel') }}</UiButton>
      <UiButton class="btn-primary" variant="primary" @click="saveFolderModal" :disabled="isBusy || !canSaveFolderModal">
        {{ actionLabel(folderModalMoves ? 'move-folder' : 'create-folder', folderModalMoves ? t('move') : t('create')) }}
      </UiButton>
    </div>
</UiModal>

<UiModal v-if="subfolderModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('addFolderTitle')" @close="closeSubfolderModal">

    <div class="dashboard-modal-head">
      <h3>{{ t('addFolderTitle') }}: {{ subfolderModal.parentName }}</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeSubfolderModal">x</UiIconButton>
    </div>
    <input
      v-model.trim="subfolderModal.value"
      class="dashboard-modal-input"
      :placeholder="t('folderName')"
      @keydown.enter.prevent="saveSubfolderModal"
    />
    <div class="dashboard-modal-actions">
      <UiButton class="btn-ghost" variant="ghost" @click="closeSubfolderModal" :disabled="isBusy">{{ t('cancel') }}</UiButton>
      <button
        class="btn-primary"
        @click="saveSubfolderModal"
        :disabled="isBusy || !subfolderModal.value.trim()"
      >{{ actionLabel('create-subfolder', t('createFolder')) }}</button>
    </div>
</UiModal>

<UiModal v-if="folderParentModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('moveFolderIntoTitle')" @close="closeFolderParentModal">

    <div class="dashboard-modal-head">
      <h3>{{ t('moveFolderIntoTitle') }}: {{ folderParentModal.name }}</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeFolderParentModal">x</UiIconButton>
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
      <UiButton class="btn-ghost" variant="ghost" @click="closeFolderParentModal" :disabled="isBusy">{{ t('cancel') }}</UiButton>
      <button
        class="btn-primary"
        data-folder-parent-save
        @click="saveFolderParentModal"
        :disabled="isBusy || !folderParentModal.targetId"
      >{{ actionLabel('move-folder-parent', t('move')) }}</button>
    </div>
</UiModal>

<UiModal v-if="descriptionModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('description')" @close="closeDescriptionModal">

    <div class="dashboard-modal-head">
      <h3>{{ descriptionModal.title || t('description') }}</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeDescriptionModal">x</UiIconButton>
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
      <UiButton class="btn-ghost" variant="ghost" @click="closeDescriptionModal" :disabled="isBusy">
        {{ descriptionModal.canEdit ? t('cancel') : t('close') }}
      </UiButton>
      <button
        v-if="descriptionModal.canEdit"
        class="btn-primary"
        @click="saveDescriptionModal"
        :disabled="isBusy"
      >{{ actionLabel('save-description', t('save')) }}</button>
    </div>
</UiModal>

<UiModal v-if="renameFolderModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('editGroup')" @close="closeRenameFolderModal">

    <div class="dashboard-modal-head">
      <h3>{{ t('editGroup') }}</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeRenameFolderModal">x</UiIconButton>
    </div>
    <input
      v-model.trim="renameFolderModal.value"
      class="dashboard-modal-input"
      :placeholder="t('groupNameTitle')"
      @keydown.enter.prevent="saveRenameFolderModal"
    />
    <p class="dashboard-modal-note">{{ t('renameGroupNote') }}</p>
    <div class="dashboard-modal-actions">
      <UiButton class="btn-ghost" variant="ghost" @click="closeRenameFolderModal" :disabled="isBusy">{{ t('cancel') }}</UiButton>
      <UiButton class="btn-primary" variant="primary" @click="saveRenameFolderModal" :disabled="isBusy || !renameFolderModal.value.trim()">
        {{ actionLabel('rename-folder', t('save')) }}
      </UiButton>
    </div>
</UiModal>

<UiModal v-if="folderShareModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('share')" @close="closeFolderShareModal">

    <div class="dashboard-modal-head">
      <h3>Share group</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeFolderShareModal">x</UiIconButton>
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
      <UiButton class="btn-ghost" variant="ghost" @click="closeFolderShareModal" :disabled="isBusy">Close</UiButton>
    </div>
</UiModal>

<UiModal v-if="tagsModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('editTags')" @close="closeTagsModal">

    <div class="dashboard-modal-head">
      <h3>Edit tags</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeTagsModal">x</UiIconButton>
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
      <UiButton class="btn-ghost" variant="ghost" @click="closeTagsModal" :disabled="isBusy">Cancel</UiButton>
      <UiButton class="btn-primary" variant="primary" @click="saveTagsModal" :disabled="isBusy">
        {{ actionLabel('save-tags', 'Save tags') }}
      </UiButton>
    </div>
</UiModal>

<UiModal v-if="transferModal.open" class="dashboard-modal" backdrop-class="dashboard-modal-backdrop" :label="t('transferOwnership')" @close="closeTransferModal">

    <div class="dashboard-modal-head">
      <h3>Transfer ownership</h3>
      <UiIconButton class="dashboard-modal-close" :label="t('close')" variant="clear" @click="closeTransferModal">x</UiIconButton>
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
      <UiButton class="btn-ghost" variant="ghost" @click="closeTransferModal" :disabled="isBusy">Cancel</UiButton>
      <UiButton class="btn-primary" variant="primary" @click="saveTransferModal" :disabled="isBusy || !transferModal.email.trim()">
        {{ actionLabel('transfer-ownership', 'Transfer') }}
      </UiButton>
    </div>
</UiModal>

</template>

<script setup lang="ts">
import { computed, isRef } from 'vue';
import { Check, X } from '@lucide/vue';
import ContactEmailInput from '../ContactEmailInput.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';

const props = defineProps({ context: { type: Object, required: true } });
const context = computed(() => (props.context || {}) as Record<string, any>);
const read = (key: string) => computed(() => {
  const value = context.value[key];
  return isRef(value) ? value.value : value;
});
const t = read('t');
const isBusy = read('isBusy');
const actionLabel = read('actionLabel');
const MAX_DESCRIPTION_LENGTH = read('MAX_DESCRIPTION_LENGTH');
const tagSheetOpen = read('tagSheetOpen');
const closeTagSheet = read('closeTagSheet');
const allTagNames = read('allTagNames');
const tagSheetDraft = read('tagSheetDraft');
const toggleDraftTag = read('toggleDraftTag');
const resetTagSheetDraft = read('resetTagSheetDraft');
const applyTagSheet = read('applyTagSheet');
const folderModal = read('folderModal');
const closeFolderModal = read('closeFolderModal');
const folderModalMoves = read('folderModalMoves');
const folderOptions = read('folderOptions');
const canSaveFolderModal = read('canSaveFolderModal');
const saveFolderModal = read('saveFolderModal');
const subfolderModal = read('subfolderModal');
const closeSubfolderModal = read('closeSubfolderModal');
const saveSubfolderModal = read('saveSubfolderModal');
const folderParentModal = read('folderParentModal');
const folderParentOptions = read('folderParentOptions');
const closeFolderParentModal = read('closeFolderParentModal');
const saveFolderParentModal = read('saveFolderParentModal');
const descriptionModal = read('descriptionModal');
const closeDescriptionModal = read('closeDescriptionModal');
const saveDescriptionModal = read('saveDescriptionModal');
const renameFolderModal = read('renameFolderModal');
const closeRenameFolderModal = read('closeRenameFolderModal');
const saveRenameFolderModal = read('saveRenameFolderModal');
const folderShareModal = read('folderShareModal');
const closeFolderShareModal = read('closeFolderShareModal');
const shareFolder = read('shareFolder');
const revokeFolderAccess = read('revokeFolderAccess');
const tagsModal = read('tagsModal');
const tagSuggestions = read('tagSuggestions');
const addSuggestedTag = read('addSuggestedTag');
const tagColors = read('tagColors');
const removeTag = read('removeTag');
const addTag = read('addTag');
const closeTagsModal = read('closeTagsModal');
const saveTagsModal = read('saveTagsModal');
const transferModal = read('transferModal');
const closeTransferModal = read('closeTransferModal');
const saveTransferModal = read('saveTransferModal');
</script>

