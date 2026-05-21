import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: '/Monitoreo_Movil/' es necesario para que GitHub Pages funcione correctamente
export default defineConfig({
  plugins: [react()],
  base: '/Monitor-_movil/',
})
