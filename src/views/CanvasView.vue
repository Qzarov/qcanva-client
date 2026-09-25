<template>
  <div ref="canvasViewRef" class="canvas-view">
    <div v-if="loading" class="canvas-loading">Loading canvas...</div>
    <div v-else-if="error" class="canvas-error">
      <div class="error-modal">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--ui-danger)" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h2>Canvas not available</h2>
        <p>{{ error }}</p>
        <router-link :to="{ name: 'dashboard' }" class="error-home-btn">Go to Dashboard</router-link>
      </div>
    </div>
    <AccessGate
      v-else-if="accessDenied"
      resource-type="canvas"
      :password-access-enabled="gatePasswordAccessEnabled"
      :checking-password="checkingResourcePassword"
      :requesting-access="requestingAccess"
      :access-request-sent="accessRequestSent"
      @submit-password="loginWithCanvasPassword"
      @request-access="requestCanvasAccess"
    />
    <template v-else>
      <!-- Top bar -->
      <div ref="topbarRef" class="canvas-topbar">
        <BackButton :to="backTarget.to" :label="backTarget.label" />
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
          <!-- Compact status, always visible -->
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
            <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="var(--ui-success)"/></svg>
          </span>
          <div class="sync-menu-wrap">
            <button
              class="topbar-sync"
              :class="'topbar-sync-' + syncStatus.kind"
              :title="syncBadgeTitle"
              @click="showSyncEvents = !showSyncEvents"
            >
              {{ syncStatus.label }}
            </button>
            <div v-if="showSyncEvents" class="sync-events-popover">
              <div class="sync-events-head">
                <strong>{{ t('syncPopoverTitle') }}</strong>
                <span>r{{ revision }}</span>
              </div>
              <div v-if="syncEvents.length === 0" class="sync-event-empty">{{ t('noLocalSyncEventsYet') }}</div>
              <div v-for="event in syncEvents" :key="event.id" class="sync-event-row" :class="'sync-event-' + event.status">
                <div>
                  <strong>{{ event.label }}</strong>
                  <span v-if="event.reason">{{ syncReasonLabel(event.reason) }}</span>
                </div>
                <time>{{ formatSyncEventTime(event.timestamp) }}</time>
              </div>
            </div>
          </div>

          <!-- Secondary actions: inline on desktop, dropdown menu on mobile -->
          <div class="topbar-actions" :class="{ open: menuOpen }">
            <input
              v-model.trim="searchQuery"
              class="canvas-search-input"
              placeholder="Search in canvas"
              @input="runCanvasSearch"
              @keydown.enter.prevent="focusNextSearchResult"
            />
            <span v-if="searchMatches.length" class="topbar-role">{{ searchIndex + 1 }}/{{ searchMatches.length }}</span>
            <span v-if="role" class="topbar-role">{{ role }}</span>
            <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="toggleShare(); menuOpen = false">
              {{ t('access') }}
            </button>
            <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="showPlugins = !showPlugins; menuOpen = false">{{ t('plugins') }}</button>
            <button v-if="canViewHistory" class="btn-ghost btn-sm" @click="toggleHistory(); menuOpen = false">
              {{ t('history') }}
            </button>
            <button class="btn-ghost btn-sm" @click="toggleChat(); menuOpen = false" :title="t('chat')">
              {{ t('chat') }}
            </button>
            <button class="btn-ghost btn-sm" @click="showShortcuts = !showShortcuts; menuOpen = false" :title="t('keyboardShortcuts')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
              <span class="topbar-action-label">{{ t('shortcuts') }}</span>
            </button>

            <!-- Canvas actions (mobile dropdown only — create actions moved to + sheet) -->
            <div class="topbar-canvas-actions">
              <span class="topbar-actions-sep"></span>
              <button class="btn-ghost btn-sm" @click="canvasRef?.resetView(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span>{{ t('resetView') }}</span>
              </button>
              <button class="btn-ghost btn-sm" @click="canvasRef?.onExportCanvas(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>{{ t('exportCanvas') }}</span>
              </button>
              <button class="btn-ghost btn-sm" @click="copyPublicLink(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>{{ t('copyLink') }}</span>
              </button>
            </div>
          </div>

          <!-- Undo / Redo (mobile header only — desktop uses keyboard / controls panel) -->
          <button
            v-if="role !== 'read'"
            class="canvas-topbar-undo mobile-only"
            :disabled="!canvasRef?.canUndo"
            :title="t('undo')"
            :aria-label="t('undo')"
            @click="canvasRef?.undo()"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-2"/></svg>
          </button>
          <button
            v-if="role !== 'read'"
            class="canvas-topbar-redo mobile-only"
            :disabled="!canvasRef?.canRedo"
            :title="t('redo')"
            :aria-label="t('redo')"
            @click="canvasRef?.redo()"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h2"/></svg>
          </button>

          <AccountMenu v-if="currentUser" />
          <router-link v-else :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn-ghost btn-sm topbar-login">{{ t('login') }}</router-link>

          <!-- Overflow menu toggle (mobile only) -->
          <button class="topbar-menu-btn" @click="menuOpen = !menuOpen" :title="menuOpen ? 'Close menu' : 'Menu'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
      </div>

      <!-- Tap-away backdrop to close the mobile overflow menu -->
      <div v-if="menuOpen" class="topbar-menu-backdrop" @click="menuOpen = false"></div>

      <div v-if="syncNotice" class="sync-notice" :class="'sync-notice-' + syncNotice.kind">
        {{ syncNotice.text }}
      </div>
      <div v-if="cacheStatus" class="resource-cache-status" :class="`resource-cache-status-${cacheStatus.kind}`">{{ cacheStatus.text }}</div>

      <section v-if="showPlugins && role === 'owner'" class="canvas-plugin-panel">
        <div class="canvas-plugin-panel-head"><strong>{{ t('canvasPlugins') }}</strong><button class="btn-ghost btn-sm" @click="showPlugins = false">×</button></div>
        <p v-if="!pluginItems.length" class="canvas-plugin-empty">{{ t('noPluginsForCanvas') }}</p>
        <div v-for="plugin in pluginItems" :key="plugin.id" class="canvas-plugin-row">
          <div><strong>{{ plugin.name }}</strong><span>{{ plugin.description }}</span></div>
          <button
            class="plugin-toggle"
            :class="{ on: plugin.enabled, loading: settingPluginId === plugin.id }"
            role="switch"
            :aria-checked="plugin.enabled"
            :aria-label="`${plugin.name}: ${plugin.enabled ? t('pluginEnabled') : t('pluginDisabled')}`"
            :title="plugin.enabled ? t('disablePlugin') : t('enablePlugin')"
            :disabled="settingPluginId === plugin.id"
            @click="setCanvasPlugin(plugin.id, !plugin.enabled)"
          ><span class="plugin-toggle-label">{{ plugin.enabled ? t('pluginOn') : t('pluginOff') }}</span><span class="plugin-toggle-knob"></span></button>
        </div>
        <!-- Minimap preference — local per-device, not per-canvas; always visible in settings -->
        <div class="canvas-plugin-row canvas-plugin-row-minimap">
          <div><strong>{{ t('minimap') }}</strong></div>
          <button
            class="plugin-toggle"
            :class="{ on: minimapEnabled }"
            role="switch"
            :aria-checked="minimapEnabled"
            :aria-label="`${t('minimap')}: ${minimapEnabled ? t('pluginEnabled') : t('pluginDisabled')}`"
            :title="minimapEnabled ? t('disablePlugin') : t('enablePlugin')"
            @click="setMinimapEnabled(!minimapEnabled)"
          ><span class="plugin-toggle-label">{{ minimapEnabled ? t('pluginOn') : t('pluginOff') }}</span><span class="plugin-toggle-knob"></span></button>
        </div>
        <div v-if="interactiveTemplatesEnabled" class="canvas-plugin-template-actions">
          <button class="btn-primary btn-sm" @click="canvasRef?.addDndCharacterTemplate(); showPlugins = false">{{ t('addCharacterCard') }}</button>
          <button class="btn-ghost btn-sm" @click="loadTemplateImport">{{ t('importFromTemplates') }}</button>
          <div v-if="templateImportOpen" class="canvas-template-import-list">
            <span v-if="templateImportLoading">{{ t('loadingTemplates') }}</span>
            <span v-else-if="!templateImportItems.length">{{ t('noTemplatesInDashboard') }}</span>
            <button v-for="template in templateImportItems" :key="template.id" class="btn-ghost btn-sm" @click="importTemplateToCanvas(template)">{{ template.title }}</button>
          </div>
        </div>
      </section>

      <!-- Desktop node inspector (top-left, visible when node selected) -->
      <div
        v-if="canvasRef?.selectedNodeIds?.length && !canvasRef?.editingNodeId && !canvasRef?.isManipulatingNode"
        ref="nodeToolbarRef"
        class="node-toolbar"
        @pointerdown.stop
        @click.stop
      >
        <div class="node-toolbar-tabs">
          <button v-if="canvasRef?.selectedNodeId" class="toolbar-tab" :class="{ active: activeToolbarMenu === 'fill' }" @click="toggleToolbarMenu('fill')" title="Background settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15l5-5 4 4 2-2 5 5"/></svg>
            <span>{{ t('background') }}</span>
          </button>
          <button v-if="canvasRef?.selectedNodeId" class="toolbar-tab" :class="{ active: activeToolbarMenu === 'text' }" @click="toggleToolbarMenu('text')" title="Text settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
            <span>{{ t('text') }}</span>
          </button>
          <button v-if="canvasRef?.selectedNodeId" class="toolbar-tab" :class="{ active: activeToolbarMenu === 'border' }" @click="toggleToolbarMenu('border')" title="Border settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 5v14M15 5v14M5 9h14M5 15h14"/></svg>
            <span>{{ t('border') }}</span>
          </button>
          <button class="toolbar-tab" :class="{ active: activeToolbarMenu === 'layers' }" @click="toggleToolbarMenu('layers')" title="Layer settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></svg>
            <span>{{ t('layers') }}</span>
          </button>
          <button class="toolbar-tab" :class="{ active: activeToolbarMenu === 'actions' }" @click="toggleToolbarMenu('actions')" title="Node actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>
            <span>{{ t('nodeActions') }}</span>
          </button>
        </div>

        <div v-if="activeToolbarMenu && (canvasRef?.selectedNodeId || activeToolbarMenu === 'layers' || activeToolbarMenu === 'actions')" class="toolbar-popover">
          <template v-if="activeToolbarMenu === 'fill'">
            <div class="toolbar-popover-title">{{ t('background') }}</div>
            <div class="toolbar-grid">
              <button v-for="c in ['1','2','3','4','5','6']" :key="'fill-'+c" class="tb-color" :class="['ctx-color-'+c, { active: canvasRef?.getNodeColor(canvasRef.selectedNodeId) === c }]" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, c)"></button>
              <button class="tb-color tb-color-none" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, undefined)">x</button>
            </div>
            <div class="toolbar-menu-row">
              <button class="toolbar-choice" :class="{ active: canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' }" @click="canvasRef?.toggleNodeFillStyle(canvasRef.selectedNodeId)">
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" :fill="canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>{{ canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' ? t('solid') : t('gradient') }}</span>
              </button>
              <button class="toolbar-choice" :class="{ active: canvasRef?.isNodeTransparent(canvasRef.selectedNodeId) }" @click="canvasRef?.toggleNodeTransparent(canvasRef.selectedNodeId)">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2h12v12H2z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 13L13 3" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>{{ t('transparent') }}</span>
              </button>
              <button class="toolbar-choice" :class="{ active: canvasRef?.getNodeShape(canvasRef.selectedNodeId) === 'round' }" @click="canvasRef?.toggleNodeShape(canvasRef.selectedNodeId)">
                <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                <span>{{ t('round') }}</span>
              </button>
            </div>
          </template>

          <template v-else-if="activeToolbarMenu === 'text'">
            <div class="toolbar-popover-title">{{ t('text') }}</div>
            <div class="toolbar-popover-label">{{ t('color') }}</div>
            <div class="toolbar-grid">
              <button v-for="c in canvasRef?.fontColors" :key="'font-'+c" class="tb-color" :class="{ active: canvasRef?.getNodeFontColor(canvasRef.selectedNodeId) === c }" :style="{ background: c }" @click="canvasRef?.setNodeFontColor(canvasRef.selectedNodeId, c)"></button>
              <button class="tb-color tb-color-none" @click="canvasRef?.setNodeFontColor(canvasRef.selectedNodeId, undefined)">x</button>
            </div>
            <div class="toolbar-popover-label">{{ t('firstLine') }}</div>
            <div class="toolbar-grid">
              <button v-for="a in aligns" :key="'tb-first-' + a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeFirstLineAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeFirstLineAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
            </div>
            <div class="toolbar-popover-label">{{ t('bodyText') }}</div>
            <div class="toolbar-grid">
              <button v-for="a in aligns" :key="'tb-body-' + a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
            </div>
          </template>

          <template v-else-if="activeToolbarMenu === 'border'">
            <div class="toolbar-popover-title">{{ t('border') }}</div>
            <div class="toolbar-popover-label">{{ t('style') }}</div>
            <div class="toolbar-grid">
              <button v-for="bs in canvasRef?.borderStyles" :key="'border-'+bs.value" class="tb-btn" :class="{ active: canvasRef?.getNodeBorderStyle(canvasRef.selectedNodeId) === bs.value }" @click="canvasRef?.setNodeBorderStyle(canvasRef.selectedNodeId, bs.value)" :title="bs.label">
                <svg width="24" height="10" viewBox="0 0 24 10" v-html="bs.svg"></svg>
              </button>
            </div>
            <div class="toolbar-popover-label">{{ t('width') }}</div>
            <div class="toolbar-grid">
              <button v-for="bw in [1,2,3,4]" :key="'width-'+bw" class="tb-btn" :class="{ active: canvasRef?.getNodeBorderWidth(canvasRef.selectedNodeId) === bw }" @click="canvasRef?.setNodeBorderWidth(canvasRef.selectedNodeId, bw)" :title="bw+'px'">
                <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" :stroke-width="bw"/></svg>
              </button>
            </div>
            <div class="toolbar-popover-label">{{ t('color') }}</div>
            <div class="toolbar-grid">
              <button v-for="c in ['#fb464c','#e9973f','#e0de71','#44cf6e','#53dfdd','#a882ff','#ffffff']" :key="'border-color-'+c" class="tb-color" :class="{ active: canvasRef?.getNodeBorderColor(canvasRef.selectedNodeId) === c }" :style="{background: c}" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, c)"></button>
              <button class="tb-color tb-color-none" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, undefined)">x</button>
            </div>
          </template>

          <template v-else-if="activeToolbarMenu === 'layers'">
            <div class="toolbar-popover-title">{{ t('layers') }}</div>
            <div class="toolbar-menu-row">
              <button class="toolbar-choice" @click="canvasRef?.bringSelectionForward()"><span>{{ t('layerUp') }}</span></button>
              <button class="toolbar-choice" @click="canvasRef?.sendSelectionBackward()"><span>{{ t('layerDown') }}</span></button>
              <button class="toolbar-choice" @click="canvasRef?.bringSelectionToFront()"><span>{{ t('bringToFront') }}</span></button>
              <button class="toolbar-choice" @click="canvasRef?.sendSelectionToBack()"><span>{{ t('sendToBack') }}</span></button>
            </div>
          </template>

          <template v-else-if="activeToolbarMenu === 'actions'">
            <div class="toolbar-popover-title">{{ t('nodeActions') }}</div>
            <div v-if="!canvasRef?.selectedNodeId" class="toolbar-popover-label">{{ t('selectedObjects') }}: {{ canvasRef?.selectedNodeIds?.length }}</div>
            <template v-if="canvasRef?.isImageNode(canvasRef.selectedNodeId) || canvasRef?.isGroupNode(canvasRef.selectedNodeId)">
              <div class="toolbar-popover-label">{{ canvasRef?.isGroupNode(canvasRef.selectedNodeId) ? t('groupName') : t('imageName') }}</div>
              <input
                class="toolbar-text-input"
                :value="canvasRef?.getNodeTitle(canvasRef.selectedNodeId)"
                :placeholder="canvasRef?.isGroupNode(canvasRef.selectedNodeId) ? t('groupName') : t('imageName')"
                :disabled="role === 'read'"
                @input="updateSelectedNodeTitle"
                @keydown.stop
              />
            </template>
            <div class="toolbar-menu-row">
              <button class="toolbar-choice" :disabled="!canvasRef?.canUndo" @click="canvasRef?.undo()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-2"/></svg>
                <span>{{ t('undo') }}</span>
              </button>
              <button class="toolbar-choice" :disabled="!canvasRef?.canRedo" @click="canvasRef?.redo()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h2"/></svg>
                <span>{{ t('redo') }}</span>
              </button>
              <button class="toolbar-choice" :class="{ active: canvasRef?.selectedNodeId ? canvasRef?.isNodePositionLocked(canvasRef.selectedNodeId) : canvasRef?.areSelectedNodesPositionLocked() }" @click="canvasRef?.selectedNodeId ? canvasRef?.toggleNodePositionLock(canvasRef.selectedNodeId) : canvasRef?.toggleSelectedNodesPositionLock()">
                <svg v-if="canvasRef?.selectedNodeId ? canvasRef?.isNodePositionLocked(canvasRef.selectedNodeId) : canvasRef?.areSelectedNodesPositionLocked()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 019.4-2.5"/></svg>
                <span>{{ (canvasRef?.selectedNodeId ? canvasRef?.isNodePositionLocked(canvasRef.selectedNodeId) : canvasRef?.areSelectedNodesPositionLocked()) ? t('unlockPosition') : t('lockPosition') }}</span>
              </button>
              <button class="toolbar-choice" @click="canvasRef?.duplicateSelection()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
                <span>{{ t('duplicate') }}</span>
              </button>
              <button v-if="role === 'owner'" class="toolbar-choice" @click="canvasRef?.selectedNodeId ? canvasRef?.toggleNodeHidden(canvasRef.selectedNodeId) : canvasRef?.toggleSelectedNodesHidden()">
                <svg v-if="canvasRef?.selectedNodeId ? canvasRef?.isNodeHidden(canvasRef.selectedNodeId) : canvasRef?.areSelectedNodesHidden()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>{{ (canvasRef?.selectedNodeId ? canvasRef?.isNodeHidden(canvasRef.selectedNodeId) : canvasRef?.areSelectedNodesHidden()) ? t('show') : t('hide') }}</span>
              </button>
              <button v-if="role !== 'read'" class="toolbar-choice toolbar-choice-danger" @click="canvasRef?.deleteSelection()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                <span>{{ t('delete') }}</span>
              </button>
            </div>
          </template>

        </div>
      </div>

      <!-- Floating actions toolbar for a selected drawing (desktop only; mobile uses MobileNodeToolbar) -->
      <div
        v-if="role !== 'read' && canvasRef?.selectedDrawingIds?.length === 1 && canvasRef?.selectedDrawingScreenRect"
        class="drawing-actions-toolbar desktop-only"
        :style="{
          left: canvasRef.selectedDrawingScreenRect.left + 'px',
          top: Math.max(8, canvasRef.selectedDrawingScreenRect.top - 52) + 'px'
        }"
        @pointerdown.stop @click.stop
      >
        <!-- current colour → click opens the palette -->
        <div class="draw-action-color">
          <button
            class="tb-color draw-action-color-current"
            :style="{ background: canvasRef?.selectedDrawingObj?.color || '#000' }"
            @click="drawColorPickerOpen = !drawColorPickerOpen"
            :title="t('color')"
          ></button>
          <div v-if="drawColorPickerOpen" class="draw-action-color-pop">
            <button
              v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000','#ffffff']" :key="'dsel-'+c"
              class="tb-color" :style="{ background: c }"
              :class="{ active: canvasRef?.selectedDrawingObj?.color === c }"
              @click="canvasRef?.setSelectedDrawingColor(c); drawColorPickerOpen = false"
            ></button>
          </div>
        </div>
        <span class="draw-action-sep"></span>
        <input class="draw-action-width" type="range" min="1" max="20"
          :value="canvasRef?.selectedDrawingObj?.width ?? 4"
          @input="canvasRef?.setSelectedDrawingWidth(Number(($event.target as HTMLInputElement).value))"
          :title="t('width')" />
        <span class="draw-action-sep"></span>
        <button class="toolbar-choice" @click="canvasRef?.duplicateSelectedDrawing()" :title="t('duplicate')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
        </button>
        <button class="toolbar-choice" @click="canvasRef?.deleteSelectedDrawing()" :title="t('delete')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
        <button v-if="role === 'owner'" class="toolbar-choice" @click="canvasRef?.toggleSelectedDrawingHidden()" :title="canvasRef?.isSelectedDrawingHidden() ? t('show') : t('hide')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><line v-if="canvasRef?.isSelectedDrawingHidden()" x1="2" y1="2" x2="22" y2="22"/></svg>
        </button>
      </div>

      <!-- Drawing toolbar — always available, independent of node selection -->
      <div v-if="role !== 'read'" ref="drawToolbarRef" class="draw-toolbar" @pointerdown.stop @click.stop>
        <button
          class="draw-toolbar-toggle"
          :class="{ active: drawPanelOpen || (canvasRef && canvasRef.drawTool !== 'select') }"
          @click="toggleDrawPanel"
          :title="t('drawingTools')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
        </button>
        <div v-if="drawPanelOpen" class="draw-toolbar-panel draw-panel-3col">
          <div class="draw-panel-left">
            <div class="draw-tools-grid">
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'select' }" @click="canvasRef?.setDrawTool('select')" :title="t('toolSelect')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 17 2.51-7.42L20 10.09 3 3z"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'pen' }" @click="canvasRef?.setDrawTool('pen')" :title="t('toolPen')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'highlighter' }" @click="canvasRef?.setDrawTool('highlighter')" :title="t('toolHighlighter')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l-6 6v3h3l6-6"/><path d="M22 12L12 2l-3 3 10 10 3-3z"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'rect' }" @click="canvasRef?.setDrawTool('rect')" :title="t('toolRect')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'ellipse' }" @click="canvasRef?.setDrawTool('ellipse')" :title="t('toolEllipse')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'line' }" @click="canvasRef?.setDrawTool('line')" :title="t('toolLine')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'arrow' }" @click="canvasRef?.setDrawTool('arrow')" :title="t('toolArrow')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="10 5 19 5 19 14"/></svg>
            </button>
            <button class="toolbar-choice draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'eraser' }" @click="canvasRef?.setDrawTool('eraser')" :title="t('toolEraser')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l5 5h9"/><path d="M14 6l4 4-8 8-5-5 6.5-6.5a1.4 1.4 0 0 1 2 0z"/></svg>
            </button>
            </div>
          </div>
          <span class="draw-panel-vsep"></span>
          <div class="draw-panel-right">
            <input class="draw-panel-width-vertical" type="range" min="1" max="20" :value="canvasRef?.drawWidth ?? 4"
              @input="canvasRef?.setDrawWidth(Number(($event.target as HTMLInputElement).value))" :title="t('width')" />
            <!-- current colour (under the size slider) → click opens palette -->
            <div class="draw-action-color">
              <button class="tb-color draw-action-color-current" :style="{ background: canvasRef?.drawColor || '#000' }" @click="drawPaletteColorOpen = !drawPaletteColorOpen" :title="t('color')"></button>
              <div v-if="drawPaletteColorOpen" class="draw-action-color-pop draw-action-color-pop-left">
                <button
                  v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000','#ffffff']" :key="'draw-'+c"
                  class="tb-color" :style="{ background: c }" :class="{ active: canvasRef?.drawColor === c }"
                  @click="canvasRef?.setDrawColor(c); drawPaletteColorOpen = false"
                ></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dice toolbar — left edge, below the draw toolbar -->
      <div v-if="role !== 'read' && diceEnabled" ref="diceToolbarRef" class="dice-toolbar" @pointerdown.stop @click.stop>
        <button class="draw-toolbar-toggle" :class="{ active: diceOpen }" @click="toggleDice" :title="t('dice')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2 21 7.2v9.6L12 22 3 16.8V7.2z"/><path d="M12 2 6.4 10.5 12 13.5 17.6 10.5z"/><path d="M6.4 10.5 12 22 17.6 10.5"/><text x="12" y="12.2" font-size="5.2" text-anchor="middle" fill="currentColor" stroke="none">20</text></svg>
        </button>
        <div v-if="diceOpen" class="dice-panel">
          <div class="dice-row">
            <button v-for="s in [4,6,8,10,12,20,100]" :key="s" class="dice-die" :class="{ active: diceSides === s }" @click="diceSides = s">d{{ s }}</button>
          </div>
          <div class="dice-controls">
            <label>{{ t('diceCount') }}</label>
            <button class="dice-step" @click="diceCount = Math.max(1, diceCount - 1)">−</button>
            <span class="dice-val">{{ diceCount }}</span>
            <button class="dice-step" @click="diceCount = Math.min(10, diceCount + 1)">+</button>
          </div>
          <div class="dice-controls">
            <label>{{ t('diceModifier') }}</label>
            <button class="dice-step" @click="diceModifier = Math.max(-100, diceModifier - 1)">−</button>
            <span class="dice-val">{{ diceModifier > 0 ? '+' + diceModifier : diceModifier }}</span>
            <button class="dice-step" @click="diceModifier = Math.min(100, diceModifier + 1)">+</button>
          </div>
          <button class="dice-roll-btn" @click="rollDice">{{ t('rollDice') }} {{ diceCount }}d{{ diceSides }}{{ diceModifier > 0 ? '+' + diceModifier : (diceModifier < 0 ? diceModifier : '') }}</button>
        </div>
      </div>

      <!-- Mobile block settings menu — opens near the minimap when a block is selected.
           Colors/style live behind expandable buttons, so there is no scrolling. -->
      <div
        v-if="canvasRef?.selectedNodeId && !canvasRef?.editingNodeId && !canvasRef?.isManipulatingNode"
        class="block-menu"
      >
        <!-- Fill (background) color -->
        <button class="block-menu-item" :class="{ open: blockSection === 'fill' }" @click="toggleBlockSection('fill')">
          <span class="block-menu-swatch" :class="canvasRef.getNodeColor(canvasRef.selectedNodeId) ? 'ctx-color-' + canvasRef.getNodeColor(canvasRef.selectedNodeId) : 'swatch-empty'"></span>
          <span class="block-menu-label">{{ t('backgroundColor') }}</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'fill'" class="block-menu-pop">
          <button v-for="c in ['1','2','3','4','5','6']" :key="'bf'+c" class="tb-color" :class="'ctx-color-'+c" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, c)"></button>
          <button class="tb-color tb-color-none" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, undefined)">x</button>
          <button class="block-menu-toggle" :class="{ active: canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' }" @click="canvasRef?.toggleNodeFillStyle(canvasRef.selectedNodeId)">
            {{ canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' ? t('solid') : t('gradient') }}
          </button>
          <button class="block-menu-toggle" :class="{ active: canvasRef?.isNodeTransparent(canvasRef.selectedNodeId) }" @click="canvasRef?.toggleNodeTransparent(canvasRef.selectedNodeId)">
            {{ canvasRef?.isNodeTransparent(canvasRef.selectedNodeId) ? t('transparent') : t('withBackground') }}
          </button>
          <button class="block-menu-toggle" :class="{ active: canvasRef?.getNodeShape(canvasRef.selectedNodeId) === 'round' }" @click="canvasRef?.toggleNodeShape(canvasRef.selectedNodeId)">
            {{ canvasRef?.getNodeShape(canvasRef.selectedNodeId) === 'round' ? t('round') : t('rectangular') }}
          </button>
        </div>

        <!-- Border color -->
        <button class="block-menu-item" :class="{ open: blockSection === 'borderColor' }" @click="toggleBlockSection('borderColor')">
          <span class="block-menu-swatch" :class="{ 'swatch-empty': !canvasRef.getNodeBorderColor(canvasRef.selectedNodeId) }" :style="canvasRef.getNodeBorderColor(canvasRef.selectedNodeId) ? { background: canvasRef.getNodeBorderColor(canvasRef.selectedNodeId) } : {}"></span>
          <span class="block-menu-label">{{ t('borderColor') }}</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'borderColor'" class="block-menu-pop">
          <button v-for="c in ['#fb464c','#e9973f','#e0de71','#44cf6e','#53dfdd','#a882ff','#ffffff']" :key="'bbc'+c" class="tb-color" :style="{ background: c }" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, c)"></button>
          <button class="tb-color tb-color-none" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, undefined)">x</button>
        </div>

        <!-- Text color -->
        <button class="block-menu-item" :class="{ open: blockSection === 'fontColor' }" @click="toggleBlockSection('fontColor')">
          <span class="block-menu-swatch" :class="{ 'swatch-empty': !canvasRef.getNodeFontColor(canvasRef.selectedNodeId) }" :style="canvasRef.getNodeFontColor(canvasRef.selectedNodeId) ? { background: canvasRef.getNodeFontColor(canvasRef.selectedNodeId) } : {}"></span>
          <span class="block-menu-label">{{ t('textColor') }}</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'fontColor'" class="block-menu-pop">
          <button v-for="c in canvasRef?.fontColors" :key="'bmfc'+c" class="tb-color" :class="{ active: canvasRef?.getNodeFontColor(canvasRef.selectedNodeId) === c }" :style="{ background: c }" @click="canvasRef?.setNodeFontColor(canvasRef.selectedNodeId, c)"></button>
          <button class="tb-color tb-color-none" @click="canvasRef?.setNodeFontColor(canvasRef.selectedNodeId, undefined)">x</button>
        </div>

        <!-- Border style & width -->
        <button class="block-menu-item" :class="{ open: blockSection === 'border' }" @click="toggleBlockSection('border')">
          <span class="block-menu-label">{{ t('border') }}</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'border'" class="block-menu-pop block-menu-pop-wrap">
          <button v-for="bs in canvasRef?.borderStyles" :key="bs.value" class="tb-btn" :class="{ active: canvasRef?.getNodeBorderStyle(canvasRef.selectedNodeId) === bs.value }" @click="canvasRef?.setNodeBorderStyle(canvasRef.selectedNodeId, bs.value)" :title="bs.label">
            <svg width="24" height="10" viewBox="0 0 24 10" v-html="bs.svg"></svg>
          </button>
          <span class="tb-sep"></span>
          <button v-for="bw in [1,2,3,4]" :key="'bmw'+bw" class="tb-btn" :class="{ active: canvasRef?.getNodeBorderWidth(canvasRef.selectedNodeId) === bw }" @click="canvasRef?.setNodeBorderWidth(canvasRef.selectedNodeId, bw)" :title="bw+'px'">
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" :stroke-width="bw"/></svg>
          </button>
        </div>

        <!-- Text alignment -->
        <button class="block-menu-item" :class="{ open: blockSection === 'align' }" @click="toggleBlockSection('align')">
          <span class="block-menu-label">{{ t('alignment') }}</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'align'" class="block-menu-pop block-menu-pop-wrap">
          <span class="block-menu-sublabel">{{ t('firstLineShort') }}</span>
          <button v-for="a in aligns" :key="'bmf-'+a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeFirstLineAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeFirstLineAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
          <span class="tb-sep"></span>
          <span class="block-menu-sublabel">{{ t('text') }}</span>
          <button v-for="a in aligns" :key="'bma-'+a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
        </div>

        <button
          v-if="canvasRef?.isImageNode(canvasRef.selectedNodeId) || canvasRef?.isGroupNode(canvasRef.selectedNodeId)"
          class="block-menu-item"
          :class="{ open: blockSection === 'imageTitle' }"
          @click="toggleBlockSection('imageTitle')"
        >
          <span class="block-menu-label">{{ canvasRef?.isGroupNode(canvasRef.selectedNodeId) ? t('groupName') : t('imageName') }}</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'imageTitle' && (canvasRef?.isImageNode(canvasRef.selectedNodeId) || canvasRef?.isGroupNode(canvasRef.selectedNodeId))" class="block-menu-pop">
          <input
            class="block-menu-text-input"
            :value="canvasRef?.getNodeTitle(canvasRef.selectedNodeId)"
            :placeholder="canvasRef?.isGroupNode(canvasRef.selectedNodeId) ? t('groupName') : t('imageName')"
            :disabled="role === 'read'"
            @input="updateSelectedNodeTitle"
            @keydown.stop
          />
        </div>

        <div class="block-menu-divider"></div>

        <!-- Actions -->
        <div class="block-menu-history">
          <button class="block-menu-item" :disabled="!canvasRef?.canUndo" @click="canvasRef?.undo()">
            <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-2"/></svg>
            <span class="block-menu-label">{{ t('undo') }}</span>
          </button>
          <button class="block-menu-item" :disabled="!canvasRef?.canRedo" @click="canvasRef?.redo()">
            <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h2"/></svg>
            <span class="block-menu-label">{{ t('redo') }}</span>
          </button>
        </div>
        <button class="block-menu-item" @click="canvasRef?.toggleNodePositionLock(canvasRef.selectedNodeId)">
          <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          <span class="block-menu-label">{{ canvasRef?.isNodePositionLocked(canvasRef.selectedNodeId) ? t('unlockPosition') : t('lockPosition') }}</span>
        </button>
        <button class="block-menu-item" @click="canvasRef?.bringSelectionForward()">
          <span class="block-menu-label">{{ t('layerUp') }}</span>
        </button>
        <button class="block-menu-item" @click="canvasRef?.sendSelectionBackward()">
          <span class="block-menu-label">{{ t('layerDown') }}</span>
        </button>
        <button class="block-menu-item" @click="canvasRef?.bringSelectionToFront()">
          <span class="block-menu-label">{{ t('bringToFront') }}</span>
        </button>
        <button class="block-menu-item" @click="canvasRef?.sendSelectionToBack()">
          <span class="block-menu-label">{{ t('sendToBack') }}</span>
        </button>
        <button class="block-menu-item" @click="canvasRef?.duplicateSelection()">
          <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
          <span class="block-menu-label">{{ t('duplicate') }}</span>
        </button>
        <button v-if="role !== 'read'" class="block-menu-item block-menu-danger" @click="canvasRef?.deleteSelection()">
          <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          <span class="block-menu-label">{{ t('delete') }}</span>
        </button>
      </div>

      <!-- Mobile node editing toolbar (above mode bar, mobile only) -->
      <MobileNodeToolbar
        v-if="mobileMode === 'cursor' && !canvasRef?.editingNodeId && !canvasRef?.isManipulatingNode"
        :canvas-ref="canvasRef"
        :role="role ?? 'read'"
        class="mobile-only"
      />

      <!-- Mobile draw panel: appears above modebar when draw mode active -->
      <div
        v-if="mobileMode === 'draw' && drawPanelOpen && role !== 'read'"
        class="mobile-draw-panel mobile-only"
        @pointerdown.stop
        @click.stop
      >
        <!-- Upward popup for color or width (floats above panel) -->
        <div v-if="drawMobilePopup === 'color'" class="mobile-draw-popup" @click.stop>
          <div class="mobile-draw-popup-colors">
            <button
              v-for="c in ['#e03131','#f08c00','#2f9e44','#1971c2','#000000','#ffffff']"
              :key="'mdpop-'+c"
              class="mobile-draw-popup-swatch"
              :style="{ background: c }"
              :class="{ active: canvasRef?.drawColor === c }"
              @click="canvasRef?.setDrawColor(c); drawMobilePopup = null"
            ></button>
          </div>
        </div>
        <div v-else-if="drawMobilePopup === 'width'" class="mobile-draw-popup" @click.stop>
          <div class="mobile-draw-popup-width">
            <input
              class="mobile-draw-popup-width-slider"
              type="range" min="1" max="20"
              :value="canvasRef?.drawWidth ?? 4"
              @input="canvasRef?.setDrawWidth(Number(($event.target as HTMLInputElement).value))"
              :aria-label="t('width')"
            />
            <span class="mobile-draw-popup-width-label">{{ canvasRef?.drawWidth ?? 4 }}</span>
          </div>
        </div>
        <!-- Backdrop to close draw mode popup on tap-outside -->
        <Teleport to="body">
          <div v-if="drawMobilePopup" class="mobile-draw-popup-backdrop" @click="drawMobilePopup = null" aria-hidden="true"/>
        </Teleport>

        <div class="mobile-draw-tools">
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'pen' }" @click="canvasRef?.setDrawTool('pen')" :aria-label="t('toolPen')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'highlighter' }" @click="canvasRef?.setDrawTool('highlighter')" :aria-label="t('toolHighlighter')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l-6 6v3h3l6-6"/><path d="M22 12L12 2l-3 3 10 10 3-3z"/></svg>
          </button>
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'rect' }" @click="canvasRef?.setDrawTool('rect')" :aria-label="t('toolRect')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
          </button>
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'ellipse' }" @click="canvasRef?.setDrawTool('ellipse')" :aria-label="t('toolEllipse')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="9" ry="7"/></svg>
          </button>
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'line' }" @click="canvasRef?.setDrawTool('line')" :aria-label="t('toolLine')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
          </button>
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'arrow' }" @click="canvasRef?.setDrawTool('arrow')" :aria-label="t('toolArrow')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="10 5 19 5 19 14"/></svg>
          </button>
          <button class="mobile-draw-tool-btn" :class="{ active: canvasRef?.drawTool === 'eraser' }" @click="canvasRef?.setDrawTool('eraser')" :aria-label="t('toolEraser')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l5 5h9"/><path d="M14 6l4 4-8 8-5-5 6.5-6.5a1.4 1.4 0 0 1 2 0z"/></svg>
          </button>
          <span class="mobile-draw-vsep"></span>
          <button
            class="mobile-draw-color-btn"
            :class="{ active: drawMobilePopup === 'color' }"
            :style="{ background: canvasRef?.drawColor || '#e03131' }"
            @click="drawMobilePopup = drawMobilePopup === 'color' ? null : 'color'"
            :aria-label="t('color')"
          ></button>
          <button
            class="mobile-draw-width-btn"
            :class="{ active: drawMobilePopup === 'width' }"
            @click="drawMobilePopup = drawMobilePopup === 'width' ? null : 'width'"
            :aria-label="t('width')"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="3" y1="13" x2="21" y2="13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              <line x1="3" y1="19" x2="21" y2="19" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Mobile mode bar: Hand / Cursor / Draw / + (mobile only) -->
      <MobileModebar ref="modebarRef" class="mobile-only" @add="addSheetOpen = true" />

      <!-- Mobile Add sheet -->
      <Teleport to="body">
        <div v-if="addSheetOpen" class="mobile-add-backdrop" @click="addSheetOpen = false"></div>
        <div v-if="addSheetOpen" class="mobile-add-sheet" role="dialog" :aria-label="t('add')" @click.stop>
          <div class="mobile-add-sheet-handle"></div>
          <div class="mobile-add-sheet-grid">
            <button
              v-for="entry in canvasRef?.addMenuEntries"
              :key="entry.key"
              class="mobile-add-sheet-item"
              @click="canvasRef?.runAddMenuEntry(entry.key); addSheetOpen = false"
            >
              <span class="mobile-add-sheet-icon" v-html="entry.icon"></span>
              <span class="mobile-add-sheet-label">{{ entry.label }}</span>
            </button>
          </div>
        </div>
      </Teleport>

      <!-- Access panel -->
      <div v-if="showShare" class="share-panel">
        <div class="share-panel-header">
          <h3>{{ t('access') }}</h3>
          <button class="btn-ghost btn-sm" @click="showShare = false">×</button>
        </div>

        <div v-if="role === 'owner'" class="share-section">
          <div class="share-section-title">{{ t('shareLinkSection') }}</div>
          <div class="slug-row">
            <span class="slug-prefix">/canvas/</span>
            <input
              v-model="slugInput"
              class="slug-input"
              placeholder="my-canvas"
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              @keydown.enter="saveSlug"
            />
            <button class="btn-ghost btn-sm" :disabled="savingSlug" @click="saveSlug">{{ t('save') }}</button>
          </div>
          <div class="slug-hint">{{ t('slugHint') }}</div>
          <div class="slug-row" style="margin-top: 10px;">
            <input :value="publicUrl" class="slug-input" readonly :aria-label="t('copyLink')" />
            <button class="btn-ghost btn-sm" @click="copyPublicLink">{{ t('copyBtn') }}</button>
          </div>
        </div>

        <div class="share-section">
          <div class="share-section-title">{{ t('whoCanView') }}</div>
          <select class="share-visibility-select" :value="visibility" @change="setVisibility(($event.target as HTMLSelectElement).value as any)">
            <option value="private">{{ t('visibilityPrivate') }}</option>
            <option value="authenticated">{{ t('visibilityAuthOnly') }}</option>
            <option value="public">{{ t('visibilityPublic') }}</option>
          </select>
          <label class="share-checkbox">
            <input type="checkbox" :checked="allowPublicEdit" @change="togglePublicEdit" />
            <span>{{ t('allowPublicEditing') }}</span>
          </label>
          <label class="share-checkbox">
            <input
              type="checkbox"
              :checked="listedInPublic"
              :disabled="visibility !== 'public'"
              @change="togglePublicListing"
            />
            <span>{{ t('showInPublic') }}</span>
          </label>
        </div>

        <div class="share-section">
          <div class="share-section-title">{{ t('invitePeople') }}</div>
          <div class="share-form">
            <input v-model="shareEmail" :placeholder="t('email')" type="email" />
            <select v-model="shareRole">
              <option value="read">{{ t('canView') }}</option>
              <option value="edit">{{ t('canEdit') }}</option>
            </select>
            <button @click="doShare">{{ t('inviteBtn') }}</button>
          </div>
          <div v-if="permissions.length" class="share-list">
            <div v-for="p in permissions" :key="p.id" class="share-item">
              <span>{{ p.user?.email || p.userId }}</span>
              <span class="share-item-role">{{ p.role === 'edit' ? t('canEdit') : t('canView') }}</span>
              <button @click="doRevoke(p.userId)">×</button>
            </div>
          </div>
        </div>

        <div v-if="role === 'owner'" class="share-section">
          <div class="share-section-title">{{ t('passwordAccessSection') }}</div>
          <label class="share-checkbox">
            <input type="checkbox" v-model="passwordAccessEnabled" />
            <span>{{ t('enablePasswordAccess') }}</span>
          </label>
          <div v-if="passwordAccessEnabled" class="share-form">
            <input v-model="passwordAccessPassword" type="password" :placeholder="t('newPasswordPlaceholder')" />
            <select v-model="passwordAccessRole">
              <option value="read">{{ t('canView') }}</option>
              <option value="edit">{{ t('canEdit') }}</option>
            </select>
            <button @click="savePasswordAccess">{{ t('save') }}</button>
          </div>
        </div>
      </div>

      <!-- History panel -->
      <div v-if="showHistory" class="history-panel">
        <div class="history-panel-header">
          <h3>{{ t('history') }}</h3>
          <button class="btn-ghost btn-sm" @click="showHistory = false">×</button>
        </div>
        <!-- History access control (owner/admin) -->
        <div v-if="canManageSettings || isAdmin()" class="history-access-control">
          <label>{{ t('whoCanViewHistory') }}</label>
          <select :value="historyAccess" @change="changeHistoryAccess(($event.target as HTMLSelectElement).value)">
            <option value="owner">{{ t('historyOwnerOnly') }}</option>
            <option value="editors">{{ t('historyEditorsOption') }}</option>
            <option value="viewers">{{ t('historyAllViewers') }}</option>
          </select>
        </div>
        <div v-if="historyLoading && historyItems.length === 0" class="history-loading">{{ t('loadingDots') }}</div>
        <div v-else-if="historyError" class="history-error">{{ historyError }}</div>
        <div v-else-if="historyItems.length === 0" class="history-empty">{{ t('noHistoryYet') }}</div>
        <div v-else class="history-split">
          <div class="history-list">
            <button
              v-for="item in historyItems"
              :key="item.id"
              class="history-item"
              :class="{ active: selectedHistoryItem?.id === item.id }"
              @click="openHistorySnapshot(item)"
            >
              <div class="history-item-header">
                <span class="history-op-type" :class="'history-op-' + opCategory(item.type)">{{ opLabel(item.type) }}</span>
                <span class="history-user">{{ item.userName }}</span>
                <span class="history-rev">r{{ item.revision }}</span>
              </div>
              <div class="history-item-detail">{{ opDetail(item) }}</div>
              <div class="history-item-date">{{ formatHistoryDate(item.createdAt) }}</div>
            </button>
            <button v-if="hasMoreHistory" class="btn-ghost btn-sm history-load-more" @click="loadMoreHistory" :disabled="historyLoading">
              {{ t('loadMore') }}
            </button>
          </div>
          <div class="history-preview">
            <div v-if="historySnapshotLoading" class="history-empty">{{ t('loadingRevision') }}</div>
            <div v-else-if="historySnapshotError" class="history-error">{{ historySnapshotError }}</div>
            <div v-else-if="!selectedHistoryItem" class="history-empty">{{ t('selectARevision') }}</div>
            <template v-else>
              <div class="history-preview-head">
                <strong>{{ t('revisionLabel') }} {{ selectedHistoryItem.revision }}</strong>
                <span>{{ formatHistoryDate(selectedHistoryItem.createdAt) }}</span>
              </div>
              <div class="history-preview-row">
                <span>{{ t('operationLabel') }}</span>
                <strong>{{ opLabel(selectedHistoryItem.type) }}</strong>
              </div>
              <div class="history-preview-row">
                <span>{{ t('authorLabel') }}</span>
                <strong>{{ selectedHistoryItem.userName || t('guestLabel') }}</strong>
              </div>
              <div class="history-preview-grid">
                <div>
                  <span>{{ t('nodesLabel') }}</span>
                  <strong>{{ selectedHistorySummary.nodes }}</strong>
                </div>
                <div>
                  <span>{{ t('edgesLabel') }}</span>
                  <strong>{{ selectedHistorySummary.edges }}</strong>
                </div>
              </div>
              <div class="history-preview-detail">{{ opDetail(selectedHistoryItem) || t('fullCanvasSnapshot') }}</div>
              <button
                v-if="role !== 'read'"
                class="btn-primary btn-sm history-restore-btn"
                :disabled="restoringHistory || !selectedHistorySnapshot"
                @click="restoreSelectedHistorySnapshot"
              >
                {{ restoringHistory ? t('restoringEllipsis') : t('restoreRevision') }}
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Embed document picker -->
      <div v-if="showDocPicker" class="embed-picker-panel">
        <div class="history-panel-header">
          <h3>{{ t('insertDocument') }}</h3>
          <button class="btn-ghost btn-sm" @click="showDocPicker = false">×</button>
        </div>
        <div class="doc-picker-tabs">
          <button :class="{ active: docKindFilter === 'all' }" @click="docKindFilter = 'all'">{{ t('all') }}</button>
          <button :class="{ active: docKindFilter === 'html' }" @click="docKindFilter = 'html'">HTML</button>
          <button :class="{ active: docKindFilter === 'text' }" @click="docKindFilter = 'text'">{{ t('textDocsFilter') }}</button>
        </div>
        <input
          v-model.trim="docSearch"
          class="embed-search-input"
          :placeholder="t('searchDocuments')"
        />
        <button
          class="doc-picker-new"
          :disabled="creatingDocument"
          :title="t('newTextDocHint')"
          @click="createAndEmbedDocument"
        >
          {{ creatingDocument ? t('creating') : t('newDocumentBtn') }}
        </button>
        <div v-if="docLoading" class="history-loading">{{ t('loadingDots') }}</div>
        <div v-else class="embed-canvas-list">
          <div
            v-for="d in filteredEmbedDocuments"
            :key="d.kind + ':' + d.id"
            class="embed-canvas-item"
            @click="doEmbedDocument(d.kind, d.id)"
          >
            <span class="embed-canvas-title">{{ d.title || t('untitled') }}</span>
            <span class="doc-kind-badge">{{ d.kind === 'text' ? 'DOC' : 'HTML' }}</span>
          </div>
          <div v-if="filteredEmbedDocuments.length === 0" class="history-empty">{{ t('documentsNotFound') }}</div>
        </div>
      </div>

      <!-- Embed canvas picker -->
      <div v-if="showEmbedPicker" class="embed-picker-panel">
        <div class="history-panel-header">
          <h3>{{ t('embedCanvasTitle') }}</h3>
          <button class="btn-ghost btn-sm" @click="showEmbedPicker = false">×</button>
        </div>
        <input
          v-model.trim="embedSearch"
          class="embed-search-input"
          :placeholder="t('searchCanvasesPlaceholder')"
        />
        <div v-if="embedLoading" class="history-loading">{{ t('loadingDots') }}</div>
        <div v-else class="embed-canvas-list">
          <div
            v-for="c in filteredEmbedCanvases"
            :key="c.id"
            class="embed-canvas-item"
            @click="doEmbed(c.id)"
          >
            <span class="embed-canvas-title">{{ c.title || t('untitled') }}</span>
            <span class="embed-canvas-owner">{{ c.ownerName || c.ownerEmail || '' }}</span>
          </div>
          <div v-if="filteredEmbedCanvases.length === 0" class="history-empty">{{ t('noCanvasesFound') }}</div>
        </div>
      </div>

      <!-- Chat drawer -->
      <div v-if="chatOpen" class="chat-drawer">
        <div class="chat-drawer-head"><span>{{ t('chat') }}</span><button class="chat-drawer-close" @click="chatOpen = false">×</button></div>
        <ChatPanel :messages="chatMessages" :can-post="role !== 'read'" :attached-node="attachedNode" :can-attach="!!canvasRef?.selectedNodeId" @send="onChatSend" @attach-node="onAttachNode" @clear-node="onClearNode" @jump-node="onJumpNode" />
      </div>

      <!-- Pick-a-node hint: shown while choosing a node to attach to a chat message -->
      <div v-if="pickingNodeForChat" class="chat-pick-hint">
        <span class="chat-pick-hint-text">{{ t('tapNodeToAttach') }}</span>
        <button class="chat-pick-cancel" @click="onCancelPickNode">{{ t('cancel') }}</button>
      </div>

      <!-- Keyboard Shortcuts dialog -->
      <div v-if="showShortcuts" class="shortcuts-backdrop" @click.self="showShortcuts = false">
        <div class="shortcuts-panel">
          <div class="shortcuts-header">
            <h3>{{ t('keyboardShortcuts') }}</h3>
            <button class="btn-ghost btn-sm" @click="showShortcuts = false">&times;</button>
          </div>
          <div class="shortcuts-grid">
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>{{ t('scUndo') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd><span>{{ t('scRedo') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>C</kbd><span>{{ t('scCopySelected') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>V</kbd><span>{{ t('scPaste') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>D</kbd><span>{{ t('scDuplicate') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>A</kbd><span>{{ t('scSelectAll') }}</span></div>
            <div class="shortcut-row"><kbd>Delete</kbd> / <kbd>Backspace</kbd><span>{{ t('scDeleteSelected') }}</span></div>
            <div class="shortcut-row"><kbd>Escape</kbd><span>{{ t('scDeselectAll') }}</span></div>
            <div class="shortcut-row"><kbd>{{ t('kbdDoubleClick') }}</kbd><span>{{ t('scEditNodeText') }}</span></div>
            <div class="shortcut-row"><kbd>Shift</kbd>+{{ t('kbdClick') }}<span>{{ t('scMultiSelect') }}</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+{{ t('kbdScroll') }}<span>{{ t('scZoom') }}</span></div>
            <div class="shortcut-row"><kbd>{{ t('kbdMiddleMouse') }}</kbd><span>{{ t('scPanCanvas') }}</span></div>
            <div class="shortcut-row"><kbd>{{ t('kbdRightClick') }}</kbd><span>{{ t('scContextMenu') }}</span></div>
            <div class="shortcut-row"><kbd>{{ t('kbdDragFromEdge') }}</kbd><span>{{ t('scCreateConnection') }}</span></div>
          </div>
        </div>
      </div>

      <CanvasLoader
        ref="canvasRef"
        :initial-data="canvasData"
        :readonly="role === 'read'"
        :is-owner="role === 'owner'"
        :remote-cursors="remoteCursorsArray"
        @change="onCanvasChange"
        @op="onCanvasOp"
        @cursor-move="onCursorMove"
        @open-canvas="onOpenCanvas"
        @open-board="onOpenBoard"
        @open-embed="openEmbedPicker"
        @open-doc-embed="openDocPicker"
        @open-document="onOpenDocument"
        @node-edit-start="closeNodeEditingPanels"
        @template-roll="onTemplateRoll"
        @readonly-action="notifyReadOnlyEditAttempt"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted, nextTick, watchPostEffect, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { accessRequests, ApiError, auth, canvas as canvasApi, getCurrentUser, htmlDocuments as htmlDocumentsApi, interactiveTemplates, isAuthenticated, isAdmin, setToken, textDocuments as textDocumentsApi, type InteractiveTemplate } from '../api/client';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import ChatPanel from '../components/ChatPanel.vue';
import AccountMenu from '../components/AccountMenu.vue';
import AccessGate from '../components/AccessGate.vue';
import { createSyncEventStore, syncReasonLabel, type SyncRejectReason } from '../canvas/syncEvents';
import { shouldRetryCanvasReject } from '../canvas/syncRetry';
import { useCanvasSocket } from '../composables/useCanvasSocket';
import { resolveSyncStatus, useCalmSaving } from '../composables/useCalmSyncStatus';
import { usePlugins } from '../composables/usePlugins';
import { useChatNodeAttach } from '../composables/useChatNodeAttach';
import { useToast } from '../composables/useToast';
import { useReadOnlyNotice } from '../composables/useReadOnlyNotice';
import { readNativeResourceCache, writeNativeResourceCache } from '../composables/useNativeResourceCache';
import { CANVAS_ORIGIN_QUERY, useResourceBackTarget } from '../composables/useResourceBackTarget';
import { useI18n } from '../composables/useI18n';
import { useMinimapPreference } from '../composables/useMinimapPreference';
import { useMobileCanvasMode } from '../composables/useMobileCanvasMode';
import CanvasLoader from '../components/CanvasLoader.vue';
import MobileModebar from '../canvas/MobileModebar.vue';
import MobileNodeToolbar from '../canvas/MobileNodeToolbar.vue';
import BackButton from '../components/BackButton.vue';
import { getPublicOrigin } from '../api/public-origin';

interface CanvasChangePayload {
  nodes: any[];
  edges: any[];
  drawings?: any[];
  forceSnapshot?: boolean;
}

export default defineComponent({
  components: { AccountMenu, AccessGate, BackButton, CanvasLoader, ChatPanel, MobileModebar, MobileNodeToolbar },
  setup() {
    const route = useRoute();
    const router = useRouter();
    // The URL param may be a UUID id or a human-readable slug. `resolvedId`
    // holds the real canvas id after load; it's used for the WS room and all
    // mutations so collaborators share one room regardless of which form of the
    // link they opened.
    const canvasId = route.params.id as string;
    const resolvedId = ref(canvasId);
    const slug = ref<string | null>(null);
    const slugInput = ref('');
    const savingSlug = ref(false);

    const publicUrl = computed(() => {
      const publicId = slug.value || resolvedId.value;
      return `${getPublicOrigin()}/canvas/${encodeURIComponent(publicId)}`;
    });

    const { show: showToast } = useToast();
    const { notifyReadOnlyEditAttempt } = useReadOnlyNotice();
    const { t } = useI18n();

    const copyPublicLink = async () => {
      try {
        await navigator.clipboard.writeText(publicUrl.value);
        showToast(t('copied'), 'success');
      } catch {
        showToast(t('copyLinkFailed'), 'error');
      }
    };
    const { mode: mobileMode } = useMobileCanvasMode();
    const canvasViewRef = ref<HTMLElement | null>(null);
    const topbarRef = ref<HTMLElement | null>(null);
    const nodeToolbarRef = ref<HTMLElement | null>(null);
    const drawToolbarRef = ref<HTMLElement | null>(null);
    const { isEnabled: isPluginEnabled, ensureLoaded: ensurePluginsLoaded, pluginItems, setEnabled: setPluginEnabled } = usePlugins();
    const { enabled: minimapEnabled, setEnabled: setMinimapEnabled } = useMinimapPreference();
    const showPlugins = ref(false);
    const settingPluginId = ref('');
    const diceEnabled = computed(() => isPluginEnabled('dice'));
    const interactiveTemplatesEnabled = computed(() => isPluginEnabled('interactive-templates'));
    const diceToolbarRef = ref<HTMLElement | null>(null);
    const diceOpen = ref(false);
    const diceSides = ref(20);
    const diceCount = ref(1);
    const diceModifier = ref(0);
    const canvasRef = ref<any>(null);
    const modebarRef = ref<{ $el?: HTMLElement } | null>(null);
    const showShortcuts = ref(false);
    const menuOpen = ref(false);
    const addSheetOpen = ref(false);
    // Which expandable section of the mobile block menu is open ('' = none)
    const blockSection = ref('');
    const toggleBlockSection = (s: string) => {
      blockSection.value = blockSection.value === s ? '' : s;
    };
    const activeToolbarMenu = ref('');
    const closeNodeEditingPanels = () => {
      activeToolbarMenu.value = '';
      blockSection.value = '';
    };
    const toggleToolbarMenu = (menu: string) => {
      activeToolbarMenu.value = activeToolbarMenu.value === menu ? '' : menu;
    };

    const updateSelectedNodeTitle = (event: Event) => {
      const title = (event.target as HTMLInputElement).value;
      canvasRef.value?.setNodeTitle?.(canvasRef.value.selectedNodeId, title);
    };
    const closeToolbarOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const el = target as HTMLElement | null;
      if (activeToolbarMenu.value && !(target && nodeToolbarRef.value?.contains(target))) {
        activeToolbarMenu.value = '';
      }
      // Close the drawing panel on any click outside it. The draw overlay is tied to the
      // active tool (not the panel), so closing the panel never interrupts a stroke. Only
      // reset to the select tool when the click is NOT on the drawing surface.
      if (drawPanelOpen.value && mobileMode.value !== 'draw') {
        const insidePanel = !!(target && drawToolbarRef.value?.contains(target));
        if (!insidePanel) {
          drawPanelOpen.value = false;
          drawPaletteColorOpen.value = false;
          drawMobilePopup.value = null;
          if (!el?.closest?.('.draw-capture')) canvasRef.value?.setDrawTool('select');
        }
      }
      // Close an open colour picker in the selected-drawing menu when clicking elsewhere.
      if (drawColorPickerOpen.value && !el?.closest?.('.drawing-actions-toolbar')) {
        drawColorPickerOpen.value = false;
      }
      // Close the dice panel when clicking outside it.
      if (diceOpen.value) {
        const insideDice = !!(target && diceToolbarRef.value?.contains(target));
        if (!insideDice) {
          diceOpen.value = false;
        }
      }
    };

    const aligns = [
      { v: 'left', l: 'Left', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>' },
      { v: 'center', l: 'Center', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>' },
      { v: 'right', l: 'Right', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>' },
      { v: 'justify', l: 'Justify', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' },
    ];

    const loading = ref(true);
    const cacheStatus = ref<{ kind: 'refreshing' | 'success' | 'error'; text: string } | null>(null);
    const error = ref('');
    const accessDenied = ref(false);
    const gatePasswordAccessEnabled = ref<boolean | undefined>(undefined);
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const checkingResourcePassword = ref(false);
    const title = ref('');
    useDocumentTitle(title);
    const canvasData = ref<any>(null);
    const role = ref('');
    const isPublic = ref(false);
    const visibility = ref<'private' | 'authenticated' | 'public'>('private');
    const allowPublicEdit = ref(false);
    const listedInPublic = ref(true);
    const revision = ref(0);
    const isResyncing = ref(false);
    const syncIssue = ref<'conflict' | ''>('');
    const syncNotice = ref<{ kind: 'info' | 'warning'; text: string } | null>(null);
    const showSyncEvents = ref(false);
    const syncEventStore = createSyncEventStore(5);
    const syncEvents = syncEventStore.events;
    const latestSyncReason = syncEventStore.latestReason;
    const searchQuery = ref('');
    const searchMatches = ref<string[]>([]);
    const searchIndex = ref(0);

    const saving = ref(false);
    const showShare = ref(false);
    const shareEmail = ref('');
    const shareRole = ref('read');
    const permissions = ref<any[]>([]);
    const passwordAccessEnabled = ref(false);
    const passwordAccessPassword = ref('');
    const passwordAccessRole = ref<'read' | 'edit'>('read');
    const canManageSettings = computed(() => isAuthenticated() && (role.value === 'owner' || role.value === 'edit'));
    const currentUser = computed(() => getCurrentUser());

    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let noticeTimeout: ReturnType<typeof setTimeout> | null = null;
    let isApplyingRemote = false;
    let cacheStatusTimeout: ReturnType<typeof setTimeout> | null = null;
    let chromeResizeObserver: ResizeObserver | null = null;

    /**
     * SYNC STATUS: one of Synced / Saving… / Offline / Sync failed, never a
     * pending-ops counter (it ticked on every drawn op). When "Saving…" may
     * appear and for how long is useCalmSaving's job (useCalmSyncStatus.ts,
     * shared with the document editors); `savingVisible` is set up below,
     * next to `pendingOpsCount`. A resync after a rejected op is real
     * ongoing work, so it reads as "Saving…" straight away; a conflict is
     * "Sync failed" until the resync/ack clears syncIssue. The count and
     * revision stay in the badge's tooltip and its sync-events popover.
     */
    const SYNC_STATUS_LABEL_KEYS = {
      synced: 'syncSynced',
      saving: 'syncSaving',
      offline: 'syncOffline',
      failed: 'syncFailed',
    } as const;
    const syncStatus = computed(() => {
      const kind = resolveSyncStatus({
        failed: !!syncIssue.value,
        offline: !wsConnected.value,
        saving: isResyncing.value || savingVisible.value,
      });
      return { kind, label: t(SYNC_STATUS_LABEL_KEYS[kind]) };
    });

    const syncBadgeTitle = computed(() => {
      const parts = [syncStatus.value.label, `r${revision.value}`];
      if (pendingOpsCount.value > 0) parts.push(t('syncPendingChanges').replace('{count}', String(pendingOpsCount.value)));
      if (latestSyncReason.value) parts.push(latestSyncReason.value);
      return parts.join(' · ');
    });

    function showSyncNotice(kind: 'info' | 'warning', text: string) {
      syncNotice.value = { kind, text };
      if (noticeTimeout) clearTimeout(noticeTimeout);
      noticeTimeout = setTimeout(() => {
        syncNotice.value = null;
      }, 3200);
    }

    function rejectNotice(reason: SyncRejectReason) {
      const reasonText = syncReasonLabel(reason);
      if (reason === 'timeout') return `${reasonText}. Saving full canvas snapshot.`;
      return `${reasonText}. Restoring the latest canvas state.`;
    }

    function formatSyncEventTime(timestamp: number) {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function updateChromeMetrics() {
      const root = canvasViewRef.value;
      if (!root) return;
      root.style.setProperty('--canvas-topbar-height', `${topbarRef.value?.offsetHeight || 44}px`);
      // Include mobile bottom bars in the toolbar-height offset so minimap/notices clear them.
      const modebarEl = modebarRef.value?.$el as HTMLElement | undefined;
      const modebarH = modebarEl?.offsetHeight ?? 0;
      root.style.setProperty('--canvas-toolbar-height', modebarH > 0 ? `${modebarH}px` : '0px');
    }

    function observeChromeMetrics() {
      chromeResizeObserver?.disconnect();
      if (typeof ResizeObserver === 'undefined') {
        updateChromeMetrics();
        return;
      }

      chromeResizeObserver = new ResizeObserver(updateChromeMetrics);
      if (topbarRef.value) chromeResizeObserver.observe(topbarRef.value);
      if (nodeToolbarRef.value) chromeResizeObserver.observe(nodeToolbarRef.value);
      const modebarEl = modebarRef.value?.$el as HTMLElement | undefined;
      if (modebarEl) chromeResizeObserver.observe(modebarEl);
      updateChromeMetrics();
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
      onAck,
      setRevision,
      pendingOpsCount,
      realtimeOpsUnavailable,
      clearPendingOps,
      sendChat,
      sendRoll,
      onChatMessage,
      onChatError,
    } = useCanvasSocket(resolvedId);

    const savingVisible = useCalmSaving(() => saving.value || pendingOpsCount.value > 0);

    const otherUsers = computed(() => {
      return onlineUsers.value.filter((_u) => {
        return true;
      });
    });

    const remoteCursorsArray = computed(() => {
      return Array.from(remoteCursors.value.values());
    });

    const toggleShare = () => {
      if (!showShare.value) {
        // opening: close other right-side panels to avoid overlap
        chatOpen.value = false;
      }
      showShare.value = !showShare.value;
    };

    // Chat
    const chatOpen = ref(false);
    const chatMessages = ref<any[]>([]);

    const openChat = async () => {
      // close other right-side panels to avoid overlap, then open + load history
      showShare.value = false;
      showHistory.value = false;
      chatOpen.value = true;
      try {
        const liveBuffer = [...chatMessages.value];
        const history = await canvasApi.getMessages(resolvedId.value);
        const ids = new Set(history.map((m: any) => m.id));
        chatMessages.value = [...history, ...liveBuffer.filter((m: any) => !ids.has(m.id))];
      } catch { /* ignore */ }
    };
    const toggleChat = () => {
      if (chatOpen.value) chatOpen.value = false;
      else void openChat();
    };

    onChatMessage((m) => {
      if (!chatMessages.value.some((x) => x.id === m.id)) chatMessages.value = [...chatMessages.value, m];
    });
    onChatError((_e) => { /* no-op: errors are server-enforced, no toast needed */ });

    const {
      attachedNode,
      picking: pickingNodeForChat,
      attach: onAttachNode,
      cancelPick: onCancelPickNode,
      clear: onClearNode,
    } = useChatNodeAttach({
      selectedNodeId: () => canvasRef.value?.selectedNodeId ?? null,
      getNodeLabel: (id) => canvasRef.value?.getNodeLabel?.(id) ?? "",
      chatOpen,
    });
    const onJumpNode = (nodeId: string) => { canvasRef.value?.focusNode?.(nodeId); };

    const onChatSend = (payload: { text: string; replyToId: string | null; nodeId: string | null; nodeLabel: string | null }) => {
      sendChat(payload.text, payload.replyToId, payload.nodeId, payload.nodeLabel);
      onClearNode();
    };

    const templateImportOpen = ref(false);
    const templateImportLoading = ref(false);
    const templateImportItems = ref<InteractiveTemplate[]>([]);
    const loadTemplateImport = async () => {
      templateImportOpen.value = !templateImportOpen.value;
      if (!templateImportOpen.value || templateImportItems.value.length) return;
      templateImportLoading.value = true;
      try { templateImportItems.value = (await interactiveTemplates.list()).templates; }
      catch (error: any) { showToast(error?.message || t('failedLoadTemplates'), 'error'); }
      finally { templateImportLoading.value = false; }
    };
    const importTemplateToCanvas = (template: InteractiveTemplate) => {
      if (template.templateType === 'trello-board') {
        canvasRef.value?.addBoardPreview?.({ boardId: template.id, title: template.title });
      } else {
        canvasRef.value?.addDndCharacterTemplate?.({ ...template.data, name: template.data.name || template.title });
      }
      templateImportOpen.value = false;
      showPlugins.value = false;
      showToast(template.templateType === 'trello-board' ? t('boardAddedToCanvas') : t('cardAddedToCanvas'), 'success');
    };

    const onTemplateRoll = (payload: { nodeId: string; label: string; modifier: number }) => {
      if (!interactiveTemplatesEnabled.value || role.value === 'read') return;
      const modifier = Math.max(-100, Math.min(100, Number(payload.modifier) || 0));
      sendChat(`🎲 ${payload.label}: d20${modifier >= 0 ? '+' : ''}${modifier}`, null, payload.nodeId, payload.label);
      sendRoll(20, 1, modifier);
      if (!chatOpen.value) void openChat();
    };

    const setCanvasPlugin = async (pluginId: string, enabled: boolean) => {
      settingPluginId.value = pluginId;
      try {
        await setPluginEnabled('canvas', resolvedId.value, pluginId, enabled);
      } catch (error: any) {
        showToast(error?.message || t('failedUpdatePlugin'), 'error');
      } finally {
        settingPluginId.value = '';
      }
    };

    const load = async () => {
      try {
        accessDenied.value = false;
        const res = await canvasApi.get(resolvedId.value);
        writeNativeResourceCache('canvas', [canvasId, res.canvas.id, res.canvas.slug || ''], res);
        // Canonicalize to the real id (the URL may have been a slug) so the WS
        // room and all mutations use it.
        resolvedId.value = res.canvas.id;
        slug.value = res.canvas.slug || null;
        slugInput.value = slug.value || '';
        // Prettify the address bar: prefer the slug when present.
        const preferred = slug.value || res.canvas.id;
        if (route.params.id !== preferred) {
          router.replace(`/canvas/${preferred}`).catch(() => {});
        }
        title.value = res.canvas.title;
        canvasData.value = JSON.parse(res.canvas.data);
        historyAccess.value = res.canvas.historyAccess || 'owner';
        canvasFolderId.value = res.canvas.folderId ?? null;
        revision.value = res.canvas.revision ?? 0;
        setRevision(revision.value);
        role.value = res.role;
        void ensurePluginsLoaded('canvas', resolvedId.value);
        isPublic.value = res.canvas.isPublic;
        visibility.value = res.canvas.visibility || (res.canvas.isPublic ? 'public' : 'private');
        allowPublicEdit.value = !!res.canvas.allowPublicEdit;
        listedInPublic.value = res.canvas.listedInPublic !== false;
        passwordAccessEnabled.value = !!res.canvas.passwordAccessEnabled;
        passwordAccessRole.value = res.canvas.passwordAccessRole || 'read';
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
          } catch (err) {
            console.error('Failed to apply remote canvas update', err);
          }
        });
        onRemoteOp((op: any, nextRevision: number) => {
          isApplyingRemote = true;
          canvasRef.value?.applyRemoteOp(op);
          revision.value = nextRevision;
          isApplyingRemote = false;
        });
        onAck((ack) => {
          syncEventStore.confirm(ack.clientOpId, ack.revision);
        });
        onReject((reject) => {
          const reason = reject.reason as SyncRejectReason;
          if (reject.reason === 'timeout') {
            // The socket composable already flipped realtimeOpsUnavailable on
            // for this timeout, and will flip it back off on the next healthy
            // ack/reconnect — so this is a recoverable fallback, not a latch.
            syncIssue.value = '';
            clearPendingOps();
            if (reject.clientOpId) syncEventStore.reject(reject.clientOpId, 'timeout', reject.serverRevision);
            else syncEventStore.recordWarning(rejectNotice('timeout'), 'timeout', reject.serverRevision);
            showSyncNotice('warning', rejectNotice('timeout'));
            void persistCurrentSnapshot();
            return;
          }

          const pendingRejectOp = reject.pending;
          if (pendingRejectOp && shouldRetryCanvasReject(reject, pendingRejectOp)) {
            const originalClientOpId = reject.clientOpId || `reject-${Date.now()}`;
            const opType = pendingRejectOp.op?.type || 'operation';
            syncEventStore.recordWarning(`${opType} retrying after parallel edit`, reason, reject.serverRevision);
            const retryClientOpId = sendOp(pendingRejectOp.op, {
              baseRevision: reject.serverRevision,
              retryCount: pendingRejectOp.retryCount + 1,
              retryOf: reject.clientOpId,
            });
            syncEventStore.recordPending(retryClientOpId, opType, reject.serverRevision);
            syncEventStore.reject(originalClientOpId, reason, reject.serverRevision);
            showSyncNotice('warning', 'Parallel edit changed revision. Retrying operation once.');
            return;
          }

          syncIssue.value = 'conflict';
          syncEventStore.reject(
            reject.clientOpId || `reject-${Date.now()}`,
            reason,
            reject.serverRevision,
          );
          showSyncNotice('warning', rejectNotice(reason));
          void resyncCanvas();
        });
      } catch (e: any) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
          accessDenied.value = true;
          gatePasswordAccessEnabled.value = (e as ApiError).body?.passwordAccessEnabled;
          loading.value = false;
          return;
        }
        if (canvasData.value) {
          cacheStatus.value = { kind: 'error', text: t('failedRefreshCached') };
          return;
        }
        console.warn('Canvas is not available, redirecting to dashboard', e);
        await router.replace('/dashboard');
        return;
      }
      loading.value = false;
      if (cacheStatus.value?.kind === 'refreshing') {
        cacheStatus.value = { kind: 'success', text: t('documentUpdated') };
        cacheStatusTimeout = setTimeout(() => { cacheStatus.value = null; }, 3000);
      }
    };

    const requestCanvasAccess = async (requestedRole: 'read' | 'edit') => {
      if (!isAuthenticated()) {
        showToast(t('accessGateLoginRequired'), 'error');
        return;
      }
      requestingAccess.value = true;
      try {
        await accessRequests.create({
          resourceType: 'canvas',
          resourceId: canvasId,
          requestedRole,
        });
        accessRequestSent.value = true;
        showToast(t('accessGateRequestSentToast'), 'success');
      } catch (e: any) {
        showToast(e.message || t('accessGateRequestFailed'), 'error');
      } finally {
        requestingAccess.value = false;
      }
    };

    const loginWithCanvasPassword = async (password: string) => {
      checkingResourcePassword.value = true;
      try {
        const res = await auth.resourcePasswordLogin({
          resourceType: 'canvas',
          resourceId: canvasId,
          password,
        });
        setToken(res.token, res.user?.role, res.user?.accessMode || 'resource-password');
        accessDenied.value = false;
        await load();
      } catch (e: any) {
        showToast(e.message || t('accessGateInvalidPassword'), 'error');
      } finally {
        checkingResourcePassword.value = false;
      }
    };

    const resyncCanvas = async () => {
      if (isResyncing.value) return;
      isResyncing.value = true;
      syncEventStore.resyncStarted();
      try {
        const res = await canvasApi.resync(resolvedId.value, revision.value);
        const parsed = JSON.parse(res.canvas.data);
        isApplyingRemote = true;
        canvasRef.value?.applyRemoteData(parsed);
        canvasData.value = parsed;
        revision.value = res.canvas.revision ?? 0;
        setRevision(revision.value);
        clearPendingOps();
        syncIssue.value = '';
        syncEventStore.resyncCompleted(revision.value);
        showSyncNotice('info', 'Canvas state refreshed.');
        isApplyingRemote = false;
      } catch (e: any) {
        error.value = e.message || 'Failed to resync canvas';
        syncEventStore.resyncFailed(error.value);
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
        drawings: currentData.drawings || [],
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
        sendUpdate(JSON.stringify({ nodes: data.nodes, edges: data.edges, drawings: data.drawings || [] }));
      } else {
        try {
          const updated = await canvasApi.update(resolvedId.value, { data: JSON.stringify({ nodes: data.nodes, edges: data.edges, drawings: data.drawings || [] }) });
          revision.value = updated?.revision ?? revision.value;
          setRevision(revision.value);
        } catch (err: any) {
          showToast(err.message || 'Failed to save canvas', 'error');
        }
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
        const clientOpId = sendOp(op);
        syncEventStore.recordPending(clientOpId, op?.type || 'operation', revision.value);
      }
    };

    const onCursorMove = (pos: { x: number; y: number }) => {
      if (wsConnected.value) {
        sendCursor(pos.x, pos.y);
      }
    };

    const saveTitle = async () => {
      if (!canManageSettings.value) return;
      try {
        await canvasApi.update(resolvedId.value, { title: title.value });
      } catch (err: any) {
        showToast(err.message || 'Failed to save title', 'error');
      }
    };

    const saveSlug = async () => {
      if (role.value !== 'owner') return;
      const next = slugInput.value.trim().toLowerCase();
      if ((next || null) === (slug.value || null)) return; // unchanged
      savingSlug.value = true;
      try {
        const updated = await canvasApi.update(resolvedId.value, { slug: next === '' ? null : next });
        slug.value = updated.slug || null;
        slugInput.value = slug.value || '';
        showToast(slug.value ? 'Link updated' : 'Link removed', 'success');
        const preferred = slug.value || resolvedId.value;
        if (route.params.id !== preferred) router.replace(`/canvas/${preferred}`).catch(() => {});
      } catch (err: any) {
        showToast(err.message || 'Failed to update link', 'error');
        slugInput.value = slug.value || '';
      } finally {
        savingSlug.value = false;
      }
    };

    const togglePublicEdit = async (e: Event) => {
      if (!canManageSettings.value) return;
      allowPublicEdit.value = (e.target as HTMLInputElement).checked;
      try {
        await canvasApi.update(resolvedId.value, { allowPublicEdit: allowPublicEdit.value });
        showToast(allowPublicEdit.value ? 'Public edit enabled' : 'Public edit disabled', 'success');
      } catch (err: any) {
        allowPublicEdit.value = !allowPublicEdit.value;
        showToast(err.message || 'Failed to update setting', 'error');
      }
    };

    const togglePublicListing = async (e: Event) => {
      if (!canManageSettings.value) return;
      const previous = listedInPublic.value;
      listedInPublic.value = (e.target as HTMLInputElement).checked;
      try {
        await canvasApi.update(resolvedId.value, { listedInPublic: listedInPublic.value });
        showToast(listedInPublic.value ? 'Shown in Public' : 'Hidden from Public', 'success');
      } catch (err: any) {
        listedInPublic.value = previous;
        showToast(err.message || 'Failed to update setting', 'error');
      }
    };

    const setVisibility = async (value: 'private' | 'authenticated' | 'public') => {
      const prev = visibility.value;
      const prevAllowPublicEdit = allowPublicEdit.value;
      visibility.value = value;
      isPublic.value = value === 'public';
      if (value === 'public') {
        allowPublicEdit.value = false;
      }
      try {
        await canvasApi.update(resolvedId.value, {
          isPublic: isPublic.value,
          visibility: value,
          ...(value === 'public' ? { allowPublicEdit: false } : {}),
        });
        showToast(`Visibility: ${value}`, 'success');
      } catch (err: any) {
        visibility.value = prev;
        isPublic.value = prev === 'public';
        allowPublicEdit.value = prevAllowPublicEdit;
        showToast(err.message || 'Failed to update visibility', 'error');
      }
    };

    const loadPermissions = async () => {
      try {
        permissions.value = await canvasApi.permissions(resolvedId.value);
      } catch (err: any) {
        showToast(err.message || 'Failed to load permissions', 'error');
      }
    };

    const doShare = async () => {
      if (!shareEmail.value) return;
      try {
        await canvasApi.share(resolvedId.value, shareEmail.value, shareRole.value);
        showToast(`Shared with ${shareEmail.value}`, 'success');
        shareEmail.value = '';
        loadPermissions();
      } catch (err: any) {
        showToast(err.message || 'Failed to share canvas', 'error');
      }
    };

    const doRevoke = async (userId: string) => {
      try {
        await canvasApi.revoke(resolvedId.value, userId);
        showToast('Access revoked', 'success');
        loadPermissions();
      } catch (err: any) {
        showToast(err.message || 'Failed to revoke access', 'error');
      }
    };

    const savePasswordAccess = async () => {
      try {
        await canvasApi.update(resolvedId.value, {
          passwordAccessEnabled: passwordAccessEnabled.value,
          passwordAccessPassword: passwordAccessPassword.value || undefined,
          passwordAccessRole: passwordAccessRole.value,
        });
        passwordAccessPassword.value = '';
        showToast('Password access saved', 'success');
        await load();
      } catch (err: any) {
        showToast(err.message || 'Failed to save password access', 'error');
      }
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
    const canViewHistory = computed(() => isAdmin() || historyAccess.value === 'viewers' || role.value === 'owner' || (historyAccess.value === 'editors' && role.value === 'edit'));
    const hasMoreHistory = ref(false);
    const selectedHistoryItem = ref<any | null>(null);
    const selectedHistorySnapshot = ref<any | null>(null);
    const historySnapshotLoading = ref(false);
    const historySnapshotError = ref('');
    const restoringHistory = ref(false);
    const HISTORY_PAGE = 30;

    const selectedHistorySummary = computed(() => {
      try {
        const data = selectedHistorySnapshot.value?.canvas?.data
          ? JSON.parse(selectedHistorySnapshot.value.canvas.data)
          : null;
        return {
          nodes: Array.isArray(data?.nodes) ? data.nodes.length : 0,
          edges: Array.isArray(data?.edges) ? data.edges.length : 0,
        };
      } catch {
        return { nodes: 0, edges: 0 };
      }
    });

    const toggleHistory = async () => {
      if (!showHistory.value) {
        // opening: close other right-side panels to avoid overlap
        chatOpen.value = false;
      }
      showHistory.value = !showHistory.value;
      if (showHistory.value && historyItems.value.length === 0) {
        await loadHistory();
      }
    };

    const loadHistory = async () => {
      historyLoading.value = true;
      historyError.value = '';
      try {
        const res = await canvasApi.history(resolvedId.value, HISTORY_PAGE + 1, 0);
        historyAccess.value = res.historyAccess;
        hasMoreHistory.value = res.items.length > HISTORY_PAGE;
        historyItems.value = res.items.slice(0, HISTORY_PAGE);
        if (!historyItems.value.some((item) => item.id === selectedHistoryItem.value?.id)) {
          selectedHistoryItem.value = null;
          selectedHistorySnapshot.value = null;
        }
      } catch (e: any) {
        historyError.value = e.message || 'Cannot load history';
      } finally {
        historyLoading.value = false;
      }
    };

    const loadMoreHistory = async () => {
      historyLoading.value = true;
      try {
        const res = await canvasApi.history(resolvedId.value, HISTORY_PAGE + 1, historyItems.value.length);
        hasMoreHistory.value = res.items.length > HISTORY_PAGE;
        historyItems.value.push(...res.items.slice(0, HISTORY_PAGE));
      } catch (err: any) {
        showToast(err.message || 'Failed to load history', 'error');
      } finally {
        historyLoading.value = false;
      }
    };

    const changeHistoryAccess = async (access: string) => {
      try {
        await canvasApi.updateHistoryAccess(resolvedId.value, access);
        historyAccess.value = access;
        showToast('History access updated', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to update history access', 'error');
      }
    };

    const openHistorySnapshot = async (item: any) => {
      selectedHistoryItem.value = item;
      selectedHistorySnapshot.value = null;
      historySnapshotError.value = '';
      historySnapshotLoading.value = true;
      try {
        selectedHistorySnapshot.value = await canvasApi.historySnapshot(resolvedId.value, item.revision);
      } catch (e: any) {
        historySnapshotError.value = e.message || 'Failed to load revision';
      } finally {
        historySnapshotLoading.value = false;
      }
    };

    const restoreSelectedHistorySnapshot = async () => {
      if (!selectedHistoryItem.value || !selectedHistorySnapshot.value) return;
      const ok = window.confirm(`Restore revision ${selectedHistoryItem.value.revision}? This will create a new current revision.`);
      if (!ok) return;
      restoringHistory.value = true;
      try {
        const result = await canvasApi.restoreHistorySnapshot(resolvedId.value, selectedHistoryItem.value.revision);
        const nextData = JSON.parse(result.canvas.data);
        isApplyingRemote = true;
        canvasRef.value?.applyRemoteData(nextData);
        canvasData.value = nextData;
        revision.value = result.canvas.revision ?? result.revision ?? revision.value;
        setRevision(revision.value);
        clearPendingOps();
        isApplyingRemote = false;
        showToast(`Restored revision ${selectedHistoryItem.value.revision}`, 'success');
        await loadHistory();
      } catch (e: any) {
        isApplyingRemote = false;
        showToast(e.message || 'Failed to restore revision', 'error');
      } finally {
        restoringHistory.value = false;
      }
    };

    const opLabel = (type: string) => {
      const opLabels: Record<string, string> = {
        'nodes-move': t('opNodesMove'),
        'node-resize': t('opNodeResize'),
        'node-add': t('opNodeAdd'),
        'node-delete': t('opNodeDelete'),
        'node-update': t('opNodeUpdate'),
        'edge-add': t('opEdgeAdd'),
        'edge-delete': t('opEdgeDelete'),
        'edge-update': t('opEdgeUpdate'),
        'canvas-restore': t('opCanvasRestore'),
      };
      return opLabels[type] || type;
    };

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
          case 'node-delete': return `${payload.ids?.length || 1} ${t('nodeUnit')}`;
          case 'nodes-move': return `${payload.moves?.length || 1} ${t('nodeUnit')}`;
          case 'node-update': return Object.keys(payload.changes || {}).join(', ');
          case 'edge-add': return `${payload.edge?.fromNode?.slice(0, 8)} → ${payload.edge?.toNode?.slice(0, 8)}`;
          case 'canvas-restore': return `${t('fromRevision')} ${payload.restoredFromRevision}`;
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
      showDocPicker.value = false;
      if (embedCanvases.value.length === 0) {
        embedLoading.value = true;
        try {
          const res = await canvasApi.list();
          const all = [...(res.own || []), ...(res.shared || []), ...(res.public || [])];
          embedCanvases.value = all.filter((c: any) => c.id !== resolvedId.value);
        } catch (err: any) {
          showToast(err.message || 'Failed to load canvases', 'error');
        } finally {
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

    // --- Embed Document ---
    const showDocPicker = ref(false);
    const docSearch = ref('');
    const docKindFilter = ref<'all' | 'html' | 'text'>('all');
    const embedDocuments = ref<{ id: string; title: string; kind: 'html' | 'text' }[]>([]);
    const docLoading = ref(false);

    const openDocPicker = async () => {
      showDocPicker.value = true;
      showEmbedPicker.value = false;
      if (embedDocuments.value.length > 0) return;
      docLoading.value = true;
      try {
        const [htmlRes, textRes] = await Promise.allSettled([
          htmlDocumentsApi.list(),
          textDocumentsApi.list(),
        ]);
        const collected: { id: string; title: string; kind: 'html' | 'text' }[] = [];
        if (htmlRes.status === 'fulfilled') {
          for (const d of htmlRes.value.documents || []) {
            collected.push({ id: d.id, title: d.title || 'Untitled', kind: 'html' });
          }
        }
        if (textRes.status === 'fulfilled') {
          for (const d of textRes.value.documents || []) {
            collected.push({ id: d.id, title: d.title || 'Untitled', kind: 'text' });
          }
        }
        if (htmlRes.status === 'rejected' && textRes.status === 'rejected') {
          throw htmlRes.reason;
        }
        embedDocuments.value = collected;
      } catch (err: any) {
        showToast(err?.message || t('failedLoadDocuments'), 'error');
      } finally {
        docLoading.value = false;
      }
    };

    const filteredEmbedDocuments = computed(() => {
      const q = docSearch.value.toLowerCase();
      return embedDocuments.value.filter((d) => {
        if (docKindFilter.value !== 'all' && d.kind !== docKindFilter.value) return false;
        return !q || d.title.toLowerCase().includes(q);
      });
    });

    const doEmbedDocument = (kind: 'html' | 'text', documentId: string) => {
      canvasRef.value?.addDocumentEmbed(kind, documentId);
      showDocPicker.value = false;
    };

    /**
     * Leaving the canvas unmounts the view, so a freshly added node must reach the
     * server first: wait for the realtime ack, or force a snapshot when there is
     * no usable realtime channel (the 1s debounce would be dropped on navigate).
     */
    const flushCanvasChanges = async () => {
      if (wsConnected.value && !realtimeOpsUnavailable.value) {
        const deadline = Date.now() + 4000;
        while (pendingOpsCount.value > 0 && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return;
      }
      if (saveTimeout) clearTimeout(saveTimeout);
      await persistCurrentSnapshot();
    };

    /** Folder the canvas itself lives in, so a document created here joins it. */
    const canvasFolderId = ref<string | null>(null);
    const { backTarget } = useResourceBackTarget();

    const creatingDocument = ref(false);

    const createAndEmbedDocument = async () => {
      if (creatingDocument.value) return;
      if (role.value !== 'owner' && role.value !== 'edit') {
        notifyReadOnlyEditAttempt();
        return;
      }
      creatingDocument.value = true;
      try {
        // Only the owner's folder is a valid destination: folderId on a canvas
        // always belongs to that canvas's owner, and a document may only be
        // filed into a folder its own owner holds.
        const folderId = role.value === 'owner' ? canvasFolderId.value : null;
        const doc = await textDocumentsApi.create({
          title: 'Untitled document',
          ...(folderId ? { folderId } : {}),
        });
        if (!doc?.id) throw new Error(t('failedCreateDocument'));
        embedDocuments.value = [
          { id: doc.id, title: doc.title || 'Untitled document', kind: 'text' },
          ...embedDocuments.value,
        ];
        canvasRef.value?.addDocumentEmbed('text', doc.id);
        showDocPicker.value = false;
        await flushCanvasChanges();
        router.push(documentRoute('text', doc.id));
      } catch (err: any) {
        showToast(err?.message || t('failedCreateDocument'), 'error');
      } finally {
        creatingDocument.value = false;
      }
    };

    /** Documents opened from a canvas carry it along so their back button returns here. */
    const documentRoute = (kind: 'html' | 'text', id: string) => ({
      path: kind === 'text' ? `/docs/${id}` : `/edit/html/${id}`,
      query: { [CANVAS_ORIGIN_QUERY]: resolvedId.value },
    });

    const onOpenDocument = (payload: { kind: 'html' | 'text'; id: string }) => {
      router.push(documentRoute(payload.kind, payload.id));
    };

    const onOpenCanvas = (targetCanvasId: string) => {
      router.push('/canvas/' + targetCanvasId);
    };
    const onOpenBoard = (boardId: string) => {
      router.push({
        name: 'interactive-template',
        params: { id: boardId },
        query: { [CANVAS_ORIGIN_QUERY]: resolvedId.value },
      });
    };

    watchPostEffect(() => {
      topbarRef.value;
      nodeToolbarRef.value;
      void nextTick(observeChromeMetrics);
    });

    onMounted(() => {
      window.addEventListener('resize', updateChromeMetrics);
      window.addEventListener('pointerdown', closeToolbarOnOutsidePointer, true);
      const cached = readNativeResourceCache<any>('canvas', canvasId);
      if (cached?.value?.canvas?.data) {
        const res = cached.value;
        resolvedId.value = res.canvas.id;
        slug.value = res.canvas.slug || null;
        slugInput.value = slug.value || '';
        title.value = res.canvas.title;
        canvasData.value = JSON.parse(res.canvas.data);
        historyAccess.value = res.canvas.historyAccess || 'owner';
        canvasFolderId.value = res.canvas.folderId ?? null;
        revision.value = res.canvas.revision ?? 0;
        setRevision(revision.value);
        role.value = res.role;
        isPublic.value = res.canvas.isPublic;
        visibility.value = res.canvas.visibility || (res.canvas.isPublic ? 'public' : 'private');
        allowPublicEdit.value = !!res.canvas.allowPublicEdit;
        listedInPublic.value = res.canvas.listedInPublic !== false;
        passwordAccessEnabled.value = !!res.canvas.passwordAccessEnabled;
        passwordAccessRole.value = res.canvas.passwordAccessRole || 'read';
        loading.value = false;
        if (cached.stale) cacheStatus.value = { kind: 'refreshing', text: t('refreshingSaved') };
      }
      void load();
      void nextTick(observeChromeMetrics);
    });
    onUnmounted(() => {
      if (saveTimeout) clearTimeout(saveTimeout);
      if (noticeTimeout) clearTimeout(noticeTimeout);
      if (cacheStatusTimeout) clearTimeout(cacheStatusTimeout);
      window.removeEventListener('resize', updateChromeMetrics);
      window.removeEventListener('pointerdown', closeToolbarOnOutsidePointer, true);
      chromeResizeObserver?.disconnect();
    });

    const drawPanelOpen = ref(false);
    const drawColorPickerOpen = ref(false);
    const drawPaletteColorOpen = ref(false);
    const drawMobilePopup = ref<null | 'color' | 'width'>(null);
    const toggleDrawPanel = () => {
      drawPanelOpen.value = !drawPanelOpen.value;
      if (!drawPanelOpen.value) canvasRef.value?.setDrawTool('select');
    };

    // Sync draw panel with mobile mode changes
    watch(mobileMode, (newMode) => {
      if (newMode === 'draw') {
        drawPanelOpen.value = true;
        if (canvasRef.value?.drawTool === 'select') canvasRef.value?.setDrawTool('pen');
      } else {
        drawPanelOpen.value = false;
        drawPaletteColorOpen.value = false;
        drawMobilePopup.value = null;
        canvasRef.value?.setDrawTool('select');
      }
    });

    const toggleDice = () => { diceOpen.value = !diceOpen.value; };
    const rollDice = () => {
      if (!diceEnabled.value) return;
      sendRoll(diceSides.value, diceCount.value, diceModifier.value);
      diceOpen.value = false;
      // open the chat (loading history) so the roll lands in a populated thread;
      // if already open, the roll just arrives live via chat-message.
      if (!chatOpen.value) void openChat();
    };

    return {
      t,
      route, backTarget, canvasViewRef, topbarRef, nodeToolbarRef, drawToolbarRef, canvasRef, modebarRef, aligns,
      drawColorPickerOpen, drawPaletteColorOpen, drawMobilePopup,
      loading, error, accessDenied, gatePasswordAccessEnabled, cacheStatus, requestingAccess, accessRequestSent,
      checkingResourcePassword,
      title, canvasData, role, isPublic, saving, syncStatus, syncNotice,
      showSyncEvents, syncEvents, syncBadgeTitle, syncReasonLabel, formatSyncEventTime,
      showShare, toggleShare, shareEmail, shareRole, permissions,
      publicUrl, copyPublicLink,
      onCanvasChange, onCanvasOp, onCursorMove, saveTitle, setVisibility, visibility, doShare, doRevoke,
      slug, slugInput, savingSlug, saveSlug,
      allowPublicEdit, listedInPublic, canManageSettings, togglePublicEdit, togglePublicListing,
      passwordAccessEnabled, passwordAccessPassword, passwordAccessRole, savePasswordAccess,
      searchQuery, searchMatches, searchIndex, runCanvasSearch, focusNextSearchResult,
      isAuthenticated, isAdmin, currentUser, canViewHistory,
      wsConnected, onlineUsers, otherUsers, remoteCursorsArray, revision, isResyncing, pendingOpsCount,
      showHistory, historyItems, historyLoading, historyError, historyAccess, hasMoreHistory,
      selectedHistoryItem, selectedHistorySnapshot, selectedHistorySummary,
      historySnapshotLoading, historySnapshotError, restoringHistory,
      toggleHistory, loadMoreHistory, changeHistoryAccess, openHistorySnapshot, restoreSelectedHistorySnapshot,
      opLabel, opCategory, opDetail, formatHistoryDate,
      showEmbedPicker, embedSearch, filteredEmbedCanvases, embedLoading,
      openEmbedPicker, doEmbed, onOpenCanvas, onOpenBoard,
      showDocPicker, docSearch, docKindFilter, docLoading, filteredEmbedDocuments,
      openDocPicker, doEmbedDocument, onOpenDocument,
      creatingDocument, createAndEmbedDocument, canvasFolderId,
      showShortcuts, menuOpen, addSheetOpen, blockSection, toggleBlockSection, requestCanvasAccess, loginWithCanvasPassword, notifyReadOnlyEditAttempt,
      activeToolbarMenu, toggleToolbarMenu, updateSelectedNodeTitle, closeNodeEditingPanels,
      showPlugins, pluginItems, settingPluginId, setCanvasPlugin, interactiveTemplatesEnabled, templateImportOpen, templateImportLoading, templateImportItems, loadTemplateImport, importTemplateToCanvas,
      minimapEnabled, setMinimapEnabled,
      mobileMode,
      drawPanelOpen,
      toggleDrawPanel,
      diceToolbarRef, diceOpen, diceSides, diceCount, diceModifier, toggleDice, rollDice, diceEnabled,
      chatOpen, chatMessages, toggleChat, onChatSend, onTemplateRoll,
      attachedNode, onAttachNode, onClearNode, onJumpNode, pickingNodeForChat, onCancelPickNode,
    };
  },
});
</script>
