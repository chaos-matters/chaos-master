import { dirname, resolve } from 'path'
import typegpuPlugin from 'unplugin-typegpu/vite'
import { fileURLToPath } from 'url'
import solidPlugin from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  // typegpuPlugin transforms tgpu.fn / 'use gpu' bodies so they carry the
  // metadata needed for WGSL resolution — without it, resolution-based tests
  // fail with "Missing metadata for tgpu.fn function body".
  // solidSvg mirrors vite.config: `import X from './x.svg'` becomes a Solid
  // component (defaultAsComponent). Without it, rendering any icon in a test
  // throws "Comp is not a function" — surfaces once the degraded WebGPU shell
  // renders SoftwareVersion (and its SVG icons) in App.integration.test.
  plugins: [
    solidPlugin({ hot: false }),
    solidSvg({ defaultAsComponent: true }),
    typegpuPlugin({}),
  ],
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
