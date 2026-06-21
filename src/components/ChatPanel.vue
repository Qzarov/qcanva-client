<template>
  <div class="chat-panel">
    <div class="chat-messages" ref="listRef">
      <div v-for="m in messages" :key="m.id" class="chat-msg" :data-mid="m.id">
        <div v-if="m.replyToId" class="chat-quote" @click="scrollToMessage(m.replyToId)">
          <span class="chat-quote-author">{{ m.replyToAuthor || 'User' }}</span>
          <span class="chat-quote-text">{{ m.replyToText }}</span>
        </div>
        <div class="chat-msg-head">
          <span class="chat-msg-author">{{ m.authorName || 'User' }}</span>
          <time class="chat-msg-time">{{ formatTime(m.createdAt) }}</time>
          <button class="chat-reply-btn" title="Ответить" @click="startReply(m)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </button>
        </div>
        <div class="chat-msg-text">{{ m.text }}</div>
      </div>
      <div v-if="!messages.length" class="chat-empty">Сообщений пока нет</div>
    </div>
    <div v-if="canPost" class="chat-compose">
      <div v-if="replyingTo" class="chat-replying">
        <div class="chat-replying-body">
          <span class="chat-replying-label">Ответ для {{ replyingTo.authorName || 'User' }}</span>
          <span class="chat-replying-text">{{ replyingTo.text }}</span>
        </div>
        <button class="chat-replying-cancel" title="Отменить" @click="replyingTo = null">×</button>
      </div>
      <div class="chat-input-row">
        <textarea v-model="draft" class="chat-input" rows="1" placeholder="Написать сообщение…" @keydown="onKey"></textarea>
        <button class="chat-send" :disabled="!draft.trim()" @click="submit">Отпр.</button>
      </div>
    </div>
    <div v-else class="chat-readonly">Только для чтения</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
const props = defineProps<{ messages: any[]; canPost: boolean }>();
const emit = defineEmits<{ (e: "send", payload: { text: string; replyToId: string | null }): void }>();
const draft = ref("");
const replyingTo = ref<any | null>(null);
const listRef = ref<HTMLElement | null>(null);

const startReply = (m: any) => { replyingTo.value = m; };
const submit = () => {
  const text = draft.value.trim();
  if (!text) return;
  emit("send", { text, replyToId: replyingTo.value?.id ?? null });
  draft.value = "";
  replyingTo.value = null;
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
};
const formatTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};
const scrollToMessage = (id: string) => {
  const root = listRef.value;
  if (!root) return;
  const el = root.querySelector(`[data-mid="${id}"]`) as HTMLElement | null;
  if (!el) return;
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  el.classList.add("chat-msg-highlight");
  setTimeout(() => el.classList.remove("chat-msg-highlight"), 1200);
};
const scrollToBottom = () => { nextTick(() => { if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight; }); };
watch(() => props.messages.length, scrollToBottom);
</script>

<style scoped>
.chat-panel { display: flex; flex-direction: column; height: 100%; }
.chat-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.chat-msg { border-radius: 8px; padding: 2px 4px; transition: background 0.3s ease; }
.chat-msg-highlight { background: rgba(77, 171, 247, 0.25); }
.chat-quote { display: flex; flex-direction: column; gap: 1px; border-left: 3px solid var(--color-brands, #4dabf7); padding: 2px 6px; margin-bottom: 3px; background: rgba(255,255,255,0.04); border-radius: 4px; cursor: pointer; }
.chat-quote-author { font-size: 11px; font-weight: 600; color: var(--color-brands, #4dabf7); }
.chat-quote-text { font-size: 11px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.chat-msg-head { display: flex; gap: 8px; align-items: baseline; }
.chat-msg-author { font-weight: 600; font-size: 13px; }
.chat-msg-time { font-size: 11px; opacity: 0.6; }
.chat-reply-btn { margin-left: auto; background: none; border: none; color: inherit; opacity: 0; cursor: pointer; padding: 0 2px; display: flex; align-items: center; }
.chat-msg:hover .chat-reply-btn { opacity: 0.6; }
.chat-reply-btn:hover { opacity: 1 !important; }
.chat-msg-text { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
.chat-empty { opacity: 0.6; font-size: 13px; text-align: center; margin-top: 16px; }
.chat-compose { border-top: 1px solid var(--dark-neutral-border, #313442); }
.chat-replying { display: flex; align-items: center; gap: 6px; padding: 6px 8px 0; }
.chat-replying-body { flex: 1; border-left: 3px solid var(--color-brands, #4dabf7); padding: 0 6px; min-width: 0; }
.chat-replying-label { display: block; font-size: 11px; font-weight: 600; color: var(--color-brands, #4dabf7); }
.chat-replying-text { display: block; font-size: 11px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chat-replying-cancel { background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; opacity: 0.7; }
.chat-input-row { display: flex; gap: 6px; padding: 8px; }
.chat-input { flex: 1; resize: none; background: var(--dark-input-bg, rgba(255,255,255,0.05)); color: inherit; border: 1px solid var(--dark-neutral-border, #313442); border-radius: 8px; padding: 6px 8px; font: inherit; }
.chat-send { padding: 0 12px; border-radius: 8px; border: 1px solid var(--dark-neutral-border, #313442); background: var(--color-brands, #00ff00); color: var(--color-brand-on, #071307); cursor: pointer; }
.chat-send:disabled { opacity: 0.5; cursor: default; }
.chat-readonly { padding: 8px; font-size: 12px; opacity: 0.6; text-align: center; border-top: 1px solid var(--dark-neutral-border, #313442); }
</style>
