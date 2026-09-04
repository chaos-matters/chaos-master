import { dismissWelcomeIfPresent, expect, test } from './helpers'

/**
 * CI-stable smoke suite.
 *
 * GitHub's hosted runners only provide flaky *software* WebGPU (swiftshader),
 * which intermittently throws errors such as
 * `OperationError: A valid external Instance reference no longer exists.`
 * mid-render. The full e2e suite (tests/*.spec.ts) depends on WebGPU-rendered
 * UI and on a clean console, so it can't run reliably there — it stays a
 * local/manual tool (see packages/app/TESTING.md).
 *
 * This spec is the curated subset that IS safe to run in CI: it verifies the
 * built bundle is served, boots, and mounts the app shell without a genuine
 * (non-GPU) JavaScript error. That still guards against the regressions unit
 * tests can't catch — build/bundle breakage, import errors, and top-level
 * render crashes — without asserting on the unreliable GPU layer.
 */

// Console-error substrings that are expected/benign in a headless,
// software-WebGPU CI environment and must not fail the smoke test. A real
// logic or bundle error (e.g. "TypeError: x is not a function") won't match
// any of these, so it still fails the suite.
const IGNORED_ERROR_PATTERNS = [
  /webgpu/i,
  /wgpu/i,
  /\bgpu\b/i,
  /adapter/i,
  /external instance/i, // "A valid external Instance reference no longer exists."
  /device.*lost/i,
  /failed to load resource/i,
  /solid-devtools/i,
]

test.describe('CI smoke', () => {
  test('serves the built app with the correct title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/Lumen Apeiron/)
  })

  test('mounts the app shell into #root', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // SolidJS mounts the shell regardless of WebGPU, so real content should
    // appear even when the GPU layer degrades.
    const childCount = await page.evaluate(() => {
      const el = document.getElementById('root')
      return el ? el.querySelectorAll('*').length : 0
    })
    expect(childCount).toBeGreaterThan(5)
  })

  /**
   * A development panel shipped to production for four months.
   *
   * `DebugOverlay` lost its `IS_DEV` gate in 53e1486 and rendered over the
   * top-left of the canvas on every visit — frame counter, camera numbers,
   * track list — with no way for a visitor to close it. This suite runs
   * against a production build, which is exactly the build that has to be
   * free of it.
   */
  test('ships no development overlay in the production build', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)
    await page.waitForTimeout(2000)
    await expect(page.getByText('ANIMATION DEBUG')).toHaveCount(0)
  })

  test('boots the isolated benchmark entry from a direct URL', async ({
    page,
  }) => {
    await page.goto('/benchmarks', { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('benchmarks-page')).toBeVisible({
      timeout: 12_000,
    })
  })

  test('opens the benchmark lab from the editor controls', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)

    const labLink = page.getByRole('link', { name: 'Open Benchmark Lab' })
    await expect(labLink).toBeVisible({ timeout: 12_000 })
    await expect(labLink).toHaveAttribute('href', '/benchmarks')

    await labLink.click()
    await expect(page).toHaveURL(/\/benchmarks$/)
    await expect(page.getByTestId('benchmarks-page')).toBeVisible({
      timeout: 12_000,
    })
  })

  test('leaves the Home gallery for the editor with Escape', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chaos-master-welcome-dismissed', 'true')
    })
    await page.route('**/api/gallery', async (route) => {
      await route.fulfill({ json: [] })
    })
    await page.goto('/#home', { waitUntil: 'domcontentloaded' })

    const backToEditor = page.getByRole('button', {
      name: 'Back to the editor',
    })
    await expect(backToEditor).toBeVisible({ timeout: 12_000 })

    // A nearer native dialog gets Escape first. Home's capture boundary must
    // shield the still-mounted editor without cancelling the browser's dialog
    // default action.
    await page.evaluate(() => {
      document.body.dataset.hiddenEscapeCount = '0'
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Escape') {
            document.body.dataset.hiddenEscapeCount = '1'
          }
        },
        { once: true },
      )

      const dialog = document.createElement('dialog')
      dialog.dataset.homeEscapeProbe = 'true'
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault()
        dialog.close()
        dialog.remove()
      })
      document.body.append(dialog)
      dialog.showModal()
    })

    await page.keyboard.press('Escape')

    await expect(page.locator('dialog[data-home-escape-probe]')).toHaveCount(0)
    await expect(backToEditor).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.hiddenEscapeCount))
      .toBe('0')

    await page.keyboard.press('Escape')

    await expect(backToEditor).toBeHidden()
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
  })

  test('centers benchmark header action labels', async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto('/benchmarks', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('benchmarks-page')).toBeVisible({
        timeout: 12_000,
      })

      for (const label of ['Run classic score', 'Back to editor']) {
        const centerOffset = await page
          .getByLabel(label, { exact: true })
          .evaluate((control) => {
            const controlBox = control.getBoundingClientRect()
            const visibleLabel = [...control.querySelectorAll('span')].find(
              (span) => globalThis.getComputedStyle(span).display !== 'none',
            )
            if (!visibleLabel) return Number.POSITIVE_INFINITY
            const labelBox = visibleLabel.getBoundingClientRect()
            return (
              labelBox.top +
              labelBox.height / 2 -
              (controlBox.top + controlBox.height / 2)
            )
          })
        expect(Math.abs(centerOffset)).toBeLessThanOrEqual(1)
      }
    }
  })

  test('boots without a non-WebGPU fatal error', async ({
    page,
    consoleErrors,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    await expect(page.locator('#root')).toBeAttached()

    const fatal = consoleErrors.filter(
      (e) => !IGNORED_ERROR_PATTERNS.some((re) => re.test(e.text)),
    )
    expect(fatal).toEqual([])
  })
})
