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
 * The shield stops a key on its way up, so a capture listener above it heard
 * every key anyway: the camera's, on window, panned under the lock (#110).
 * The key gate (arcade/lockKeyGate.ts), the first key listener the app adds,
 * swallows every key under the lock before any other listener, capture or
 * not, and leaves the pilot's Esc-twice, the theme chord and the Stop
 * button's own keys working.
 *
 * Back on the web is a close request on the top dialog (Android's back
 * gesture, or Escape): the shield refuses it and the take runs on, and the
 * end card treats it as Escape. The native back button goes through the
 * app's back registry instead, which the unit tests cover (LockShield.test).
 */
import { expect, test } from './helpers'
import { callTool, focused, LOCK_NAME, openEditor, startLock, STOP_NAME, topDialogAt, } from './pilotLock'
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

/** Listen in the capture phase, the way the camera and Home do. */
async function listenInCapture(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as { heard: string[] }
    win.heard = []
    for (const [where, target] of [
      ['window', window],
      ['document', document],
    ] as const) {
      for (const type of ['keydown', 'keyup', 'keypress']) {
        target.addEventListener(
          type,
          (ev) => {
            win.heard.push(
              `${where} capture ${type} ${(ev as KeyboardEvent).key}`,
            )
          },
          true,
        )
      }
    }
  })
}

/**
 * Before the app loads, wrap every key listener it adds to window or
 * document, so a spec can tell which of them ran, by the order they were
 * added in.
 */
async function recordAppKeyListeners(page: Page) {
  await page.addInitScript(() => {
    type Listener = EventListenerOrEventListenerObject
    const record = { added: [] as string[], ran: [] as number[] }
    ;(window as unknown as { keyListeners: typeof record }).keyListeners =
      record
    const wrappers = new WeakMap<object, Map<string, EventListener>>()
    const slot = (target: EventTarget, type: string, capture: boolean) =>
      `${target === window ? 'window' : 'document'} ${type} ${capture ? 'capture' : 'bubble'}`
    const isCapture = (options?: boolean | EventListenerOptions) =>
      typeof options === 'boolean' ? options : options?.capture === true
    // The originals, called below with `.call` on the right target.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const add = EventTarget.prototype.addEventListener
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const remove = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (
      type: string,
      listener: Listener | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (
        listener === null ||
        (this !== window && this !== document) ||
        !type.startsWith('key')
      ) {
        add.call(this, type, listener, options)
        return
      }
      const key = slot(this, type, isCapture(options))
      const byKey = wrappers.get(listener) ?? new Map<string, EventListener>()
      wrappers.set(listener, byKey)
      if (byKey.has(key)) return
      const index = record.added.push(key) - 1
      const wrapper: EventListener = function (this: unknown, ev) {
        record.ran.push(index)
        if (typeof listener === 'function') listener.call(this, ev)
        else listener.handleEvent(ev)
      }
      byKey.set(key, wrapper)
      add.call(this, type, wrapper, options)
    }
    EventTarget.prototype.removeEventListener = function (
      type: string,
      listener: Listener | null,
      options?: boolean | EventListenerOptions,
    ) {
      const wrapper =
        listener === null
          ? undefined
          : wrappers.get(listener)?.get(slot(this, type, isCapture(options)))
      if (wrapper)
        wrappers.get(listener!)?.delete(slot(this, type, isCapture(options)))
      remove.call(this, type, wrapper ?? listener, options)
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

test.describe('the key gate under the screen lock', () => {
  test('capture listeners on window and document hear no key', async ({
    page,
  }) => {
    await openEditor(page)
    await listenInCapture(page)
    await startLock(page)

    for (const key of ['w', 'ArrowLeft', 'Delete', 'q', 'Escape'])
      await page.keyboard.press(key)

    expect(await heard(page)).toEqual([])
    // The Escape still armed the pilot's Esc-twice.
    await expect(page.getByRole('button', { name: STOP_NAME })).toHaveText(
      /Esc again/,
    )

    await endTake(page)
    await heard(page)
    await page.keyboard.press('w')
    expect(await heard(page)).toEqual([
      'window capture keydown w',
      'document capture keydown w',
      'window capture keypress w',
      'document capture keypress w',
      'window capture keyup w',
      'document capture keyup w',
    ])
  })

  test('is the first key listener the app adds, and the only one that runs', async ({
    page,
  }) => {
    await recordAppKeyListeners(page)
    await openEditor(page)
    const record = () =>
      page.evaluate(() => {
        const { added, ran } = (
          window as unknown as {
            keyListeners: { added: string[]; ran: number[] }
          }
        ).keyListeners
        return { added: [...added], ran: ran.splice(0) }
      })
    const { added } = await record()
    expect(added.slice(0, 3)).toEqual([
      'window keydown capture',
      'window keyup capture',
      'window keypress capture',
    ])
    await startLock(page)
    await record()

    for (const key of ['w', 'ArrowLeft', 'Delete', 'Escape'])
      await page.keyboard.press(key)

    // Every key reached the gate (0: keydown, 1: keyup, 2: keypress) and no
    // other listener the app added, capture or bubble, window or document.
    const { ran } = await record()
    expect(ran.length).toBeGreaterThan(0)
    expect([...new Set(ran)].sort()).toEqual([0, 1, 2])
  })

  test('leaves the theme chord and the Stop button their keys', async ({
    page,
  }) => {
    await openEditor(page)
    await startLock(page)
    const theme = () => page.evaluate(() => document.body.dataset.theme)
    const before = await theme()

    await page.keyboard.press('Control+d')
    await expect.poll(theme).not.toBe(before)
    await page.keyboard.press('Control+d')
    await expect.poll(theme).toBe(before)

    await page.keyboard.press('Tab')
    expect(await focused(page)).toBe(STOP_NAME)
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeVisible()
  })

  test('releases a key the page heard go down before the lock', async ({
    page,
  }) => {
    await openEditor(page)
    await listenLikeTheApp(page)
    await page.keyboard.down('w')
    expect(await heard(page)).toEqual([
      'document keydown w',
      'window keydown w',
    ])

    await startLock(page)
    // The page hears the key come up as the lock starts, as it would on a
    // blur, so a camera moving on it stops now and not at the next repeat.
    expect(await heard(page)).toEqual(['document keyup w', 'window keyup w'])

    await page.keyboard.down('w')
    await page.keyboard.up('w')
    expect(await heard(page)).toEqual([])
  })

  test('keeps a key pressed under the lock until it comes up', async ({
    page,
  }) => {
    await openEditor(page)
    await startLock(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: STOP_NAME })).toHaveText(
      /Esc again/,
    )
    // The second Escape ends the take and is held past it.
    await page.keyboard.down('Escape')
    const card = page.getByRole('dialog', { name: /Stopped by you/ })
    await expect(card).toBeVisible()

    // Its repeats are not a new Escape on the end card.
    await page.keyboard.down('Escape')
    await page.keyboard.down('Escape')
    await page.keyboard.up('Escape')
    await expect(card).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
  })
})
