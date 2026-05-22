import { dismissWelcomeIfPresent, expect, test } from './helpers'

test.describe('Sidebar Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)
  })

  test('should render app without fatal errors', async ({ page, consoleErrors }) => {
    const root = page.locator('#root')
    await expect(root).toBeAttached()

    const fatalErrors = consoleErrors.filter(e =>
      !e.text.includes('No WebGPU adapters found') &&
      !e.text.includes('Failed to load resource')
    )
    expect(fatalErrors).toHaveLength(0)
  })

  test('should have sidebar with controls', async ({ page }) => {
    // Skip if WebGPU unavailable (sidebar only exists inside App)
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const sidebar = page.locator('[class*="sidebar"]').first()
    await expect(sidebar).toBeVisible({ timeout: 10000 })
  })

  test('should have exposure slider', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const exposureLabel = page.locator('text=Exposure')
    await expect(exposureLabel).toBeVisible({ timeout: 10000 })

    const slider = exposureLabel.locator('..').locator('input[type="range"]').first()
    await expect(slider).toBeVisible()
  })

  test('should have vibrancy slider', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const vibrancyLabel = page.locator('text=Vibrancy')
    await expect(vibrancyLabel).toBeVisible({ timeout: 10000 })

    const slider = vibrancyLabel.locator('..').locator('input[type="range"]').first()
    await expect(slider).toBeVisible()
  })

  test('should have skip iterations slider', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const skipLabel = page.locator('text=Skip Iterations')
    await expect(skipLabel).toBeVisible({ timeout: 10000 })

    const slider = skipLabel.locator('..').locator('input[type="range"]').first()
    await expect(slider).toBeVisible()
  })

  test('should have probability slider for transforms', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const probLabel = page.locator('text=Probability')
    await expect(probLabel).toBeVisible({ timeout: 10000 })

    const slider = probLabel.locator('..').locator('input[type="range"]').first()
    await expect(slider).toBeVisible()
  })
})
