import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE_URL=/Monitor-_movil/ → para GitHub Pages
// VITE_BASE_URL no definida (o ./)  → para APK con Capacitor
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_URL ?? './',
})
