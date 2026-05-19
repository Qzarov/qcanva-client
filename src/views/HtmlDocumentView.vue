<template>
  <div class="html-editor-page">
    <div v-if="loading" class="canvas-loading">Loading document...</div>
    <div v-else-if="accessDenied" class="canvas-error">
      <div class="error-modal access-request-modal">
        <h2>No access to this HTML document</h2>
        <p>Request access from the owner and choose the level you need.</p>
        <div class="access-request-controls">
          <select v-model="requestedRole">
            <option value="read">Read</option>
            <option value="edit">Edit</option>
          </select>
          <button class="error-home-btn" :disabled="requestingAccess || accessRequestSent" @click="requestHtmlAccess">
            {{ accessRequestSent ? 'Request sent' : 'Request access' }}
          </button>
        </div>
        <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      </div>
    </div>
    <template v-else>
    <header class="html-editor-bar">
      <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      <input v-model="title" class="html-title-input" :readonly="role === 'read'" />
      <select v-if="role === 'owner'" v-model="visibility" class="html-access-select" @change="saveAccessSettings">
        <option value="private">Private</option>
        <option value="authenticated">Auth only</option>
        <option value="public">Public</option>
      </select>
      <label v-if="role === 'owner'" class="share-checkbox">
        <input type="checkbox" v-model="allowPublicEdit" @change="saveAccessSettings" />
        <span>Public edit</span>
      </label>
      <button v-if="role === 'owner'" class="btn-ghost" @click="showShare = !showShare">Share</button>
      <button v-if="role !== 'read'" class="btn-primary" @click="save">Save</button>
    </header>
    <section v-if="showShare && role === 'owner'" class="share-panel html-share-panel">
      <h3>Share HTML</h3>
      <div class="share-form">
        <input v-model.trim="shareEmail" placeholder="Email" type="email" />
        <select v-model="shareRole">
          <option value="read">Read</option>
          <option value="edit">Edit</option>
        </select>
        <button @click="doShare">Share</button>
      </div>
      <div v-if="permissions.length" class="share-list">
        <div v-for="p in permissions" :key="p.id" class="share-item">
          <span>{{ p.user?.email || p.userId }} - {{ p.role }}</span>
          <button @click="doRevoke(p.userId)">x</button>
        </div>
      </div>
    </section>
    <main class="html-editor-grid">
      <textarea v-if="role !== 'read'" v-model="html" class="html-source"></textarea>
      <section class="html-preview" @change="onPreviewChange" v-html="html"></section>
    </main>
    </template>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { accessRequests, ApiError, htmlDocuments, isAuthenticated } from '../api/client';
import { useToast } from '../composables/useToast';

export default defineComponent({
  setup() {
    const route = useRoute();
    const router = useRouter();
    const id = route.params.id as string;
    const { show: showToast } = useToast();
    const title = ref('');
    const html = ref('');
    const role = ref('read');
    const visibility = ref<'private' | 'authenticated' | 'public'>('private');
    const allowPublicEdit = ref(false);
    const loading = ref(true);
    const accessDenied = ref(false);
    const requestedRole = ref<'read' | 'edit'>('read');
    const requestingAccess = ref(false);
    const accessRequestSent = ref(false);
    const showShare = ref(false);
    const shareEmail = ref('');
    const shareRole = ref<'read' | 'edit'>('read');
    const permissions = ref<any[]>([]);

    async function load() {
      try {
        loading.value = true;
        accessDenied.value = false;
        const res = await htmlDocuments.get(id);
        title.value = res.document.title;
        html.value = res.document.html;
        visibility.value = res.document.visibility || (res.document.shared ? 'public' : 'private');
        allowPublicEdit.value = !!res.document.allowPublicEdit;
        role.value = res.role;
        if (res.role === 'owner') await loadPermissions();
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 403 && isAuthenticated()) {
          accessDenied.value = true;
          return;
        }
        if (e instanceof ApiError && e.status === 404) {
          await router.replace('/html-docs');
          return;
        }
        throw e;
      } finally {
        loading.value = false;
      }
    }

    async function save() {
      await htmlDocuments.update(id, { title: title.value, html: html.value });
      await load();
    }

    async function saveAccessSettings() {
      await htmlDocuments.update(id, {
        visibility: visibility.value,
        allowPublicEdit: allowPublicEdit.value,
      });
      await load();
    }

    async function onPreviewChange(event: Event) {
      const target = event.target as HTMLInputElement;
      if (target?.type !== 'checkbox' || !target.dataset.checkId) return;
      await htmlDocuments.checklist(id, target.dataset.checkId, target.checked);
    }

    async function loadPermissions() {
      permissions.value = await htmlDocuments.permissions(id);
    }

    async function doShare() {
      if (!shareEmail.value) return;
      try {
        await htmlDocuments.share(id, shareEmail.value, shareRole.value);
        shareEmail.value = '';
        await loadPermissions();
        showToast('HTML document shared', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to share document', 'error');
      }
    }

    async function doRevoke(userId: string) {
      await htmlDocuments.revoke(id, userId);
      await loadPermissions();
    }

    async function requestHtmlAccess() {
      requestingAccess.value = true;
      try {
        await accessRequests.create({
          resourceType: 'html-document',
          resourceId: id,
          requestedRole: requestedRole.value,
        });
        accessRequestSent.value = true;
        showToast('Access request sent', 'success');
      } catch (e: any) {
        showToast(e.message || 'Failed to request access', 'error');
      } finally {
        requestingAccess.value = false;
      }
    }

    onMounted(load);
    return {
      title, html, role, visibility, allowPublicEdit, loading, accessDenied,
      requestedRole, requestingAccess, accessRequestSent, showShare, shareEmail,
      shareRole, permissions,
      save, saveAccessSettings, onPreviewChange, doShare, doRevoke, requestHtmlAccess,
    };
  },
});
</script>
