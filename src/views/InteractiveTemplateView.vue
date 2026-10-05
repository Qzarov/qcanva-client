<template>
  <div class="template-page">
    <header class="template-header">
      <BackButton :to="backTarget.to" :label="backTarget.label" />
      <div class="template-header-actions"><span v-if="saving" class="template-save-status">Сохраняем…</span><AccountMenu :show-plugins="false" /></div>
    </header>
    <main v-if="template" class="template-editor">
      <DndCharacterSheet
        :data="data"
        @change="save"
        @request-portrait="portraitInput?.click()"
        @remove-portrait="removePortrait"
      />
      <input ref="portraitInput" type="file" accept="image/*" hidden @change="uploadPortrait" />
    </main>
    <p v-else-if="error" class="template-error">{{ error }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { markResourceOpened } from '../composables/useRecentResource';
import { interactiveTemplates, uploadImage, type InteractiveTemplate } from '../api/client';
import { characterSheetTitle, createDndCharacterSheet, normalizeDndCharacterSheet } from '../dnd/characterSheet';
import AccountMenu from '../components/AccountMenu.vue';
import DndCharacterSheet from '../components/DndCharacterSheet.vue';
import BackButton from '../components/BackButton.vue';
import { useResourceBackTarget } from '../composables/useResourceBackTarget';

export default defineComponent({
  components: { AccountMenu, DndCharacterSheet, BackButton },
  setup() {
    const route = useRoute();
    const { backTarget } = useResourceBackTarget();
    const template = ref<InteractiveTemplate | null>(null);
    const saving = ref(false);
    const error = ref('');
    const data = reactive(createDndCharacterSheet());

    const persist = async () => {
      if (!template.value) return;
      saving.value = true;
      try {
        template.value = await interactiveTemplates.update(template.value.id, { title: characterSheetTitle(data), data });
      } catch (e: any) {
        error.value = e?.message || 'Не удалось сохранить шаблон';
      } finally {
        saving.value = false;
      }
    };

    // Buffered autosave: `@change` already fires per-field (on blur), not per
    // keystroke; the debounce additionally batches rapid changes (HP actions,
    // proficiency pips) into one request instead of one save per click.
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; void persist(); }, 500);
    };
    onBeforeUnmount(() => { if (saveTimer) { clearTimeout(saveTimer); void persist(); } });

    const portraitInput = ref<HTMLInputElement | null>(null);
    const uploadPortrait = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        saving.value = true;
        const { url } = await uploadImage(file);
        if (url) { data.identity.portraitUrl = url; await persist(); }
      } catch (e: any) {
        error.value = e?.message || 'Не удалось загрузить портрет';
      } finally {
        saving.value = false;
      }
    };
    const removePortrait = async () => { data.identity.portraitUrl = ''; await persist(); };

    onMounted(async () => {
      try {
        template.value = await interactiveTemplates.get(String(route.params.id));
        markResourceOpened('interactive-template', template.value?.id);
        Object.assign(data, normalizeDndCharacterSheet(template.value.data));
      } catch (e: any) {
        error.value = e?.message || 'Шаблон не найден';
      }
    });

    return { template, data, saving, error, save, portraitInput, uploadPortrait, removePortrait, backTarget };
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
.template-header-actions { display:flex; align-items:center; gap:10px; }
.template-save-status { color:var(--ui-text-secondary); font-size:13px; }
.template-editor { max-width:1120px; margin:auto; padding:20px; }
.template-error { text-align:center; color:var(--ui-danger-foreground); }
@media (max-width: 760px) { .template-editor { padding:12px; } .template-header { padding:8px 12px; } }
</style>
