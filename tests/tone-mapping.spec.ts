import { dismissWelcomeIfPresent, expect, test } from './helpers'

test.describe('Tone Mapping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    await dismissWelcomeIfPresent(page)
  })

  test('should render flame without fatal errors', async ({ page, consoleErrors }) => {
    const root = page.locator('#root')
    await expect(root).toBeAttached()

    const fatalErrors = consoleErrors.filter(e =>
      !e.text.includes('No WebGPU adapters found') &&
      !e.text.includes('Failed to load resource')
    )
    expect(fatalErrors).toHaveLength(0)
  })

  test('should have vibrancy control for tone mapping', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const vibrancyLabel = page.locator('text=Vibrancy')
    await expect(vibrancyLabel).toBeVisible({ timeout: 10000 })

    const vibrancySlider = vibrancyLabel.locator('..').locator('input[type="range"]').first()
    await expect(vibrancySlider).toBeVisible()
  })

  test('should have exposure control for brightness mapping', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const exposureLabel = page.locator('text=Exposure')
    await expect(exposureLabel).toBeVisible({ timeout: 10000 })

    const exposureSlider = exposureLabel.locator('..').locator('input[type="range"]').first()
    await expect(exposureSlider).toBeVisible()
  })

  test('should handle different draw modes for tone mapping', async ({ page }) => {
    const webgpuError = page.locator('text=WebGPU').first()
    const webgpuShown = await webgpuError.isVisible({ timeout: 500 }).catch(() => false)
    if (webgpuShown) return

    await dismissWelcomeIfPresent(page)
    const drawModeLabel = page.locator('text=Draw Mode')
    await expect(drawModeLabel).toBeVisible({ timeout: 10000 })

    const select = drawModeLabel.locator('..').locator('select').first()
    await expect(select).toBeVisible()

    const options = await select.locator('option').allTextContents()
    expect(options.length).toBeGreaterThan(0)
  })

  test('should not log WebGPU pipeline errors', async ({ page, consoleErrors }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Only WebGPU adapter errors are expected in headless
    const webgpuPipelineErrors = consoleErrors.filter(e =>
      e.text.includes('webgpu') ||
      e.text.includes('wgpu') ||
      e.text.includes('buffer') ||
      e.text.includes('storage')
    )
    const realWebgpuErrors = webgpuPipelineErrors.filter(e =>
      !e.text.includes('No WebGPU adapters found')
    )
    expect(realWebgpuErrors).toHaveLength(0)
  })
})
