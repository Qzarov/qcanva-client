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
      <section class="character-sheet">
        <div class="character-sheet-head"><div class="template-portrait"><img v-if="data.identity.portraitUrl" :src="data.identity.portraitUrl" alt="Портрет персонажа" /><span v-else>{{ data.identity.name.slice(0, 1).toUpperCase() }}</span><button type="button" title="Загрузить портрет" @click="portraitInput?.click()">▣</button><button v-if="data.identity.portraitUrl" type="button" title="Удалить портрет" @click="removePortrait">×</button></div><input v-model="data.identity.name" @change="save" /><span>ур. <input v-model.number="data.identity.level" type="number" min="1" @change="save" /></span></div>
        <div class="character-sheet-stats">
          <label>HP <input v-model.number="data.combat.currentHp" type="number" min="0" @change="save" /></label>
          <label>AC <input v-model.number="data.combat.armorClass" type="number" min="0" @change="save" /></label>
        </div>
        <div class="character-sheet-abilities"><label v-for="ability in abilities" :key="ability.key">{{ ability.short }}<input v-model.number="data.abilities[ability.key].score" type="number" min="1" max="30" @change="save" /></label></div>
      </section>
      <input ref="portraitInput" type="file" accept="image/*" hidden @change="uploadPortrait" />
    </main>
    <p v-else-if="error" class="template-error">{{ error }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { interactiveTemplates, uploadImage, type InteractiveTemplate } from '../api/client';
import { DND_ABILITIES, createDndCharacterSheet, normalizeDndCharacterSheet } from '../dnd/characterSheet';
import AccountMenu from '../components/AccountMenu.vue';

export default defineComponent({
  components: { AccountMenu },
  setup() {
    const route = useRoute(); const template = ref<InteractiveTemplate | null>(null); const saving = ref(false); const error = ref('');
    const data = reactive(createDndCharacterSheet());
    const abilities = DND_ABILITIES;
    const save = async () => { if (!template.value) return; saving.value = true; try { template.value = await interactiveTemplates.update(template.value.id, { title: template.value.title, data }); } catch (e: any) { error.value = e?.message || 'Не удалось сохранить шаблон'; } finally { saving.value = false; } };
    const portraitInput = ref<HTMLInputElement | null>(null);
    const uploadPortrait = async (event: Event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file) return; try { saving.value = true; const { url } = await uploadImage(file); if (url) { data.identity.portraitUrl = url; await save(); } } catch (e: any) { error.value = e?.message || 'Не удалось загрузить портрет'; } finally { saving.value = false; } };
    const removePortrait = async () => { data.identity.portraitUrl = ''; await save(); };
    onMounted(async () => { try { template.value = await interactiveTemplates.get(String(route.params.id)); Object.assign(data, normalizeDndCharacterSheet(template.value.data)); } catch (e: any) { error.value = e?.message || 'Шаблон не найден'; } });
    return { template, data, abilities, saving, error, save, portraitInput, uploadPortrait, removePortrait };
  },
});
</script>

<style scoped>
.template-page { min-height:100vh; padding:20px; background:var(--ui-page); color:var(--ui-text); }.template-header { display:flex; justify-content:space-between; max-width:720px; margin:0 auto 26px; }.template-header-actions { display:flex; align-items:center; gap:10px; }.template-save-status,.template-kind { color:var(--ui-text-secondary); font-size:13px; }
.template-editor { max-width:720px; margin:auto; }.template-editor-head { display:flex; justify-content:space-between; gap:16px; align-items:end; margin-bottom:20px; }.template-editor-head label { display:grid; gap:6px; color:var(--ui-text-secondary); font-size:13px; }.template-editor-head input { width:min(360px,75vw); padding:9px; border-radius:6px; border:1px solid var(--ui-border); background:var(--ui-surface-subtle); color:var(--ui-text); }
.character-sheet { max-width:560px; padding:20px; background:var(--ui-surface); border:1px solid var(--ui-border); border-radius:12px; }.character-sheet-head { display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--ui-border); padding-bottom:12px; }.character-sheet-head>input { flex:1; min-width:0; font-size:20px; font-weight:700; }.character-sheet input { color:var(--ui-text); background:var(--ui-surface-subtle); border:1px solid var(--ui-border); border-radius:5px; padding:5px; }.character-sheet-head>input { background:transparent; border:0; }.character-sheet-head span input { width:42px; }.character-sheet-stats { display:flex; gap:16px; margin:14px 0; }.character-sheet-stats label,.character-sheet-abilities label { display:grid; gap:4px; color:var(--ui-text-secondary); font-size:12px; }.character-sheet-stats input { width:54px; }.character-sheet-abilities { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }.character-sheet-abilities input { width:100%; box-sizing:border-box; font-weight:700; }.template-portrait { position:relative; display:grid; flex:0 0 62px; place-items:center; width:62px; height:62px; overflow:visible; border:1px solid var(--ui-border); border-radius:50%; background:var(--ui-brand-soft); color:var(--ui-brand-soft-on); font-size:23px; font-weight:700; }.template-portrait img { width:100%; height:100%; border-radius:50%; object-fit:cover; }.template-portrait button { position:absolute; right:-5px; bottom:-4px; width:20px; height:20px; padding:0; border:1px solid var(--ui-border); border-radius:50%; color:var(--ui-text); background:var(--ui-surface-elevated); cursor:pointer; }.template-portrait button + button { right:-25px; }.template-error { text-align:center; color:var(--ui-danger-foreground); }
</style>
