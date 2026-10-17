<template>
  <div v-if="isAllowed" class="hub-override-card" data-hub-override>
    <label class="hub-override-label" for="hub-override-address">
      Адрес хаба (для отладки)
    </label>
    <div class="hub-override-row">
      <input
        id="hub-override-address"
        v-model="inputValue"
        type="text"
        inputmode="url"
        autocapitalize="off"
        spellcheck="false"
        placeholder="http://192.168.1.59:8080"
        class="hub-override-input"
        data-hub-override-input
        @keydown.enter.prevent="save"
      />
      <button
        type="button"
        class="hub-override-btn hub-override-btn-save"
        data-hub-override-save
        @click="save"
      >
        Сохранить
      </button>
      <button
        type="button"
        class="hub-override-btn hub-override-btn-reset"
        data-hub-override-reset
        @click="reset"
      >
        Сбросить
      </button>
    </div>
    <p v-if="error" class="hub-override-error" role="alert" data-hub-override-error>
      {{ error }}
    </p>
    <div class="hub-override-details">
      <p class="hub-override-meta" data-hub-override-current>
        Текущий адрес: {{ currentBase }}
      </p>
      <p class="hub-override-meta" data-hub-override-default>
        По умолчанию: {{ defaultBase }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  defaultApiBase,
  getHubOverride,
  isHubOverrideAllowed,
  normalizeHubOverride,
  resolveApiBase,
} from '../api/hubOverride';
import { applyHubOverride } from '../api/hubSwitch';

const isAllowed = isHubOverrideAllowed();
const currentBase = resolveApiBase();
const defaultBase = defaultApiBase();

const inputValue = ref(getHubOverride() ?? '');
const error = ref<string | null>(null);

function save() {
  error.value = null;
  const raw = inputValue.value.trim();
  if (!raw) {
    error.value = 'Нужен адрес вида http://IP:порт';
    return;
  }
  const normalized = normalizeHubOverride(raw);
  if (!normalized) {
    error.value = 'Нужен адрес вида http://IP:порт';
    return;
  }
  try {
    applyHubOverride(normalized);
  } catch {
    error.value = 'Нужен адрес вида http://IP:порт';
  }
}

function reset() {
  error.value = null;
  inputValue.value = '';
  applyHubOverride(null);
}
</script>

<style scoped>
.hub-override-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed var(--ui-border, #444);
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.04));
  font-size: 0.9rem;
}

.hub-override-label {
  font-weight: 600;
  color: var(--ui-text-primary, inherit);
  font-size: 0.85rem;
}

.hub-override-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hub-override-input {
  flex: 1 1 200px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #555);
  background: var(--ui-surface, #222);
  color: inherit;
  font-size: 0.85rem;
}

.hub-override-input:focus {
  outline: none;
  border-color: var(--ui-brand, #3b82f6);
}

.hub-override-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #555);
  background: var(--ui-surface-hover, #333);
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

.hub-override-btn-save {
  background: var(--ui-brand, #3b82f6);
  border-color: var(--ui-brand, #3b82f6);
  color: #fff;
}

.hub-override-btn-reset {
  color: var(--ui-text-muted, #aaa);
}

.hub-override-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ui-danger, #ef4444);
}

.hub-override-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
  color: var(--ui-text-muted, #888);
  word-break: break-all;
}

.hub-override-meta {
  margin: 0;
}
</style>
