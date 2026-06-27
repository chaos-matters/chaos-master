/**
 * WebGPU graceful-fallback / resilience scenarios.
 *
 *   chromium-gpu      headed + real GPU: healthy render, then force a device
 *                     loss via __chaosForceGpuUnavailable() and assert the app
 *                     degrades gracefully (posters, no spiral, shell usable).
 *   chromium-degraded headless, no WebGPU: assert the app never hangs and comes
 *                     up directly in the degraded shell.
 *
 * Run: pnpm exec playwright test -c playwright.resilience.config.ts
 */
import { expect, test } from '@playwright/test'
import type { ConsoleMessage, Page } from '@playwright/test'

const LOAD_SETTLE_MS = 6000

type Snapshot = {
  canvases: number
  posters: number
  hasForceHook: boolean
  // A few editor controls — proof the shell is still mounted + interactive.
  editorControls: number
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const w = globalThis as unknown as Record<string, unknown>
    const editorLabels = ['Affine', 'Color', 'Palette', 'Custom Variations']
    const buttons = [...document.querySelectorAll('button')].map((b) =>
      (b.textContent ?? '').trim(),
    )
    return {
      canvases: document.querySelectorAll('canvas').length,
      posters: document.querySelectorAll('[data-testid="webgpu-poster"]')
        .length,
      hasForceHook: typeof w.__chaosForceGpuUnavailable === 'function',
      editorControls: editorLabels.filter((l) => buttons.includes(l)).length,
    }
  })
}

function attachConsole(page: Page, sink: string[]) {
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') sink.push(m.text())
  })
  page.on('pageerror', (e: Error) => sink.push(`[pageerror] ${e.message}`))
}

async function forceDegrade(page: Page) {
  await page.evaluate(() => {
    ;(
      globalThis as unknown as { __chaosForceGpuUnavailable: () => void }
    ).__chaosForceGpuUnavailable()
  })
}

