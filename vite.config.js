import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/case-manager/',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })),
  },
})
