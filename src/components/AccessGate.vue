<template>
  <div class="access-gate">
    <div class="access-gate-card">
      <div class="access-gate-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 class="access-gate-title">{{ t(titleKey) }}</h2>
      <p class="access-gate-sub">{{ t('accessGateSubtitle') }}</p>

      <div class="access-gate-auth">
        <p v-if="loggedIn" class="access-gate-auth-status" data-access-gate-logged-in>
          {{ t('accessGateLoggedInAs') }} <strong>{{ currentUser?.email }}</strong>
        </p>
        <div v-else class="access-gate-auth-actions" data-access-gate-auth-actions>
          <router-link :to="{ name: 'login', query: { redirect: currentPath } }" class="access-gate-btn access-gate-btn-primary">{{ t('login') }}</router-link>
          <router-link :to="{ name: 'register', query: { redirect: currentPath } }" class="access-gate-btn access-gate-btn-secondary">{{ t('register') }}</router-link>
        </div>
      </div>

      <template v-if="passwordAccessEnabled !== false">
        <div class="access-gate-section" data-access-gate-password>
          <div class="access-gate-label">{{ t('accessGateHavePassword') }}</div>
          <form class="access-gate-form" data-access-gate-password-form @submit.prevent="onSubmitPassword">
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              :aria-label="t('accessGateHavePassword')"
              :placeholder="t('accessGatePasswordPlaceholder')"
              class="access-gate-input"
              data-access-gate-password-input
            />
            <button class="access-gate-btn access-gate-btn-primary" type="submit" :disabled="checkingPassword || !password">
              {{ checkingPassword ? t('accessGateChecking') : t('accessGateOpen') }}
            </button>
          </form>
        </div>

        <div class="access-gate-divider"><span>{{ t('or') }}</span></div>
      </template>

      <div class="access-gate-section" data-access-gate-request>
        <div class="access-gate-label">{{ t('accessGateRequestFromOwner') }}</div>
        <div class="access-gate-request-row">
          <select v-model="requestedRole" class="access-gate-select" data-access-gate-role-select>
            <option value="read">{{ t('accessGateViewOnly') }}</option>
            <option value="edit">{{ t('accessGateCanEdit') }}</option>
          </select>
          <button
            type="button"
            class="access-gate-btn access-gate-btn-secondary"
            data-access-gate-request-button
            :disabled="requestingAccess || accessRequestSent"
            @click="onRequestAccess"
          >
            {{ accessRequestSent ? t('accessGateRequestSent') : t('accessGateSendRequest') }}
          </button>
        </div>
      </div>

      <router-link :to="backTarget.to" class="access-gate-back">{{ backTarget.label }}</router-link>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, ref, type PropType } from 'vue';
import { useRoute, type RouteLocationRaw } from 'vue-router';
import { getCurrentUser, isAuthenticated } from '../api/client';
import { useI18n } from '../composables/useI18n';

export type AccessGateResourceType = 'text-document' | 'html-document' | 'canvas';
export type AccessGateBackTarget = { to: RouteLocationRaw; label: string };

export default defineComponent({
  name: 'AccessGate',
  props: {
    resourceType: { type: String as PropType<AccessGateResourceType>, required: true },
    /**
     * Tri-state on purpose: `undefined` (prop omitted, e.g. an older backend
     * mid-rollout that doesn't send this yet) must behave like `true` and
     * show the password field - hiding it on anything other than an
     * explicit `false` risks locking out a visitor who already has the
     * resource's password in hand.
     */
    passwordAccessEnabled: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    backTarget: { type: Object as PropType<AccessGateBackTarget>, required: true },
    checkingPassword: { type: Boolean, default: false },
    requestingAccess: { type: Boolean, default: false },
    accessRequestSent: { type: Boolean, default: false },
  },
  emits: ['submit-password', 'request-access'],
  setup(props, { emit }) {
    const { t } = useI18n();
    const route = useRoute();
    const password = ref('');
    const requestedRole = ref<'read' | 'edit'>('read');

    const loggedIn = computed(() => isAuthenticated());
    const currentUser = computed(() => getCurrentUser());
    const titleKey = computed(() => (props.resourceType === 'canvas' ? 'accessGateTitleCanvas' : 'accessGateTitleDocument'));
    const currentPath = computed(() => route.fullPath);

    const onSubmitPassword = () => {
      if (!password.value) return;
      emit('submit-password', password.value);
    };
    const onRequestAccess = () => {
      emit('request-access', requestedRole.value);
    };

    return {
      t,
      password,
      requestedRole,
      loggedIn,
      currentUser,
      titleKey,
      currentPath,
      onSubmitPassword,
      onRequestAccess,
    };
  },
});
</script>
