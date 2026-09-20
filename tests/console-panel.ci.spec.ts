import { dismissWelcomeIfPresent, expect, openWorkspaceMenuItem, test, } from './helpers'

test.describe('Console panel', () => {
  test('shows the snapshot taken at log time, not the live object', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)

    // Log a live object and then mutate it. The panel used to hold the argument
    // by reference and format it at render time, so it would show 'after'.
    await page.evaluate(() => {
      const live = { state: 'before', nested: { items: [1, 2] } }
      console.warn('[e2e] live object', live)
      live.state = 'after'
    })

    // The console sits behind Settings and More in the workspace menu and is
    // open by default there. The version pill used to open the About modal
    // directly; it now opens the menu, so this spec failed on a dialog that
    // never appeared.
    await openWorkspaceMenuItem(page, /Settings and More/)

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
