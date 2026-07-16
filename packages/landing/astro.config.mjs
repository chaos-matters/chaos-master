import solid from '@astrojs/solid-js'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import typegpu from 'unplugin-typegpu/vite'
import { qrcode } from 'vite-plugin-qrcode'

// Dev-only: receive console logs POSTed by devices (phones/tablets that have no
// usable console) and print them in THIS terminal. Pairs with the client-side
// console interceptor in Base.astro, gated by PUBLIC_REMOTE_LOG. Serve-only, so
// it never ships to production.
function remoteLogPlugin() {
  const colors = {
    error: '\x1b[31m',
    warn: '\x1b[33m',
    info: '\x1b[36m',
    log: '\x1b[90m',
  }
  return {
    name: 'landing-remote-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__client-log', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            const { level, args } = JSON.parse(body)
            const color = colors[level] ?? ''
            console.log(
              `${color}[device:${level}]\x1b[0m`,
              ...(Array.isArray(args) ? args : [args]),
            )
          } catch {
            // ignore malformed payloads
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

// The live GPU flame islands import the real renderer out of `packages/app`
// (Root / AutoCanvas / Camera2D / Flam3). Those modules use the app's own `@/`
// alias and are transformed at build time by `unplugin-typegpu` + the Solid
// compiler — so we mirror that here. The `@` alias only matches `@/…` (not
// `@typegpu/*` / `@astrojs/*`), so it's safe to point at the app's src.
const appSrc = fileURLToPath(new URL('../app/src', import.meta.url))
const stub = (p) =>
  fileURLToPath(new URL(`./src/flame/stubs/${p}`, import.meta.url))

// Static marketing site. Output goes to `dist/` (matches the repo .gitignore and
// the Cloudflare static-assets deploy in wrangler.jsonc). The app itself lives in
// packages/app and is deployed separately to the root domain.
export default defineConfig({
  site: 'https://about.lumenapeiron.com',
  output: 'static',
  build: {
    format: 'directory',
  },
  // Expose the dev server on the LAN so phones/tablets can reach it; the qrcode
  // Vite plugin then prints a scannable QR of the Network URL on `pnpm start`
  // (same setup as the chaos-master app).
  server: {
    host: true,
  },
  integrations: [solid()],
  vite: {
    // basicSsl serves the dev server over HTTPS. WebGPU is a secure-context API:
    // `localhost` is trusted, but a phone hitting the dev server at
    // http://192.168.x.x is NOT a secure context, so navigator.gpu is hidden and
    // every flame falls back to its poster. HTTPS (self-signed — accept the cert
    // warning once on the device) fixes it. Same approach as the chaos-master app.
    plugins: [basicSsl(), typegpu({}), qrcode(), remoteLogPlugin()],
    resolve: {
      // Array form so the specific stub entries win over the general `@` prefix
      // (first match wins). `@` only matches `@/…`, never `@typegpu/*` etc.
      alias: [
        // Mock editor-only modules the live render path doesn't need — keeps the
        // @/icons barrel, ConsoleLog and version banner out of the bundle, and
        // lets the hero poster show as the non-WebGPU fallback.
        {
          find: '@/components/ErrorHandling/ErrorHandling',
          replacement: stub('ErrorHandling.tsx'),
        },
        { find: '@', replacement: appSrc },
      ],
    },
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
      },
    },
    // The app's renderer (and solid-js) use modern syntax; downleveling to an
    // older target makes esbuild choke ("Transforming destructuring … not
    // supported"). Pin every esbuild pass to esnext — this is a WebGPU-only page
    // shipped to evergreen browsers anyway.
    build: {
      target: 'esnext',
    },
    esbuild: {
      target: 'esnext',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
  },
})
