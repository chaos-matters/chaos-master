// Render arbitrary flames to images on the real GPU.
//
// The poster pipeline renders rows out of D1; this renders whatever you hand
// it, which is what a sequence PREVIEW needs — its candidates do not exist in
// the database yet, and the whole point is deciding whether they ever should.
//
// Both go through the same capture page (`scripts/poster-capture.html` +
// posterCapture.tsx), which already accepts a bare `spec` carrying its own
// flame. So this shares the app's export driver, its quality gate and its
// blank-canvas check rather than growing a second renderer that drifts.
//
// Returns images as BYTES; the caller decides whether they become files, or
// base64 in a JSON payload for a console to show.
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'
import { CAPTURE_PAGE } from './dev-server-checkout.mjs'

const EXT = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/**
 * Render each flame once, in one browser session.
 *
 * Headed with the WebGPU flags, for the same reason the poster capture is:
 * headless Chromium has no usable WebGPU on this machine and would write black
 * images that look like a rendering bug rather than a missing adapter.
 *
 * @param {object} options
 * @param {unknown[]} options.flames  descriptors to render, in order
 * @param {string} options.base       dev server origin, e.g. https://localhost:5173
 * @param {(msg: string) => void} [options.onProgress]
 * @returns {Promise<{ index: number, bytes: Buffer, mimeType: string, ext: string,
 *   peak: number, error: string | null }[]>}
 */
export async function renderFlames({
  flames,
  base,
  width = 480,
  height = 270,
  quality = 0.9,
  pointCountPerBatch = 4e5,
  mimeType = 'image/webp',
  encodeQuality = 0.85,
  timeout = 120_000,
  onProgress = () => {},
}) {
  if (flames.length === 0) return []

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--ignore-gpu-blocklist',
      // Same reason as capture-gallery-posters: a hidden workspace for agent windows.
      '--class=agent-browser',
    ],
  })
  try {
    // ignoreHTTPSErrors: the dev server is HTTPS with a self-signed cert
    // (basic-ssl), which Playwright refuses without this.
    const context = await browser.newContext({
      viewport: { width: 900, height: 700 },
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    page.on('pageerror', (err) => {
      onProgress(`  [page] ${err.message}`)
    })

    await page.goto(`${base}${CAPTURE_PAGE}`, {
      waitUntil: 'load',
      timeout: 60_000,
    })
    await page.waitForFunction(() => '__posterCapture' in window, undefined, {
      timeout: 60_000,
    })

    const out = []
    for (const [index, flame] of flames.entries()) {
      onProgress(`  rendering ${index + 1}/${flames.length} ...`)
      try {
        await page.evaluate((s) => window.__posterCapture.load(s), {
          slug: `candidate-${index}`,
          flame,
          animation: null,
          width,
          height,
          quality,
          pointCountPerBatch,
          frame: null,
          frameFraction: null,
          mimeType,
          encodeQuality,
        })
        await page.waitForFunction(
          () => {
            const status = window.__posterCapture.status()
            if (status.state === 'error') throw new Error(status.error)
            return status.state === 'done'
          },
          undefined,
          { timeout, polling: 500 },
        )
        const result = await page.evaluate(() => window.__posterCapture.take())
        if (!result) throw new Error('capture page returned no image')
        // The same blank guard the poster capture uses: a canvas that never
        // drew encodes fine and is uniformly black, so only the pixels can
        // tell you it failed.
        if (result.peak <= 2) {
          throw new Error(`blank render (peak channel ${result.peak})`)
        }
        out.push({
          index,
          bytes: Buffer.from(result.base64, 'base64'),
          mimeType: result.mimeType,
          ext: EXT[result.mimeType] ?? 'bin',
          peak: result.peak,
          error: null,
        })
      } catch (error) {
        // One bad candidate must not lose the rest — a preview of 8 usable
        // flames beats an error because the 9th would not converge.
        out.push({
          index,
          bytes: null,
          mimeType,
          ext: EXT[mimeType] ?? 'bin',
          peak: 0,
          error: error instanceof Error ? error.message : String(error),
        })
        onProgress(`  candidate ${index} failed: ${String(error)}`)
      }
    }
    return out
  } finally {
    await browser.close()
  }
}
