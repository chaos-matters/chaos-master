import { dirname, resolve } from 'path'
import typegpuPlugin from 'unplugin-typegpu/vite'
import { fileURLToPath } from 'url'
import solidPlugin from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  // typegpuPlugin transforms tgpu.fn / 'use gpu' bodies so they carry the
  // metadata needed for WGSL resolution — without it, resolution-based tests
  // fail with "Missing metadata for tgpu.fn function body".
  plugins: [solidPlugin({ hot: false }), typegpuPlugin({})],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/vitest.setup.ts'],
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
  define: {
    __GIT_SHA__: '"test-sha"',
  },
  resolve: {
    conditions: ['development', 'browser'],
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
