import { dismissWelcomeIfPresent, expect, openWorkspaceMenuItem, test, } from './helpers'

test.describe('Documentation modal', () => {
  test('opens from the workspace menu and shows the three tabs with content', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)

    // v0.9.11 had a Docs pill; the entry now lives in the workspace menu. This
    // spec used to skip when the old selector missed, and so reported green
    // while testing nothing.
    await openWorkspaceMenuItem(page, /Documentation/)

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
