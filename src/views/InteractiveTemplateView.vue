<template>
  <div class="template-page">
    <header class="template-header" :class="{ 'has-tabs': tabMode }">
      <BackButton :to="backTarget.to" :label="backTarget.label" />
      <div class="template-header-actions">
        <span v-if="syncText" class="template-save-status" :class="{ 'is-warning': syncWarning }">{{ syncText }}</span>
        <DndUndoButtons v-if="template && !readonly && mode === 'setup'" :can-undo="undoStack.length > 0" :can-redo="redoStack.length > 0" @undo="undo" @redo="redo" />
        <DndSheetHistory v-if="template" :sheet-id="template.id" :can-restore="!readonly" @restored="onRestored" />
        <DndModeToggle v-if="template && !readonly" :mode="mode" @change="mode = $event" />
        <DndCanvasLink v-if="template" :canvas-id="data.campaign.canvasId" :target="rollTarget" :readonly="readonly" @link="linkCanvas" @unlink="linkCanvas('')" />
        <AccountMenu :show-plugins="false" />
      </div>
    </header>
    <main v-if="template" ref="editorRoot" class="template-editor" @input.capture="markDirty" @change.capture="markClean">
      <DndCharacterSheet
        :data="data"
        :readonly="readonly"
        :mode="readonly ? 'play' : mode"
        :remote-roll="remoteRoll"
        @change="commitEdits"
        @op="sendOperation"
        @request-portrait="portraitInput?.click()"
        @remove-portrait="removePortrait"
      />
      <input ref="portraitInput" type="file" accept="image/*" hidden @change="uploadPortrait" />
    </main>
    <p v-else-if="error" class="template-error">{{ error }}</p>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useActiveListener } from '../composables/useViewActivity';
import { useTab } from '../tabs/tabContext';
import { tabsEnabled } from '../tabs/flag';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { markResourceOpened } from '../composables/useRecentResource';
import { interactiveTemplates, uploadImage, type InteractiveTemplate } from '../api/client';
import { createDndCharacterSheet, isBlankSheet, normalizeDndCharacterSheet, type DndCharacterSheetData, type DndSheetMode } from '../dnd/characterSheet';
import { diffSheet, type SheetOperation } from '../dnd/sheetOperations';
import { SheetRollRefused, useCharacterSheetSocket } from '../composables/useCharacterSheetSocket';
import type { RemoteRoller } from '../dnd/useSheetRolls';
import DndCanvasLink from '../components/DndCanvasLink.vue';
import DndModeToggle from '../components/DndModeToggle.vue';
import DndUndoButtons from '../components/DndUndoButtons.vue';
import DndSheetHistory from '../components/DndSheetHistory.vue';
import { setupPart } from '../dnd/sheetKinds';
import { redoOps, undoOps, type UndoEntry } from '../dnd/sheetUndo';
import AccountMenu from '../components/AccountMenu.vue';
import DndCharacterSheet from '../components/DndCharacterSheet.vue';
import BackButton from '../components/BackButton.vue';
import { useResourceBackTarget } from '../composables/useResourceBackTarget';

