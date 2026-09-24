/**
 * Leaving or reloading the page while an agent's take records.
 *
 * A reload, closing the tab, or a jump from the browser's long-press history
 * menu to another page ends the take and loses its recording. While a take
 * records (a lesson, a Cinema take or a duel), the page asks first: the
 * browser's own "Leave site?" prompt. It asks at no other time. Chrome shows
 * the prompt only once the page has had a user gesture, so each case presses
 * a key first, as a viewer would have clicked or typed.
 *
 * A jump from the history menu to an entry of this same page fires popstate,
 * not beforeunload. Under the screen lock the history hold
 * (lib/historyHold.ts) answers it, and the take records on.
 */
import { expect, test } from './helpers'
import { callTool, LOCK_NAME, openEditor, startLock, STOP_NAME, topDialogAt, } from './pilotLock'
import type { Page } from '@playwright/test'

/** Every dialog the page raises from here on, dismissed, by type. */
function collectDialogs(page: Page): string[] {
  const seen: string[] = []
  page.on('dialog', (dialog) => {
    seen.push(dialog.type())
    void dialog.dismiss()
  })
  return seen
}

/** The user gesture Chrome wants before it shows a beforeunload prompt. */
async function gesture(page: Page) {
  await page.keyboard.press('Shift')
}

/** Reload, and let a dismissed prompt keep the page where it is. */
async function tryReload(page: Page) {
  await page.reload({ timeout: 3_000 }).catch(() => undefined)
}

const phase = async (page: Page) =>
  (await callTool(page, 'arcade_status', {})).phase

test.describe('while an agent’s take records', () => {
  test('a reload asks first, and the take records on when it is refused', async ({
    page,
  }) => {
    await openEditor(page)
    await gesture(page)
    await startLock(page)
    const dialogs = collectDialogs(page)

    await tryReload(page)

    expect(dialogs).toEqual(['beforeunload'])
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
    expect(await phase(page)).toBe('driving')
  })

  test('a reload during a duel asks first', async ({ page }) => {
    await openEditor(page)
    await gesture(page)
    expect(
      await callTool(page, 'arcade_start_duel', { durationSeconds: 60 }),
    ).toMatchObject({ ok: true })
    const dialogs = collectDialogs(page)
    await page.evaluate(() => {
      ;(window as unknown as { beforeReload: boolean }).beforeReload = true
    })

    await tryReload(page)

    expect(dialogs).toEqual(['beforeunload'])
    // Refused, so this is still the page the duel runs in.
    expect(
      await page.evaluate(
        () => (window as unknown as { beforeReload?: boolean }).beforeReload,
      ),
    ).toBe(true)
  })

  test('a history jump within the page leaves the take recording', async ({
    page,
  }) => {
    await openEditor(page)
    await page.evaluate(() => {
      window.history.replaceState(window.history.state, '', '#home')
      window.location.hash = '#arcade'
      window.location.hash = ''
    })
    await startLock(page)
    const dialogs = collectDialogs(page)

    // What the long-press history menu does: several entries at once, past
    // the hold's guard, to an entry of this same document.
    await page.evaluate(() => {
      window.history.go(-3)
    })
    await page.waitForTimeout(300)

    expect(dialogs).toEqual([])
    expect(new URL(page.url()).pathname).toBe('/')
    expect(await page.evaluate(() => window.location.hash)).toBe('')
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
    expect(await phase(page)).toBe('driving')
  })
})

test.describe('outside a take', () => {
  test('a reload asks nothing, before a take or after one', async ({
    page,
  }) => {
    await openEditor(page)
    await gesture(page)
    const dialogs = collectDialogs(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(dialogs).toEqual([])

    await openEditor(page)
    await gesture(page)
    await startLock(page)
    await page.getByRole('button', { name: STOP_NAME }).click()
    const card = page.getByRole('dialog', { name: /Stopped by you/ })
    await expect(card).toBeVisible()
    // The take is over and saved: the end card is no reason to ask.
    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(dialogs).toEqual([])
  })
})
