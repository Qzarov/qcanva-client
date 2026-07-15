import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pro.qzarov.qcanva',
  appName: 'QCanva',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
