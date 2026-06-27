/**
 * Reusable helpers for driving the variation galleries in e2e tests.
 *
 * Designed for the `chromium-gpu` project (headed, real GPU) in
 * playwright.resilience.config.ts, but every helper degrades gracefully so the
 * same spec can `test.skip` under `chromium-degraded` (headless, no WebGPU).
 *
 * Copy this pattern for future gallery/preview features: open a gallery, drive
 * scroll, read the debug-panel GPU stats, assert previews stay bounded.
 */
import type { BrowserContext, Page } from '@playwright/test'

export const GALLERY_LIST = '[class*="galleryList"]' // QuickVariationPicker scroll container
export const MODAL_GALLERY = 'section[class*="gallery"]' // full VariationSelector grid

/** Seed the welcome-dismissed flag before the app loads (the #1 blocker). */
export async function dismissWelcome(context: BrowserContext) {
  await context.addInitScript(() => {
    localStorage.setItem('chaos-master-welcome-dismissed', 'true')
  })
}

/** Navigate to the editor and wait for WebGPU init + first render to settle. */
export async function gotoEditor(page: Page, settleMs = 6000) {
  await page.goto('/')
  await page.waitForTimeout(settleMs)
}

export type GpuStats = {
  /** Live (mounted) gallery preview canvases, from the debug panel. */
  livePreviews: number | null
  /** Tracked GPU-buffer MiB, from the debug panel. */
  mib: number | null
  /** Total <canvas> elements in the DOM (main render + live previews). */
  canvases: number
  /** The main IFS "X / Y Iters" readout (debug panel, first row). */
  itersText: string | null
}

/** Read the debug panel's GPU stats (DEV builds show it; toggle is Ctrl/Cmd+M). */
export async function readGpuStats(page: Page): Promise<GpuStats> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('p')].map((e) =>
      (e.textContent ?? '').trim(),
    )
    const num = (re: RegExp) => {
      const m = rows.find((s) => re.test(s))?.match(/[\d.]+/)
      return m ? parseFloat(m[0]) : null
    }
    return {
      livePreviews: num(/live previews/),
      mib: num(/MiB GPU buffers/),
      canvases: document.querySelectorAll('canvas').length,
      itersText: rows.find((s) => /Iters$/.test(s)) ?? null,
    }
  })
}

/** Open the sidebar QuickVariationPicker by clicking the first variation type. */
export async function openQuickPicker(page: Page) {
  await page.locator('[data-tour-target="variation-type"]').first().click()
  await page.waitForTimeout(400)
}

export async function switchToGalleryMode(page: Page) {
  const btn = page.locator('button[title="Preview gallery mode"]')
  if (await btn.count()) {
    await btn.click()
  }
  await page.waitForTimeout(500)
}

/** Open the full VariationSelector modal (previews + editable params). */
export async function openFullSelector(page: Page) {
  await page
    .locator('button[title="Open full browser (with previews and params)"]')
    .first()
    .click()
  await page.waitForTimeout(1500)
}

/** Fast, jerky up/down scrolling — the pattern that ballooned VRAM. */
export async function fastJerkyScroll(page: Page, selector = GALLERY_LIST) {
  await page.evaluate(async (sel) => {
    const l = document.querySelector(sel)
    if (!l) return
    for (let i = 0; i < 30; i++) {
      l.scrollTop = (i % 2 ? 25 - i : i) * 500
      await new Promise((r) => setTimeout(r, 25))
    }
  }, selector)
}

/** Scroll the whole list top-to-bottom in viewport-sized steps. */
export async function sweepScroll(page: Page, selector = GALLERY_LIST) {
  await page.evaluate(async (sel) => {
    const l = document.querySelector(sel)
    if (!l) return
    const step = l.clientHeight * 0.8
    for (let y = 0; y < l.scrollHeight; y += step) {
      l.scrollTop = y
      await new Promise((r) => setTimeout(r, 300))
    }
  }, selector)
}
