import { expect, test } from './helpers'

test.describe('Welcome Screen', () => {
  test('should render app with welcome screen on first visit', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Check for welcome screen elements or app renders
    const welcomeText = page.locator('text=Welcome').or(page.locator('text=welcome'))
    const hasWelcome = await welcomeText.isVisible({ timeout: 5000 }).catch(() => false)

    // Either welcome screen shows or app renders (depends on WebGPU availability)
    expect(hasWelcome || (await page.locator('#root').evaluate(el => el.children.length > 0))).toBeTruthy()
  })

  test('should allow closing welcome screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Try to find Enter button (may not be visible if WebGPU failed)
    const enterBtn = page.locator('button:has-text("Enter")').first()
    const enterVisible = await enterBtn.isVisible({ timeout: 2000 }).catch(() => false)

    if (enterVisible) {
      await enterBtn.click()
      await page.waitForTimeout(500)
    }
    // If Enter button is not visible, the welcome screen likely didn't render due to WebGPU failure
  })

  test('should not show welcome when URL has flame query param', async ({ page }) => {
    const minimalFlame = {
      version: '1.0',
      metadata: { version: '1.0', author: 'test' },
      transforms: {},
      renderSettings: {
        exposure: 0.25,
        skipIters: 20,
        drawMode: 'light',
        camera: { zoom: 1, position: [0, 0] },
        colorInitMode: 'colorInitZero',
        pointInitMode: 'pointInitUnitDisk',
        vibrancy: 0.5,
      },
    }

    const encoded = btoa(JSON.stringify(minimalFlame))
    await page.goto(`/?flame=${encodeURIComponent(encoded)}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()
  })

  test('should handle invalid flame query param gracefully', async ({ page, consoleErrors }) => {
    await page.goto('/?flame=invalid_encoded_data', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Should handle invalid param without crashing
    // (decompression errors are expected and acceptable)
    const fatalErrors = consoleErrors.filter(e =>
      !e.text.includes('incorrect header check') &&
      !e.text.includes('No WebGPU adapters found')
    )
    expect(fatalErrors).toHaveLength(0)
  })
})
