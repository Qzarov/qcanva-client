import { useToast } from './useToast'

const COOLDOWN_MS = 5 * 60 * 1000
const STORAGE_KEY = 'qcanva:readonly-edit-notice-at'

export function useReadOnlyNotice() {
  const { show } = useToast()

  function notifyReadOnlyEditAttempt() {
    const now = Date.now()
    const lastShown = Number(globalThis.localStorage?.getItem(STORAGE_KEY) || 0)
    if (now - lastShown < COOLDOWN_MS) return false
    globalThis.localStorage?.setItem(STORAGE_KEY, String(now))
    show('Ресурс открыт в режиме чтения. Чтобы редактировать его, запросите права на редактирование у владельца.', 'info', 6500)
    return true
  }

  return { notifyReadOnlyEditAttempt }
}
