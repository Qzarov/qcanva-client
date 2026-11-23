<template>
  <div class="downloads-page" data-downloads-view>
    <header class="downloads-topbar">
      <router-link
        :to="isLoggedIn ? { name: 'dashboard' } : { name: 'landing' }"
        class="btn-ghost downloads-back"
        :aria-label="t('back')"
        :title="t('back')"
        data-downloads-back
      >
        <ArrowLeft :size="18" aria-hidden="true" />
      </router-link>
      <div class="downloads-topbar-brand">
        <img src="/qcanva-logo.png" alt="QCanva" class="downloads-logo" />
        <h1>{{ t('downloadsPageTitle') }}</h1>
      </div>
      <div class="downloads-topbar-actions">
        <LanguageToggle />
        <AccountMenu v-if="isLoggedIn" glass :show-plugins="false" />
        <template v-else>
          <ThemeMenu />
          <router-link to="/login" class="btn-primary downloads-login-link" data-downloads-login>
            {{ t('login') }}
          </router-link>
        </template>
      </div>
    </header>

    <main class="downloads-main">
      <UiCard as="section" class="downloads-hero" data-downloads-hero>
        <div class="downloads-hero-copy">
          <span class="downloads-kicker">{{ t('downloadsHeroKicker') }}</span>
          <h2>{{ t('downloadsHeroTitle') }}</h2>
          <p>{{ t('downloadsHeroSubtitle') }}</p>
        </div>
        <div class="downloads-pillars">
          <div class="downloads-pillar">
            <span class="downloads-pillar-icon" aria-hidden="true"><FolderSync :size="18" /></span>
            <div>
              <strong>{{ t('downloadsPillarSyncTitle') }}</strong>
              <p>{{ t('downloadsPillarSyncDesc') }}</p>
            </div>
          </div>
          <div class="downloads-pillar">
            <span class="downloads-pillar-icon" aria-hidden="true"><HardDrive :size="18" /></span>
            <div>
              <strong>{{ t('downloadsPillarKeeperTitle') }}</strong>
              <p>{{ t('downloadsPillarKeeperDesc') }}</p>
            </div>
          </div>
          <div class="downloads-pillar">
            <span class="downloads-pillar-icon" aria-hidden="true"><Smartphone :size="18" /></span>
            <div>
              <strong>{{ t('downloadsPillarMobileTitle') }}</strong>
              <p>{{ t('downloadsPillarMobileDesc') }}</p>
            </div>
          </div>
        </div>
      </UiCard>

      <section class="downloads-grid" :aria-label="t('downloadsPageTitle')">
        <!-- Linux (featured full-width card) -->
        <UiCard as="article" class="downloads-card downloads-card--linux" data-platform-card="linux">
          <header class="downloads-card-head">
            <div class="downloads-card-title-group">
              <span class="downloads-platform-icon downloads-platform-icon--linux" aria-hidden="true">
                <Terminal :size="20" />
              </span>
              <div>
                <h3>{{ t('downloadsLinuxTitle') }}</h3>
                <p class="downloads-card-subtitle">{{ t('downloadsLinuxSubtitle') }}</p>
              </div>
            </div>
            <div class="downloads-card-badges">
              <UiBadge v-if="manifestState === 'loading'" variant="neutral" role="status" data-linux-status>
                {{ t('downloadsLinuxLoading') }}
              </UiBadge>
              <UiBadge
                v-else-if="manifestState === 'ok' && manifest"
                variant="success"
                role="status"
                data-linux-status
              >
                {{ t('downloadsLinuxVersion').replace('{version}', manifest.version) }}
              </UiBadge>
              <UiBadge
                v-else-if="manifestState === 'unavailable'"
                variant="warning"
                role="status"
                data-linux-status
              >
                {{ t('downloadsLinuxUnavailable') }}
              </UiBadge>
              <UiBadge v-else variant="danger" role="status" data-linux-status>
                {{ t('downloadsLinuxOffline') }}
              </UiBadge>
              <button
                v-if="manifestState === 'error'"
                type="button"
                class="btn-ghost btn-sm downloads-retry-btn"
                data-linux-retry
                @click="loadManifest"
              >
                <RefreshCw :size="14" aria-hidden="true" />
                <span>{{ t('downloadsRetry') }}</span>
              </button>
            </div>
          </header>

          <div class="downloads-linux-body">
            <div class="downloads-linux-primary">
              <div class="downloads-block">
                <span class="downloads-field-label">{{ t('downloadsLinuxInstallLabel') }}</span>
                <div class="downloads-command-row">
                  <code class="downloads-command" data-linux-install-cmd>{{ installCommand }}</code>
                  <button
                    type="button"
                    class="btn-primary downloads-copy-btn"
                    data-copy-install
                    @click="copyText(installCommand, 'install')"
                  >
                    <Check v-if="copiedKey === 'install'" :size="15" aria-hidden="true" />
                    <Copy v-else :size="15" aria-hidden="true" />
                    <span>{{ copiedKey === 'install' ? t('downloadsCopied') : t('downloadsCopy') }}</span>
                  </button>
                </div>
                <p class="downloads-hint">{{ t('downloadsLinuxInstallHint') }}</p>
              </div>

              <div class="downloads-block">
                <span class="downloads-field-label">{{ t('downloadsLinuxBuildsLabel') }}</span>
                <ul v-if="linuxBuilds.length" class="downloads-builds-list" data-linux-builds>
                  <li v-for="build in linuxBuilds" :key="build.name" class="downloads-build-row" :data-build-arch="build.arch">
                    <div class="downloads-build-meta">
                      <div class="downloads-build-name-row">
                        <span class="downloads-arch-pill">{{ formatArchLabel(build.arch) }}</span>
                        <code class="downloads-build-filename">{{ build.name }}</code>
                        <span class="downloads-build-size">{{ formatBytes(build.size) }}</span>
                      </div>
                      <button
                        type="button"
                        class="downloads-sha-btn"
                        :title="t('downloadsLinuxCopySha')"
                        :data-copy-sha="build.arch"
                        @click="copyText(build.sha256, `sha:${build.name}`)"
                      >
                        <span>SHA-256: {{ shortSha(build.sha256) }}</span>
                        <Check v-if="copiedKey === `sha:${build.name}`" :size="12" aria-hidden="true" />
                        <Copy v-else :size="12" aria-hidden="true" />
                      </button>
                    </div>
                    <a
                      :href="agentBinaryUrl(build.name, hubBase)"
                      :download="build.name"
                      class="btn-ghost downloads-download-link"
                      :data-download-arch="build.arch"
                    >
                      <Download :size="15" aria-hidden="true" />
                      <span>{{ t('downloadsLinuxDownloadBtn') }}</span>
                    </a>
                  </li>
                </ul>
                <p v-else-if="manifestState !== 'loading'" class="downloads-fallback-note" data-linux-fallback>
                  {{ t('downloadsLinuxNoBuildsNote') }}
                </p>
              </div>
            </div>

            <aside class="downloads-steps-panel">
              <h4>{{ t('downloadsLinuxStepsTitle') }}</h4>
              <ol class="downloads-steps-list">
                <li>
                  <span class="downloads-step-num">1</span>
                  <p>{{ t('downloadsLinuxStep1') }}</p>
                </li>
                <li>
                  <span class="downloads-step-num">2</span>
                  <p>{{ t('downloadsLinuxStep2') }}</p>
                </li>
                <li>
                  <span class="downloads-step-num">3</span>
                  <p>{{ t('downloadsLinuxStep3') }}</p>
                </li>
              </ol>
              <router-link
                v-if="isLoggedIn"
                :to="{ name: 'settings', query: { section: 'devices' } }"
                class="btn-ghost downloads-qcontrol-link"
                data-downloads-qcontrol
              >
                <span>{{ t('downloadsOpenQControl') }}</span>
                <ExternalLink :size="14" aria-hidden="true" />
              </router-link>
            </aside>
          </div>
        </UiCard>

        <!-- Android -->
        <UiCard as="article" class="downloads-card" data-platform-card="android">
          <header class="downloads-card-head">
            <div class="downloads-card-title-group">
              <span class="downloads-platform-icon downloads-platform-icon--android" aria-hidden="true">
                <Smartphone :size="20" />
              </span>
              <div>
                <h3>{{ t('downloadsAndroidTitle') }}</h3>
                <p class="downloads-card-subtitle">{{ t('downloadsAndroidSubtitle') }}</p>
              </div>
            </div>
            <UiBadge :variant="androidApkUrl ? 'success' : 'neutral'" data-android-badge>
              {{ androidApkUrl ? t('downloadsAndroidDirectBadge') : t('downloadsAndroidReleasesBadge') }}
            </UiBadge>
          </header>

          <p class="downloads-card-desc">{{ t('downloadsAndroidDesc') }}</p>

          <div v-if="androidApkUrl" class="downloads-card-action">
            <a
              :href="androidApkUrl"
              download
              class="btn-primary downloads-platform-cta"
              data-android-download
            >
              <Download :size="16" aria-hidden="true" />
              <span>{{ t('downloadsAndroidDownloadApk') }}</span>
            </a>
          </div>
          <div v-else class="downloads-card-status-box" data-android-releases-fallback>
            <p class="downloads-fallback-note">{{ t('downloadsAndroidReleasesNote') }}</p>
            <a
              :href="androidReleasesUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-ghost downloads-platform-cta"
              data-android-releases-link
            >
              <span>{{ t('downloadsAndroidOpenReleases') }}</span>
              <ExternalLink :size="15" aria-hidden="true" />
            </a>
          </div>

          <div class="downloads-mini-steps">
            <h4>{{ t('downloadsAndroidStepsTitle') }}</h4>
            <ul>
              <li>{{ t('downloadsAndroidStep1') }}</li>
              <li>{{ t('downloadsAndroidStep2') }}</li>
            </ul>
          </div>
        </UiCard>

        <!-- Windows -->
        <UiCard as="article" class="downloads-card downloads-card--upcoming" data-platform-card="windows">
          <header class="downloads-card-head">
            <div class="downloads-card-title-group">
              <span class="downloads-platform-icon" aria-hidden="true">
                <Monitor :size="20" />
              </span>
              <div>
                <h3>{{ t('downloadsWindowsTitle') }}</h3>
                <p class="downloads-card-subtitle">{{ t('downloadsWindowsSubtitle') }}</p>
              </div>
            </div>
            <UiBadge variant="accent" data-windows-badge>{{ t('downloadsComingSoon') }}</UiBadge>
          </header>

          <p class="downloads-card-desc">{{ t('downloadsWindowsDesc') }}</p>
          <p class="downloads-upcoming-note">{{ t('downloadsDesktopInProgress') }}</p>
        </UiCard>

        <!-- macOS -->
        <UiCard as="article" class="downloads-card downloads-card--upcoming" data-platform-card="macos">
          <header class="downloads-card-head">
            <div class="downloads-card-title-group">
              <span class="downloads-platform-icon" aria-hidden="true">
                <Laptop :size="20" />
              </span>
              <div>
                <h3>{{ t('downloadsMacosTitle') }}</h3>
                <p class="downloads-card-subtitle">{{ t('downloadsMacosSubtitle') }}</p>
              </div>
            </div>
            <UiBadge variant="accent" data-macos-badge>{{ t('downloadsComingSoon') }}</UiBadge>
          </header>

          <p class="downloads-card-desc">{{ t('downloadsMacosDesc') }}</p>
          <p class="downloads-upcoming-note">{{ t('downloadsDesktopInProgress') }}</p>
        </UiCard>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderSync,
  HardDrive,
  Laptop,
  Monitor,
  RefreshCw,
  Smartphone,
  Terminal,
} from '@lucide/vue';
import { isAuthenticated } from '../api/client';
import {
  agentBinaryUrl,
  agentInstallCommand,
  fetchAgentManifest,
  getAndroidApkUrl,
  resolveHubBase,
  type AgentBuild,
  type AgentManifest,
} from '../api/downloads';
import { SOURCE_CODE_URL } from '../app-info';
import AccountMenu from '../components/AccountMenu.vue';
import LanguageToggle from '../components/LanguageToggle.vue';
import ThemeMenu from '../components/ThemeMenu.vue';
import UiBadge from '../components/ui/UiBadge.vue';
import UiCard from '../components/ui/UiCard.vue';
import { useDocumentTitle } from '../composables/useDocumentTitle';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { formatBytes } from '../utils/deviceStatus';

