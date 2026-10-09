/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento (`npm run dev`) o Vite repassa /api para o backend,
// reproduzindo o proxy do nginx usado no Docker (mesma origem, sem CORS).
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Datas e horas mostradas no fuso do browser: os testes fixam o de Brasília,
    // para darem o mesmo resultado em qualquer máquina (CI em UTC).
    env: { TZ: 'America/Sao_Paulo' },
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
    unstubGlobals: true,
  },
});
