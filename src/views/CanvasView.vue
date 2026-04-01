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
          v-if="role === 'owner' || role === 'edit'"
          class="topbar-title"
          v-model="title"
          @blur="saveTitle"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          placeholder="Untitled"
        />
        <span v-else class="topbar-title-ro">{{ title || 'Untitled' }}</span>
        <div class="topbar-right">
          <!-- Online users -->
          <div v-if="onlineUsers.length > 1" class="online-users">
            <div
              v-for="u in otherUsers"
              :key="u.socketId"
              class="online-avatar"
              :style="{ background: u.color }"
              :title="u.name"
            >{{ u.name.charAt(0).toUpperCase() }}</div>
          </div>
          <span v-if="wsConnected" class="topbar-ws-status" title="Realtime connected">
            <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#44cf6e"/></svg>
          </span>
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

      <!-- Node toolbar (under topbar, visible when node selected) -->
      <div v-if="canvasRef?.selectedNodeId && !canvasRef?.editingNodeId" class="node-toolbar">
        <!-- Fill color -->
        <span class="tb-label">Fill</span>
        <button v-for="c in ['1','2','3','4','5','6']" :key="c" class="tb-color" :class="'ctx-color-'+c" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, c)"></button>
        <button class="tb-color tb-color-none" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, undefined)">x</button>
        <button class="tb-btn tb-fill-toggle" :class="{ active: canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' }" @click="canvasRef?.toggleNodeFillStyle(canvasRef.selectedNodeId)" title="Toggle solid/gradient fill">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" :fill="canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <span class="tb-sep"></span>
        <!-- Text align -->
        <span class="tb-label">Align</span>
        <button v-for="a in aligns" :key="a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
        <span class="tb-sep"></span>
        <!-- Border style -->
        <span class="tb-label">Border</span>
        <button v-for="bs in canvasRef?.borderStyles" :key="bs.value" class="tb-btn" :class="{ active: canvasRef?.getNodeBorderStyle(canvasRef.selectedNodeId) === bs.value }" @click="canvasRef?.setNodeBorderStyle(canvasRef.selectedNodeId, bs.value)" :title="bs.label">
          <svg width="24" height="10" viewBox="0 0 24 10" v-html="bs.svg"></svg>
        </button>
        <span class="tb-sep"></span>
        <!-- Border width -->
        <span class="tb-label">Width</span>
        <button v-for="bw in [1,2,3,4]" :key="'bw'+bw" class="tb-btn" :class="{ active: canvasRef?.getNodeBorderWidth(canvasRef.selectedNodeId) === bw }" @click="canvasRef?.setNodeBorderWidth(canvasRef.selectedNodeId, bw)" :title="bw+'px'">
          <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" :stroke-width="bw"/></svg>
        </button>
        <span class="tb-sep"></span>
        <!-- Border color -->
        <span class="tb-label">Color</span>
        <button v-for="c in ['#fb464c','#e9973f','#e0de71','#44cf6e','#53dfdd','#a882ff','#ffffff']" :key="'bc'+c" class="tb-color" :style="{background: c}" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, c)"></button>
        <button class="tb-color tb-color-none" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, undefined)">x</button>
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
        ref="canvasRef"
        :initial-data="canvasData"
        :readonly="role === 'read'"
        :remote-cursors="remoteCursorsArray"
        @change="onCanvasChange"
        @cursor-move="onCursorMove"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { canvas as canvasApi, isAuthenticated } from '../api/client';
import { useCanvasSocket, type RemoteCursor } from '../composables/useCanvasSocket';
import CanvasLoader from '../components/CanvasLoader.vue';

export default defineComponent({
  components: { CanvasLoader },
  setup() {
    const route = useRoute();
    const canvasId = route.params.id as string;

    const canvasRef = ref<any>(null);

    const aligns = [
      { v: 'left', l: 'Left', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>' },
      { v: 'center', l: 'Center', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>' },
      { v: 'right', l: 'Right', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>' },
      { v: 'justify', l: 'Justify', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' },
    ];

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
    let isApplyingRemote = false;

    // WebSocket
    const {
      connected: wsConnected,
      onlineUsers,
      remoteCursors,
      connect: wsConnect,
      sendUpdate,
      sendCursor,
      onRemoteCanvasUpdate,
    } = useCanvasSocket(canvasId);

    const otherUsers = computed(() => {
      return onlineUsers.value.filter((u) => {
        // Filter out self — socket id won't match any user if we check by presence
        // We keep all users except self; self is the one whose socketId matches the connected socket
        return true; // We'll filter self server-side or by checking socket id
      });
    });

    const remoteCursorsArray = computed(() => {
      return Array.from(remoteCursors.value.values());
    });

    const load = async () => {
      try {
        const res = await canvasApi.get(canvasId);
        title.value = res.canvas.title;
        canvasData.value = JSON.parse(res.canvas.data);
        role.value = res.role;
        isPublic.value = res.canvas.isPublic;
        if (res.role === 'owner') loadPermissions();

        // Connect WebSocket after canvas loaded
        if (isAuthenticated()) {
          wsConnect();
          onRemoteCanvasUpdate((dataStr: string) => {
            try {
              const parsed = JSON.parse(dataStr);
              isApplyingRemote = true;
              canvasRef.value?.applyRemoteData(parsed);
              isApplyingRemote = false;
            } catch {}
          });
        }
      } catch (e: any) {
        error.value = e.message || 'Canvas not found';
      }
      loading.value = false;
    };

    const saveData = async (data: any) => {
      if (role.value !== 'owner' && role.value !== 'edit') return;
      saving.value = true;
      // Send via WebSocket (persists on server too)
      if (wsConnected.value) {
        sendUpdate(JSON.stringify(data));
      } else {
        try {
          await canvasApi.update(canvasId, { data: JSON.stringify(data) });
        } catch {}
      }
      saving.value = false;
    };

    const onCanvasChange = (data: any) => {
      if (isApplyingRemote) return; // Don't echo back remote updates
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => saveData(data), 1000);
    };

    const onCursorMove = (pos: { x: number; y: number }) => {
      if (wsConnected.value) {
        sendCursor(pos.x, pos.y);
      }
    };

    const saveTitle = async () => {
      if (role.value !== 'owner' && role.value !== 'edit') return;
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
      canvasRef, aligns,
      loading, error, title, canvasData, role, isPublic, saving,
      showShare, shareEmail, shareRole, permissions,
      onCanvasChange, onCursorMove, saveTitle, togglePublic, doShare, doRevoke,
      isAuthenticated,
      wsConnected, onlineUsers, otherUsers, remoteCursorsArray,
    };
  },
});
</script>