const { t } = useI18n();
const toast = useToast();
useDocumentTitle(computed(() => t('downloadsPageTitle')));

const isLoggedIn = computed(() => isAuthenticated());
const hubBase = resolveHubBase();
const installCommand = agentInstallCommand(hubBase);
const androidApkUrl = getAndroidApkUrl();
const androidReleasesUrl = `${SOURCE_CODE_URL}/releases`;

const manifestState = ref<'loading' | 'ok' | 'unavailable' | 'error'>('loading');
const manifest = ref<AgentManifest | null>(null);
const copiedKey = ref<string | null>(null);

let activeController: AbortController | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const ARCH_ORDER: Record<string, number> = { x86_64: 0, aarch64: 1 };

const linuxBuilds = computed<AgentBuild[]>(() => {
  const files = manifest.value?.files ?? [];
  return files
    .filter((f) => f.os === 'linux')
    .slice()
    .sort((a, b) => (ARCH_ORDER[a.arch] ?? 99) - (ARCH_ORDER[b.arch] ?? 99));
});

function formatArchLabel(arch: string): string {
  if (arch === 'x86_64') return 'x86_64 (amd64)';
  if (arch === 'aarch64') return 'aarch64 (arm64)';
  return arch;
}

function shortSha(sha256: string): string {
  if (sha256.length <= 16) return sha256;
  return `${sha256.slice(0, 8)}…${sha256.slice(-8)}`;
}

