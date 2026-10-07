// Standalone headed-Chrome WebGPU verification.
//
// Deliberately NOT a `playwright test` run: this
// repo's playwright.config.ts forces swiftshader, which produces fake
// device-loss crashes. Launch flags copied from
// packages/app/scripts/capture-readme-screenshots.mjs so the window lands on
// the hidden agent workspace (--class=agent-browser).
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

// Point BASE at whatever is already serving the app: `pnpm --filter
// chaos-master start` (5173) or `e2e:serve` (4173). Results and screenshots go
// to OUT, which defaults to a gitignored directory in the repo.
const BASE = process.env.VERIFY_BASE_URL ?? 'https://localhost:5173'
const OUT = process.env.VERIFY_OUT_DIR ?? 'webgpu-verify-out'
mkdirSync(`${OUT}/shots`, { recursive: true })

const report = { webgpu: null, routes: [], viewports: [], errors: [] }

const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--ignore-gpu-blocklist',
    '--class=agent-browser',
  ],
})

async function newPage(viewport) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('chaos-master-welcome-dismissed', 'true')
    } catch {
      // Storage can be unavailable; the welcome overlay is not fatal here.
    }
  })
  return ctx
}

async function visit(ctx, path, label) {
  const page = await ctx.newPage()
  const console_errors = []
  const solid_warnings = []
  let bytes = 0
  const byType = {}
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error') console_errors.push(t.slice(0, 300))
    if (/computations created outside a `?createRoot|createRoot/i.test(t))
      solid_warnings.push(t.slice(0, 300))
  })
  page.on('pageerror', (e) =>
    console_errors.push(`PAGEERROR: ${String(e).slice(0, 300)}`),
  )
  page.on('response', (res) => {
    try {
      const h = res.headers()
      const len = Number(h['content-length'] || 0)
      const ct = (h['content-type'] || '').split(';')[0]
      if (len) {
        bytes += len
        byType[ct] = (byType[ct] || 0) + len
      }
    } catch {
      // A response without usable headers just does not contribute a size.
    }
  })
  const t0 = Date.now()
  await page
    .goto(BASE + path, { waitUntil: 'networkidle', timeout: 90_000 })
    .catch((e) => {
      console_errors.push(`GOTO: ${String(e).slice(0, 200)}`)
    })
  const loadMs = Date.now() - t0
  await page.waitForTimeout(4000)
  const gpu = await page
    .evaluate(async () => {
      if (!navigator.gpu) return { hasGPU: false }
      try {
        const a = await navigator.gpu.requestAdapter()
        return {
          hasGPU: true,
          adapter: !!a,
          info:
            a && a.info
              ? {
                  vendor: a.info.vendor,
                  arch: a.info.architecture,
                  desc: a.info.description,
                }
              : null,
        }
      } catch (e) {
        return { hasGPU: true, adapter: false, err: String(e) }
      }
    })
    .catch(() => ({ hasGPU: false, evalFailed: true }))
  const canvases = await page
    .evaluate(() =>
      [...document.querySelectorAll('canvas')].map((c) => ({
        w: c.width,
        h: c.height,
        cw: c.clientWidth,
        ch: c.clientHeight,
      })),
    )
    .catch(() => [])
  const shot = `${OUT}/shots/${label}.png`
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {})
  await page.close()
  return {
    label,
    path,
    loadMs,
    bytes,
    byType,
    console_errors,
    solid_warnings,
    gpu,
    canvases,
    shot,
  }
}

// 1. Desktop routes, with payload accounting (the Phase 2 startup question).
const desktop = await newPage({ width: 1920, height: 1080 })
for (const [path, label] of [
  ['/', 'desktop-main'],
  ['/arcade', 'desktop-arcade'],
  ['/benchmarks', 'desktop-benchmarks'],
  ['/explore', 'desktop-explorer'],
]) {
  const r = await visit(desktop, path, label)
  report.routes.push(r)
  if (!report.webgpu) report.webgpu = r.gpu
  console.log(
    `[route] ${label}: ${(r.bytes / 1048576).toFixed(2)} MB, ${r.loadMs}ms, ${r.console_errors.length} errors, ${r.solid_warnings.length} solid warnings`,
  )
}
await desktop.close()

// 2. Viewport sweep on the main surface (the mobile/tablet work from PR #77).
for (const [w, h, label] of [
  [1920, 1080, 'vp-desktop'],
  [1024, 768, 'vp-tablet-landscape'],
  [768, 1024, 'vp-tablet-portrait'],
  [390, 844, 'vp-phone'],
]) {
  const ctx = await newPage({ width: w, height: h })
  const r = await visit(ctx, '/', label)
  report.viewports.push(r)
  console.log(
    `[viewport] ${label} ${w}x${h}: ${r.console_errors.length} errors, ${r.solid_warnings.length} solid warnings, ${r.canvases.length} canvases`,
  )
  await ctx.close()
}

await browser.close()
writeFileSync(`${OUT}/headed-verify.json`, JSON.stringify(report, null, 2))
console.log('===HEADED:DONE===')
