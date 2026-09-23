/**
 * The Arcade's screen lock over the export dialog the viewer left open.
 *
 * The dialog sat in the browser's top layer above the lock, and kept every
 * key and click the viewer made for the whole take. The lock is the newest
 * modal now, over it, and hands it back afterwards as it was.
 *
 * Not a CI spec: the dialog mounts a WebGPU root of its own, which the
 * software adapter does not hold. pilot-lock-focus.ci.spec.ts runs the same
 * checks on a dialog of the same kind built in the page.
 */
import { expect, test } from './helpers'
import { expectDialogHeldUnderLock, openEditor } from './pilotLock'

test('the export dialog open before the lock is covered, then handed back', async ({
  page,
}) => {
  await openEditor(page)
  await page.keyboard.press('Control+e')
  const dialog = page.locator('dialog[open]', { hasText: 'Render Flame' })
  const field = dialog.locator('input[type="text"]').first()
  await field.click()
  await field.press('End')
  await page.keyboard.type('7')

  await expectDialogHeldUnderLock(page, dialog, field)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
