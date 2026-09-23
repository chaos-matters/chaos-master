/**
 * Enter in the Randomizer's gallery modal, in the real app.
 *
 * Click a flame to select it, then Enter (or a second click) applies it. The
 * Enter used to be heard on the whole document, so with a flame selected it
 * also took the Enter of every focused control: a count chip, Re-roll or a
 * flame's own Mutate applied the selection and closed the gallery instead of
 * doing their own thing. It is the grid's alone now, and the click that
 * selects a flame puts the focus on it.
 *
 * Not a CI spec: the gallery renders WebGPU previews, which the software
 * adapter does not hold.
 */
import { dismissWelcomeIfPresent, expect, test } from './helpers'
import type { Page } from '@playwright/test'

async function openGallery(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissWelcomeIfPresent(page, 12_000)
  await page.getByRole('button', { name: /Flame Randomizer/ }).click()
  await page.getByRole('button', { name: 'Preview Gallery' }).click()
  await page.getByRole('button', { name: 'Advanced…' }).click()
  const gallery = page.locator('dialog[open]', { hasText: 'Flame Gallery' })
  await expect(gallery).toBeVisible()
  return gallery
}

test.describe('the randomizer gallery', () => {
  test('Enter applies the flame a click selected', async ({ page }) => {
    const gallery = await openGallery(page)
    const cell = gallery.locator('[title="Click to select"]').first()
    await cell.click()
    await expect(
      gallery.locator('[title^="Click again (or press Enter)"]'),
    ).toHaveCount(1)

    await page.keyboard.press('Enter')

    // Applying closes the gallery.
    await expect(gallery).toBeHidden()
  })

  test('Enter on a focused count chip is the chip’s, with a flame selected', async ({
    page,
  }) => {
    const gallery = await openGallery(page)
    await gallery.locator('[title="Click to select"]').first().click()
    const chip = gallery.getByRole('button', { name: '18', exact: true })
    await chip.focus()

    await page.keyboard.press('Enter')

    // The chip took it: 18 flames, and nothing applied.
    await expect(gallery).toBeVisible()
    await expect(chip).toHaveClass(/chipActive/)
    await expect(gallery.locator('[title="Click to select"]')).toHaveCount(18)
  })
})
