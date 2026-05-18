<template>
  <div class="html-editor-page">
    <header class="html-editor-bar">
      <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      <input v-model="title" class="html-title-input" :readonly="role !== 'owner'" />
      <label class="share-checkbox">
        <input type="checkbox" v-model="shared" :disabled="role !== 'owner'" />
        <span>Shared</span>
      </label>
      <button v-if="role === 'owner'" class="btn-primary" @click="save">Save</button>
    </header>
    <main class="html-editor-grid">
      <textarea v-if="role === 'owner'" v-model="html" class="html-source"></textarea>
      <section class="html-preview" @change="onPreviewChange" v-html="html"></section>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { htmlDocuments } from '../api/client';

export default defineComponent({
  setup() {
    const route = useRoute();
    const id = route.params.id as string;
    const title = ref('');
    const html = ref('');
    const shared = ref(false);
    const role = ref('read');

    async function load() {
      const res = await htmlDocuments.get(id);
      title.value = res.document.title;
      html.value = res.document.html;
      shared.value = !!res.document.shared;
      role.value = res.role;
    }

    async function save() {
      await htmlDocuments.update(id, { title: title.value, html: html.value, shared: shared.value });
      await load();
    }

    async function onPreviewChange(event: Event) {
      const target = event.target as HTMLInputElement;
      if (target?.type !== 'checkbox' || !target.dataset.checkId) return;
      await htmlDocuments.checklist(id, target.dataset.checkId, target.checked);
    }

    onMounted(load);
    return { title, html, shared, role, save, onPreviewChange };
  },
});
</script>
