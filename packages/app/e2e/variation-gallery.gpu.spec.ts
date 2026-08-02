/**
 * GPU-enabled e2e: variation gallery preview behaviour (real WebGPU).
 *
 * These tests REQUIRE a real GPU, so they are a local-only suite — the `.gpu.spec.ts`
 * suffix keeps them out of the CI config (see playwright.config.ts testIgnore) and
 * into the headed GPU config (playwright.resilience.config.ts). Add future
 * GPU-only feature tests as `*.gpu.spec.ts` and they join this group automatically.
 *
 * Regression cover for the gallery memory/perf work:
 *  - fast/jerky + full-sweep scrolling keeps GPU memory bounded (the balloon to
 *    tens of GB that stalled Firefox/AMD must not come back)
 *  - closing the picker frees previews (live count returns to 0 — no leak)
 *  - editing a parametric variation's slider re-renders its gallery tile
 *
 * Run locally (start the HTTPS dev server on :3000 first — cd packages/app && pnpm start):
 *   pnpm exec playwright test -c playwright.resilience.config.ts --project chromium-gpu
 *   pnpm exec playwright test variation-gallery.gpu -c playwright.resilience.config.ts --project chromium-gpu
 */
import { expect, test } from '@playwright/test'
import { dismissWelcome, fastJerkyScroll, GALLERY_LIST, gotoEditor, MODAL_GALLERY, openFullSelector, openQuickPicker, readGpuStats, sweepScroll, switchToGalleryMode, } from './helpers/gallery'

// The balloon hit tens of GB; healthy is ~30-100 MiB. A generous ceiling still
// catches any regression without flaking on normal in-flight previews.
const MAX_PREVIEW_MIB = 500

test.describe('GPU-enabled e2e: variation gallery preview', () => {
  test.beforeEach(async ({ context }) => {
    await dismissWelcome(context)
  })

  test('GPU memory stays bounded under fast + sweep scrolling', async ({
    page,
  }) => {
    await gotoEditor(page)
    test.skip(
      (await readGpuStats(page)).canvases === 0,
      'needs live WebGPU — use the chromium-gpu project',
    )

    await openQuickPicker(page)
    await switchToGalleryMode(page)
    await page.waitForTimeout(3000)

    await fastJerkyScroll(page, GALLERY_LIST)
    const during = await readGpuStats(page)
    await sweepScroll(page, GALLERY_LIST)
    await page.waitForTimeout(1000)
    const after = await readGpuStats(page)

    // eslint-disable-next-line no-console
    console.log(`MiB during=${during.mib} after-sweep=${after.mib}`)
    expect(
      during.mib ?? 0,
      'GPU buffers bounded during fast scroll',
    ).toBeLessThan(MAX_PREVIEW_MIB)
    expect(
      after.mib ?? 0,
      'GPU buffers bounded after full sweep (no balloon)',
    ).toBeLessThan(MAX_PREVIEW_MIB)
  })

  test('closing the picker frees previews (live count returns to 0)', async ({
    page,
  }) => {
    await gotoEditor(page)
    test.skip((await readGpuStats(page)).canvases === 0, 'needs live WebGPU')

    await openQuickPicker(page)
    await switchToGalleryMode(page)
    await page.waitForTimeout(2500)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(1500)
    expect(
      (await readGpuStats(page)).livePreviews ?? -1,
      'live previews freed after close',
    ).toBe(0)
  })

  test('editing a parametric variation re-renders its gallery tile', async ({
    page,
  }) => {
    await gotoEditor(page)
    test.skip((await readGpuStats(page)).canvases === 0, 'needs live WebGPU')

    await openQuickPicker(page)
    await openFullSelector(page)
    await page.waitForTimeout(1500)

    // blob is a parametric variation (Low/High/Waves sliders).
    const blobTile = page
      .locator(`${MODAL_GALLERY} button[class*="item"]`, { hasText: /blob/i })
      .first()
    test.skip((await blobTile.count()) === 0, 'blob tile not present')
    await blobTile.scrollIntoViewIfNeeded()
    await blobTile.click()
    await expect(page.getByText('Variation Parameters')).toBeVisible({
      timeout: 5000,
    })

    // Read the blob tile directly. `stretch-done` is present once the preview has
    // rendered and frozen to a static image; a live <canvas> means it is
    // (re)rendering.
    const tileState = () =>
      blobTile.evaluate((el) => ({
        live: !!el.querySelector('canvas'),
        snapshotted: !!el.querySelector('[class*="stretch-done"]'),
      }))

    // Wait until the tile has finished rendering and frozen to a static image.
    await blobTile.scrollIntoViewIfNeeded()
    await expect
      .poll(async () => (await tileState()).snapshotted, { timeout: 20000 })
      .toBe(true)

    // Change a param: the editor uses a native <input type=range>; arrow keys
    // fire its onInput -> setValue -> the per-tile re-render bump.
    const slider = page
      .locator('[class*="item-params"] input[type="range"]')
      .first()
    await expect(slider).toBeVisible({ timeout: 3000 })
    const valueBefore = await slider.inputValue()
    await slider.focus()
    for (let i = 0; i < 8; i++) {
      await slider.press('ArrowRight')
    }
    expect(
      await slider.inputValue(),
      'slider value actually changed (interaction worked)',
    ).not.toBe(valueBefore)

    // The fix: changing a param must drop the cached image and re-render the tile
    // live (canvas mounts / the static image is discarded).
    await expect
      .poll(
        async () => {
          const s = await tileState()
          return s.live || !s.snapshotted
        },
        { timeout: 6000 },
      )
      .toBe(true)
  })
})
