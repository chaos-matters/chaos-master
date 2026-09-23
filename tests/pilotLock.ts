/**
 * Driving the Arcade's screen lock from a spec, and reading what it covers.
 */
import { dismissWelcomeIfPresent, expect } from './helpers'
import type { Locator, Page } from '@playwright/test'

type Envelope = { content: { type: string; text: string }[]; isError?: boolean }

export async function callTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const envelope = await page.evaluate(
    async ([n, i]) => {
      const win = window as unknown as {
        webmcp: {
          execute: (name: string, input: unknown) => Promise<Envelope>
        }
      }
      return await win.webmcp.execute(n, i)
    },
    [name, input] as const,
  )
  return JSON.parse(envelope.content[0]!.text) as Record<string, unknown>
}

export async function openEditor(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissWelcomeIfPresent(page, 12_000)
  await page.waitForFunction(() => 'webmcp' in window, undefined, {
    timeout: 20_000,
  })
}

export const LOCK_NAME = 'The agent is driving the editor'
export const STOP_NAME = 'Stop the agent and keep what was recorded'

export async function startLock(page: Page): Promise<Locator> {
  expect(await callTool(page, 'arcade_start_cinema', {})).toMatchObject({
    ok: true,
  })
  // By attribute: a lock a modal left inert would have no role to find.
  const lock = page.locator(`[aria-label="${LOCK_NAME}"]`)
  await expect(lock).toBeVisible()
  return lock
}

/** What has the focus, by its accessible name or its tag. */
export async function focused(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    return el.getAttribute('aria-label') ?? el.tagName
  })
}

export async function isFocused(locator: Locator): Promise<boolean> {
  return await locator.evaluate((el) => el === document.activeElement)
}

/** The dialog drawn on top at a point (the viewport's centre by default), by
 *  its accessible name or id: what a click there would reach. When no dialog
 *  is, the element that is, for the failure message. */
export async function topDialogAt(
  page: Page,
  at?: { x: number; y: number },
): Promise<string | null> {
  return await page.evaluate((p) => {
    const x = p?.x ?? window.innerWidth / 2
    const y = p?.y ?? window.innerHeight / 2
    const el = document.elementFromPoint(x, y)
    const hit = el?.closest('dialog, [role="dialog"]')
    if (!hit) return el ? `(no dialog: ${el.tagName})` : null
    return hit.getAttribute('aria-label') ?? (hit.id || `(unnamed dialog)`)
  }, at)
}

export async function centreOf(locator: Locator) {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** A click where `locator` is drawn, reaching whatever is on top there. */
export async function clickOver(page: Page, locator: Locator) {
  const { x, y } = await centreOf(locator)
  await page.mouse.click(x, y)
}

/**
 * A modal `dialog` with a focused text `field` in it, open when the lock
 * starts: the lock goes over it, takes its keys, clicks and Escape, and when
 * the take and its end card are over, hands it back open, with its value and
 * the focus. Leaves it open and focused.
 */
export async function expectDialogHeldUnderLock(
  page: Page,
  dialog: Locator,
  field: Locator,
) {
  const before = await field.inputValue()
  await startLock(page)

  expect(await topDialogAt(page, await centreOf(field))).toBe(LOCK_NAME)
  expect(await focused(page)).toBe(LOCK_NAME)
  await page.keyboard.type('12')
  await clickOver(page, field)
  await page.keyboard.type('3')
  expect(await field.inputValue()).toBe(before)

  // Escape is the pilot's, twice, and never closes the dialog underneath.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: STOP_NAME })).toHaveText(
    /Esc again/,
  )
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  const card = page.getByRole('dialog', { name: /Stopped by you/ })
  await expect(card).toBeVisible()
  expect(await topDialogAt(page, await centreOf(field))).toMatch(
    /Stopped by you/,
  )
  await expect(dialog).toBeVisible()

  // The card goes first; the dialog is the viewer's again, field and all.
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
  await expect(dialog).toBeVisible()
  expect(await isFocused(field)).toBe(true)
  await page.keyboard.type('4')
  expect(await field.inputValue()).toBe(`${before}4`)
}
