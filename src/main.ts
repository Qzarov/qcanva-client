import { createApp } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import App from './App.vue'
import router from './router'
import './style.css'
import { applyInitialLocale } from './composables/useI18n'

applyInitialLocale()
const app = createApp(App)
app.use(router)
app.mount('#app')

// Android's system back button otherwise closes the WebView as soon as the
// browser history is exhausted. Keep navigation inside QCanva predictable:
// a resource returns to the dashboard, and only the dashboard can exit.
if (Capacitor.isNativePlatform()) {
  void router.isReady().then(() => CapacitorApp.addListener('backButton', async () => {
    if (router.currentRoute.value.name !== 'dashboard') {
      await router.replace({ name: 'dashboard' })
      return
    }

    if (window.confirm('Exit QCanva?')) {
      await CapacitorApp.exitApp()
    }
  }))
}
