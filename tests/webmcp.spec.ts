import { dismissWelcomeIfPresent, expect, test } from './helpers'

test.describe('WebMCP & Evolutionary Art Director UI', () => {
  test('registers webmcp on window and opens Art Director overlay on executeTool', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    // Verify window.webmcp exists
    const hasWebMcp = await page.evaluate(() => {
      const win = window as unknown as {
        webmcp?: {
          executeTool: (name: string, input: unknown) => Promise<unknown>
          execute: (name: string, input: unknown) => Promise<unknown>
        }
      }
      return typeof win.webmcp !== 'undefined'
    })
    expect(hasWebMcp).toBe(true)

    // Execute open_art_director via window.webmcp
    const result = await page.evaluate(async () => {
      const win = window as unknown as {
        webmcp?: {
          executeTool: (name: string, input: unknown) => Promise<unknown>
        }
      }
      return await win.webmcp?.executeTool('open_art_director', {
        generation: 1,
        candidates: [
          { fitness: 0.85, flame: { transforms: {}, renderSettings: {} } },
          { fitness: 0.92, flame: { transforms: {}, renderSettings: {} } },
        ],
      })
    })

    expect(result).toEqual({
      success: true,
      message: 'Art Director UI opened.',
    })

    // Verify the Art Director overlay is visible
    const directorHeader = page.getByRole('heading', { name: 'Art Director' })
    await expect(directorHeader).toBeVisible({ timeout: 5000 })

    // Verify generation number and candidates are displayed
    await expect(page.getByText('Generation')).toBeVisible()
    await expect(page.getByText('Flame 1')).toBeVisible()
    await expect(page.getByText('Flame 2')).toBeVisible()
    await expect(page.getByText('85%')).toBeVisible()
    await expect(page.getByText('92%')).toBeVisible()

    // Test candidate selection
    const selectBtn = page.getByRole('button', { name: 'Select' }).first()
    await selectBtn.click()

    // Test close button
    const closeBtn = page.getByRole('button', { name: 'Close' })
    await closeBtn.click()
    await expect(directorHeader).toBeHidden()
  })

  test('executes open_art_director using execute alias', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    const result = await page.evaluate(async () => {
      const win = window as unknown as {
        webmcp?: {
          execute: (name: string, input: unknown) => Promise<unknown>
        }
      }
      return await win.webmcp?.execute('open_art_director', {
        generation: 2,
        candidates: [{ fitness: 0.99, flame: {} }],
      })
    })

    expect(result).toEqual({
      success: true,
      message: 'Art Director UI opened.',
    })

    const directorHeader = page.getByRole('heading', { name: 'Art Director' })
    await expect(directorHeader).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('99%')).toBeVisible()
  })
})
