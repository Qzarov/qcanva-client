import { createApp } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import App from './App.vue'
import router from './router'
import './style.css'
import { applyInitialLocale } from './composables/useI18n'
import { runBackHandlers } from './composables/useBackHandler'

applyInitialLocale()
const app = createApp(App)
app.use(router)
app.mount('#app')

// Android's system back button otherwise closes the WebView as soon as the
// browser history is exhausted. Keep navigation inside QCanva predictable:
// the open screen gets the first say (the dashboard steps out of a folder -
// see useBackHandler), then a resource returns to the dashboard, and only
// the dashboard's home can exit.
if (Capacitor.isNativePlatform()) {
  void router.isReady().then(() => CapacitorApp.addListener('backButton', async () => {
    if (runBackHandlers()) return

    if (router.currentRoute.value.name !== 'dashboard') {
      await router.replace({ name: 'dashboard' })
      return
    }

    if (window.confirm('Exit QCanva?')) {
      await CapacitorApp.exitApp()
    }
  }))
}
