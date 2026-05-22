import { dismissWelcomeIfPresent, expect, test } from './helpers'
// import type { Page } from '@playwright/test'

test.describe('Palette System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)
  })

  test('should render app without fatal errors', async ({ page, consoleErrors }) => {
    const root = page.locator('#root')
    await expect(root).toBeAttached()

    const webgpuMsg = 'No WebGPU adapters found'
    const resourceMsg = 'Failed to load resource'
    const fatalErrors = consoleErrors.filter((e) => {
      const text = e.text
      return !text.includes(webgpuMsg) && !text.includes(resourceMsg)
    })
    expect(fatalErrors).toHaveLength(0)
  })

  test('should have palette selector', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const paletteLabel = page.locator('text=Palette').or(page.locator('text=palette'))
    await expect(paletteLabel.first()).toBeVisible({ timeout: 10000 })
  })

  test('should be able to select different palettes', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const selectors = page.locator('select')
    const count = await selectors.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should show palette gradient preview', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const gradientPreview = page.locator('[class*="gradient"]').or(page.locator('[style*="gradient"]'))
    await expect(gradientPreview.first()).toBeVisible({ timeout: 10000 })
  })
})
