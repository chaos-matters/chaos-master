/**
 * Generate static flame posters for the landing's poster fallback.
 *
 * Renders each flame from the REAL Flam3 renderer (via the dev-only
 * /poster-capture page) and screenshots the converged canvas to a poster JPG.
 * Headless has no WebGPU on this box, so it drives a HEADED Chromium
 * (see [[webgpu-verify-headed-playwright]]).
 *
 * Run:
 *   pnpm --filter @chaos-master/landing dev          # in one terminal
 *   node packages/landing/scripts/capture-posters.mjs [baseURL] [id1,id2,...]
 *
 * baseURL defaults to http://localhost:4321 (astro dev). An optional
 * comma-separated id list renders only those jobs (e.g. `... '' earth,ocean`).
 * Job ids: the LANDING_FLAMES keys (-> posters/<id>.jpg) and the EARTH_VARIANTS
 * ids (-> posters/earth-variants/<id>.jpg). Keep these lists in sync with
 * src/lib/flame.ts and src/lib/earthVariants.ts.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '../public/posters')
const BASE = process.argv[2] ?? 'http://localhost:4321'
const FILTER = process.argv[3] ? process.argv[3].split(',') : null
const SIZE = 1280
const QUALITY_TARGET = 0.97

const NAMES = [
  'example1',
  'example29',
  'example33',
  'example40',
  'example45',
  'rose',
  'earth',
]
const EARTH_VARIANTS = [
  'sunrise',
  'ocean',
  'trueearth',
  'verdant',
  'nebula',
  'vivid',
]

const JOBS = [
  ...NAMES.map((id) => ({ id, query: `name=${id}`, out: `${id}.jpg` })),
  ...EARTH_VARIANTS.map((id) => ({
    id,
    query: `variant=${id}`,
    out: `earth-variants/${id}.jpg`,
  })),
]
const jobs = FILTER ? JOBS.filter((j) => FILTER.includes(j.id)) : JOBS

mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(resolve(OUT_DIR, 'earth-variants'), { recursive: true })

const browser = await chromium.launch({
  headless: false,
  // --class: the window manager files agent-owned windows by this class on a
  // hidden workspace, so the capture window never covers the user's screen.
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--class=agent-browser',
  ],
})
// ignoreHTTPSErrors: the dev server runs over HTTPS (basic-ssl) with a
// self-signed cert; without this Playwright refuses to load the capture page.
const context = await browser.newContext({
  viewport: { width: SIZE, height: SIZE },
  ignoreHTTPSErrors: true,
})
const page = await context.newPage()
page.on('console', (m) => {
  const t = m.text()
  if (t.includes('error') || t.includes('Error') || t.includes('WebGPU')) {
    console.log(`  [page] ${t}`)
  }
})

let failures = 0
for (const job of jobs) {
  const url = `${BASE}/poster-capture?${job.query}&size=${SIZE}`
  process.stdout.write(`capturing ${job.id} ... `)
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    await page.waitForSelector('canvas', { timeout: 30000 })
    // Astro's dev toolbar is fixed at the bottom-center and would bleed into the
    // canvas screenshot (locator.screenshot clips the composited page). Hide it.
    await page.addStyleTag({
      content: 'astro-dev-toolbar{display:none!important}',
    })
    // Wait for the flame to actually converge, not just the first frame.
    await page.waitForFunction(
      (target) => {
        const w = /** @type {any} */ (window)
        if (w.__captureError) throw new Error(w.__captureError)
        return (
          typeof w.__captureQuality === 'function' &&
          w.__captureQuality() >= target
        )
      },
      QUALITY_TARGET,
      { timeout: 60000, polling: 250 },
    )
    await page.waitForTimeout(600) // settle the last postprocess frame
    const out = resolve(OUT_DIR, job.out)
    await page
      .locator('canvas')
      .screenshot({ path: out, type: 'jpeg', quality: 92 })
    console.log(`ok -> ${job.out}`)
  } catch (err) {
    failures += 1
    console.log(`FAILED: ${err.message}`)
  }
}

await browser.close()
console.log(
  failures ? `\n${failures} poster(s) failed.` : '\nAll posters captured.',
)
process.exit(failures ? 1 : 0)
