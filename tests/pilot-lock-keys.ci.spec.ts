/**
 * Keys and back under the Arcade's screen lock, in the real app.
 *
 * The lock took the pointer and the focus, but a key still reached every
 * window and document listener that did not ask whether the pilot owned the
 * keyboard: the debug panel's Ctrl+M, a gallery's or a modal's Delete and
 * Enter. Under the lock no key gets past the shield; the pilot's Esc-twice
 * still works, Home opened behind it or not, and every key is the page's again
 * once the take and its end card are over.
 *
 * Back on the web is a close request on the top dialog (Android's back
 * gesture, or Escape): the shield refuses it and the take runs on, and the
 * end card treats it as Escape. The native back button goes through the
 * app's back registry instead, which the unit tests cover (LockShield.test).
 */
import { expect, test } from './helpers'
import { callTool, LOCK_NAME, openEditor, startLock, STOP_NAME, topDialogAt, } from './pilotLock'
import type { Page } from '@playwright/test'

/** Listen the way the app's own window and document listeners do. */
async function listenLikeTheApp(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as { heard: string[] }
    win.heard = []
    for (const [where, target] of [
      ['window', window],
      ['document', document],
    ] as const) {
      for (const type of ['keydown', 'keyup']) {
        target.addEventListener(type, (ev) => {
          win.heard.push(`${where} ${type} ${(ev as KeyboardEvent).key}`)
        })
      }
    }
  })
}

/** What those listeners heard since the last call. */
async function heard(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const win = window as unknown as { heard: string[] }
    return win.heard.splice(0)
  })
}

/** The debug panel Ctrl+M toggles (components/Debug), hidden in a build. */
const debugPanel = (page: Page) =>
  page.locator('button[title="Expand stats"], button[title="Collapse stats"]')

// Tab moves the focus to Stop, and Escape is the pilot's: both are the
// shield's own keys and are checked on their own.
const KEYS = ['Delete', 'Backspace', 'Enter', 'Space', 'q', 'ArrowLeft']

async function endTake(page: Page) {
  await page.getByRole('button', { name: STOP_NAME }).click()
  const card = page.getByRole('dialog', { name: /Stopped by you/ })
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toBeHidden()
}

test.describe('keys under the screen lock', () => {
  test('reach no listener of the page, and reach them all again after', async ({
    page,
  }) => {
    await openEditor(page)
    await expect(debugPanel(page)).toBeHidden()
    await listenLikeTheApp(page)
    await startLock(page)

    for (const key of KEYS) await page.keyboard.press(key)
    await page.keyboard.press('Control+m')
    expect(await heard(page)).toEqual([])
    await expect(debugPanel(page)).toBeHidden()
    // Still locked: none of them reached Stop.
    expect(await topDialogAt(page)).toBe(LOCK_NAME)

    await endTake(page)
    await heard(page)
    await page.keyboard.press('Delete')
    await page.keyboard.press('q')
    expect(await heard(page)).toEqual([
      'document keydown Delete',
      'window keydown Delete',
      'document keyup Delete',
      'window keyup Delete',
      'document keydown q',
      'window keydown q',
      'document keyup q',
      'window keyup q',
    ])
    await page.keyboard.press('Control+m')
    await expect(debugPanel(page)).toBeVisible()
    await page.keyboard.press('Control+m')
    await expect(debugPanel(page)).toBeHidden()
  })

  test('Escape twice ends the take with Home opened behind it', async ({
    page,
  }) => {
    await openEditor(page)
    await startLock(page)
    // A take starts in the editor, but the address bar can still open Home
    // under it, and Home claims Escape in the capture phase too, whatever
    // steps the agent takes after.
    await page.evaluate(() => {
      window.location.hash = '#home'
    })
    await expect(page.locator('[class^="_home_"]')).toBeAttached()
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'flame.setExposure',
        args: [0.3],
      }),
    ).toMatchObject({ success: true })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: STOP_NAME })).toHaveText(
      /Esc again/,
    )
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeVisible()
    // The keys that ended the take did not also leave Home.
    expect(await page.evaluate(() => window.location.hash)).toBe('#home')
  })
})

test.describe('a close request under the screen lock', () => {
  test('is refused by the shield, and the take runs on', async ({ page }) => {
    await openEditor(page)
    const lock = await startLock(page)
    // A key first, so the browser lets the page cancel the request.
    await page.keyboard.press('Shift')

    await lock.evaluate((el) => {
      ;(el as HTMLDialogElement).requestClose()
    })

    await expect(lock).toBeVisible()
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toHaveCount(0)
    await expect(page.getByRole('button', { name: STOP_NAME })).toBeVisible()
  })

  test('dismisses the end card, as Escape does', async ({ page }) => {
    await openEditor(page)
    await startLock(page)
    await page.getByRole('button', { name: STOP_NAME }).click()
    const card = page.getByRole('dialog', { name: /Stopped by you/ })
    await expect(card).toBeVisible()

    await card.evaluate((el) => {
      ;(el as HTMLDialogElement).requestClose()
    })

    await expect(card).toBeHidden()
  })
})
