import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pro.qzarov.qcanva',
  appName: 'QCanva',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // Stand builds (VITE_ALLOW_HUB_OVERRIDE=1 at `cap sync`) may point the app
    // at an http hub in the local network. API calls go through CapacitorHttp,
    // but images and websockets load in the https://localhost WebView and are
    // mixed content, which Android blocks by default. Release syncs without
    // the flag and keeps the default.
    allowMixedContent: process.env.VITE_ALLOW_HUB_OVERRIDE === '1',
  },
  plugins: {
    // Use Android's HTTP stack for the existing fetch-based API client. This
    // avoids WebView network/CORS failures while keeping browser behavior unchanged.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
