<template>
  <div class="dashboard">
    <header class="dash-header">
      <h1>My Canvases</h1>
      <div class="dash-actions">
        <button class="btn-primary" @click="createCanvas">+ New Canvas</button>
        <button class="btn-ghost" @click="logout">Logout</button>
      </div>
    </header>

    <div v-if="loading" class="dash-loading">Loading...</div>

    <div v-else class="dash-grid">
      <div
        v-for="c in allCanvases"
        :key="c.id"
        class="canvas-card"
        @click="$router.push(`/canvas/${c.id}`)"
      >
        <div class="card-title">{{ c.title }}</div>
        <div class="card-meta">
          <span v-if="c.isOwn" class="badge badge-owner">Owner</span>
          <span v-else class="badge badge-shared">{{ c.role }}</span>
          <span class="card-date">{{ formatDate(c.updatedAt) }}</span>
        </div>
        <button
          v-if="c.isOwn"
          class="card-delete"
          @click.stop="deleteCanvas(c.id)"
          title="Delete"
        >x</button>
      </div>

      <div v-if="allCanvases.length === 0" class="dash-empty">
        No canvases yet. Create your first one!
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { canvas, clearToken } from '../api/client';

export default defineComponent({
  setup() {
    const router = useRouter();
    const own = ref<any[]>([]);
    const shared = ref<any[]>([]);
    const loading = ref(true);

    const allCanvases = computed(() => [
      ...own.value.map((c) => ({ ...c, isOwn: true })),
      ...shared.value.map((c) => ({ ...c, isOwn: false })),
    ]);

    const load = async () => {
      loading.value = true;
      try {
        const res = await canvas.list();
        own.value = res.own;
        shared.value = res.shared;
      } catch {}
      loading.value = false;
    };

    const createCanvas = async () => {
      const c = await canvas.create('Untitled');
      router.push(`/canvas/${c.id}`);
    };

    const deleteCanvas = async (id: string) => {
      await canvas.delete(id);
      own.value = own.value.filter((c) => c.id !== id);
    };

    const logout = () => {
      clearToken();
      router.push('/login');
    };

    const formatDate = (d: string) => {
      return new Date(d).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    };

    onMounted(load);

    return { allCanvases, loading, createCanvas, deleteCanvas, logout, formatDate };
  },
});
</script>
