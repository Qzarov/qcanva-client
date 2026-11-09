import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

type ReadonlyValue<T> = { readonly value: readonly T[] };

export function useDashboardFeedNavigation<TSection extends string>(options: {
  dashboardShell: Ref<HTMLElement | null>;
  feedNavSections: ReadonlyValue<TSection>;
  initialSection: TSection;
}) {
  const activeFeedSection = ref<TSection>(options.initialSection);
  let feedJumpTarget: TSection | null = null;
  let feedScroller: HTMLElement | null = null;
  let feedSpyFrame = 0;

  const scrollToFeedSection = (section: TSection) => {
    activeFeedSection.value = section;
    feedJumpTarget = section;
    document.getElementById(`feed-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updateActiveFeedSection = () => {
    feedSpyFrame = 0;
    const sections = options.feedNavSections.value;
    if (!feedScroller || !sections.length) return;
    const box = feedScroller.getBoundingClientRect();
    const barBottom = box.top;
    const atEnd = feedScroller.scrollTop + feedScroller.clientHeight >= feedScroller.scrollHeight - 2;
    if (feedJumpTarget) {
      const rect = document.getElementById(`feed-${feedJumpTarget}`)?.getBoundingClientRect();
      if (rect && rect.bottom > barBottom && rect.top < box.bottom) {
        activeFeedSection.value = feedJumpTarget;
        return;
      }
      feedJumpTarget = null;
    }
    let current: TSection = sections[0]!;
    for (const section of sections) {
      const top = document.getElementById(`feed-${section}`)?.getBoundingClientRect().top;
      if (top === undefined) continue;
      if (top <= barBottom + 24 || (atEnd && top < box.bottom)) current = section;
    }
    activeFeedSection.value = current;
  };

  const onFeedManualScroll = () => { feedJumpTarget = null; };
  const onFeedScroll = () => {
    if (!feedSpyFrame) feedSpyFrame = requestAnimationFrame(updateActiveFeedSection);
  };

  onMounted(() => {
    feedScroller = (document.querySelector('.dashboard-central-shell .app-main') as HTMLElement | null)
      ?? (document.querySelector('.app-main') as HTMLElement | null);
    feedScroller?.addEventListener('scroll', onFeedScroll, { passive: true });
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
      feedScroller?.addEventListener(type, onFeedManualScroll, { passive: true });
    }
    watch(options.feedNavSections, () => { void nextTick(updateActiveFeedSection); }, { flush: 'post' });
  });

  onBeforeUnmount(() => {
    feedScroller?.removeEventListener('scroll', onFeedScroll);
    for (const type of ['wheel', 'touchstart', 'keydown'] as const) {
      feedScroller?.removeEventListener(type, onFeedManualScroll);
    }
    if (feedSpyFrame) cancelAnimationFrame(feedSpyFrame);
  });

  return { activeFeedSection, scrollToFeedSection, onFeedManualScroll, onFeedScroll };
}
