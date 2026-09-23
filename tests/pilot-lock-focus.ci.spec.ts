/**
 * The keyboard under the Arcade's screen lock, in the real app.
 *
 * A control the viewer focused before the agent took the screen used to keep
 * its focus: the shield took the pointer, but a slider still took its arrows,
 * a field its typing and a button its Space and Enter, each of them editing
 * the take being made. Under the lock the page behind the overlay is inert,
 * focus sits in the overlay, and it comes back to the viewer's control once
 * the lock and its end card are gone.
 *
 * The page behind is inert because the lock is a modal dialog, the newest
 * one, in the browser's top layer. So a dialog the viewer had open is under
 * it too, and theirs again afterwards; one opened during the take goes under
 * it; and nothing added to the page mid-take takes the focus or a click.
 *
 * And F with a modifier is the browser's: Ctrl+F is find. A headless browser
 * draws no find bar, so what this checks is the part the page controls: the
 * app does not prevent the key and does not toggle the sidebar on it.
 */
import { expect, test } from './helpers'
import { centreOf, clickOver, expectDialogHeldUnderLock, focused, isFocused, LOCK_NAME, openEditor, startLock, STOP_NAME, topDialogAt, } from './pilotLock'
import type { Page } from '@playwright/test'

test.describe('the screen lock', () => {
  test('a slider focused before it takes no key, and gets its focus back after', async ({
    page,
  }) => {
    await openEditor(page)
    const slider = page.locator('input[type="range"]:visible').first()
    await expect(slider).toBeVisible()
    await slider.focus()
    const before = await slider.inputValue()

    await startLock(page)

    // Focus left the page for the overlay, which covers the page.
    expect(await focused(page)).toBe(LOCK_NAME)
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    expect(await slider.inputValue()).toBe(before)
    // Nor can it take the focus back while the lock is on.
    await slider.evaluate((el) => {
      ;(el as HTMLElement).focus()
    })
    expect(await isFocused(slider)).toBe(false)

    // The theme toggle stays the viewer's (maff's call).
    const theme = await page.evaluate(() => document.body.dataset.theme)
    await page.keyboard.press('Control+d')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.theme))
      .not.toBe(theme)
    await page.keyboard.press('Control+d')
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.theme))
      .toBe(theme)

    // The overlay's own controls work from the keyboard: Tab reaches Stop,
    // and Enter on it ends the take.
    await page.keyboard.press('Tab')
    expect(await focused(page)).toBe(STOP_NAME)
    await page.keyboard.press('Enter')
    const card = page.getByRole('dialog', { name: /Stopped by you/ })
    await expect(card).toBeVisible()

    // The end card takes over the lock's place and its focus. Polled: the
    // theme's view transition hit-tests as the page root while it runs.
    await expect.poll(() => topDialogAt(page)).toMatch(/Stopped by you/)
    expect(await isFocused(card)).toBe(true)

    // Dismissed, it gives the viewer their slider back, keys and all.
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
    expect(await isFocused(slider)).toBe(true)
    await page.keyboard.press('ArrowRight')
    expect(await slider.inputValue()).not.toBe(before)
  })

  test('a field and a button focused before it take nothing either', async ({
    page,
  }) => {
    await openEditor(page)
    const field = page.locator('input[type="number"]:visible').first()
    await expect(field).toBeVisible()
    const fieldBefore = await field.inputValue()
    // By attribute, not by role: an inert control leaves the accessibility
    // tree, so a role query cannot find it while the lock is on.
    const toggle = page
      .locator('button[title^="Breeding features"][aria-expanded]')
      .first()
    await expect(toggle).toBeVisible()
    const expanded = await toggle.getAttribute('aria-expanded')

    await field.focus()
    await startLock(page)
    await page.keyboard.type('7')
    expect(await field.inputValue()).toBe(fieldBefore)
    await page.getByRole('button', { name: STOP_NAME }).click()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeHidden()
    expect(await isFocused(field)).toBe(true)

    await toggle.focus()
    await startLock(page)
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')
    expect(await toggle.getAttribute('aria-expanded')).toBe(expanded)
    // Still locked: neither key reached Stop, which only a focused Stop gets.
    await expect(page.getByRole('dialog', { name: LOCK_NAME })).toBeVisible()
  })
})

