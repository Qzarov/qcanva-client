<template>
  <!-- A file's picture when there is none (yet, or at all): a tinted square
       with the file's extension in a hand-drawn loop, tilted a little - each
       file its own way, from its name. The kind's icon in the list view,
       where the square is too small for it. -->
  <span class="file-placeholder" :class="'is-' + tone" :style="{ '--file-placeholder-tilt': tilt + 'deg' }" data-file-placeholder>
    <span class="file-placeholder-art" aria-hidden="true">
      <!-- A line figure of the kind in the corner, drawn like the loop. -->
      <svg class="file-placeholder-figure" viewBox="0 0 100 100" aria-hidden="true" data-file-placeholder-figure>
        <path v-for="(d, i) in figure" :key="i" :d="d" vector-effect="non-scaling-stroke" />
      </svg>
      <span class="file-placeholder-label">
        <svg class="file-placeholder-loop" viewBox="0 0 120 70" preserveAspectRatio="none" aria-hidden="true">
          <path :d="loop" vector-effect="non-scaling-stroke" />
        </svg>
        <span class="file-placeholder-text" data-file-placeholder-text>{{ label }}</span>
      </span>
    </span>
    <span class="file-placeholder-icon" aria-hidden="true">
      <Video v-if="kind === 'video'" :size="18" />
      <ImageIcon v-else-if="kind === 'picture'" :size="18" />
      <FileIcon v-else :size="18" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { File as FileIcon, Image as ImageIcon, Video } from '@lucide/vue';

const props = defineProps<{ name: string; kind: 'picture' | 'video' | 'file' }>();

/** A small number from the name, so every file keeps its own tilt and loop. */
const seed = computed(() => {
  let hash = 0;
  for (const char of props.name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
});
const label = computed(() => {
  const dot = props.name.lastIndexOf('.');
  const ext = dot > 0 ? props.name.slice(dot + 1).toLowerCase() : '';
  return ext && ext.length <= 6 ? ext : props.kind === 'video' ? 'video' : props.kind === 'picture' ? 'photo' : 'file';
});
const tone = computed(() => (props.kind === 'video' ? 'video' : props.kind === 'picture' ? 'picture' : 'file'));
const tilt = computed(() => -8 + (seed.value % 9));
/** Two loops, drawn by hand: one rounder, one longer. */
const LOOPS = [
  'M14,34 C10,14 44,5 78,6 C104,7 116,22 110,40 C104,58 70,66 42,63 C22,61 16,50 14,34 Z',
  'M8,40 C6,22 36,10 72,9 C100,8 116,18 113,33 C110,52 78,63 44,64 C20,65 9,55 8,40 Z',
];
const loop = computed(() => LOOPS[seed.value % LOOPS.length]);

/** Line figures per kind, two of each; the name picks one. */
const FIGURES: Record<'picture' | 'video' | 'file', string[][]> = {
  picture: [
    // Mountains under a sun.
    ['M8,82 L36,46 L52,64 L66,50 L92,82 Z', 'M74,30 m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0'],
    // A cut stone.
    ['M28,22 L72,22 L90,44 L50,88 L10,44 Z', 'M10,44 L90,44', 'M28,22 L40,44 L50,88 L60,44 L72,22', 'M40,44 L50,22 L60,44'],
  ],
  video: [
    // A play mark in a screen.
    ['M14,24 Q14,18 20,18 L80,18 Q86,18 86,24 L86,74 Q86,80 80,80 L20,80 Q14,80 14,74 Z', 'M42,36 L64,49 L42,62 Z'],
    // A strip of film.
    ['M22,10 L78,10 L78,90 L22,90 Z', 'M22,30 L78,30', 'M22,70 L78,70', 'M30,16 L30,22', 'M30,78 L30,84', 'M70,16 L70,22', 'M70,78 L70,84'],
  ],
  file: [
    // A page with a folded corner.
    ['M24,10 L62,10 L80,28 L80,90 L24,90 Z', 'M62,10 L62,28 L80,28', 'M34,50 L70,50', 'M34,62 L70,62', 'M34,74 L58,74'],
    ['M24,10 L62,10 L80,28 L80,90 L24,90 Z', 'M62,10 L62,28 L80,28', 'M38,56 m-6,0 a6,6 0 1,0 12,0 a6,6 0 1,0 -12,0', 'M52,52 L68,52', 'M52,62 L68,62'],
  ],
};
const figure = computed(() => {
  const set = FIGURES[tone.value];
  return set[Math.floor(seed.value / 7) % set.length];
});
</script>
