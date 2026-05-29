import ssl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'node:child_process'
import devtools from 'solid-devtools/vite'
import typegpuPlugin from 'unplugin-typegpu/vite'
import { defineConfig } from 'vite'
import bundleAnalyzer from 'vite-bundle-analyzer'
import { qrcode } from 'vite-plugin-qrcode'
import solidPlugin from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'

const resolveCommitHash = (): string => {
  // Deno Deploy and GitHub Actions expose this automatically.

  const fromEnv: string | undefined = process.env.GITHUB_SHA
  if (fromEnv !== undefined) {
    return fromEnv.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return process.env.VITE_GIT_SHA ?? 'dev'
  }
}

const commitHash = resolveCommitHash()

const ANALYZE_BUNDLE = Boolean(process.env.VITE_ANALYZE_BUNDLE)

export default defineConfig({
  plugins: [
    solidPlugin(),
    solidSvg({ defaultAsComponent: true }),
    typegpuPlugin({}),
    devtools(),
    ssl(),
    qrcode(),
    ANALYZE_BUNDLE ? bundleAnalyzer() : undefined,
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    __GIT_SHA__: JSON.stringify(commitHash),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // necessary for github pages to work
  base: './',
  build: {
    target: 'esnext',
    sourcemap: true,
  },
})