async function copyText(text: string, key: string) {
  try {
    await navigator.clipboard?.writeText(text);
    copiedKey.value = key;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 1800);
    toast.show(t('downloadsCopied'), 'success', 2000);
  } catch {
    // Clipboard access can be denied in restricted contexts; the text stays selectable.
  }
}

async function loadManifest() {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  manifestState.value = 'loading';
  try {
    const result = await fetchAgentManifest({ signal: controller.signal, hubBase });
    if (controller.signal.aborted) return;
    if (result.status === 'ok') {
      manifest.value = result.manifest;
      manifestState.value = 'ok';
    } else if (result.status === 'unavailable') {
      manifest.value = null;
      manifestState.value = 'unavailable';
    } else {
      manifest.value = null;
      manifestState.value = 'error';
    }
  } catch {
    if (!controller.signal.aborted) {
      manifest.value = null;
      manifestState.value = 'error';
    }
  }
}

onMounted(() => {
  void loadManifest();
});

onBeforeUnmount(() => {
  activeController?.abort();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped>
.downloads-page {
  height: 100vh;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--ui-glass-ambient), var(--ui-page);
  background-attachment: fixed;
  color: var(--ui-text);
}

.downloads-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px max(16px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--ui-glass-border);
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: inset 0 -1px 0 var(--ui-glass-highlight);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
}

