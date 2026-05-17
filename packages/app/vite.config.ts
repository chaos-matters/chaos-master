import ssl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'child_process'
import typegpuPlugin from 'unplugin-typegpu/vite'
import { defineConfig } from 'vite'
import bundleAnalyzer from 'vite-bundle-analyzer'
import solidPlugin from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'

const resolveCommitHash = (): string => {
  // Deno Deploy and GitHub Actions expose this automatically.
  // @ts-expect-error TS doesn't know about `process`
  const fromEnv: string | undefined = process.env.GITHUB_SHA
  if (fromEnv !== undefined) {
    return fromEnv.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

const commitHash = resolveCommitHash()

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
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
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
