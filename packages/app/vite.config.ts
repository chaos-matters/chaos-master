import ssl from '@vitejs/plugin-basic-ssl'
import typegpuPlugin from 'unplugin-typegpu/vite'
import { defineConfig } from 'vite'
import bundleAnalyzer from 'vite-bundle-analyzer'
import solidPlugin from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'

// @ts-expect-error TS doesn't know about `process`
const ANALYZE_BUNDLE = Boolean(process.env.VITE_ANALYZE_BUNDLE)

export default defineConfig({
  plugins: [
    solidPlugin(),
    solidSvg({ defaultAsComponent: true }),
    typegpuPlugin({}),
    ssl(),
    ANALYZE_BUNDLE ? bundleAnalyzer() : undefined,
  ],
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
    sourcemap: true,
  },
})
