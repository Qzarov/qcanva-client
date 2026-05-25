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
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
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

export default router;
