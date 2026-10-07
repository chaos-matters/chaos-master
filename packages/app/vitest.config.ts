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
    // `vitest run --coverage` turns this on. It lives here rather than in a
    // flag string so an IDE run, `vitest --ui` and CI all measure the same set.
    // Vitest 4 reports every file matched by `include`, loaded or not, which is
    // what the old --coverage.all flag asked for.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        // Variation bodies: 'use gpu' functions compiled to WGSL. The registry
        // imports all ~380 of them, so their lines "run" on import without any
        // assertion reaching the shader. Counting them tracks shader volume, not
        // tested code. Their CPU side (registry, param editors, docs) stays in.
        'src/flame/variations/{simple,simple3D,parametric,parametric3D}/**',
      ],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage-audit',
    },
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
  define: {
    __GIT_SHA__: '"test-sha"',
    __NATIVE_BUILD__: 'false',
  },
  resolve: {
    conditions: ['development', 'browser'],
    alias: {
      '@': resolve(__dirname, './src'),
      '@chaos-master/core': resolve(__dirname, '../core/src'),
    },
  },
})
