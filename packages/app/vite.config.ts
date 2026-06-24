import ssl from '@vitejs/plugin-basic-ssl'
import { execSync } from 'node:child_process'
import devtools from 'solid-devtools/vite'
import typegpuPlugin from 'unplugin-typegpu/vite'
import { defineConfig } from 'vite'
import bundleAnalyzer from 'vite-bundle-analyzer'
import { qrcode } from 'vite-plugin-qrcode'
import solidPlugin from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'
import type { ProxyOptions } from 'vite'

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

// Solid Devtools is opt-in — it instruments every component (a real dev-startup
// cost). Off by default for fast loads; enable with `VITE_DEVTOOLS=1 pnpm dev`.
const ENABLE_DEVTOOLS = Boolean(process.env.VITE_DEVTOOLS)

// Proxies Worker routes to local `wrangler dev`. On a proxy error (typically the
// Worker not running) it answers 502 immediately so the browser fails fast,
// instead of hanging until the client-side request timeout.
const workerProxy: ProxyOptions = {
  target: 'http://localhost:8787',
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('error', (_err, req, res) => {
      // Respond 502 AND force the connection closed. Without the close, a large
      // half-sent upload (Chrome sends `Expect: 100-continue` for multi-MB
      // bodies like the Discord share image) keeps the keep-alive socket waiting
      // and the browser stalls until its own request timeout. Closing makes the
      // app surface the failure (→ manual fallback) immediately.
      if (res && 'writeHead' in res && !res.headersSent) {
        res.writeHead(502, {
          'Content-Type': 'application/json',
          Connection: 'close',
        })
        res.end('{"error":"worker not running — run pnpm wr-dev"}')
      }
      req.socket?.destroy()
    })
  },
}

export default defineConfig({
  plugins: [
    solidPlugin(),
    solidSvg({ defaultAsComponent: true }),
    typegpuPlugin({}),
    ENABLE_DEVTOOLS ? devtools() : undefined,
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
    // Pre-transform the heaviest eagerly-imported modules during server boot so
    // the first page load isn't stuck transforming the ~400-module variation
    // catalogue on the critical path (the dev-only white screen). Doesn't reduce
    // total work — overlaps it with startup so the first navigation hits cache.
    warmup: {
      clientFiles: [
        './src/MainWorkspace.tsx',
        './src/flame/variations/index.ts',
      ],
    },
    // Proxy Worker routes to `pnpm wr-dev` (wrangler on :8787) so the API and
    // the /discord redirect work from the vite dev server. Both run side by side.
    proxy: {
      '/api': workerProxy,
      '/discord': workerProxy,
    },
  },
  // necessary for github pages to work
  base: './',
  build: {
    target: 'esnext',
    sourcemap: true,
  },
})
