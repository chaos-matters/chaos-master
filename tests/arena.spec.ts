import { dismissWelcomeIfPresent, expect, test } from './helpers'

// Needs real GPU output: under swiftshader the arena's fighter previews lose
// the device ("createBuffer failed ... mappedAtCreation") and the error
// boundary replaces the app, so this stays out of the CI project.
test.describe('Flame Clash Arena', () => {
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

    // Fighter names are no longer headings. Player 1 takes the loaded flame's
    // own name (Cyan Guardian only when it has none), so pin the fixed rival.
    await expect(page.getByText('Crimson Nemesis').first()).toBeVisible()

    // The button is named CLASH, not CLASH FLAMES: 0d264a2c moved it into
    // ArenaCenterStage as <Zap/><span>CLASH</span><Zap/>. Anchored, because a
    // bare /CLASH/i also matches 'READY TO CLASH' in ArenaTopBar.
    const clashBtn = page.getByRole('button', { name: /^CLASH$/i })
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
