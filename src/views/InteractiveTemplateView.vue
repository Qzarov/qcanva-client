<template>
  <div class="template-page">
    <header class="template-header">
      <router-link :to="{ name: 'dashboard' }" class="btn-ghost">← Дашборд</router-link>
      <div class="template-header-actions"><span v-if="saving" class="template-save-status">Сохраняем…</span><AccountMenu /></div>
    </header>
    <main v-if="template" class="template-editor">
      <div class="template-editor-head">
        <label>Название в дашборде<input v-model="template.title" @change="save" /></label>
        <span class="template-kind">Интерактивный шаблон · D&D</span>
      </div>
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
import { createDndCharacterSheet, normalizeDndCharacterSheet } from '../dnd/characterSheet';
import AccountMenu from '../components/AccountMenu.vue';
import DndCharacterSheet from '../components/DndCharacterSheet.vue';

export default defineComponent({
  components: { AccountMenu, DndCharacterSheet },
  setup() {
    const route = useRoute();
    const template = ref<InteractiveTemplate | null>(null);
    const saving = ref(false);
    const error = ref('');
    const data = reactive(createDndCharacterSheet());

    const persist = async () => {
      if (!template.value) return;
      saving.value = true;
      try {
        template.value = await interactiveTemplates.update(template.value.id, { title: template.value.title, data });
      } catch (e: any) {
        error.value = e?.message || 'Не удалось сохранить шаблон';
      } finally {
        saving.value = false;
      }
    };

    // Buffered autosave: `@change` already fires per-field (on blur), not per
    // keystroke; the debounce additionally batches rapid toggles (HP +/-,
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

    return { template, data, saving, error, save, portraitInput, uploadPortrait, removePortrait };
  },
});
</script>

<style scoped>
/* Own scroll container: the global mobile rule `@media(max-width:640px){html,body{overflow:hidden}}`
   (there for the canvas) otherwise traps this tall sheet with no way to scroll. */
.template-page { height:100vh; height:100dvh; overflow-y:auto; overflow-x:hidden; padding:20px; background:var(--ui-page); color:var(--ui-text); }
.template-header { display:flex; justify-content:space-between; max-width:1080px; margin:0 auto 26px; }
.template-header-actions { display:flex; align-items:center; gap:10px; }
.template-save-status,.template-kind { color:var(--ui-text-secondary); font-size:13px; }
.template-editor { max-width:1080px; margin:auto; }
.template-editor-head { display:flex; justify-content:space-between; gap:16px; align-items:end; margin-bottom:20px; flex-wrap:wrap; }
.template-editor-head label { display:grid; gap:6px; color:var(--ui-text-secondary); font-size:13px; }
.template-editor-head input { width:min(360px,75vw); padding:9px; border-radius:6px; border:1px solid var(--ui-border); background:var(--ui-surface-subtle); color:var(--ui-text); }
.template-error { text-align:center; color:var(--ui-danger-foreground); }
@media (max-width: 760px) { .template-page { padding:12px; } }
</style>
