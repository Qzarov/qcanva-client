import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated } from '../api/client';

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
      path: '/html-settings',
      name: 'html-settings',
      component: () => import('../views/HtmlSettingsView.vue'),
      meta: { requiresAuth: true },
    },
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
router.afterEach(() => {
  document.title = 'QCanva';
});

export default router;
