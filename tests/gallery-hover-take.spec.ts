/**
 * The blend gallery's hover preview against a take and against 3D, on a GPU.
 *
 * Hovering a tile writes its blend into the document, silently, so the canvas
 * can show it. A take the agent started right then recorded that preview as
 * the flame it starts from, and replayed from a blend nobody picked. And in
 * 3D, where Blend previews nothing, the badge over the canvas still named the
 * tile as if the canvas showed it.
 *
 * On a GPU because the gallery's tiles and the canvas are WebGPU; the
 * software adapter CI runs on loses the device by itself.
 */
import { expect, test } from './helpers'
import { callTool, openEditor, startLock } from './pilotLock'
import type { Page } from '@playwright/test'

/** The first example tile of the blend gallery, opened. */
async function hoverableTile(page: Page) {
  await page.locator('button[title="Pick blend flame"]').click()
  const tile = page
    .getByText('Examples', { exact: true })
    .locator('xpath=../..')
    .locator('button[title]')
    .first()
  await expect(tile).toBeVisible()
  return { tile, name: (await tile.getAttribute('title'))! }
}

const badge = (page: Page) => page.locator('[class*="hover-preview-badge"]')

/** The flame the newest take in the session library starts from. */
async function newestTakeStart(page: Page) {
  return await page.evaluate(async () => {
    /** An IndexedDB request, settled. */
    const settled = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(new Error(String(request.error)))
        }
      })
    const db = await settled(window.indexedDB.open('chaos-master-sessions'))
    const rows = (await settled(
      db.transaction('sessions').objectStore('sessions').getAll(),
    )) as { name: string; timestamp: number; session: { initial: unknown } }[]
    db.close()
    const newest = rows.sort((a, b) => b.timestamp - a.timestamp)[0]
    const initial = newest?.session.initial as
      | { renderSettings?: { blendFlame?: unknown } }
      | undefined
    return {
      name: newest?.name,
      blended: initial?.renderSettings?.blendFlame !== undefined,
    }
  })
}

test.describe('a hovered gallery tile', () => {
  test('is not where a take the agent starts over it begins', async ({
    page,
  }) => {
    await openEditor(page)
    const { tile, name } = await hoverableTile(page)
    await tile.hover()
    await expect(badge(page)).toContainText(name)

    await startLock(page)
    const ended = await callTool(page, 'arcade_end_cinema', {
      title: 'Hover take',
    })
    expect(ended).toMatchObject({ ok: true })

    await expect
      .poll(async () => (await newestTakeStart(page)).name)
      .toBe(ended.sessionName)
    expect(await newestTakeStart(page)).toEqual({
      name: ended.sessionName,
      blended: false,
    })
  })

  test('is named over the canvas in 2D only, where its blend shows', async ({
    page,
  }) => {
    await openEditor(page)
    const { tile, name } = await hoverableTile(page)
    await tile.hover()
    await expect(badge(page)).toContainText(name)
    // Blend has no 3D path, so the editor offers it in 2D only; a gallery
    // opened there stays open across the switch.
    await page.locator('button[title="Switch to 3D"]').click()
    await expect(page.locator('button[title="Switch to 2D"]')).toBeVisible()

    await tile.hover()
    // Past the gallery's hover handling, and a frame or two after it.
    await page.waitForTimeout(600)

    await expect(badge(page)).toHaveCount(0)
  })
})
