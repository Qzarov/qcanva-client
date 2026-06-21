<template>
  <div class="chat-panel">
    <div class="chat-messages" ref="listRef">
      <div v-for="m in messages" :key="m.id" class="chat-msg">
        <div class="chat-msg-head">
          <span class="chat-msg-author">{{ m.authorName || 'User' }}</span>
          <time class="chat-msg-time">{{ formatTime(m.createdAt) }}</time>
        </div>
        <div class="chat-msg-text">{{ m.text }}</div>
      </div>
      <div v-if="!messages.length" class="chat-empty">Сообщений пока нет</div>
    </div>
    <div v-if="canPost" class="chat-input-row">
      <textarea v-model="draft" class="chat-input" rows="1" placeholder="Написать сообщение…" @keydown="onKey"></textarea>
      <button class="chat-send" :disabled="!draft.trim()" @click="submit">Отпр.</button>
    </div>
    <div v-else class="chat-readonly">Только для чтения</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
const props = defineProps<{ messages: any[]; canPost: boolean }>();
const emit = defineEmits<{ (e: "send", text: string): void }>();
const draft = ref("");
const listRef = ref<HTMLElement | null>(null);
const submit = () => {
  const text = draft.value.trim();
  if (!text) return;
  emit("send", text);
  draft.value = "";
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
};
const formatTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};
const scrollToBottom = () => { nextTick(() => { if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight; }); };
watch(() => props.messages.length, scrollToBottom);
</script>

<style scoped>
.chat-panel { display: flex; flex-direction: column; height: 100%; }
.chat-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.chat-msg-head { display: flex; gap: 8px; align-items: baseline; }
.chat-msg-author { font-weight: 600; font-size: 13px; }
.chat-msg-time { font-size: 11px; opacity: 0.6; }
.chat-msg-text { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
.chat-empty { opacity: 0.6; font-size: 13px; text-align: center; margin-top: 16px; }
.chat-input-row { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--dark-neutral-border, #313442); }
.chat-input { flex: 1; resize: none; background: var(--dark-input-bg, rgba(255,255,255,0.05)); color: inherit; border: 1px solid var(--dark-neutral-border, #313442); border-radius: 8px; padding: 6px 8px; font: inherit; }
.chat-send { padding: 0 12px; border-radius: 8px; border: 1px solid var(--dark-neutral-border, #313442); background: var(--color-brands, #00ff00); color: var(--color-brand-on, #071307); cursor: pointer; }
.chat-send:disabled { opacity: 0.5; cursor: default; }
.chat-readonly { padding: 8px; font-size: 12px; opacity: 0.6; text-align: center; border-top: 1px solid var(--dark-neutral-border, #313442); }
</style>
