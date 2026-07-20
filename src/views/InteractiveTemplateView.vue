<template>
  <div class="template-page">
    <header class="template-header">
      <router-link to="/" class="btn-ghost">← Дашборд</router-link>
      <span v-if="saving" class="template-save-status">Сохраняем…</span>
    </header>
    <main v-if="template" class="template-editor">
      <div class="template-editor-head">
        <label>Название в дашборде<input v-model="template.title" @change="save" /></label>
        <span class="template-kind">Интерактивный шаблон · D&D</span>
      </div>
      <section class="character-sheet">
        <div class="character-sheet-head"><input v-model="data.name" @change="save" /><span>ур. <input v-model.number="data.level" type="number" min="1" @change="save" /></span></div>
        <div class="character-sheet-stats">
          <label>HP <input v-model.number="data.hp" type="number" min="0" @change="save" /></label>
          <label>AC <input v-model.number="data.ac" type="number" min="0" @change="save" /></label>
        </div>
        <div class="character-sheet-abilities"><label v-for="ability in abilities" :key="ability.key">{{ ability.label }}<input v-model.number="data[ability.key]" type="number" @change="save" /></label></div>
      </section>
    </main>
    <p v-else-if="error" class="template-error">{{ error }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { interactiveTemplates, type InteractiveTemplate } from '../api/client';

const defaults = { name: 'Новый персонаж', level: 1, hp: 10, ac: 10, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
export default defineComponent({
  setup() {
    const route = useRoute(); const template = ref<InteractiveTemplate | null>(null); const saving = ref(false); const error = ref('');
    const data = reactive<Record<string, string | number>>({ ...defaults });
    const abilities = [{ key: 'str', label: 'СИЛ' }, { key: 'dex', label: 'ЛОВ' }, { key: 'con', label: 'ТЕЛ' }, { key: 'int', label: 'ИНТ' }, { key: 'wis', label: 'МДР' }, { key: 'cha', label: 'ХАР' }];
    const save = async () => { if (!template.value) return; saving.value = true; try { template.value = await interactiveTemplates.update(template.value.id, { title: template.value.title, data }); } catch (e: any) { error.value = e?.message || 'Не удалось сохранить шаблон'; } finally { saving.value = false; } };
    onMounted(async () => { try { template.value = await interactiveTemplates.get(String(route.params.id)); Object.assign(data, defaults, template.value.data); } catch (e: any) { error.value = e?.message || 'Шаблон не найден'; } });
    return { template, data, abilities, saving, error, save };
  },
});
</script>

<style scoped>
.template-page { min-height: 100vh; padding: 20px; background: #11101a; color: #f3ead2; }
.template-header { display:flex; justify-content:space-between; max-width:720px; margin:0 auto 26px; }.template-save-status,.template-kind { color:#b7ad91; font-size:13px; }
.template-editor { max-width:720px; margin:auto; }.template-editor-head { display:flex; justify-content:space-between; gap:16px; align-items:end; margin-bottom:20px; }.template-editor-head label { display:grid; gap:6px; color:#b7ad91; font-size:13px; }.template-editor-head input { width:min(360px,75vw); padding:9px; border-radius:6px; border:1px solid #62583e; background:#211e2b; color:#fff3d4; }
.character-sheet { max-width:420px; padding:20px; background:linear-gradient(145deg,#28223b,#171522); border:1px solid #c9a35b; border-radius:12px; }.character-sheet-head { display:flex; gap:12px; border-bottom:1px solid #675834; padding-bottom:12px; }.character-sheet-head>input { flex:1; min-width:0; font-size:20px; font-weight:700; }.character-sheet input { color:#fff3d4; background:rgba(255,255,255,.06); border:1px solid rgba(201,163,91,.35); border-radius:5px; padding:5px; }.character-sheet-head>input { background:transparent; border:0; }.character-sheet-head span input { width:42px; }.character-sheet-stats { display:flex; gap:16px; margin:14px 0; }.character-sheet-stats label,.character-sheet-abilities label { display:grid; gap:4px; color:#cdbd96; font-size:12px; }.character-sheet-stats input { width:54px; }.character-sheet-abilities { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }.character-sheet-abilities input { width:100%; box-sizing:border-box; font-weight:700; }.template-error { text-align:center; color:#ff9898; }
</style>
