import { dismissWelcomeIfPresent, expect, test } from './helpers'

test.describe('Console panel', () => {
  test('shows the snapshot taken at log time, not the live object', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)

    // The About pill carries the version and lives next to the Docs pill in the
    // main workspace, which only mounts once WebGPU initializes.
    const aboutButton = page
      .locator('button')
      .filter({ hasText: /^v\d+\.\d+/ })
      .first()
    const aboutVisible = await aboutButton
      .isVisible({ timeout: 8000 })
      .catch(() => false)
    test.skip(!aboutVisible, 'WebGPU unavailable — about pill not mounted')

    // Log a live object and then mutate it. The panel used to hold the argument
    // by reference and format it at render time, so it would show 'after'.
    await page.evaluate(() => {
      const live = { state: 'before', nested: { items: [1, 2] } }
      console.warn('[e2e] live object', live)
      live.state = 'after'
    })

    // dispatchEvent rather than click(): the welcome backdrop can still be
    // fading and would otherwise intercept the pointer.
    await aboutButton.dispatchEvent('click')

    const modal = page
      .locator('dialog')
      .filter({ hasText: 'Console Logs' })
      .first()
    await expect(modal).toBeVisible()
    await expect(modal.getByText(/^Console \(\d+\)$/)).toBeVisible()

    await expect(modal).toContainText('[e2e] live object')
    await expect(modal).toContainText('"state": "before"')
    await expect(modal).not.toContainText('"state": "after"')
    await expect(modal).toContainText('"items": [')

    // The adapter info object that the panel used to pin for the life of the
    // ring buffer is still readable in full.
    await expect(modal).toContainText('[WebGPU] Adapter acquired:')
    await expect(modal).toContainText('"vendor":')
  })
})
