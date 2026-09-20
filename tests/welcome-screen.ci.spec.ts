import { dismissWelcomeIfPresent, expect, test } from './helpers'
import type { Page } from '@playwright/test'

/** The welcome screen's primary action, as dismissWelcomeIfPresent finds it. */
const welcomeAction = (page: Page) =>
  page.getByRole('button', { name: /^(Start|Enter)$/ }).first()

test.describe('Welcome Screen', () => {
  test('should render app with welcome screen on first visit', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // First visit, nothing dismissed: the welcome screen has to show. This
    // used to accept "welcome shows OR #root has children", which any render
    // satisfies.
    await expect(welcomeAction(page)).toBeVisible({ timeout: 15_000 })
  })

  test('should allow closing welcome screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Used to click Enter only if it happened to be visible, then assert
    // nothing: green whether or not the welcome screen closes.
    const action = welcomeAction(page)
    await expect(action).toBeVisible({ timeout: 15_000 })
    await action.click()
    await expect(action).toBeHidden()
  })

  test('should not show welcome when URL has flame query param', async ({
    page,
  }) => {
    // A genuine share link, made by the app itself. The hand-built payload this
    // test used before failed validation, so the welcome screen showed, and the
    // test (which only checked that #root existed) never noticed.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)
    const encoded = await page.evaluate(async () => {
      const win = window as unknown as {
        webmcp: {
          executeTool: (
            name: string,
            input: unknown,
          ) => Promise<{ content: { text: string }[] }>
        }
      }
      const res = await win.webmcp.executeTool('create_share_link', {})
      return (JSON.parse(res.content[0]!.text) as { encoded: string }).encoded
    })
    expect(encoded.length).toBeGreaterThan(100)

    // Forget the dismissal, so only the link can keep the welcome screen away.
    await page.evaluate(() => {
      localStorage.clear()
    })
    await page.goto(`/?flame=${encodeURIComponent(encoded)}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    // The first test shows the welcome screen appears within this window on a
    // plain visit, so its absence here means something.
    await expect(welcomeAction(page)).toHaveCount(0)
  })

  test('should handle invalid flame query param gracefully', async ({
    page,
    consoleErrors,
  }) => {
    await page.goto('/?flame=invalid_encoded_data', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    const root = page.locator('#root')
    await expect(root).toBeAttached()

    // Should handle invalid param without crashing
    // (decompression errors are expected and acceptable)
    const fatalErrors = consoleErrors.filter(
      (e) =>
        !e.text.includes('incorrect header check') &&
        !e.text.includes('No WebGPU adapters found'),
    )
    expect(fatalErrors).toHaveLength(0)
  })
})
