import { dismissWelcomeIfPresent, expect, test } from './helpers'

test.describe('App Loading', () => {
  test('should load the app without fatal errors', async ({
    page,
    consoleErrors,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // App should have rendered something in the root
    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Filter out expected errors (WebGPU not available in headless, devtools network errors)
    const fatalErrors = consoleErrors.filter(
      (e) =>
        !e.text.includes('No WebGPU adapters found') &&
        !e.text.includes('Failed to load resource') &&
        !e.text.includes('solid-devtools'),
    )
    expect(fatalErrors).toHaveLength(0)
  })

  test('should have correct page title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/Lumen Apeiron/)
  })

  test('should render the app DOM structure', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // App should have rendered the root structure
    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Should have at least one child element rendered
    const childCount = await page.evaluate(() => {
      const root = document.getElementById('root')
      return root ? root.querySelectorAll('*').length : 0
    })
    expect(childCount).toBeGreaterThan(5)
  })

  test('should handle WebGPU unavailability gracefully', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    await dismissWelcomeIfPresent(page, 12_000)

    // One of two real states: the unsupported notice, or the workspace (its
    // version pill). A crash lands on the error boundary, which is neither;
    // "#root has children" could not tell those apart.
    const webgpuError = page.locator('text=WebGPU is not supported')
    const workspace = page.getByRole('button', {
      name: /^Lumen Apeiron v\S+ menu$/,
    })
    await expect(webgpuError.or(workspace).first()).toBeVisible({
      timeout: 20_000,
    })
  })
})