.downloads-back {
  width: 38px;
  height: 38px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
  border: 1px solid var(--ui-glass-border);
  box-shadow: var(--ui-glass-inset-highlight);
  color: var(--ui-text);
  text-decoration: none;
}

.downloads-back:hover {
  background: var(--ui-glass-btn-hover);
}

.downloads-topbar-brand {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.downloads-logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.downloads-topbar h1 {
  margin: 0;
  font-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloads-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.downloads-login-link {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 14px;
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.downloads-main {
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 24px 16px 56px;
  display: grid;
  gap: 20px;
}

.downloads-hero {
  gap: 20px;
  padding: 26px 28px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-brand) 10%, transparent), transparent 60%),
    var(--ui-glass-tint),
    var(--ui-glass-card-bg);
}

.downloads-hero-copy {
  display: grid;
  gap: 10px;
}

.downloads-kicker {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.downloads-hero h2 {
  margin: 0;
  font-size: clamp(24px, 3.2vw, 34px);
  letter-spacing: -0.03em;
  line-height: 1.12;
}

.downloads-hero-copy p {
  margin: 0;
  max-width: 720px;
  color: var(--ui-text-secondary);
  font-size: 15px;
  line-height: 1.55;
}

.downloads-pillars {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.downloads-pillar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-subtle);
}

