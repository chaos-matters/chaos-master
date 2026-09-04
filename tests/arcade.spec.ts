import { dismissWelcomeIfPresent, expect, test } from './helpers'
import type { Page } from '@playwright/test'

type Envelope = { content: { type: string; text: string }[]; isError?: boolean }

async function callToolRaw(
  page: Page,
  name: string,
  input: unknown,
): Promise<Envelope> {
  return await page.evaluate(
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
}

async function callTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const envelope = await callToolRaw(page, name, input)
  return JSON.parse(envelope.content[0]!.text) as Record<string, unknown>
}

async function openEditor(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissWelcomeIfPresent(page, 12_000)
  await page.waitForFunction(() => 'webmcp' in window, undefined, {
    timeout: 20_000,
  })
}

test.describe('Lumen Arcade', () => {
  test('hub renders six cards and the WebMCP status pill', async ({ page }) => {
    await page.goto('/#arcade', { waitUntil: 'domcontentloaded' })
    // No welcome dismissal first: `/arcade` must land on the hub itself, or a
    // judge following the link never reaches it.
    await expect(page.getByTestId('arcade-card')).toHaveCount(6, {
      timeout: 20_000,
    })
    // Kept afterwards so the test still passes if another path shows it.
    await dismissWelcomeIfPresent(page, 2_000)
    await expect(page.getByTestId('webmcp-status')).toContainText(/WebMCP/)
    await page.getByTestId('arcade-card').filter({ hasText: 'Teach' }).click()
    await expect(page.getByTestId('prompt-card')).toContainText(
      'arcade_start_lesson',
    )
  })

  test('the Arcade pill opens and closes the hub in place', async ({
    page,
  }) => {
    await openEditor(page)
    // The workspace is up and the hub is not.
    await expect(page.getByTestId('arcade-card')).toHaveCount(0)

    await page.getByRole('link', { name: 'Open Lumen Arcade' }).click()
    await expect(page.getByTestId('arcade-card')).toHaveCount(6)
    // In place: no reload, so the mock the workspace installed is still there.
    expect(await page.evaluate(() => 'webmcp' in window)).toBe(true)

    await page.getByRole('button', { name: 'Back to editor' }).click()
    await expect(page.getByTestId('arcade-card')).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Open Lumen Arcade' }),
    ).toBeVisible()
  })

  test('Teach: start, drive, narrate, end, replay card', async ({ page }) => {
    await openEditor(page)
    const brief = await callTool(page, 'arcade_start_lesson', {
      topic: 'variations',
    })
    expect(brief).toMatchObject({ ok: true, topic: 'variations' })
    const lock = page.getByRole('dialog', {
      name: 'The agent is driving the editor',
    })
    await expect(lock).toBeVisible()
    await expect(lock).toContainText('Teaching: Variations')

    // `flame.addTransform` carries the ids it is about to mint, so a replay
    // recreates the same entities (commands/registry.ts REPLAY_ARG_POLICIES).
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'flame.addTransform',
        args: ['linearVar', 't1', 'v1'],
      }),
    ).toMatchObject({ success: true })
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'flame.addTransform',
        args: ['sphericalVar', 't2', 'v2'],
      }),
    ).toMatchObject({ success: true })
    expect(
      await callTool(page, 'arcade_narrate', {
        text: 'Two transforms, two families.',
      }),
    ).toMatchObject({ ok: true })
    await expect(lock).toContainText('Two transforms, two families.')
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'view.setQualityPreset',
        args: ['ultra'],
      }),
    ).toHaveProperty('error')
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'export.png',
        args: [],
      }),
    ).toHaveProperty('error')
    // The whole non-arcade write surface is closed while the pilot drives:
    // the gate answers with a plain-text error envelope, not a tool result.
    const gated = await callToolRaw(page, 'randomize_flame', {})
    expect(gated.isError).toBe(true)
    expect(gated.content[0]!.text).toContain('unavailable while an Arcade')

    const ended = await callTool(page, 'arcade_end_lesson', {
      title: 'Two families',
      summary: 'Linear plus spherical.',
    })
    expect(ended).toMatchObject({
      ok: true,
      sessionName: 'Lesson: Variations — Two families',
    })
    const card = page.getByRole('dialog', { name: /Two families: Finished/ })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Saved to your library')
    expect(await callTool(page, 'arcade_status', {})).toMatchObject({
      phase: 'ended',
      locked: false,
    })
    await card.getByRole('button', { name: 'Replay' }).click()
    await expect(card).toBeHidden()
  })

  test('Stop ends the lesson and keeps the recording', async ({ page }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'color' })
    await page.getByRole('button', { name: /Stop the agent/ }).click()
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeVisible()
    expect(
      await callTool(page, 'arcade_narrate', { text: 'too late' }),
    ).toHaveProperty('error')
  })

  /**
   * Fit is a button, and the agent has no pointer.
   *
   * A take is usually longer than whatever span the dope sheet was showing, so
   * the frames the agent just wrote ran off the right edge of the panel the
   * lock overlay points at. Only a real layout can answer this: jsdom gives
   * every element a zero width, and autoFitZoom returns early on one.
   */
  test('Cinema fits the dope sheet to the take it just wrote', async ({
    page,
  }) => {
    await openEditor(page)
    expect(await callTool(page, 'arcade_start_cinema', {})).toMatchObject({
      ok: true,
    })
    const zoom = page.getByTestId('timeline-zoom')
    await expect(zoom).toBeVisible({ timeout: 20_000 })
    const before = await zoom.textContent()

    // A nine-second take at 30fps, three times the span the editor opens with.
    expect(
      await callTool(page, 'arcade_set_keyframes', {
        fps: 30,
        durationFrames: 270,
        play: false,
        tracks: [
          {
            path: 'camera.zoom',
            keyframes: [
              { frame: 0, value: 1 },
              { frame: 270, value: 1.6 },
            ],
          },
        ],
      }),
    ).toMatchObject({ ok: true })
    await expect(zoom).not.toHaveText(before ?? '', { timeout: 10_000 })

    // The invariant, independent of how far the zoom range actually reaches:
    // the take is already fitted, so pressing Fit changes nothing. Fit has to
    // wait for the session to end — the pilot shield intercepts every pointer
    // event over the workspace, which is exactly why the agent cannot press it
    // and the dope sheet has to fit itself.
    const fitted = await zoom.textContent()
    await callTool(page, 'arcade_end_cinema', { title: 'Fit check' })
    const endCard = page.getByRole('dialog', { name: /Fit check: Finished/ })
    await expect(endCard).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(endCard).toBeHidden()
    await page.getByRole('button', { name: 'Fit' }).click()
    await expect(zoom).toHaveText(fitted ?? '')
  })

  test('Cinema: paths, keyframes, end', async ({ page }) => {
    await openEditor(page)
    expect(await callTool(page, 'arcade_start_cinema', {})).toMatchObject({
      ok: true,
    })
    const paths = await callTool(page, 'arcade_get_animatable_paths', {})
    expect(JSON.stringify(paths)).toContain('camera.zoom')
    const set = await callTool(page, 'arcade_set_keyframes', {
      fps: 30,
      durationFrames: 60,
      loopMode: 'seamless',
      tracks: [
        {
          path: 'camera.zoom',
          keyframes: [
            { frame: 0, value: 1, easing: 'easeInOut' },
            { frame: 60, value: 1.6 },
          ],
        },
      ],
    })
    expect(set).toMatchObject({ ok: true, trackCount: 1, keyframeCount: 2 })
    // `timeline.play` is wall-clock transport and deliberately not replayable,
    // so arcade_set_keyframes starts it; the agent scrubs with setCurrentFrame.
    expect(
      await callTool(page, 'execute_command', {
        commandId: 'timeline.setCurrentFrame',
        args: [10],
      }),
    ).toMatchObject({ success: true })
    expect(
      await callTool(page, 'arcade_end_cinema', { title: 'Push-in' }),
    ).toMatchObject({ ok: true, sessionName: 'Animation: Push-in' })
    await expect(
      page.getByRole('dialog', { name: /Push-in: Finished/ }),
    ).toBeVisible()
  })
})
