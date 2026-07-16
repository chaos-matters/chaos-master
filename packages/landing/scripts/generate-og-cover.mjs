/**
 * Regenerate the shared social-preview card (public/og-cover.jpg) for BOTH
 * packages/app and packages/landing.
 *
 * The card is a 2400x1260 landscape crop of the landing hero render
 * (hero-flame.jpg) with a lower-left brand lockup: the "Lumen Apeiron"
 * wordmark in the app Welcome screen's exact style (Inter semibold, -0.02em
 * tracking, periwinkle→blue oklch gradient) over a tagline that leads with
 * the "Chaos Master" sub-brand. Headless Chromium renders the type (no
 * WebGPU needed); Inter loads from Google Fonts, the same source the landing
 * page uses, so network access is required.
 *
 * Run (after pnpm install):
 *   node packages/landing/scripts/generate-og-cover.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const __dirname = dirname(fileURLToPath(import.meta.url))
const HERO = resolve(__dirname, '../public/hero-flame.jpg')
const TARGETS = [
  resolve(__dirname, '../public/og-cover.jpg'),
  resolve(__dirname, '../../app/public/og-cover.jpg'),
]

const W = 2400
const H = 1260
// Landscape band of the square 1440x1440 hero used by the previous card
// (full width, rows 30..786 — recovered by correlating the shipped card
// against the hero); upscaled + mildly sharpened below.
const CROP = { x: 0, y: 30, w: 1440, h: 756 }

const heroB64 = readFileSync(HERO).toString('base64')

const html = /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=block" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #stage { position: relative; width: ${W}px; height: ${H}px; }
  #bg { position: absolute; inset: 0; }
  /* Text safe-zone: a soft bottom veil plus a stronger pocket behind the
     lower-left lockup (matches the darkening profile of the previous card). */
  .scrim { position: absolute; inset: 0;
    background:
      radial-gradient(2100px 860px at 10% 98%, rgba(0,0,0,0.66), rgba(0,0,0,0) 74%),
      linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.52) 100%);
  }
  .title { position: absolute; left: 144px; top: 872px;
    font: 600 175px/1 Inter, sans-serif; letter-spacing: -0.02em;
    /* The app Welcome screen wordmark gradient, verbatim. */
    background: linear-gradient(135deg, oklch(78% 0.12 280), oklch(72% 0.14 240));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .tagline { position: absolute; left: 154px; top: 1052px;
    font: 400 52px/1.15 Inter, sans-serif; color: rgb(172, 175, 182);
  }
</style>
</head>
<body>
<div id="stage">
  <canvas id="bg" width="${W}" height="${H}"></canvas>
  <div class="scrim"></div>
  <div class="title">Lumen Apeiron</div>
  <div class="tagline">Chaos Master &middot; Real-time IFS fractal flame editor &middot; WebGPU &middot; in your browser</div>
</div>
<script>
  const img = new Image()
  img.onload = () => {
    const ctx = document.getElementById('bg').getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, ${CROP.x}, ${CROP.y}, ${CROP.w}, ${CROP.h}, 0, 0, ${W}, ${H})
    // Mild unsharp (3x3, amount 0.6) so the upscale reads crisp at card size.
    const src = ctx.getImageData(0, 0, ${W}, ${H})
    const out = ctx.createImageData(${W}, ${H})
    const s = src.data, o = out.data, k = 0.15
    for (let y = 0; y < ${H}; y++) {
      for (let x = 0; x < ${W}; x++) {
        const i = (y * ${W} + x) * 4
        const up = y > 0 ? i - ${W} * 4 : i
        const dn = y < ${H} - 1 ? i + ${W} * 4 : i
        const lf = x > 0 ? i - 4 : i
        const rt = x < ${W} - 1 ? i + 4 : i
        for (let c = 0; c < 3; c++) {
          const v = (1 + 4 * k) * s[i + c] - k * (s[up + c] + s[dn + c] + s[lf + c] + s[rt + c])
          o[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
        }
        o[i + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
    void document.fonts.ready.then(() => { window.__ready = true })
  }
  img.src = 'data:image/jpeg;base64,${heroB64}'
</script>
</body>
</html>`

const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  })
  await page.setContent(html, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ready === true, undefined, {
    timeout: 30_000,
  })
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 82 })
  for (const target of TARGETS) {
    writeFileSync(target, jpeg)
    console.log(`wrote ${target} (${(jpeg.length / 1024).toFixed(0)} KB)`)
  }
} finally {
  await browser.close()
}
