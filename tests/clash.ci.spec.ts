import { expect, test } from './helpers'

/**
 * The Flame Clash preview at /clash: its own entry, apart from the editor.
 *
 * These hold on the software adapter because they read only the page around
 * the canvas (the fighters, the buttons, the picker and the URL), never the
 * pixels of the fight itself.
 */

// Errors a software WebGPU adapter raises in CI (see smoke.ci.spec.ts).
const IGNORED_ERROR_PATTERNS = [
  /webgpu/i,
  /wgpu/i,
  /\bgpu\b/i,
  /adapter/i,
  /external instance/i,
  /device.*lost/i,
  /failed to load resource/i,
  /solid-devtools/i,
]

test.describe('Flame Clash preview', () => {
  test('boots from a direct URL without the editor', async ({
    page,
    consoleErrors,
  }) => {
    await page.goto('/clash', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Flame Clash', { exact: false })).toBeVisible({
      timeout: 12_000,
    })
    await expect(page.getByText('Preview', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Fighters' }).getByRole('listitem'),
    ).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()

    // The editor's workspace pill never mounts here.
    await expect(
      page.getByRole('button', { name: /^Lumen Apeiron v\S+ menu$/ }),
    ).toHaveCount(0)

    const fatal = consoleErrors.filter(
      (e) => !IGNORED_ERROR_PATTERNS.some((re) => re.test(e.text)),
    )
    expect(fatal).toEqual([])
  })

  test('toggles reduced motion from its button', async ({ page }) => {
    await page.goto('/clash', { waitUntil: 'domcontentloaded' })
    const reduce = page.getByRole('button', { name: 'Reduce motion' })
    await expect(reduce).toHaveAttribute('aria-pressed', 'false', {
      timeout: 12_000,
    })
    await reduce.click()
    await expect(reduce).toHaveAttribute('aria-pressed', 'true')
  })

  test('picks new fighters and names them in the URL', async ({ page }) => {
    await page.goto('/clash', { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('button', { name: 'Change fighters' })
      .click({ timeout: 12_000 })

    const picker = page.getByRole('form', { name: 'Choose the fighters' })
    await expect(picker).toBeVisible()
    await picker.getByLabel('Fighter B').selectOption('example:example1')
    await picker.getByRole('button', { name: 'Fight' }).click()

    await expect(picker).toBeHidden()
    await expect(page).toHaveURL(/[?&]b=example%3Aexample1(&|$)/)
  })

  test('explains a fighter it cannot load and offers the picker', async ({
    page,
  }) => {
    await page.goto('/clash?a=example:noSuchFlame', {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByText('Fighter A could not be loaded.')).toBeVisible({
      timeout: 12_000,
    })
    await expect(
      page.getByRole('form', { name: 'Choose the fighters' }),
    ).toBeVisible()
  })
})
