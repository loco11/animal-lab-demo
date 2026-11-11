import { defineConfig } from 'vite'

// 静态部署优先：相对路径 + hash 路由，dist 可直接挂任意 Web 服务器或对象存储
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 4 * 1024 * 1024,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
