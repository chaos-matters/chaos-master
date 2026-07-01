import { expect, test } from './helpers'

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
    await expect(page).toHaveTitle(/Chaos Master/)
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
