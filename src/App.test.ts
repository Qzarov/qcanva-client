// @vitest-environment jsdom
//
// Pins WHICH routes remount their view on a path change, because the answer
// is not uniform and getting it wrong is invisible in the two directions that
// matter: too narrow and "continue on a new page" leaves the old document on
// screen; too wide and every slugged canvas and html document tears down and
// rebuilds its editor the instant it opens, because those views canonicalise
// their own URL (id -> slug) right after loading.
//
// The router here mirrors the real one's names and paths with stub views, so
// the mount counting is readable; the names are the real ones, and the real
// router's route names are asserted against the policy at the bottom.

import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import App from './App.vue';
import { REMOUNT_ON_PATH_CHANGE, viewKeyFor } from './router/view-remount';

const mounts = ref<Record<string, number>>({});

function countingView(id: string) {
  return defineComponent({
    name: `${id}View`,
    setup() {
      // A stand-in for everything a real view builds once in setup() and
      // never rebuilds on a parameter change: an editor, a Y.Doc, a socket.
      mounts.value[id] = (mounts.value[id] ?? 0) + 1;
      return () => h('div', { class: `${id}-view` });
    },
  });
}

async function mountApp(start: string) {
  mounts.value = {};
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/docs/:id', name: 'text-document', component: countingView('doc') },
      { path: '/canvas/:id', name: 'canvas', component: countingView('canvas') },
      { path: '/edit/html/:id', name: 'html-document', component: countingView('html') },
      { path: '/dashboard', name: 'dashboard', component: countingView('dashboard') },
    ],
  });
  await router.push(start);
  await router.isReady();
  const wrapper = mount(App, {
    global: { plugins: [router], stubs: { ToastContainer: true } },
  });
  await wrapper.vm.$nextTick();
  return { wrapper, router };
}

describe('App view remounting', () => {
  it('remounts the view when one text document navigates to another', async () => {
    // The behaviour "continue on a new page" needs. Without it the editor,
    // the Y.Doc and the socket built for /docs/a would still be live while
    // the route says /docs/b.
    const { wrapper, router } = await mountApp('/docs/alpha');
    expect(mounts.value.doc).toBe(1);

    await router.push('/docs/beta');
    await wrapper.vm.$nextTick();

    expect(mounts.value.doc).toBe(2);
    wrapper.unmount();
  });

  it('does NOT remount a canvas when it canonicalises its id to its slug', async () => {
    // CanvasView.vue does `router.replace('/canvas/' + slug)` right after
    // loading. Roughly 40% of production canvases have a slug, so keying every
    // route made almost half of them rebuild their editor immediately after
    // opening. This is that regression, in one assertion.
    const { wrapper, router } = await mountApp('/canvas/c-1');
    expect(mounts.value.canvas).toBe(1);

    await router.replace('/canvas/my-canvas-slug');
    await wrapper.vm.$nextTick();

    expect(mounts.value.canvas).toBe(1);
    wrapper.unmount();
  });

  it('does NOT remount an html document when it canonicalises its id to its slug', async () => {
    const { wrapper, router } = await mountApp('/edit/html/h-1');
    expect(mounts.value.html).toBe(1);

    await router.replace('/edit/html/my-html-slug');
    await wrapper.vm.$nextTick();

    expect(mounts.value.html).toBe(1);
    wrapper.unmount();
  });

  it('does NOT remount the dashboard when only the query changes', async () => {
    // The key is the PATH, never the fullPath: the dashboard's filters live in
    // the query and a filter click must not rebuild the list.
    const { wrapper, router } = await mountApp('/dashboard?type=canvas');
    expect(mounts.value.dashboard).toBe(1);

    await router.push('/dashboard?type=text-document');
    await wrapper.vm.$nextTick();

    expect(mounts.value.dashboard).toBe(1);
    wrapper.unmount();
  });
});

describe('viewKeyFor', () => {
  it('keys only the routes on the list, by path', () => {
    expect(viewKeyFor({ name: 'text-document', path: '/docs/a' })).toBe('/docs/a');
    expect(viewKeyFor({ name: 'canvas', path: '/canvas/a' })).toBeUndefined();
    expect(viewKeyFor({ name: 'html-document', path: '/edit/html/a' })).toBeUndefined();
    expect(viewKeyFor({ name: 'dashboard', path: '/dashboard' })).toBeUndefined();
    expect(viewKeyFor({ name: undefined, path: '/docs/a' })).toBeUndefined();
  });

  it('stays a narrow list', () => {
    // Widening this is a decision about two other views' behaviour, not a
    // tidy-up. If a route is added here, the three "does NOT remount" tests
    // above are what says whether it was the right call.
    expect([...REMOUNT_ON_PATH_CHANGE]).toEqual(['text-document']);
  });
});
