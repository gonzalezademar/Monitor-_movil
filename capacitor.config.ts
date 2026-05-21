import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.radarfamiliar.app',
  appName: 'Radar Familiar',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
