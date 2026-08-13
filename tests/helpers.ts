import { test as base } from '@playwright/test'
import type { ConsoleMessage, Page } from '@playwright/test'

export type ConsoleError = {
  type: string
  text: string
  location: { url: string; lineNumber: number; columnNumber: number }
  args: unknown[]
}

export async function dismissWelcomeIfPresent(page: Page, timeout = 2000) {
  // Hardware detection can delay the welcome screen in software-WebGPU CI.
  // Prefer its explicit action when it appears, then fall back to the backdrop.
  try {
    const startBtn = page
      .getByRole('button', { name: /^(Start|Enter)$/ })
      .first()
    const welcomeAppeared = await startBtn
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false)
    if (welcomeAppeared) {
      await startBtn.click()
      await page.waitForTimeout(500)
      return
    }

    const backdrop = page.locator('[class*="backdrop"]').first()
    if (await backdrop.isVisible({ timeout: 500 })) {
      await backdrop.click({ position: { x: 5, y: 5 } })
      await page.waitForTimeout(500)
    }
  } catch {
    // No welcome screen present
  }
}

export async function captureConsoleErrors(
  page: Page,
): Promise<ConsoleError[]> {
  const errors: ConsoleError[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const loc = msg.location()
      errors.push({
        type: msg.type(),
        text: msg.text(),
        location: {
          url: loc.url,
          lineNumber: loc.lineNumber,
          columnNumber: loc.columnNumber,
        },
        args: msg.args(),
      })
    }
  })
  page.on('pageerror', (err: Error) => {
    errors.push({
      type: 'pageerror',
      text: err.message,
      location: { url: '', lineNumber: 0, columnNumber: 0 },
      args: [],
    })
  })
  // Small delay to allow listeners to register
  await new Promise((resolve) => setTimeout(resolve, 0))
  return errors
}

export interface TestContext {
  page: Page
  consoleErrors: ConsoleError[]
}

/** Extended test fixture that captures console errors automatically */
export const test = base.extend<TestContext>({
  consoleErrors: async ({ page }, use) => {
    const errors: ConsoleError[] = []
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        const loc = msg.location()
        errors.push({
          type: 'error',
          text: msg.text(),
          location: {
            url: loc.url,
            lineNumber: loc.lineNumber,
            columnNumber: loc.columnNumber,
          },
          args: [],
        })
      }
    })
    page.on('pageerror', (err: Error) => {
      errors.push({
        type: 'pageerror',
        text: err.message,
        location: { url: '', lineNumber: 0, columnNumber: 0 },
        args: [],
      })
    })
    await use(errors)
  },
})

export { expect } from '@playwright/test'