type ViewPrefs = Pick<DndCharacterSheetData, 'activeTab' | 'displayMode'>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export default defineComponent({
  components: { AccountMenu, DndCharacterSheet, DndCanvasLink, DndModeToggle, DndUndoButtons, DndSheetHistory, BackButton },
  setup() {
    const route = useRoute();
    const sheetId = String(route.params.id);
    const { backTarget } = useResourceBackTarget();
    const template = ref<InteractiveTemplate | null>(null);
    const error = ref('');
    const data = reactive(createDndCharacterSheet());
    const sync = useCharacterSheetSocket(sheetId);

    // The tab and display mode are this viewer's, not the sheet's: the DM
    // switching tabs must not move the player's.
    const prefsKey = `dnd-sheet-view:${sheetId}`;
    const readPrefs = (): Partial<ViewPrefs> => {
      try { return JSON.parse(localStorage.getItem(prefsKey) || '{}') as Partial<ViewPrefs>; } catch { return {}; }
    };
    const prefs = reactive<Partial<ViewPrefs>>(readPrefs());
    const savePrefs = () => {
      prefs.activeTab = data.activeTab;
      prefs.displayMode = data.displayMode;
      try { localStorage.setItem(prefsKey, JSON.stringify(prefs)); } catch { /* storage unavailable: keep in memory */ }
    };

    // Play or setup: this viewer's own, never synced or remembered - every
    // opening starts in play, except a sheet nobody has filled in yet.
    const mode = ref<DndSheetMode>('play');
    let modeChosen = false;

    // What the sheet looked like after the last rebuild or edit: the base the
    // next edit is diffed against.
    let shadow = clone(data) as unknown as Record<string, unknown>;

    // Inputs save on `change` (blur/Enter). An input the user is typing in
    // must keep its text when a remote edit re-renders the sheet.
    const dirtyInputs = new WeakSet<EventTarget>();
    const markDirty = (event: Event) => { if (event.target) dirtyInputs.add(event.target); };
    const markClean = (event: Event) => { if (event.target) dirtyInputs.delete(event.target); };
    const editorRoot = ref<HTMLElement | null>(null);

    const rebuild = (sheet: Record<string, unknown>) => {
      const next = normalizeDndCharacterSheet(sheet);
      if (!modeChosen) {
        modeChosen = true;
        if (isBlankSheet(next)) mode.value = 'setup';
      }
      if (prefs.activeTab) next.activeTab = prefs.activeTab;
      if (prefs.displayMode) next.displayMode = prefs.displayMode;
      const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      const typing = active && dirtyInputs.has(active) && editorRoot.value?.contains(active)
        ? { element: active, value: active.value, start: active.selectionStart, end: active.selectionEnd }
        : null;
      Object.assign(data, next);
      shadow = clone(next) as unknown as Record<string, unknown>;
      if (typing) {
        void nextTick(() => {
          if (document.activeElement !== typing.element || typing.element.value === typing.value) return;
          typing.element.value = typing.value;
          try { typing.element.setSelectionRange(typing.start, typing.end); } catch { /* number inputs have no selection */ }
        });
      }
    };
    sync.onState(rebuild);

    const notice = ref('');
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    const showNotice = (text: string) => {
      notice.value = text;
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { notice.value = ''; }, 5000);
    };
    sync.onReject((reason) => {
      showNotice(reason === 'forbidden'
        ? 'Нет прав на изменение персонажа'
        : reason === 'target_missing' ? 'Этот элемент уже удалён' : 'Изменение не применилось');
    });

    // ===== Undo / redo of this tab's own setup edits (edit-modes spec, part 2) =====
    // Only setup edits made in setup mode are recorded; play actions are
    // corrected with their own buttons. The stacks live until a reload.
    const UNDO_LIMIT = 100;
    const newActionId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const undoStack = ref<UndoEntry[]>([]);
    const redoStack = ref<UndoEntry[]>([]);
    const current = () => clone(data) as unknown as Record<string, unknown>;
    const recordSetup = (ops: SheetOperation[], before: Record<string, unknown>) => {
      if (readonly.value || mode.value !== 'setup') return;
      const setupOps = setupPart(ops);
      if (!setupOps.length) return;
      undoStack.value = [...undoStack.value, { ops: setupOps, before, after: current() }].slice(-UNDO_LIMIT);
      redoStack.value = [];
    };
    const undo = () => {
      const entry = undoStack.value[undoStack.value.length - 1];
      if (!entry) return;
      undoStack.value = undoStack.value.slice(0, -1);
      const ops = undoOps(entry, current());
      if (!ops) {
        showNotice('Отмена пропущена: это уже изменил кто-то другой');
        return;
      }
      const meta = { actionId: newActionId(), note: 'undo' as const };
      for (const op of ops) sync.sendOperation(op, meta);
      redoStack.value = [...redoStack.value, entry];
    };
    const redo = () => {
      const entry = redoStack.value[redoStack.value.length - 1];
      if (!entry) return;
      redoStack.value = redoStack.value.slice(0, -1);
      const ops = redoOps(entry, current());
      if (!ops) {
        showNotice('Возврат пропущен: это уже изменил кто-то другой');
        return;
      }
      const meta = { actionId: newActionId(), note: 'redo' as const };
      for (const op of ops) sync.sendOperation(op, meta);
      undoStack.value = [...undoStack.value, entry];
    };
    // A restore reaches this tab as ordinary edits through the socket.
    // What the tabs panel shows for this sheet.
    const tab = useTab();
    watch(() => data.identity.name, (name) => tab.setTitle(name.trim() || 'Персонаж'), { immediate: true });
    watch(() => sync.status.value, (status) => tab.setStatus(status === 'offline' || status === 'error' ? 'offline' : status === 'connecting' ? 'reconnecting' : 'online'), { immediate: true });
    watch(() => sync.pendingCount.value, (count) => tab.setUnsent(count > 0), { immediate: true });

    const onRestored = (rolledBack: number) => { showNotice(`Настройка возвращена: откачено записей — ${rolledBack}`); };

    // Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y) in setup mode. A text field keeps its
    // own undo while it has focus.
    const undoKeys = (event: KeyboardEvent) => {
      if (mode.value !== 'setup' || readonly.value || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
    };

    // Undo keys only while this sheet is on screen, not from a background tab.
    useActiveListener(window, 'keydown', undoKeys);

    const sendOperation = (op: SheetOperation) => { sync.sendOperation(op); };
    const commitEdits = () => {
      if (data.activeTab !== shadow.activeTab || data.displayMode !== shadow.displayMode) savePrefs();
      const before = shadow;
      const ops = diffSheet(shadow, data as unknown as Record<string, unknown>);
      shadow = clone(data) as unknown as Record<string, unknown>;
      // One change on the sheet is one action in the history, however many fields it touched.
      const meta = ops.length > 1 ? { actionId: newActionId() } : undefined;
      for (const op of ops) sync.sendOperation(op, meta);
      recordSetup(ops, before);
    };

    // ===== Rolls to the chat of a connected canvas =====
    // The connection is a field of the sheet, so everyone who opens it sees
    // (and, with edit rights, changes) the same one.
    const linkCanvas = (canvasId: string) => {
      if (data.campaign.canvasId === canvasId) return;
      data.campaign.canvasId = canvasId;
      commitEdits();
    };
    // Reasons that mean "this user's rolls cannot reach the canvas": the roll is
    // made locally instead, and the header says so.
    const LOCAL_REASONS = new Set(['not_linked', 'forbidden', 'plugin_disabled', 'canvas_missing']);
    const remoteRoll: RemoteRoller = (spec) => {
      if (!data.campaign.canvasId) return null;
      const target = sync.rollTarget.value;
      const current = target && (!target.canvasId || target.canvasId === data.campaign.canvasId);
      if (current && target.status !== 'ok') return null;
      return sync.requestRoll(spec).catch((error: unknown) => {
        const reason = error instanceof SheetRollRefused ? error.reason : 'error';
        if (LOCAL_REASONS.has(reason)) {
          sync.requestRollTarget();
          showNotice('Бросок не попал в чат канваса — он только у вас');
          return null;
        }
        // No answer from the server: making the roll here would leave the table without it.
        showNotice(reason === 'offline' ? 'Нет связи — бросок не сделан' : 'Бросок не удался, попробуйте ещё раз');
        throw error;
      });
    };

    const readonly = computed(() => sync.role.value === 'read' || sync.status.value === 'forbidden');
    const syncWarning = computed(() => sync.status.value === 'offline' || sync.status.value === 'error');
    const syncText = computed(() => {
      if (notice.value) return notice.value;
      if (sync.status.value === 'forbidden') return 'Нет доступа';
      if (syncWarning.value) return sync.pendingCount.value ? 'Нет связи — изменения отправятся при подключении' : 'Нет связи';
      if (sync.pendingCount.value) return 'Сохраняем…';
      if (sync.role.value === 'read') return 'Только просмотр';
      return '';
    });

    /** A setup edit sent directly (not via the sheet's diff), still undoable. */
    const sendSetup = (op: SheetOperation) => {
      const before = current();
      sync.sendOperation(op);
      recordSetup([op], before);
    };
    const portraitInput = ref<HTMLInputElement | null>(null);
    const uploadPortrait = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const { url } = await uploadImage(file);
        if (url) sendSetup({ type: 'set', path: ['identity', 'portraitUrl'], value: url });
      } catch (e: any) {
        showNotice(e?.message || 'Не удалось загрузить портрет');
      }
    };
    const removePortrait = () => { sendSetup({ type: 'set', path: ['identity', 'portraitUrl'], value: '' }); };

    // Leaving with unconfirmed edits would lose them: ask first - both on a
    // full unload and on in-app navigation.
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (!sync.pendingCount.value) return;
      event.preventDefault();
      event.returnValue = '';
    };
    // With tabs, leaving is switching tabs: the sheet stays alive and its edits
    // keep syncing in the background, so there is nothing to confirm (closing
    // the tab asks instead).
    onBeforeRouteLeave(() => Boolean(tab.key) || !sync.pendingCount.value || window.confirm('Есть неотправленные изменения персонажа. Уйти со страницы?'));

    onMounted(async () => {
      window.addEventListener('beforeunload', warnUnsaved);

      try {
        template.value = await interactiveTemplates.get(sheetId);
        markResourceOpened('interactive-template', template.value?.id);
        sync.seed(template.value.data as Record<string, unknown>);
        sync.connect();
      } catch (e: any) {
        error.value = e?.message || 'Шаблон не найден';
      }
    });
    onBeforeUnmount(() => {
      window.removeEventListener('beforeunload', warnUnsaved);

      if (noticeTimer) clearTimeout(noticeTimer);
    });

    return {
      tabMode: tabsEnabled(),
      template, data, error, readonly, mode, undoStack, redoStack, undo, redo, onRestored, syncText, syncWarning, editorRoot,
      markDirty, markClean, commitEdits, sendOperation,
      rollTarget: sync.rollTarget, linkCanvas, remoteRoll,
      portraitInput, uploadPortrait, removePortrait, backTarget,
    };
  },
});
</script>

