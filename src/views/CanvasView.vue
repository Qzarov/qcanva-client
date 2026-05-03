<template>
  <div class="canvas-view">
    <div v-if="loading" class="canvas-loading">Loading canvas...</div>
    <div v-else-if="error" class="canvas-error">
      <div class="error-modal">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(251,70,76,0.8)" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h2>Canvas not available</h2>
        <p>{{ error }}</p>
        <router-link to="/" class="error-home-btn">Go to Dashboard</router-link>
      </div>
    </div>
    <template v-else>
      <!-- Top bar -->
      <div class="canvas-topbar">
        <router-link to="/" class="topbar-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </router-link>
        <input
          v-if="canManageSettings"
          class="topbar-title"
          v-model="title"
          @blur="saveTitle"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
          placeholder="Untitled"
        />
        <span v-else class="topbar-title-ro">{{ title || 'Untitled' }}</span>
        <div class="topbar-right">
          <input
            v-model.trim="searchQuery"
            class="canvas-search-input"
            placeholder="Search in canvas"
            @input="runCanvasSearch"
            @keydown.enter.prevent="focusNextSearchResult"
          />
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
          <span class="topbar-sync" :class="'topbar-sync-' + syncStatus.kind" :title="'Revision ' + revision">
            {{ syncStatus.label }}<template v-if="pendingOpsCount"> · {{ pendingOpsCount }}</template>
          </span>
          <span v-if="searchMatches.length" class="topbar-role">{{ searchIndex + 1 }}/{{ searchMatches.length }}</span>
          <span v-if="role" class="topbar-role">{{ role }}</span>
          <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="cycleVisibility">
            {{ visibilityLabel }}
          </button>
          <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="showShare = !showShare">
            Share
          </button>
          <button v-if="role !== 'read'" class="btn-ghost btn-sm" @click="openEmbedPicker">
            Embed
          </button>
          <button class="btn-ghost btn-sm" @click="toggleHistory">
            History
          </button>
        </div>
      </div>

      <div v-if="syncNotice" class="sync-notice" :class="'sync-notice-' + syncNotice.kind">
        {{ syncNotice.text }}
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
        <span class="tb-label">First</span>
        <button
          v-for="a in aligns"
          :key="'first-' + a.v"
          class="tb-btn"
          :class="{ active: canvasRef?.getNodeFirstLineAlign(canvasRef.selectedNodeId) === a.v }"
          @click="canvasRef?.setNodeFirstLineAlign(canvasRef.selectedNodeId, a.v)"
          :title="'First line: ' + a.l"
          v-html="a.icon"
        ></button>
        <span class="tb-sep"></span>
        <span class="tb-label">Body</span>
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
        <label v-if="role === 'owner'" class="share-checkbox">
          <input type="checkbox" :checked="allowPublicEdit" @change="togglePublicEdit" />
          <span>Allow public edit</span>
        </label>
      </div>

      <!-- History panel -->
      <div v-if="showHistory" class="history-panel">
        <div class="history-panel-header">
          <h3>History</h3>
          <button class="btn-ghost btn-sm" @click="showHistory = false">×</button>
        </div>
        <!-- History access control (owner/admin) -->
        <div v-if="canManageSettings || isAdmin()" class="history-access-control">
          <label>Who can view history:</label>
          <select :value="historyAccess" @change="changeHistoryAccess(($event.target as HTMLSelectElement).value)">
            <option value="owner">Owner only</option>
            <option value="editors">Editors</option>
            <option value="viewers">All viewers</option>
          </select>
        </div>
        <div v-if="historyLoading && historyItems.length === 0" class="history-loading">Loading...</div>
        <div v-else-if="historyError" class="history-error">{{ historyError }}</div>
        <div v-else-if="historyItems.length === 0" class="history-empty">No history yet</div>
        <div v-else class="history-list">
          <div v-for="item in historyItems" :key="item.id" class="history-item">
            <div class="history-item-header">
              <span class="history-op-type" :class="'history-op-' + opCategory(item.type)">{{ opLabel(item.type) }}</span>
              <span class="history-user">{{ item.userName }}</span>
              <span class="history-rev">r{{ item.revision }}</span>
            </div>
            <div class="history-item-detail">{{ opDetail(item) }}</div>
            <div class="history-item-date">{{ formatHistoryDate(item.createdAt) }}</div>
          </div>
          <button v-if="hasMoreHistory" class="btn-ghost btn-sm history-load-more" @click="loadMoreHistory" :disabled="historyLoading">
            Load more
          </button>
        </div>
      </div>

      <!-- Embed canvas picker -->
      <div v-if="showEmbedPicker" class="embed-picker-panel">
        <div class="history-panel-header">
          <h3>Embed Canvas</h3>
          <button class="btn-ghost btn-sm" @click="showEmbedPicker = false">×</button>
        </div>
        <input
          v-model.trim="embedSearch"
          class="embed-search-input"
          placeholder="Search canvases..."
        />
        <div v-if="embedLoading" class="history-loading">Loading...</div>
        <div v-else class="embed-canvas-list">
          <div
            v-for="c in filteredEmbedCanvases"
            :key="c.id"
            class="embed-canvas-item"
            @click="doEmbed(c.id)"
          >
            <span class="embed-canvas-title">{{ c.title || 'Untitled' }}</span>
            <span class="embed-canvas-owner">{{ c.ownerName || c.ownerEmail || '' }}</span>
          </div>
          <div v-if="filteredEmbedCanvases.length === 0" class="history-empty">No canvases found</div>
        </div>
      </div>

      <CanvasLoader
        ref="canvasRef"
        :initial-data="canvasData"
        :readonly="role === 'read'"
        :remote-cursors="remoteCursorsArray"
        @change="onCanvasChange"
        @op="onCanvasOp"
        @cursor-move="onCursorMove"
        @open-canvas="onOpenCanvas"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { canvas as canvasApi, isAuthenticated, isAdmin } from '../api/client';
