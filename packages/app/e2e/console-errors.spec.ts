/**
 * Playwright end-to-end tests for console error detection.
 *
 * These tests help catch runtime errors like:
 * - "Cannot read properties of undefined (reading 'x')"
 * - "Cannot destructure property 'width' of 'n(...)' as it is undefined"
 * - All other canvasSize() or worldToClip() undefined errors
 */
import { expect, test } from '@playwright/test'

test.describe('Console Error Detection', () => {
  test('should render app without console errors', async ({ page }) => {
    const errors: string[] = []

    // Capture all console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    // Navigate to app
    await page.goto('/')

    // Wait for app to load (up to 10 seconds)
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {})

    // Capture errors
    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    // Wait a bit for any delayed errors
    await page.waitForTimeout(1000)

    // Assert no console errors
    if (errors.length > 0) {
      console.error('Console errors found:', errors)
    }
    expect(errors).toEqual([])

    // Assert no page errors
    if (pageErrors.length > 0) {
      console.error('Page errors found:', pageErrors)
    }
    expect(pageErrors).toEqual([])
  })

  test('should render canvas without errors', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    // Wait for canvas to render
    await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => {})

    // Give rendering time to settle
    await page.waitForTimeout(2000)

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('should handle rapid interactions without errors', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    // Wait for initial render
    await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => {})

    // Rapid interactions that might trigger re-renders
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(100, 0)
      await page.waitForTimeout(100)
    }

    // Toggle sidebar
    await page.click('button:has-text("Load")')
    await page.waitForTimeout(500)
    await page.click('button:has-text("Load")')
    await page.waitForTimeout(500)

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('should handle quality preset changes without errors', async ({
    page,
  }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => {})

    // Change quality presets
    for (let i = 0; i < 5; i++) {
      const qualityButtons = await page.locator('button:has-text("Quality")')
      if ((await qualityButtons.count()) > 0) {
        await qualityButtons.click()
        await page.waitForTimeout(200)

        // Click a random quality pill
        const pills = await page
          .locator('.quality-pills-container button')
          .all()
        if (pills.length > 0) {
          await pills[0]!.click()
          await page.waitForTimeout(300)
        }
      }
    }

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('should handle slider interactions without errors', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => {})

    // Try to interact with sliders
    const sliders = await page.locator('input[type="range"]').all()
    for (let i = 0; i < Math.min(sliders.length, 3); i++) {
      await sliders[i]!.click()
      await page.mouse.move(0, 0)
      await page.mouse.wheel(0, 100)
      await page.waitForTimeout(100)
    }

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('should handle timeline interactions without errors', async ({
    page,
  }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => {})

    // Toggle timeline visibility
    const timelineToggle = page.locator('button:has-text("Timeline")')
    if (await timelineToggle.isVisible()) {
      await timelineToggle.click()
      await page.waitForTimeout(500)
      await timelineToggle.click()
      await page.waitForTimeout(500)
    }

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('should handle multiple rapid renders without errors', async ({
    page,
  }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')

    // Rapidly refresh page multiple times
    for (let i = 0; i < 3; i++) {
      await page.reload()
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => {})
      await page.waitForSelector('canvas', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(500)
    }

    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(1000)

    expect(errors).toEqual([])
    expect(pageErrors).toEqual([])
  })
})
