/**
 * Regenerate the shared social-preview card (public/og-cover.jpg) for BOTH
 * packages/app and packages/landing.
 *
 * The card is a 2400x1260 landscape crop of the landing hero render
 * (hero-flame.jpg) with a lower-left brand lockup: the Deep C mark, then the
 * "Lumen Apeiron" wordmark, then the "The Chaos Master" subtitle, then the
 * tagline.
 *
 * The wordmark is set in weight contrast rather than one flat weight -- "Lumen"
 * light, "Apeiron" semibold, tracked tight -- which is what makes it read as a
 * wordmark instead of a heading. There is no gradient on it: paper on a dark
 * flame is already 17:1, and the old periwinkle->blue oklch gradient came from
 * a palette the brand no longer uses.
 *
 * The mark is READ FROM public/favicon.svg at generation time, so the geometry
 * lives in exactly one place -- change the favicon and the card follows.
 *
 * Headless Chromium renders the type (no WebGPU needed); Inter loads from
 * Google Fonts, the same source the landing page uses, so network access is
 * required.
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
// One source of truth for the mark: the shipped favicon.
const MARK = readFileSync(resolve(__dirname, '../public/favicon.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/width="64"\s+height="64"/, 'width="224" height="224"')

const html = /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=block" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #stage { position: relative; width: ${W}px; height: ${H}px; }
  #bg { position: absolute; inset: 0; }
  /* Text safe-zone: a soft bottom veil plus a stronger pocket behind the
     lower-left lockup (matches the darkening profile of the previous card). */
  /* Text safe-zone, tinted with the brand void rather than pure black so the
     scrim and the mark's own tile are the same colour. */
  .scrim { position: absolute; inset: 0;
    background:
      radial-gradient(2200px 900px at 8% 100%, rgba(8,10,14,0.82), rgba(8,10,14,0) 74%),
      linear-gradient(to bottom, rgba(8,10,14,0) 34%, rgba(8,10,14,0.62) 100%);
  }
  /* The lockup is laid out, not hand-positioned: mark and text sit in a flex
     row anchored to the bottom-left, so changing a size cannot desync them. */
  .lockup { position: absolute; left: 144px; bottom: 104px;
    display: flex; align-items: center; gap: 46px; }
  .mark { flex: none; width: 224px; height: 224px; display: block;
    filter: drop-shadow(0 0 28px rgba(255,116,72,0.28)); }
  .mark svg { display: block; border-radius: 52px; }
  .words { display: flex; flex-direction: column; gap: 22px; }
  /* Weight contrast is the whole device: light + semibold, tracked tight. */
  .title { font: 300 152px/0.98 Inter, sans-serif; letter-spacing: -0.035em;
    color: #F2F3F5; white-space: nowrap; }
  .title b { font-weight: 600; }
  .sub { display: flex; align-items: center; gap: 22px;
    font: 500 40px/1 Inter, sans-serif; letter-spacing: 0.3em;
    text-transform: uppercase; color: #929AA7; white-space: nowrap; }
  .sub i { flex: none; width: 64px; height: 3px; background: #FF7448;
    border-radius: 2px; display: block; }
  .tagline { position: absolute; left: 148px; bottom: 40px;
    font: 400 44px/1.15 Inter, sans-serif; color: #929AA7; }
  .tagline em { font-style: normal; color: #FF7448; padding: 0 6px; }
</style>
</head>
<body>
<div id="stage">
  <canvas id="bg" width="${W}" height="${H}"></canvas>
  <div class="scrim"></div>
  <div class="lockup">
    <span class="mark">${MARK}</span>
    <span class="words">
      <span class="title">Lumen <b>Apeiron</b></span>
      <span class="sub"><i></i>The Chaos Master</span>
    </span>
  </div>
  <div class="tagline">Real-time IFS fractal flame editor<em>&middot;</em>WebGPU<em>&middot;</em>WebMCP</div>
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
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 78 })
  for (const target of TARGETS) {
    writeFileSync(target, jpeg)
    console.log(`wrote ${target} (${(jpeg.length / 1024).toFixed(0)} KB)`)
  }
} finally {
  await browser.close()
}
