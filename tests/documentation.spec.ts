import { dismissWelcomeIfPresent, expect, test } from './helpers'

test.describe('Documentation modal', () => {
  test('opens from the Docs pill and shows the three tabs with content', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)

    // The Docs pill lives next to the version in the main workspace, which only
    // mounts once WebGPU initializes. The swiftshader + --enable-unsafe-webgpu
    // launch flags (playwright.config.ts) provide a software adapter headless.
    const docsButton = page.locator('button:has-text("Docs")').first()
    const docsVisible = await docsButton
      .isVisible({ timeout: 8000 })
      .catch(() => false)
    test.skip(!docsVisible, 'WebGPU unavailable — docs pill not mounted')

    // dispatchEvent rather than click(): the welcome backdrop can still be
    // fading and would otherwise intercept the pointer.
    await docsButton.dispatchEvent('click')

    const modal = page.locator('dialog', { hasText: 'Documentation' }).first()
    await expect(modal).toBeVisible()

    for (const label of ['Variations', 'IFS', 'API']) {
      await expect(
        modal.locator('button', { hasText: label }).first(),
      ).toBeVisible()
    }

    // IFS tab shows the ported guide prose.
    await modal
      .locator('button', { hasText: 'IFS' })
      .first()
      .dispatchEvent('click')
    await expect(modal.locator('text=Iterated Function Systems')).toBeVisible()

    // API tab shows the custom-variation reference.
    await modal
      .locator('button', { hasText: 'API' })
      .first()
      .dispatchEvent('click')
    await expect(modal.locator('text=Environment bindings')).toBeVisible()
  })
})
