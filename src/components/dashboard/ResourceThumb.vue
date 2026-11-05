<template>
  <!-- A resource's picture at the top of its dashboard card (dashboard/
       thumbnails.ts). Holds its shape while loading so the grid does not
       jump; a resource with no picture for this viewer leaves no box. -->
  <div
    v-if="state !== 'none'"
    ref="root"
    class="resource-thumb"
    :class="{ 'resource-thumb-loaded': state === 'ready' }"
    :data-resource-thumb="`${kind}:${id}`"
    aria-hidden="true"
  >
    <img v-if="src" :src="src" alt="" draggable="false" decoding="async" @error="state = 'none'" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useTheme } from '../../composables/useTheme';
import { isThumbnailKind, loadThumbnail, type ThumbnailKind } from '../../dashboard/thumbnails';

const props = defineProps<{
  kind: string;
  id: string;
  /** The resource's updatedAt: a changed resource is a new picture. */
  version?: string | null;
}>();

const { effectiveTheme } = useTheme();
const root = ref<HTMLElement | null>(null);
const src = ref<string | null>(null);
const state = ref<'idle' | 'loading' | 'ready' | 'none'>(isThumbnailKind(props.kind) ? 'idle' : 'none');
let observer: IntersectionObserver | null = null;
let visible = false;
let request = 0;

async function load() {
  if (!isThumbnailKind(props.kind)) {
    state.value = 'none';
    return;
  }
  const mine = ++request;
  state.value = 'loading';
  const url = await loadThumbnail(props.kind as ThumbnailKind, props.id, {
    version: props.version,
    theme: effectiveTheme.value === 'dark' ? 'dark' : 'light',
  });
  if (mine !== request) return;
  src.value = url;
  state.value = url ? 'ready' : 'none';
}

onMounted(() => {
  if (state.value === 'none' || !root.value) return;
  // Only cards on (or near) the screen ask for their picture.
  if (typeof IntersectionObserver === 'undefined') {
    visible = true;
    void load();
    return;
  }
  observer = new IntersectionObserver(
    (records) => {
      if (!records.some((record) => record.isIntersecting)) return;
      visible = true;
      observer?.disconnect();
      observer = null;
      void load();
    },
    { rootMargin: '200px' },
  );
  observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  request += 1;
});

watch(
  () => [props.kind, props.id, props.version, effectiveTheme.value],
  () => {
    if (visible) void load();
  },
);
</script>
