import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  plugins: [solidPlugin(), mkcert()],
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