test.describe('dialogs under the screen lock', () => {
  test('a dialog open before it is covered, then handed back as it was', async ({
    page,
  }) => {
    await openEditor(page)
    // Built the way the app's own are (components/Modal): a modal dialog a
    // close request closes, in a portal. The app's that hold a text field
    // mount a WebGPU root, which the software adapter does not hold
    // (pilot-lock-export.spec.ts runs this on the export dialog, on a GPU).
    await page.evaluate(() => {
      const portal = document.createElement('div')
      const dialog = document.createElement('dialog')
      dialog.id = 'viewer-dialog'
      dialog.innerHTML = '<input id="viewer-field" value="kept">'
      dialog.addEventListener('cancel', (ev) => {
        ev.preventDefault()
        dialog.close()
      })
      portal.append(dialog)
      document.body.append(portal)
      dialog.showModal()
      document.getElementById('viewer-field')!.focus()
    })
    const dialog = page.locator('#viewer-dialog')
    const field = page.locator('#viewer-field')
    await field.press('End')

    await expectDialogHeldUnderLock(page, dialog, field)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('a dialog opened during the take goes under it', async ({ page }) => {
    await openEditor(page)
    await startLock(page)

    await page.evaluate(() => {
      const late = document.createElement('dialog')
      late.id = 'late-dialog'
      late.innerHTML = '<input id="late-field">'
      document.body.append(late)
      late.showModal()
      document.getElementById('late-field')!.focus()
    })
    const lateField = page.locator('#late-field')

    await expect
      .poll(async () => topDialogAt(page, await centreOf(lateField)))
      .toBe(LOCK_NAME)
    expect(await focused(page)).toBe(LOCK_NAME)
    await page.keyboard.type('late')
    expect(await lateField.inputValue()).toBe('')

    // Still open when the take ends, and on top once the card is gone.
    await page.getByRole('button', { name: STOP_NAME }).click()
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeHidden()
    expect(await topDialogAt(page, await centreOf(lateField))).toBe(
      'late-dialog',
    )
  })

  test('nothing added to the page mid-take takes a click or the focus', async ({
    page,
  }) => {
    await openEditor(page)
    await startLock(page)

    // A portal as a panel or a toast would add it, stacked as high as CSS goes.
    await page.evaluate(() => {
      const late = document.createElement('button')
      late.id = 'late-button'
      late.textContent = 'Late'
      late.style.cssText =
        'position:fixed;left:40px;top:300px;z-index:2147483647'
      late.onclick = () => {
        late.dataset.clicked = 'yes'
      }
      document.body.append(late)
      late.focus()
    })
    const late = page.locator('#late-button')

    expect(await focused(page)).toBe(LOCK_NAME)
    await clickOver(page, late)
    expect(await late.getAttribute('data-clicked')).toBeNull()
    await page.keyboard.press('Enter')
    expect(await late.getAttribute('data-clicked')).toBeNull()
  })
})

test.describe('the sidebar key', () => {
  /** Whether the app claimed the last F: seen by a listener the app's own
   *  run before, unless one of them stopped it. */
  async function watchF(page: Page) {
    await page.evaluate(() => {
      const win = window as unknown as { lastF?: { prevented: boolean } }
      window.addEventListener('keydown', (ev) => {
        if (ev.code === 'KeyF') win.lastF = { prevented: ev.defaultPrevented }
      })
    })
  }

  async function lastF(page: Page) {
    return await page.evaluate(() => {
      const win = window as unknown as { lastF?: { prevented: boolean } }
      const seen = win.lastF
      win.lastF = undefined
      return seen ?? 'stopped'
    })
  }

  const sidebarHidden = async (page: Page) =>
    await page
      .locator('[data-tour-target="canvas"]')
      .evaluate((el) =>
        Array.from(el.classList).some((name) => name.includes('fullscreen')),
      )

  test('Ctrl+F is left to the browser and toggles nothing; F still toggles', async ({
    page,
  }) => {
    await openEditor(page)
    await watchF(page)
    const hidden = await sidebarHidden(page)

    await page.keyboard.press('Control+f')
    expect(await lastF(page)).toEqual({ prevented: false })
    expect(await sidebarHidden(page)).toBe(hidden)

    await page.keyboard.press('f')
    // Claimed: the app stops it before this listener.
    expect(await lastF(page)).toBe('stopped')
    await expect.poll(() => sidebarHidden(page)).toBe(!hidden)
  })
})
