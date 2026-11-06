<template>
  <!-- Where to move on the Yandex Disk: walk its folders, then "Move here". -->
  <Transition name="yandex-picker" appear @after-leave="emit('close')">
    <div v-if="visible" class="dashboard-modal-backdrop" data-yandex-picker @click.self="close">
      <div class="dashboard-modal yandex-picker">
        <div class="dashboard-modal-head">
          <h3>{{ t('moveSelectedTitle').replace('{n}', String(sources.length)) }}</h3>
          <button class="dashboard-modal-close" :aria-label="t('cancel')" @click="close">x</button>
        </div>
        <nav class="yandex-picker-crumbs" :aria-label="t('yandexDisk')">
          <button type="button" class="btn-ghost btn-sm" data-picker-crumb="/" @click="go('/')">{{ t('yandexDisk') }}</button>
          <template v-for="crumb in crumbs" :key="crumb.path">
            <span aria-hidden="true">›</span>
            <button type="button" class="btn-ghost btn-sm" :data-picker-crumb="crumb.path" @click="go(crumb.path)">{{ crumb.name }}</button>
          </template>
        </nav>
        <div class="folder-parent-list" data-picker-folders>
          <p v-if="loading" class="dashboard-modal-note">{{ t('driveLoading') }}</p>
          <p v-else-if="!folders.length" class="dashboard-modal-note">{{ t('yandexNoSubfolders') }}</p>
          <button
            v-for="folder in folders"
            :key="folder.path"
            type="button"
            class="folder-parent-option folder-destination"
            :disabled="isSourceOrInside(folder.path)"
            :data-picker-folder="folder.path"
            @click="go(folder.path)"
          >
            <span class="folder-destination-name">{{ folder.name }}</span>
          </button>
        </div>
        <div class="dashboard-modal-actions dashboard-modal-actions-row">
          <button class="btn-ghost" :disabled="busy" @click="close">{{ t('cancel') }}</button>
          <button class="btn-primary" :disabled="busy || !canMoveHere" data-picker-confirm @click="emit('confirm', path)">{{ t('yandexMoveHere') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { yandexCrumbs, yandexDisk, yandexParentPath, type YandexItem } from '../../api/yandexDisk';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{ sources: readonly string[]; start: string; busy?: boolean }>();
const emit = defineEmits<{ confirm: [target: string]; close: [] }>();
const { t } = useI18n();

const visible = ref(true);
const path = ref(props.start);
const folders = ref<YandexItem[]>([]);
const loading = ref(false);
const crumbs = computed(() => yandexCrumbs(path.value));

const isSourceOrInside = (target: string) => props.sources.some((source) => target === source || target.startsWith(`${source}/`));
/** Not into a moved folder itself, and not where everything already is. */
const canMoveHere = computed(() => (
  !isSourceOrInside(path.value) && props.sources.some((source) => yandexParentPath(source) !== path.value)
));

async function go(target: string) {
  path.value = target;
  loading.value = true;
  try {
    const listing = await yandexDisk.list(target, { sort: 'name' });
    if (path.value === target) folders.value = listing.items.filter((item) => item.type === 'dir');
  } catch {
    if (path.value === target) folders.value = [];
  } finally {
    if (path.value === target) loading.value = false;
  }
}

function close() {
  // The parent drops us once the fade is over (after-leave).
  visible.value = false;
}
defineExpose({ close });

onMounted(() => { void go(props.start); });
</script>
