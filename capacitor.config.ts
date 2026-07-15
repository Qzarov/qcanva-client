import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pro.qzarov.qcanva',
  appName: 'QCanva',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
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
