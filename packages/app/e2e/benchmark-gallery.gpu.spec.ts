import { expect, test } from '@playwright/test'

type TilePreviewState = {
  backgroundImage: string
  canvasCount: number
  state: string
}

test.describe('GPU-enabled e2e: benchmark flame gallery', () => {
  test('shows only final snapshots and retains them across scrolling', async ({
    page,
  }) => {
    await page.goto('/benchmarks')
    await expect(page.getByTestId('benchmarks-page')).toBeVisible()
    test.skip(
      (await page.getByText('Local GPU ready', { exact: true }).count()) === 0,
      'needs live WebGPU — use the chromium-gpu project',
    )

    await page.locator('#benchmark-corpus').scrollIntoViewIfNeeded()
    const tiles = page.locator(
      '#benchmark-corpus button[aria-label*="benchmark corpus"]',
    )
    const firstTile = tiles.first()

    await expect
      .poll(
        async () =>
          firstTile.locator('[data-preview-state="snapshot"]').count(),
        { timeout: 20_000 },
      )
      .toBe(1)

    const firstSnapshot = await firstTile.evaluate<TilePreviewState>((tile) => {
      const preview = tile.querySelector<HTMLElement>('[data-preview-state]')
      return {
        backgroundImage: preview
          ? globalThis.getComputedStyle(preview).backgroundImage
          : 'none',
        canvasCount: tile.querySelectorAll('canvas').length,
        state: preview?.dataset.previewState ?? 'missing',
      }
    })
    expect(firstSnapshot.state).toBe('snapshot')
    expect(firstSnapshot.backgroundImage).toContain('blob:')
    expect(firstSnapshot.canvasCount).toBe(0)

    await page.evaluate(() => {
      const section = document.querySelector('#benchmark-corpus')
      const gallery = section
        ? [...section.querySelectorAll<HTMLElement>('div')].find(
            (element) =>
              globalThis.getComputedStyle(element).overflowY === 'auto',
          )
        : undefined
      if (gallery) gallery.scrollTop = gallery.scrollHeight
    })
    await page.waitForTimeout(400)

    const visiblyRenderingCanvases = await page
      .locator('#benchmark-corpus canvas')
      .evaluateAll(
        (canvases) =>
          canvases.filter((canvas) =>
            canvas.checkVisibility({ opacityProperty: true }),
          ).length,
      )
    expect(visiblyRenderingCanvases).toBe(0)

    await page.evaluate(() => {
      const section = document.querySelector('#benchmark-corpus')
      const gallery = section
        ? [...section.querySelectorAll<HTMLElement>('div')].find(
            (element) =>
              globalThis.getComputedStyle(element).overflowY === 'auto',
          )
        : undefined
      if (gallery) gallery.scrollTop = 0
    })
    await page.waitForTimeout(250)

    const retainedSnapshot = await firstTile.evaluate<TilePreviewState>(
      (tile) => {
        const preview = tile.querySelector<HTMLElement>('[data-preview-state]')
        return {
          backgroundImage: preview
            ? globalThis.getComputedStyle(preview).backgroundImage
            : 'none',
          canvasCount: tile.querySelectorAll('canvas').length,
          state: preview?.dataset.previewState ?? 'missing',
        }
      },
    )
    expect(retainedSnapshot).toEqual(firstSnapshot)
  })
})
