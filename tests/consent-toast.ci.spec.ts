/**
 * The auto-save question waits while a view with its own top bar covers the
 * editor, and is asked once the viewer is back. On a real GPU it landed over
 * the Arena and took the click meant for Exit Arena (arena.spec.ts, which
 * needs real GPU output). The Arcade hub is held by the same rule and renders
 * nothing on the GPU, so it stands in for the Arena here.
 */
import { dismissWelcomeIfPresent, expect, test } from './helpers'

const QUESTION = 'Auto-save your flames to Recents while you edit?'
const POLL_MS = 30_000

test.describe('the auto-save question and the views over the editor', () => {
  test('waits over the Arcade hub and is asked back in the editor', async ({
    page,
  }) => {
    await page.clock.install()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await dismissWelcomeIfPresent(page, 12_000)
    await page.waitForFunction(() => 'webmcp' in window, undefined, {
      timeout: 20_000,
    })

    // Unsaved work: the question is only asked about a flame with edits.
    await page.evaluate(async () => {
      const win = window as unknown as {
        webmcp: { execute: (name: string, input: unknown) => Promise<unknown> }
      }
      await win.webmcp.execute('execute_command', {
        commandId: 'flame.setMetadata',
        args: ['name', 'Edited in the consent spec'],
      })
    })

    await page.evaluate(() => {
      window.location.hash = '#arcade'
    })
    await page.clock.fastForward(POLL_MS * 2 + 1000)
    await expect(page.getByText(QUESTION)).toHaveCount(0)

    await page.evaluate(() => {
      window.location.hash = ''
    })
    await page.clock.fastForward(POLL_MS + 1000)
    await expect(page.getByText(QUESTION)).toBeVisible()
  })
})
