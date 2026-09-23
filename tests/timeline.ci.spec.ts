// Drives the timeline from its transport bar and settings row in the built app:
// stepping and seeking the playhead, the length and loop settings, playback.
import { dismissWelcomeIfPresent, expect, test } from './helpers'
import type { Page } from '@playwright/test'

/**
 * This replaces tests/timeline.spec.ts. That spec was written in 2024 for a
 * timeline panel that no longer exists: a keyframe editor with a parameter
 * `<select>`, Add, Update and Remove buttons, and an `#fps-input`. None of its
 * 18 tests could pass, and because it was a `chromium`-project spec nothing
 * ran it. Keyframes are now edited on the dope sheet with a pointer, so these
 * tests keep to the controls that the transport bar and the settings row
 * expose. Those are DOM, and they hold on the software adapter that CI has.
 *
 * Playback is started and paused here, but its frames are not counted. The
 * interval that advances them lives in the renderer (Flam3.tsx), and on the
 * software adapter the renderer can fail to mount: locally it throws
 * `createBuffer failed, size (4) is too large for the implementation when
 * mappedAtCreation == true`, and the transport keeps working without it.
 * What playback does at the end (REQ-TA-027) is unit-tested in
 * packages/app/src/utils/timeline.test.ts, "should wrap to start frame when at
 * end".
 *
 * Every test opens a fresh page, so each one starts from the default config
 * in utils/timeline.ts: frame 0 to 90, 30 fps, loop on, Auto FPS off.
 */

async function openTimeline(page: Page) {
  await page.goto('/')
  await dismissWelcomeIfPresent(page)
  const section = page.getByTestId('timeline-section')
  await expect(section).toBeVisible({ timeout: 20_000 })
  return section
}

const currentFrame = (page: Page) => page.getByTestId('current-frame')
const endFrame = (page: Page) => page.getByTestId('end-frame')

/** Sets the timeline's length through its Frames field, as a user would. */
async function setLength(page: Page, frames: number) {
  const field = page
    .getByTestId('timeline-section')
    .getByLabel('Frames', { exact: true })
  await field.fill(String(frames))
  // The field commits on change, which fires when it loses focus.
  await field.blur()
  await expect(endFrame(page)).toHaveText(String(frames))
}

test.describe('Timeline', () => {
  test('steps and seeks the playhead from the transport bar', async ({
    page,
  }) => {
    await openTimeline(page)
    await expect(currentFrame(page)).toHaveText('0')

    const next = page.getByTestId('next-frame')
    await next.click()
    await next.click()
    await next.click()
    await expect(currentFrame(page)).toHaveText('3')

    await page.getByTestId('previous-frame').click()
    await expect(currentFrame(page)).toHaveText('2')

    const end = await endFrame(page).innerText()
    await page.getByTestId('go-to-end').click()
    await expect(currentFrame(page)).toHaveText(end)

    await page.getByTestId('go-to-start').click()
    await expect(currentFrame(page)).toHaveText('0')
  })

  test('sets the length, plays and pauses, and undoes one setting at a time', async ({
    page,
  }) => {
    const section = await openTimeline(page)
    await setLength(page, 6)

    // Loop stays on here, so playback cannot stop by itself before the pause.
    await page.getByTestId('play').click()
    await expect(page.getByTestId('pause')).toBeVisible()
    // Playback locks the timeline except for the transport bar, so pausing
    // is a click on the same button.
    await page.getByTestId('pause').click()
    await expect(page.getByTestId('play')).toBeVisible()

    // A settings change is one undo step: undo takes back the loop switch and
    // leaves the length set before it.
    const loop = section.getByTestId('loop-toggle')
    await expect(loop).toBeChecked()
    await loop.setChecked(false)
    await expect(loop).not.toBeChecked()
    await page.keyboard.press('Control+z')
    await expect(loop).toBeChecked()
    await expect(endFrame(page)).toHaveText('6')
  })
})
