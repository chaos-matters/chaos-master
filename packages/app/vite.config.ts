import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'

export default defineConfig({
  plugins: [solidPlugin(), solidSvg({ defaultAsComponent: true })],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  server: {
    port: 3000,
  },
  // necessary for github pages to work
  base: './',
  build: {
    target: 'esnext',
  },
})