import { useCanvasSocket } from '../composables/useCanvasSocket';
import CanvasLoader from '../components/CanvasLoader.vue';

interface CanvasChangePayload {
  nodes: any[];
  edges: any[];
  forceSnapshot?: boolean;
}

export default defineComponent({
  components: { CanvasLoader },
  setup() {
    const route = useRoute();
    const router = useRouter();
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
    const visibility = ref<'private' | 'authenticated' | 'public'>('private');
    const allowPublicEdit = ref(false);
    const revision = ref(0);
    const isResyncing = ref(false);
    const syncIssue = ref<'conflict' | ''>('');
    const syncNotice = ref<{ kind: 'info' | 'warning'; text: string } | null>(null);
    const realtimeOpsUnavailable = ref(false);
    const searchQuery = ref('');
    const searchMatches = ref<string[]>([]);
    const searchIndex = ref(0);

    const visibilityLabel = computed(() => {
      const map = { private: 'Private', authenticated: 'Auth Only', public: 'Public' };
      return map[visibility.value];
    });
    const saving = ref(false);
    const showShare = ref(false);
    const shareEmail = ref('');
    const shareRole = ref('read');
    const permissions = ref<any[]>([]);
    const canManageSettings = computed(() => isAuthenticated() && (role.value === 'owner' || role.value === 'edit'));

    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let noticeTimeout: ReturnType<typeof setTimeout> | null = null;
    let isApplyingRemote = false;

    const syncStatus = computed(() => {
      if (syncIssue.value) return { kind: 'conflict', label: 'Conflict' };
      if (isResyncing.value) return { kind: 'resyncing', label: 'Resyncing' };
      if (saving.value || pendingOpsCount.value > 0) return { kind: 'saving', label: 'Saving' };
      if (wsConnected.value) return { kind: 'synced', label: 'Synced' };
      return { kind: 'offline', label: 'Offline' };
    });

    function showSyncNotice(kind: 'info' | 'warning', text: string) {
      syncNotice.value = { kind, text };
      if (noticeTimeout) clearTimeout(noticeTimeout);
      noticeTimeout = setTimeout(() => {
        syncNotice.value = null;
      }, 3200);
    }

    // WebSocket
    const {
      connected: wsConnected,
      onlineUsers,
      remoteCursors,
      connect: wsConnect,
      sendUpdate,
      sendOp,
      sendCursor,
      onRemoteCanvasUpdate,
      onRemoteOp,
      onReject,
      setRevision,
      pendingOpsCount,
      clearPendingOps,
    } = useCanvasSocket(canvasId);

    const otherUsers = computed(() => {
      return onlineUsers.value.filter((_u) => {
        return true;
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
        revision.value = res.canvas.revision ?? 0;
        setRevision(revision.value);
        role.value = res.role;
        isPublic.value = res.canvas.isPublic;
        visibility.value = res.canvas.visibility || (res.canvas.isPublic ? 'public' : 'private');
        allowPublicEdit.value = !!res.canvas.allowPublicEdit;
        if (res.role === 'owner') loadPermissions();

        // Connect WebSocket after canvas loaded
        wsConnect();
        onRemoteCanvasUpdate((dataStr: string, nextRevision: number) => {
          try {
            const parsed = JSON.parse(dataStr);
            isApplyingRemote = true;
            canvasRef.value?.applyRemoteData(parsed);
            revision.value = nextRevision;
            isApplyingRemote = false;
          } catch {}
        });
        onRemoteOp((op: any, nextRevision: number) => {
          isApplyingRemote = true;
          canvasRef.value?.applyRemoteOp(op);
          revision.value = nextRevision;
          isApplyingRemote = false;
        });
        onReject((reject) => {
          if (reject.reason === 'timeout') {
            realtimeOpsUnavailable.value = true;
            syncIssue.value = '';
            clearPendingOps();
            showSyncNotice('warning', 'Realtime ops unavailable. Saving full canvas snapshot.');
            void persistCurrentSnapshot();
            return;
          }

          syncIssue.value = 'conflict';
          showSyncNotice('warning', 'Parallel edit conflict. Restoring the latest canvas state.');
          void resyncCanvas();
        });
      } catch (e: any) {
        error.value = e.message || 'Canvas not found';
      }
      loading.value = false;
    };

    const resyncCanvas = async () => {
      if (isResyncing.value) return;
      isResyncing.value = true;
      try {
        const res = await canvasApi.resync(canvasId, revision.value);
        const parsed = JSON.parse(res.canvas.data);
        isApplyingRemote = true;
        canvasRef.value?.applyRemoteData(parsed);
        canvasData.value = parsed;
        revision.value = res.canvas.revision ?? 0;
        setRevision(revision.value);
        clearPendingOps();
        syncIssue.value = '';
        showSyncNotice('info', 'Canvas state refreshed.');
        isApplyingRemote = false;
      } catch (e: any) {
        error.value = e.message || 'Failed to resync canvas';
      } finally {
        isResyncing.value = false;
      }
    };

    const getCurrentCanvasData = (): CanvasChangePayload | null => {
      const currentData = canvasRef.value?.getCanvasData?.();
      if (!currentData) return null;
      return {
        nodes: currentData.nodes,
        edges: currentData.edges,
        forceSnapshot: true,
      };
    };

    const persistCurrentSnapshot = async () => {
      const currentData = getCurrentCanvasData();
      if (!currentData) return;
      await saveData(currentData);
    };

    const saveData = async (data: CanvasChangePayload) => {
      if (role.value !== 'owner' && role.value !== 'edit') return;
      if (wsConnected.value && !data.forceSnapshot && !realtimeOpsUnavailable.value) return;
      saving.value = true;
      if (wsConnected.value) {
        sendUpdate(JSON.stringify({ nodes: data.nodes, edges: data.edges }));
      } else {
        try {
          const updated = await canvasApi.update(canvasId, { data: JSON.stringify({ nodes: data.nodes, edges: data.edges }) });
          revision.value = updated?.revision ?? revision.value;
          setRevision(revision.value);
        } catch {}
      }
      saving.value = false;
    };

    const onCanvasChange = (data: CanvasChangePayload) => {
      if (isApplyingRemote) return;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => saveData(data), 1000);
    };

    const onCanvasOp = (op: any) => {
      if (isApplyingRemote) return;
      if (realtimeOpsUnavailable.value) return;
      if (wsConnected.value) {
        sendOp(op);
      }
    };

    const onCursorMove = (pos: { x: number; y: number }) => {
      if (wsConnected.value) {
        sendCursor(pos.x, pos.y);
      }
    };

    const saveTitle = async () => {
      if (!canManageSettings.value) return;
      await canvasApi.update(canvasId, { title: title.value });
    };

    const togglePublicEdit = async (e: Event) => {
      if (!canManageSettings.value) return;
      allowPublicEdit.value = (e.target as HTMLInputElement).checked;
      await canvasApi.update(canvasId, { allowPublicEdit: allowPublicEdit.value });
    };

    const cycleVisibility = async () => {
      const order: Array<'private' | 'authenticated' | 'public'> = ['private', 'authenticated', 'public'];
      const idx = order.indexOf(visibility.value);
      visibility.value = order[(idx + 1) % order.length]!;
      isPublic.value = visibility.value === 'public';
      await canvasApi.update(canvasId, { isPublic: isPublic.value, visibility: visibility.value });
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

    const runCanvasSearch = () => {
      searchMatches.value = canvasRef.value?.searchNodes?.(searchQuery.value) || [];
      searchIndex.value = 0;
      if (searchMatches.value.length) {
        canvasRef.value?.focusNode?.(searchMatches.value[0]);
      }
    };

    const focusNextSearchResult = () => {
      if (!searchMatches.value.length) return;
      searchIndex.value = (searchIndex.value + 1) % searchMatches.value.length;
      canvasRef.value?.focusNode?.(searchMatches.value[searchIndex.value]);
    };

    // --- History ---
    const showHistory = ref(false);
    const historyItems = ref<any[]>([]);
    const historyLoading = ref(false);
    const historyError = ref('');
    const historyAccess = ref('owner');
    const hasMoreHistory = ref(false);
    const HISTORY_PAGE = 30;

    const toggleHistory = async () => {
      showHistory.value = !showHistory.value;
      if (showHistory.value && historyItems.value.length === 0) {
        await loadHistory();
      }
    };

    const loadHistory = async () => {
      historyLoading.value = true;
      historyError.value = '';
      try {
        const res = await canvasApi.history(canvasId, HISTORY_PAGE + 1, 0);
        historyAccess.value = res.historyAccess;
        hasMoreHistory.value = res.items.length > HISTORY_PAGE;
        historyItems.value = res.items.slice(0, HISTORY_PAGE);
      } catch (e: any) {
        historyError.value = e.message || 'Cannot load history';
      } finally {
        historyLoading.value = false;
      }
    };

    const loadMoreHistory = async () => {
      historyLoading.value = true;
      try {
        const res = await canvasApi.history(canvasId, HISTORY_PAGE + 1, historyItems.value.length);
        hasMoreHistory.value = res.items.length > HISTORY_PAGE;
        historyItems.value.push(...res.items.slice(0, HISTORY_PAGE));
      } catch {} finally {
        historyLoading.value = false;
      }
    };

    const changeHistoryAccess = async (access: string) => {
      try {
        await canvasApi.updateHistoryAccess(canvasId, access);
        historyAccess.value = access;
      } catch (e: any) {
        alert(e.message);
      }
    };

    const opLabels: Record<string, string> = {
      'nodes-move': 'Moved nodes',
      'node-resize': 'Resized node',
      'node-add': 'Added node',
      'node-delete': 'Deleted nodes',
      'node-update': 'Updated node',
      'edge-add': 'Added edge',
      'edge-delete': 'Deleted edge',
      'edge-update': 'Updated edge',
    };

    const opLabel = (type: string) => opLabels[type] || type;

    const opCategory = (type: string) => {
      if (type.includes('add')) return 'add';
      if (type.includes('delete')) return 'delete';
      return 'change';
    };

    const opDetail = (item: any) => {
      try {
        const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;
        switch (item.type) {
          case 'node-add': return payload.node?.text?.slice(0, 60) || payload.node?.type || '';
          case 'node-delete': return `${payload.ids?.length || 1} node(s)`;
          case 'nodes-move': return `${payload.moves?.length || 1} node(s)`;
          case 'node-update': return Object.keys(payload.changes || {}).join(', ');
          case 'edge-add': return `${payload.edge?.fromNode?.slice(0, 8)} → ${payload.edge?.toNode?.slice(0, 8)}`;
          default: return '';
        }
      } catch {
        return '';
      }
    };

    const formatHistoryDate = (d: string) => {
      const date = new Date(d);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    // --- Embed Canvas ---
    const showEmbedPicker = ref(false);
    const embedSearch = ref('');
    const embedCanvases = ref<any[]>([]);
    const embedLoading = ref(false);

    const openEmbedPicker = async () => {
      showEmbedPicker.value = true;
      if (embedCanvases.value.length === 0) {
        embedLoading.value = true;
        try {
          const res = await canvasApi.list();
          const all = [...(res.own || []), ...(res.shared || []), ...(res.public || [])];
          embedCanvases.value = all.filter((c: any) => c.id !== canvasId);
        } catch {} finally {
          embedLoading.value = false;
        }
      }
    };

    const filteredEmbedCanvases = computed(() => {
      const q = embedSearch.value.toLowerCase();
      if (!q) return embedCanvases.value;
      return embedCanvases.value.filter((c: any) =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.ownerName || '').toLowerCase().includes(q)
      );
    });

    const doEmbed = (embedCanvasId: string) => {
      canvasRef.value?.addCanvasEmbed(embedCanvasId);
      showEmbedPicker.value = false;
    };

    const onOpenCanvas = (targetCanvasId: string) => {
      router.push('/canvas/' + targetCanvasId);
    };

    onMounted(load);
    onUnmounted(() => {
      if (saveTimeout) clearTimeout(saveTimeout);
      if (noticeTimeout) clearTimeout(noticeTimeout);
    });

    return {
      canvasRef, aligns,
      loading, error, title, canvasData, role, isPublic, saving, syncStatus, syncNotice,
      showShare, shareEmail, shareRole, permissions,
      onCanvasChange, onCanvasOp, onCursorMove, saveTitle, cycleVisibility, visibilityLabel, doShare, doRevoke,
      allowPublicEdit, canManageSettings, togglePublicEdit,
      searchQuery, searchMatches, searchIndex, runCanvasSearch, focusNextSearchResult,
      isAuthenticated, isAdmin,
      wsConnected, onlineUsers, otherUsers, remoteCursorsArray, revision, isResyncing, pendingOpsCount,
      showHistory, historyItems, historyLoading, historyError, historyAccess, hasMoreHistory,
      toggleHistory, loadMoreHistory, changeHistoryAccess,
      opLabel, opCategory, opDetail, formatHistoryDate,
      showEmbedPicker, embedSearch, filteredEmbedCanvases, embedLoading,
      openEmbedPicker, doEmbed, onOpenCanvas,
    };
  },
});
</script>