.downloads-pillar-icon {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--ui-brand-soft);
  color: var(--ui-accent-strong);
}

.downloads-pillar strong {
  display: block;
  font-size: 13px;
  margin-bottom: 2px;
}

.downloads-pillar p {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-secondary);
  line-height: 1.45;
}

.downloads-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.downloads-card--linux {
  grid-column: 1 / -1;
}

.downloads-card {
  align-content: start;
  gap: 16px;
}

.downloads-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.downloads-card-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.downloads-platform-icon {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
}

.downloads-platform-icon--linux,
.downloads-platform-icon--android {
  border-color: var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
}

.downloads-card-title-group h3 {
  margin: 0;
  font-size: 17px;
}

.downloads-card-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ui-text-secondary);
}

.downloads-card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.downloads-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.downloads-linux-body {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.downloads-linux-primary {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.downloads-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.downloads-field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-secondary);
}

.downloads-command-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}

.downloads-command {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--ui-border);
  background: var(--ui-canvas);
  color: var(--ui-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  user-select: all;
}

.downloads-copy-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
}

.downloads-hint,
.downloads-fallback-note,
.downloads-card-desc,
.downloads-upcoming-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-text-secondary);
}

.downloads-builds-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.downloads-build-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-subtle);
}

.downloads-build-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.downloads-build-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.downloads-arch-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ui-brand-soft);
  color: var(--ui-accent-strong);
  font-size: 11px;
  font-weight: 700;
}

.downloads-build-filename {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--ui-text);
  overflow-wrap: anywhere;
}

.downloads-build-size {
  font-size: 12px;
  color: var(--ui-text-muted);
}

.downloads-sha-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  cursor: pointer;
}

.downloads-sha-btn:hover {
  color: var(--ui-text);
}

.downloads-download-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  text-decoration: none;
}

.downloads-steps-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-subtle);
}

.downloads-steps-panel h4,
.downloads-mini-steps h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.downloads-steps-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.downloads-steps-list li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.downloads-step-num {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-glass-accent-bg);
  border: 1px solid var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
  font-size: 12px;
  font-weight: 700;
}

.downloads-steps-list p {
  margin: 1px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ui-text-secondary);
}

.downloads-qcontrol-link,
.downloads-platform-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 14px;
  text-decoration: none;
  border-radius: 12px;
}

.downloads-card-status-box {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-subtle);
}

.downloads-mini-steps {
  display: grid;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--ui-border);
}

.downloads-mini-steps ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ui-text-secondary);
}

.downloads-card--upcoming {
  opacity: 0.94;
}

.downloads-upcoming-note {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed var(--ui-border);
  background: var(--ui-surface-subtle);
  font-size: 12.5px;
}

@media (max-width: 920px) {
  .downloads-pillars {
    grid-template-columns: 1fr;
  }

  .downloads-linux-body {
    grid-template-columns: 1fr;
  }

  .downloads-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .downloads-main {
    padding: 16px 12px 44px;
    gap: 14px;
  }

  .downloads-hero {
    padding: 18px 16px;
  }

  .downloads-grid {
    grid-template-columns: 1fr;
  }

  .downloads-command-row {
    flex-direction: column;
  }

  .downloads-build-row {
    flex-direction: column;
    align-items: stretch;
  }

  .downloads-download-link {
    justify-content: center;
  }
}
</style>