<style scoped>
/* Own scroll container: the global mobile rule `@media(max-width:640px){html,body{overflow:hidden}}`
   (there for the canvas) otherwise traps this tall sheet with no way to scroll. */
.template-page { height:100vh; height:100dvh; overflow-y:auto; overflow-x:hidden; background:var(--ui-page); color:var(--ui-text); }
.template-header { position:sticky; top:0; z-index:30; display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:56px; padding:10px 18px; pointer-events:none; }
.template-header > * { pointer-events:auto; }
.template-header :deep(.back-btn), .template-header :deep(.account-menu-trigger) { background:var(--ui-glass-tint),var(--ui-glass-bg); border:1px solid var(--ui-glass-border); box-shadow:inset 0 1px 0 var(--ui-glass-highlight),var(--ui-glass-shadow); backdrop-filter:blur(var(--ui-glass-blur)) saturate(1.2); color:var(--ui-text); }
.template-header :deep(.back-btn) { width:36px; height:36px; min-width:36px; border-radius:999px; }
.template-header :deep(.account-menu-trigger) { border-radius:999px; }
.template-header-actions { display:flex; align-items:center; justify-content:flex-end; gap:10px; min-width:0; }
.template-save-status { min-width:0; color:var(--ui-text-secondary); font-size:13px; }
.template-save-status.is-warning { color:var(--ui-danger-foreground); }
.template-editor { max-width:1120px; margin:auto; padding:20px; }
.template-error { text-align:center; color:var(--ui-danger-foreground); }
@media (max-width: 760px) { .template-editor { padding:12px; } .template-header { padding:8px 12px; } }
/* Tab mode adds the tabs button next to Back: on the narrowest phones the
   header tightens, the canvas link shrinks to its dot, and below 340 px the
   account menu (also on the dashboard, one tap away in the tabs panel) goes. */
@media (max-width: 360px) {
  .template-header.has-tabs { gap:4px; padding:8px; }
  .template-header.has-tabs .template-header-actions { gap:4px; }
  .template-header.has-tabs :deep(.back-group) { gap:4px; }
  .template-header.has-tabs :deep(.dnd-undo) { gap:4px; }
  .template-header.has-tabs :deep(.dnd-link-button) { width:36px; padding:0; justify-content:center; }
  .template-header.has-tabs :deep(.dnd-link-text) { display:none; }
}
@media (max-width: 340px) { .template-header.has-tabs :deep(.account-menu) { display:none; } }
</style>