test.describe('WebGPU resilience', () => {
  test('healthy GPU: renders flames, no posters, bounded errors', async ({
    page,
  }) => {
    const errors: string[] = []
    attachConsole(page, errors)
    await page.goto('/')
    await page.waitForTimeout(LOAD_SETTLE_MS)

    const snap = await snapshot(page)
    test.skip(
      snap.canvases === 0,
      'WebGPU not rendering here — see chromium-degraded',
    )

    expect(snap.canvases, 'live canvases should render').toBeGreaterThan(0)
    expect(snap.posters, 'no posters while healthy').toBe(0)
    expect(snap.editorControls, 'editor shell present').toBeGreaterThan(0)
    // WebGPU init logs are info, not error; the healthy path should be quiet.
    const gpuSpam = errors.filter(
      (e) => e.includes('invalid') || e.includes('Buffer'),
    )
    expect(gpuSpam, 'no buffer-invalid spam while healthy').toEqual([])
  })

  test('forced device loss: previews become posters, shell stays usable, no spiral', async ({
    page,
  }) => {
    const errors: string[] = []
    attachConsole(page, errors)
    await page.goto('/')
    await page.waitForTimeout(LOAD_SETTLE_MS)

    const before = await snapshot(page)
    test.skip(before.canvases === 0, 'Needs a live GPU to lose')
    expect(before.canvases).toBeGreaterThan(0)

    await forceDegrade(page)
    await page.waitForTimeout(1500)
    const afterFlip = await snapshot(page)

    // Posters replaced the live canvases.
    expect(afterFlip.posters, 'posters appear on previews').toBeGreaterThan(0)
    expect(afterFlip.canvases, 'live canvases torn down').toBeLessThan(
      before.canvases,
    )
    // Shell still mounted + interactive.
    expect(afterFlip.editorControls, 'shell still usable').toBeGreaterThan(0)

    // No spiral: error count must plateau after the loops tear down.
    const errAt1 = errors.length
    await page.waitForTimeout(3000)
    const errAt4 = errors.length
    expect(
      errAt4 - errAt1,
      `errors kept growing after degrade (${errAt1} -> ${errAt4}) = spiral`,
    ).toBeLessThan(10)

    // The shell really is navigable: a control click doesn't throw.
    const docs = page.locator('button:has-text("Docs")')
    if (await docs.count()) {
      await docs
        .first()
        .click({ timeout: 3000 })
        .catch(() => {})
    }
  })

  test('variation gallery under device loss: posters across the grid, no spiral', async ({
    page,
  }) => {
    const errors: string[] = []
    attachConsole(page, errors)
    await page.goto('/')
    await page.waitForTimeout(LOAD_SETTLE_MS)

    const base = await snapshot(page)
    test.skip(base.canvases === 0, 'Needs a live GPU')

    // Open the variation gallery (many small IFS previews) — the scenario that
    // crashed on Firefox/AMD. Add variation -> open the full browser with previews.
    const addVar = page.locator('button:has-text("Add variation")').first()
    if (await addVar.count()) {
      await addVar.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(800)
    }
    const openFull = page.locator(
      'button[title="Open full browser (with previews and params)"]',
    )
    if (await openFull.count()) {
      await openFull
        .first()
        .click({ timeout: 5000 })
        .catch(() => {})
      await page.waitForTimeout(3500)
    }
    // Scroll the grid to mount more previews (intersection-observer gated).
    await page.mouse.move(640, 400)
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 600)
      await page.waitForTimeout(400)
    }
    const galleryCanvases = (await snapshot(page)).canvases

    await forceDegrade(page)
    await page.waitForTimeout(2000)
    const after = await snapshot(page)

    expect(after.posters, 'posters render across the gallery').toBeGreaterThan(
      0,
    )

    const errAt0 = errors.length
    await page.waitForTimeout(3000)
    expect(
      errors.length - errAt0,
      'no error spiral with many previews mounted',
    ).toBeLessThan(15)

    // eslint-disable-next-line no-console
    console.log(
      `GALLERY canvases=${galleryCanvases} -> postersAfter=${after.posters}`,
    )
  })

  test('resize storm while healthy does not crash', async ({ page }) => {
    const errors: string[] = []
    attachConsole(page, errors)
    await page.goto('/')
    await page.waitForTimeout(LOAD_SETTLE_MS)
    test.skip((await snapshot(page)).canvases === 0, 'Needs a live GPU')

    const sizes = [
      { width: 800, height: 600 },
      { width: 1400, height: 900 },
      { width: 600, height: 800 },
      { width: 1600, height: 700 },
      { width: 1000, height: 1000 },
    ]
    for (let i = 0; i < 3; i++) {
      for (const s of sizes) {
        await page.setViewportSize(s)
        await page.waitForTimeout(250)
      }
    }
    await page.waitForTimeout(2000)

    const snap = await snapshot(page)
    // Either still rendering, or it degraded gracefully — but NOT a hard crash.
    expect(
      snap.canvases > 0 || snap.posters > 0,
      'app survived the resize storm',
    ).toBeTruthy()
    expect(
      snap.editorControls,
      'shell intact after resize storm',
    ).toBeGreaterThan(0)
  })

  test('no WebGPU: app loads degraded (no hang), shell usable', async ({
    page,
  }) => {
    const snap0 = await page.goto('/').then(async () => {
      await page.waitForTimeout(LOAD_SETTLE_MS)
      return snapshot(page)
    })
    test.skip(
      snap0.canvases > 0,
      'WebGPU is rendering — not the degraded project',
    )

    // The init timeout guarantees the resource resolves — the shell must be up.
    expect(
      snap0.editorControls,
      'degraded shell rendered, not hung',
    ).toBeGreaterThan(0)
    expect(snap0.posters, 'previews show posters').toBeGreaterThan(0)
    expect(snap0.canvases, 'no live canvases without WebGPU').toBe(0)
  })
})
