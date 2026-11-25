<script setup lang="ts">
import { Users } from '@lucide/vue';
import { computed, reactive, watch } from 'vue';
import { renditionUrl } from '../../api/photos';
import { useI18n } from '../../composables/useI18n';

export interface GalleryPerson {
  id: string;
  name: string;
  count: number;
  avatarUrl?: string | null;
  coverHash?: string | null;
  color?: string;
}

const props = withDefaults(defineProps<{
  people: readonly GalleryPerson[];
  selectedIds?: readonly string[];
}>(), {
  selectedIds: () => [],
});

const emit = defineEmits<{
  (e: 'select', personIds: string[]): void;
  (e: 'update:selectedIds', personIds: string[]): void;
}>();

const { t, locale } = useI18n();

const AVATAR_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6'];
const resolvedAvatars = reactive<Record<string, string | null>>({});
const requestedHashes = new Set<string>();

const selectedSet = computed(() => new Set(props.selectedIds));

watch(
  () => props.people,
  (list) => {
    for (const person of list) {
      if (person.avatarUrl || !person.coverHash || requestedHashes.has(person.coverHash)) continue;
      const hash = person.coverHash;
      requestedHashes.add(hash);
      renditionUrl(hash, 'thumbnail')
        .then((url) => {
          resolvedAvatars[hash] = url;
        })
        .catch(() => {
          resolvedAvatars[hash] = null;
        });
    }
  },
  { immediate: true },
);

function avatarSrc(person: GalleryPerson): string | null {
  if (person.avatarUrl) return person.avatarUrl;
  if (person.coverHash) return resolvedAvatars[person.coverHash] ?? null;
  return null;
}

function badgeColor(person: GalleryPerson, index: number): string {
  return person.color || AVATAR_COLORS[index % AVATAR_COLORS.length]!;
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

function countLabel(count: number): string {
  if (locale.value === 'en') {
    return count === 1 ? '1 photo' : `${count} photos`;
  }
  return `${count} фото`;
}

function onPersonClick(e: MouseEvent, person: GalleryPerson): void {
  const multi = e.ctrlKey || e.metaKey || e.shiftKey;
  let next: string[];
  if (multi) {
    const current = new Set(props.selectedIds);
    if (current.has(person.id)) current.delete(person.id);
    else current.add(person.id);
    next = [...current];
  } else {
    next = [person.id];
  }
  emit('update:selectedIds', next);
  emit('select', next);
}
</script>

<template>
  <div class="gpg" data-testid="gallery-people-grid">
    <div class="gpg-head">
      <h2 class="gpg-title">{{ t('galleryPeople') }}</h2>
      <p class="gpg-hint">{{ t('galleryPeopleHint') }}</p>
    </div>

    <div v-if="people.length === 0" class="gpg-empty" data-testid="gallery-people-empty">
      <span class="gpg-empty-icon" aria-hidden="true">
        <Users :size="28" />
      </span>
      <p>{{ t('galleryPeopleEmpty') }}</p>
    </div>

    <div v-else class="gpg-grid" role="list" :aria-label="t('galleryPeople')">
      <button
        v-for="(person, idx) in people"
        :key="person.id"
        type="button"
        role="listitem"
        class="gpg-card"
        :class="{ active: selectedSet.has(person.id) }"
        :aria-pressed="selectedSet.has(person.id)"
        :data-person-id="person.id"
        @click="onPersonClick($event, person)"
      >
        <span class="gpg-circle">
          <img v-if="avatarSrc(person)" :src="avatarSrc(person)!" :alt="person.name" loading="lazy" />
          <span v-else class="gpg-circle-fallback" :style="{ background: badgeColor(person, idx) }">
            {{ initialOf(person.name) }}
          </span>
          <span class="gpg-badge" :style="{ background: badgeColor(person, idx) }" aria-hidden="true">
            {{ initialOf(person.name) }}
          </span>
        </span>
        <span class="gpg-name">{{ person.name }}</span>
        <span class="gpg-count">{{ countLabel(person.count) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.gpg {
  max-width: 1180px;
  margin: 0 auto;
  padding: 16px 20px 36px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.gpg-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.gpg-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--ui-text);
}
.gpg-hint {
  margin: 0;
  font-size: 12.5px;
  color: var(--ui-text-muted);
}
.gpg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  border-radius: 18px;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur, 18px)) saturate(1.2);
  color: var(--ui-text-secondary);
  text-align: center;
}
.gpg-empty p {
  margin: 0;
  max-width: 380px;
  font-size: 14px;
}
.gpg-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  border: 1px solid var(--ui-glass-accent-border);
}
.gpg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 18px;
}
.gpg-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 14px 10px;
  border-radius: 18px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: center;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
.gpg-card:hover {
  background: var(--ui-glass-btn-bg);
  transform: translateY(-2px);
}
.gpg-card.active {
  background: var(--ui-glass-accent-tint), var(--ui-glass-accent-bg);
  border-color: var(--ui-glass-accent-border);
}
.gpg-card:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}
.gpg-circle {
  position: relative;
  width: 108px;
  height: 108px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--ui-glass-border);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  background: var(--ui-surface-subtle);
}
.gpg-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.gpg-circle-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
}
.gpg-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 11px;
  color: #fff;
  border: 2px solid rgba(10, 14, 11, 0.85);
}
.gpg-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--ui-text);
}
.gpg-count {
  font-size: 12px;
  color: var(--ui-text-muted);
}
</style>
