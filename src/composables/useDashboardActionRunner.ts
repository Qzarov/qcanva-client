import { onBeforeUnmount, ref } from 'vue';

export type DashboardFeedbackState = { type: 'success' | 'error'; message: string };

export function useDashboardActionRunner() {
  const pendingAction = ref('');
  const feedback = ref<DashboardFeedbackState>({ type: 'success', message: '' });
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  const setFeedback = (type: DashboardFeedbackState['type'], message: string) => {
    feedback.value = { type, message };
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedback.value.message = '';
    }, 2800);
  };

  const runAction = async <T>(action: string, task: () => Promise<T>, successMessage?: string) => {
    pendingAction.value = action;
    try {
      const result = await task();
      if (successMessage) setFeedback('success', successMessage);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      setFeedback('error', message);
      throw error;
    } finally {
      pendingAction.value = '';
    }
  };

  onBeforeUnmount(() => {
    if (feedbackTimer) clearTimeout(feedbackTimer);
  });

  return { pendingAction, feedback, setFeedback, runAction };
}
