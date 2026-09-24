/**
 * History navigation under the Arcade's screen lock, in the real app.
 *
 * The tab lives in the URL fragment (lib/activeTab.ts), so a browser Back or
 * Forward, a mouse's back button, the iOS edge swipe on the web, Alt+Left or
 * a fragment typed into the address bar changed the view under the agent:
 * Home opened or closed over the take it was making. Under the lock the view
 * holds, the address bar is put back to match it, and a Back adds no history
 * entry however often it is pressed. When the take and its end card are over,
 * the page is on the view it was on and history works as before. A seat lock,
 * the viewer's half of a duel, holds nothing.
 */
import { expect, test } from './helpers'
import { callTool, LOCK_NAME, openEditor, startLock, STOP_NAME, topDialogAt, } from './pilotLock'
import type { Page } from '@playwright/test'

const home = (page: Page) => page.locator('[class^="_home_"]')
const fragment = (page: Page) => page.evaluate(() => window.location.hash)
const historyLength = (page: Page) => page.evaluate(() => window.history.length)
const endCard = (page: Page) =>
  page.getByRole('dialog', { name: /Stopped by you/ })

/** The editor, with Home one Back behind it and nothing of the app before. */
async function editorAfterHome(page: Page) {
  await openEditor(page)
  await page.evaluate(() => {
    window.history.replaceState(window.history.state, '', '#home')
    window.location.hash = ''
  })
  await expect(home(page)).toHaveCount(0)
}

/** What a history step settles into: the next frame after its events. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        setTimeout(resolve, 150)
      }),
  )
}

test.describe('history under the screen lock', () => {
  test('a fragment typed into the address bar is put back', async ({
    page,
  }) => {
    await openEditor(page)
    await startLock(page)
    const before = await fragment(page)

    await page.evaluate(() => {
      window.location.hash = '#home'
    })
    await settle(page)

    await expect(home(page)).toHaveCount(0)
    expect(await fragment(page)).toBe(before)
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
  })

  test('Back and Forward change nothing, however often, and add no entry', async ({
    page,
  }) => {
    await editorAfterHome(page)
    await startLock(page)
    const length = await historyLength(page)

    for (let i = 0; i < 3; i++) {
      await page.goBack()
      await settle(page)
      await expect(home(page)).toHaveCount(0)
      expect(await fragment(page)).toBe('')
    }
    await page.goForward()
    await settle(page)

    await expect(home(page)).toHaveCount(0)
    expect(await fragment(page)).toBe('')
    expect(await historyLength(page)).toBe(length)
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
  })

  test('several Backs at once change nothing either', async ({ page }) => {
    await editorAfterHome(page)
    await startLock(page)

    await page.evaluate(() => {
      window.history.back()
      window.history.back()
      window.history.go(-2)
    })
    await settle(page)
    await settle(page)

    await expect(home(page)).toHaveCount(0)
    expect(await fragment(page)).toBe('')
    expect(new URL(page.url()).pathname).toBe('/')
  })

  test('a Back to another page stays on this one', async ({ page }) => {
    await page.goto('/explorer', { waitUntil: 'domcontentloaded' })
    await openEditor(page)
    await startLock(page)

    await page.goBack()
    await settle(page)

    expect(new URL(page.url()).pathname).toBe('/')
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
  })

  test('a deep link to the Arcade holds too, with nothing behind it', async ({
    page,
  }) => {
    await page.goto('/#arcade', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => 'webmcp' in window, undefined, {
      timeout: 20_000,
    })
    await startLock(page)
    const before = await fragment(page)

    await page.goBack()
    await settle(page)

    expect(new URL(page.url()).pathname).toBe('/')
    expect(await fragment(page)).toBe(before)
    expect(await topDialogAt(page)).toBe(LOCK_NAME)
  })

  test('Back on the end card closes it, and the view stays', async ({
    page,
  }) => {
    await editorAfterHome(page)
    await startLock(page)
    await page.getByRole('button', { name: STOP_NAME }).click()
    await expect(endCard(page)).toBeVisible()

    await page.goBack()
    await settle(page)

    await expect(endCard(page)).toBeHidden()
    await expect(home(page)).toHaveCount(0)
    expect(await fragment(page)).toBe('')
  })

  test('after the take, the view is as it was and Back works as before', async ({
    page,
  }) => {
    await editorAfterHome(page)
    await startLock(page)
    await page.goBack()
    await settle(page)
    await page.getByRole('button', { name: STOP_NAME }).click()
    await expect(endCard(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(endCard(page)).toBeHidden()
    await settle(page)

    await expect(home(page)).toHaveCount(0)
    expect(await fragment(page)).toBe('')
    await page.goBack()
    await expect(home(page)).toBeAttached()
    expect(await fragment(page)).toBe('#home')
  })
})

test.describe('history under a seat lock', () => {
  test('is the viewer’s: a fragment still changes the view', async ({
    page,
  }) => {
    await openEditor(page)
    expect(
      await callTool(page, 'arcade_start_duel', { durationSeconds: 60 }),
    ).toMatchObject({ ok: true })

    await page.evaluate(() => {
      window.location.hash = '#home'
    })

    await expect(home(page)).toBeAttached()
    expect(await fragment(page)).toBe('#home')
  })
})
