<template>
  <div ref="canvasViewRef" class="canvas-view">
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
    <div v-else-if="accessDenied" class="access-gate">
      <div class="access-gate-card">
        <div class="access-gate-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h2 class="access-gate-title">Private canvas</h2>
        <p class="access-gate-sub">You need permission to view this document.</p>

        <div class="access-gate-section">
          <div class="access-gate-label">Have a password?</div>
          <form class="access-gate-form" @submit.prevent="loginWithCanvasPassword">
            <input v-model="resourcePassword" type="password" placeholder="Enter password" class="access-gate-input" />
            <button class="access-gate-btn access-gate-btn-primary" :disabled="checkingResourcePassword || !resourcePassword">
              {{ checkingResourcePassword ? 'Checking…' : 'Open' }}
            </button>
          </form>
        </div>

        <div class="access-gate-divider"><span>or</span></div>

        <div class="access-gate-section">
          <div class="access-gate-label">Request access from the owner</div>
          <div class="access-gate-request-row">
            <select v-model="requestedRole" class="access-gate-select">
              <option value="read">View only</option>
              <option value="edit">Can edit</option>
            </select>
            <button class="access-gate-btn access-gate-btn-secondary" :disabled="requestingAccess || accessRequestSent" @click="requestCanvasAccess">
              {{ accessRequestSent ? '✓ Request sent' : 'Send request' }}
            </button>
          </div>
        </div>

        <router-link to="/" class="access-gate-back">← Dashboard</router-link>
      </div>
    </div>
    <template v-else>
      <!-- Top bar -->
      <div ref="topbarRef" class="canvas-topbar">
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
            <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#44cf6e"/></svg>
          </span>
          <div class="sync-menu-wrap">
            <button
              class="topbar-sync"
              :class="'topbar-sync-' + syncStatus.kind"
              :title="syncBadgeTitle"
              @click="showSyncEvents = !showSyncEvents"
            >
              {{ syncStatus.label }}<template v-if="pendingOpsCount"> · {{ pendingOpsCount }}</template>
            </button>
            <div v-if="showSyncEvents" class="sync-events-popover">
              <div class="sync-events-head">
                <strong>Sync</strong>
                <span>r{{ revision }}</span>
              </div>
              <div v-if="syncEvents.length === 0" class="sync-event-empty">No local sync events yet</div>
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
            <button v-if="role === 'owner'" class="btn-ghost btn-sm" @click="showShare = !showShare; menuOpen = false">
              Access
            </button>
            <button v-if="role !== 'read'" class="btn-ghost btn-sm" @click="openEmbedPicker(); menuOpen = false">
              Embed
            </button>
            <button class="btn-ghost btn-sm" @click="toggleHistory(); menuOpen = false">
              History
            </button>
            <button class="btn-ghost btn-sm" @click="showShortcuts = !showShortcuts; menuOpen = false" title="Keyboard Shortcuts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="10" y1="10" x2="10" y2="10.01"/><line x1="14" y1="10" x2="14" y2="10.01"/><line x1="18" y1="10" x2="18" y2="10.01"/><line x1="8" y1="14" x2="16" y2="14"/></svg>
              <span class="topbar-action-label">Shortcuts</span>
            </button>

            <!-- Canvas actions (mobile dropdown only — replaces the floating controls panel) -->
            <div class="topbar-canvas-actions">
              <span class="topbar-actions-sep"></span>
              <button v-if="role !== 'read'" class="btn-ghost btn-sm" @click="canvasRef?.addTextNodeCenter(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Add text block</span>
              </button>
              <button v-if="role !== 'read'" class="btn-ghost btn-sm" @click="canvasRef?.openImagePicker(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span>Add image</span>
              </button>
              <button class="btn-ghost btn-sm" @click="canvasRef?.resetView(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span>Reset view</span>
              </button>
              <button class="btn-ghost btn-sm" @click="canvasRef?.onExportCanvas(); menuOpen = false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Export .canvas</span>
              </button>
            </div>
          </div>

          <!-- Overflow menu toggle (mobile only) -->
          <button class="topbar-menu-btn btn-ghost btn-sm" @click="menuOpen = !menuOpen" :title="menuOpen ? 'Close menu' : 'Menu'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
          </button>
        </div>
      </div>

      <!-- Tap-away backdrop to close the mobile overflow menu -->
      <div v-if="menuOpen" class="topbar-menu-backdrop" @click="menuOpen = false"></div>

      <div v-if="syncNotice" class="sync-notice" :class="'sync-notice-' + syncNotice.kind">
        {{ syncNotice.text }}
      </div>

      <!-- Node toolbar (under topbar, visible when node selected) -->
      <div v-if="canvasRef?.selectedNodeId && !canvasRef?.editingNodeId" ref="nodeToolbarRef" class="node-toolbar">
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
        <span class="tb-sep"></span>
        <!-- Node actions -->
        <button class="tb-btn" @click="canvasRef?.duplicateSelection()" title="Duplicate">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
        </button>
        <button v-if="role !== 'read'" class="tb-btn tb-btn-danger" @click="canvasRef?.deleteSelection()" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>

      <!-- Mobile block settings menu — opens near the minimap when a block is selected.
           Colors/style live behind expandable buttons, so there is no scrolling. -->
      <div
        v-if="canvasRef?.selectedNodeId && !canvasRef?.editingNodeId"
        class="block-menu"
      >
        <!-- Fill (background) color -->
        <button class="block-menu-item" :class="{ open: blockSection === 'fill' }" @click="toggleBlockSection('fill')">
          <span class="block-menu-swatch" :class="canvasRef.getNodeColor(canvasRef.selectedNodeId) ? 'ctx-color-' + canvasRef.getNodeColor(canvasRef.selectedNodeId) : 'swatch-empty'"></span>
          <span class="block-menu-label">Цвет фона</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'fill'" class="block-menu-pop">
          <button v-for="c in ['1','2','3','4','5','6']" :key="'bf'+c" class="tb-color" :class="'ctx-color-'+c" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, c)"></button>
          <button class="tb-color tb-color-none" @click="canvasRef?.setNodeColor(canvasRef.selectedNodeId, undefined)">x</button>
          <button class="block-menu-toggle" :class="{ active: canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' }" @click="canvasRef?.toggleNodeFillStyle(canvasRef.selectedNodeId)">
            {{ canvasRef?.getNodeFillStyle(canvasRef.selectedNodeId) === 'solid' ? 'Сплошная' : 'Градиент' }}
          </button>
        </div>

        <!-- Border color -->
        <button class="block-menu-item" :class="{ open: blockSection === 'borderColor' }" @click="toggleBlockSection('borderColor')">
          <span class="block-menu-swatch" :class="{ 'swatch-empty': !canvasRef.getNodeBorderColor(canvasRef.selectedNodeId) }" :style="canvasRef.getNodeBorderColor(canvasRef.selectedNodeId) ? { background: canvasRef.getNodeBorderColor(canvasRef.selectedNodeId) } : {}"></span>
          <span class="block-menu-label">Цвет рамки</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'borderColor'" class="block-menu-pop">
          <button v-for="c in ['#fb464c','#e9973f','#e0de71','#44cf6e','#53dfdd','#a882ff','#ffffff']" :key="'bbc'+c" class="tb-color" :style="{ background: c }" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, c)"></button>
          <button class="tb-color tb-color-none" @click="canvasRef?.setNodeBorderColor(canvasRef.selectedNodeId, undefined)">x</button>
        </div>

        <!-- Border style & width -->
        <button class="block-menu-item" :class="{ open: blockSection === 'border' }" @click="toggleBlockSection('border')">
          <span class="block-menu-label">Рамка</span>
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
          <span class="block-menu-label">Выравнивание</span>
          <svg class="block-menu-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div v-if="blockSection === 'align'" class="block-menu-pop block-menu-pop-wrap">
          <span class="block-menu-sublabel">1-я строка</span>
          <button v-for="a in aligns" :key="'bmf-'+a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeFirstLineAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeFirstLineAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
          <span class="tb-sep"></span>
          <span class="block-menu-sublabel">Текст</span>
          <button v-for="a in aligns" :key="'bma-'+a.v" class="tb-btn" :class="{ active: canvasRef?.getNodeAlign(canvasRef.selectedNodeId) === a.v }" @click="canvasRef?.setNodeAlign(canvasRef.selectedNodeId, a.v)" :title="a.l" v-html="a.icon"></button>
        </div>

        <div class="block-menu-divider"></div>

        <!-- Actions -->
        <button class="block-menu-item" @click="canvasRef?.duplicateSelection()">
          <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><rect x="4" y="4" width="11" height="11" rx="2"/></svg>
          <span class="block-menu-label">Дублировать</span>
        </button>
        <button v-if="role !== 'read'" class="block-menu-item block-menu-danger" @click="canvasRef?.deleteSelection()">
          <svg class="block-menu-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          <span class="block-menu-label">Удалить</span>
        </button>
      </div>

      <!-- Access panel -->
      <div v-if="showShare" class="share-panel">
        <div class="share-panel-header">
          <h3>Access</h3>
          <button class="btn-ghost btn-sm" @click="showShare = false">×</button>
        </div>

        <div v-if="role === 'owner'" class="share-section">
          <div class="share-section-title">Link</div>
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
            <button class="btn-ghost btn-sm" :disabled="savingSlug" @click="saveSlug">Save</button>
          </div>
          <div class="slug-hint">Lowercase letters, digits and hyphens. Leave empty to use the id.</div>
        </div>

        <div class="share-section">
          <div class="share-section-title">Who can view</div>
          <select class="share-visibility-select" :value="visibility" @change="setVisibility(($event.target as HTMLSelectElement).value as any)">
            <option value="private">Private — only invited people</option>
            <option value="authenticated">Auth only — any logged-in user</option>
            <option value="public">Public — anyone with the link</option>
          </select>
          <label class="share-checkbox">
            <input type="checkbox" :checked="allowPublicEdit" @change="togglePublicEdit" />
            <span>Allow public editing</span>
          </label>
          <label class="share-checkbox">
            <input
              type="checkbox"
              :checked="listedInPublic"
              :disabled="visibility !== 'public'"
              @change="togglePublicListing"
            />
            <span>Show in Public</span>
          </label>
        </div>

        <div class="share-section">
          <div class="share-section-title">Invite people</div>
          <div class="share-form">
            <input v-model="shareEmail" placeholder="Email" type="email" />
            <select v-model="shareRole">
              <option value="read">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button @click="doShare">Invite</button>
          </div>
          <div v-if="permissions.length" class="share-list">
            <div v-for="p in permissions" :key="p.id" class="share-item">
              <span>{{ p.user?.email || p.userId }}</span>
              <span class="share-item-role">{{ p.role === 'edit' ? 'Can edit' : 'Can view' }}</span>
              <button @click="doRevoke(p.userId)">×</button>
            </div>
          </div>
        </div>

        <div v-if="role === 'owner'" class="share-section">
          <div class="share-section-title">Password access</div>
          <label class="share-checkbox">
            <input type="checkbox" v-model="passwordAccessEnabled" />
            <span>Enable password access</span>
          </label>
          <div v-if="passwordAccessEnabled" class="share-form">
            <input v-model="passwordAccessPassword" type="password" placeholder="New password" />
            <select v-model="passwordAccessRole">
              <option value="read">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button @click="savePasswordAccess">Save</button>
          </div>
        </div>
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
              Load more
            </button>
          </div>
          <div class="history-preview">
            <div v-if="historySnapshotLoading" class="history-empty">Loading revision...</div>
            <div v-else-if="historySnapshotError" class="history-error">{{ historySnapshotError }}</div>
            <div v-else-if="!selectedHistoryItem" class="history-empty">Select a revision</div>
            <template v-else>
              <div class="history-preview-head">
                <strong>Revision {{ selectedHistoryItem.revision }}</strong>
                <span>{{ formatHistoryDate(selectedHistoryItem.createdAt) }}</span>
              </div>
              <div class="history-preview-row">
                <span>Operation</span>
                <strong>{{ opLabel(selectedHistoryItem.type) }}</strong>
              </div>
              <div class="history-preview-row">
                <span>Author</span>
                <strong>{{ selectedHistoryItem.userName || 'Guest' }}</strong>
              </div>
              <div class="history-preview-grid">
                <div>
                  <span>Nodes</span>
                  <strong>{{ selectedHistorySummary.nodes }}</strong>
                </div>
                <div>
                  <span>Edges</span>
                  <strong>{{ selectedHistorySummary.edges }}</strong>
                </div>
              </div>
              <div class="history-preview-detail">{{ opDetail(selectedHistoryItem) || 'Full canvas snapshot' }}</div>
              <button
                v-if="role !== 'read'"
                class="btn-primary btn-sm history-restore-btn"
                :disabled="restoringHistory || !selectedHistorySnapshot"
                @click="restoreSelectedHistorySnapshot"
              >
                {{ restoringHistory ? 'Restoring...' : 'Restore revision' }}
              </button>
            </template>
          </div>
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

      <!-- Keyboard Shortcuts dialog -->
      <div v-if="showShortcuts" class="shortcuts-backdrop" @click.self="showShortcuts = false">
        <div class="shortcuts-panel">
          <div class="shortcuts-header">
            <h3>Keyboard Shortcuts</h3>
            <button class="btn-ghost btn-sm" @click="showShortcuts = false">&times;</button>
          </div>
          <div class="shortcuts-grid">
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>Undo</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd><span>Redo</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>C</kbd><span>Copy selected</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>V</kbd><span>Paste</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>D</kbd><span>Duplicate</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+<kbd>A</kbd><span>Select all</span></div>
            <div class="shortcut-row"><kbd>Delete</kbd> / <kbd>Backspace</kbd><span>Delete selected</span></div>
            <div class="shortcut-row"><kbd>Escape</kbd><span>Deselect all</span></div>
            <div class="shortcut-row"><kbd>Double-click</kbd><span>Edit node text</span></div>
            <div class="shortcut-row"><kbd>Shift</kbd>+Click<span>Multi-select</span></div>
            <div class="shortcut-row"><kbd>Ctrl</kbd>+Scroll<span>Zoom in/out</span></div>
            <div class="shortcut-row"><kbd>Middle mouse</kbd><span>Pan canvas</span></div>
            <div class="shortcut-row"><kbd>Right-click</kbd><span>Context menu</span></div>
            <div class="shortcut-row"><kbd>Drag from edge</kbd><span>Create connection</span></div>
          </div>
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
import { defineComponent, ref, computed, onMounted, onUnmounted, nextTick, watchPostEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { accessRequests, ApiError, auth, canvas as canvasApi, isAuthenticated, isAdmin, setToken } from '../api/client';
import { createSyncEventStore, syncReasonLabel, type SyncRejectReason } from '../canvas/syncEvents';
import { shouldRetryCanvasReject } from '../canvas/syncRetry';
import { useCanvasSocket } from '../composables/useCanvasSocket';
import { useToast } from '../composables/useToast';
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
    // The URL param may be a UUID id or a human-readable slug. `resolvedId`
    // holds the real canvas id after load; it's used for the WS room and all
    // mutations so collaborators share one room regardless of which form of the
    // link they opened.
    const canvasId = route.params.id as string;
    const resolvedId = ref(canvasId);
    const slug = ref<string | null>(null);
    const slugInput = ref('');
    const savingSlug = ref(false);

    const { show: showToast } = useToast();
    const canvasViewRef = ref<HTMLElement | null>(null);
    const topbarRef = ref<HTMLElement | null>(null);
    const nodeToolbarRef = ref<HTMLElement | null>(null);
    const canvasRef = ref<any>(null);
    const showShortcuts = ref(false);
    const menuOpen = ref(false);
    // Which expandable section of the mobile block menu is open ('' = none)
    const blockSection = ref('');
    const toggleBlockSection = (s: string) => {
      blockSection.value = blockSection.value === s ? '' : s;
    };

    const aligns = [
      { v: 'left', l: 'Left', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>' },
      { v: 'center', l: 'Center', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/></svg>' },
      { v: 'right', l: 'Right', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>' },
      { v: 'justify', l: 'Justify', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' },
    ];

    const loading = ref(true);
    const error = ref('');
    const accessDenied = ref(false);
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const requestedRole = ref<'read' | 'edit'>('read');
    const resourcePassword = ref('');
    const checkingResourcePassword = ref(false);
    const title = ref('');
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
    const realtimeOpsUnavailable = ref(false);
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

    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    let noticeTimeout: ReturnType<typeof setTimeout> | null = null;
    let isApplyingRemote = false;
    let chromeResizeObserver: ResizeObserver | null = null;

    const syncStatus = computed(() => {
      if (syncIssue.value) return { kind: 'conflict', label: 'Conflict' };
      if (isResyncing.value) return { kind: 'resyncing', label: 'Resyncing' };
      if (saving.value || pendingOpsCount.value > 0) return { kind: 'saving', label: 'Saving' };
      if (wsConnected.value) return { kind: 'synced', label: 'Synced' };
      return { kind: 'offline', label: 'Offline' };
    });

    const syncBadgeTitle = computed(() => {
      const parts = [`Revision ${revision.value}`, `${pendingOpsCount.value} pending`];
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
      root.style.setProperty('--canvas-toolbar-height', `${nodeToolbarRef.value?.offsetHeight || 0}px`);
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
      clearPendingOps,
    } = useCanvasSocket(resolvedId);

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
        accessDenied.value = false;
        const res = await canvasApi.get(resolvedId.value);
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
        revision.value = res.canvas.revision ?? 0;
        setRevision(revision.value);
        role.value = res.role;
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
            realtimeOpsUnavailable.value = true;
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
          loading.value = false;
          return;
        }
        console.warn('Canvas is not available, redirecting to dashboard', e);
        await router.replace('/');
        return;
      }
      loading.value = false;
    };

    const requestCanvasAccess = async () => {
      if (!isAuthenticated()) {
        await router.push(`/login?redirect=/canvas/${canvasId}`);
        return;
      }
      requestingAccess.value = true;
      try {
        await accessRequests.create({
          resourceType: 'canvas',
          resourceId: canvasId,
          requestedRole: requestedRole.value,
        });
        accessRequestSent.value = true;
        showToast('Access request sent', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to request access', 'error');
      } finally {
        requestingAccess.value = false;
      }
    };

    const loginWithCanvasPassword = async () => {
      checkingResourcePassword.value = true;
      try {
        const res = await auth.resourcePasswordLogin({
          resourceType: 'canvas',
          resourceId: canvasId,
          password: resourcePassword.value,
        });
        setToken(res.token, res.user?.role, res.user?.accessMode || 'resource-password');
        accessDenied.value = false;
        await load();
      } catch (e: any) {
        showToast(e.message || 'Invalid password', 'error');
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
          const updated = await canvasApi.update(resolvedId.value, { data: JSON.stringify({ nodes: data.nodes, edges: data.edges }) });
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

    const opLabels: Record<string, string> = {
      'nodes-move': 'Moved nodes',
      'node-resize': 'Resized node',
      'node-add': 'Added node',
      'node-delete': 'Deleted nodes',
      'node-update': 'Updated node',
      'edge-add': 'Added edge',
      'edge-delete': 'Deleted edge',
      'edge-update': 'Updated edge',
      'canvas-restore': 'Restored canvas',
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
          case 'canvas-restore': return `from revision ${payload.restoredFromRevision}`;
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

    const onOpenCanvas = (targetCanvasId: string) => {
      router.push('/canvas/' + targetCanvasId);
    };

    watchPostEffect(() => {
      topbarRef.value;
      nodeToolbarRef.value;
      void nextTick(observeChromeMetrics);
    });

    onMounted(() => {
      window.addEventListener('resize', updateChromeMetrics);
      void load();
      void nextTick(observeChromeMetrics);
    });
    onUnmounted(() => {
      if (saveTimeout) clearTimeout(saveTimeout);
      if (noticeTimeout) clearTimeout(noticeTimeout);
      window.removeEventListener('resize', updateChromeMetrics);
      chromeResizeObserver?.disconnect();
    });

    return {
      canvasViewRef, topbarRef, nodeToolbarRef, canvasRef, aligns,
      loading, error, accessDenied, requestingAccess, accessRequestSent, requestedRole,
      resourcePassword, checkingResourcePassword,
      title, canvasData, role, isPublic, saving, syncStatus, syncNotice,
      showSyncEvents, syncEvents, syncBadgeTitle, syncReasonLabel, formatSyncEventTime,
      showShare, shareEmail, shareRole, permissions,
      onCanvasChange, onCanvasOp, onCursorMove, saveTitle, setVisibility, visibility, doShare, doRevoke,
      slug, slugInput, savingSlug, saveSlug,
      allowPublicEdit, listedInPublic, canManageSettings, togglePublicEdit, togglePublicListing,
      passwordAccessEnabled, passwordAccessPassword, passwordAccessRole, savePasswordAccess,
      searchQuery, searchMatches, searchIndex, runCanvasSearch, focusNextSearchResult,
      isAuthenticated, isAdmin,
      wsConnected, onlineUsers, otherUsers, remoteCursorsArray, revision, isResyncing, pendingOpsCount,
      showHistory, historyItems, historyLoading, historyError, historyAccess, hasMoreHistory,
      selectedHistoryItem, selectedHistorySnapshot, selectedHistorySummary,
      historySnapshotLoading, historySnapshotError, restoringHistory,
      toggleHistory, loadMoreHistory, changeHistoryAccess, openHistorySnapshot, restoreSelectedHistorySnapshot,
      opLabel, opCategory, opDetail, formatHistoryDate,
      showEmbedPicker, embedSearch, filteredEmbedCanvases, embedLoading,
      openEmbedPicker, doEmbed, onOpenCanvas,
      showShortcuts, menuOpen, blockSection, toggleBlockSection, requestCanvasAccess, loginWithCanvasPassword,
    };
  },
});
</script>
