import { createRouter, createWebHistory } from 'vue-router';
import { getCurrentUser, isAuthenticated } from '../api/client';
import { tabsEnabled } from '../tabs/flag';
import { ensureTabsFor, showTab } from '../tabs/registry';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
    },
    {
      path: '/',
      name: 'landing',
      component: () => import('../views/LandingView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/drive',
      name: 'drive',
      component: () => import('../views/DriveView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/drive/trash',
      name: 'drive-trash',
      component: () => import('../views/DriveTrashView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/drive/:folderId',
      name: 'drive-folder',
      component: () => import('../views/DriveView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/html-docs',
      name: 'html-docs',
      redirect: { name: 'dashboard', query: { type: 'html' } },
      meta: { requiresAuth: true },
    },
    {
      path: '/edit/html/:id',
      name: 'html-document',
      component: () => import('../views/HtmlDocumentView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresAuth: true },
    },
    // Old addresses, kept working: the MCP guide and the back's login-token
    // notice link to /mcp.
    { path: '/html-settings', redirect: { name: 'settings', query: { section: 'html' } } },
    {
      path: '/docs/:id',
      name: 'text-document',
      component: () => import('../views/TextDocumentView.vue'),
    },
    {
      path: '/templates/:id',
      name: 'interactive-template',
      component: () => import('../views/BoardTemplateView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/mcp', redirect: { name: 'settings', query: { section: 'mcp' } } },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/plugins',
      name: 'plugins',
      component: () => import('../views/PluginsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/canvas/:id',
      name: 'canvas',
      component: () => import('../views/CanvasView.vue'),
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
});

// A baseline reset on every navigation. Dashboard/document/canvas views set
// their own reactive title once mounted (useDocumentTitle); every other
// route (login, admin, ...) has none of its own, and without this reset it
// would otherwise keep showing whatever the PREVIOUS page's tab title was.
router.afterEach((to) => {
  document.title = 'QCanva';
  if (!tabsEnabled()) return;
  // Tab mode: the list of open tabs is per user and survives a restart; a
  // sign-in as someone else switches to their list.
  ensureTabsFor(getCurrentUser()?.id ?? null);
  showTab(to);
});

export default router;
