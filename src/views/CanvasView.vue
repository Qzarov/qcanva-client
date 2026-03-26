<template>
  <div class="canvas-view">
    <div v-if="loading" class="canvas-loading">Loading canvas...</div>
    <div v-else-if="error" class="canvas-error">{{ error }}</div>
    <template v-else>
      <!-- Top bar -->
      <div class="canvas-topbar">
        <router-link to="/" class="topbar-back" v-if="isAuthenticated()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </router-link>
        <input
          v-if="role === 'owner'"
          class="topbar-title"
          v-model="title"
          @blur="saveTitle"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span v-else class="topbar-title-ro">{{ title }}</span>
        <div class="topbar-right">
          <span v-if="saving" class="topbar-status">Saving...</span>
          <span v-if="role" class="topbar-role">{{ role }}</span>
          <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="togglePublic">
            {{ isPublic ? 'Public' : 'Private' }}
          </button>
          <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="showShare = !showShare">
            Share
          </button>
        </div>
      </div>

      <!-- Share panel -->
      <div v-if="showShare" class="share-panel">
        <h3>Share Canvas</h3>
        <div class="share-form">
          <input v-model="shareEmail" placeholder="Email" type="email" />
          <select v-model="shareRole">
            <option value="read">Read</option>
            <option value="edit">Edit</option>
          </select>
          <button @click="doShare">Share</button>
        </div>
        <div v-if="permissions.length" class="share-list">
          <div v-for="p in permissions" :key="p.id" class="share-item">
            <span>{{ p.user?.email || p.userId }} — {{ p.role }}</span>
            <button @click="doRevoke(p.userId)">x</button>
          </div>
        </div>
      </div>

      <CanvasLoader
        ref="canvasLoader"
        :initial-data="canvasData"
        :readonly="role === 'read'"
        @change="onCanvasChange"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { canvas as canvasApi, isAuthenticated } from '../api/client';
import CanvasLoader from '../components/CanvasLoader.vue';

export default defineComponent({
  components: { CanvasLoader },
  setup() {
    const route = useRoute();
    const canvasId = route.params.id as string;

    const loading = ref(true);
    const error = ref('');
    const title = ref('');
    const canvasData = ref<any>(null);
    const role = ref('');
    const isPublic = ref(false);
    const saving = ref(false);
    const showShare = ref(false);
    const shareEmail = ref('');
    const shareRole = ref('read');
    const permissions = ref<any[]>([]);

    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await canvasApi.get(canvasId);
        title.value = res.canvas.title;
        canvasData.value = JSON.parse(res.canvas.data);
        role.value = res.role;
        isPublic.value = res.canvas.isPublic;
        if (res.role === 'owner') loadPermissions();
      } catch (e: any) {
        error.value = e.message || 'Canvas not found';
      }
      loading.value = false;
    };

    const saveData = async (data: any) => {
      if (role.value !== 'owner' && role.value !== 'edit') return;
      saving.value = true;
      try {
        await canvasApi.update(canvasId, { data: JSON.stringify(data) });
      } catch {}
      saving.value = false;
    };

    const onCanvasChange = (data: any) => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => saveData(data), 1000);
    };

    const saveTitle = async () => {
      if (role.value !== 'owner') return;
      await canvasApi.update(canvasId, { title: title.value });
    };

    const togglePublic = async () => {
      isPublic.value = !isPublic.value;
      await canvasApi.update(canvasId, { isPublic: isPublic.value });
    };

    const loadPermissions = async () => {
      try {
        permissions.value = await canvasApi.permissions(canvasId);
      } catch {}
    };

    const doShare = async () => {
      if (!shareEmail.value) return;
      await canvasApi.share(canvasId, shareEmail.value, shareRole.value);
      shareEmail.value = '';
      loadPermissions();
    };

    const doRevoke = async (userId: string) => {
      await canvasApi.revoke(canvasId, userId);
      loadPermissions();
    };

    onMounted(load);
    onUnmounted(() => { if (saveTimeout) clearTimeout(saveTimeout); });

    return {
      loading, error, title, canvasData, role, isPublic, saving,
      showShare, shareEmail, shareRole, permissions,
      onCanvasChange, saveTitle, togglePublic, doShare, doRevoke,
      isAuthenticated,
    };
  },
});
</script>
