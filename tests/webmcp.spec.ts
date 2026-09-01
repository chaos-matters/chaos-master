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
    await expect(page.getByText('Gen 1')).toBeVisible()
    await expect(page.getByText('85%')).toBeVisible()
    await expect(page.getByText('92%')).toBeVisible()

    // Test candidate rating with stars
    const starBtn = page.getByRole('button', { name: 'Rate 4 stars' }).first()
    await starBtn.click()

    // Test candidate selection
    const loadBtn = page.getByRole('button', { name: 'Load Candidate' }).first()
    await loadBtn.click()

    // Test close button
    const closeBtn = page.getByRole('button', { name: 'Close Art Director' })
    await closeBtn.click()
    await expect(directorHeader).toBeHidden()
  })

  test('opens Art Director from toolbar Genetics menu and populates candidates', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    // Open Genetics menu
    const geneticsBtn = page.getByRole('button', { name: 'Genetics' })
    await geneticsBtn.click()

    // Click Art Director menu item
    const artDirectorItem = page.getByRole('menuitem', {
      name: /Art Director/i,
    })
    await artDirectorItem.click()

    // Verify Art Director overlay opens
    const directorHeader = page.getByRole('heading', { name: 'Art Director' })
    await expect(directorHeader).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Candidates (4)')).toBeVisible()

    // Verify close
    const closeBtn = page.getByRole('button', { name: 'Close Art Director' })
    await closeBtn.click()
    await expect(directorHeader).toBeHidden()
  })

  test('opens Flame Clash Arena and executes clash battle simulation', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    // Open Flame Clash Arena via Genetics menu
    const geneticsBtn = page.getByRole('button', { name: 'Genetics' })
    await geneticsBtn.click()

    const clashItem = page.getByRole('menuitem', { name: /Flame Clash/i })
    await clashItem.click()

    // Verify Arena overlay opens
    const arenaTitle = page.getByRole('heading', { name: 'Flame Clash Arena' })
    await expect(arenaTitle).toBeVisible({ timeout: 5000 })

    // Verify Player 1 and Player 2 stat cards
    await expect(
      page.getByRole('heading', { name: 'Cyan Guardian' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Crimson Nemesis' }),
    ).toBeVisible()

    // Click Clash Flames button
    const clashBtn = page.getByRole('button', { name: /CLASH FLAMES/i })
    await expect(clashBtn).toBeVisible()
    await clashBtn.click()

    // Verify victor badge appears after clash calculation
    const victorBadge = page.getByText('VICTOR').first()
    await expect(victorBadge).toBeVisible({ timeout: 5000 })

    // Exit arena
    const exitBtn = page.getByRole('button', { name: 'Exit Arena' })
    await exitBtn.click()
    await expect(arenaTitle).toBeHidden()
  })
})
