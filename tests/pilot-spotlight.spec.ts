import { dismissWelcomeIfPresent, expect, test } from './helpers'
import type { Page } from '@playwright/test'

/**
 * The live spotlight, in a real browser.
 *
 * The unit tests prove the sequencing in jsdom, where every rectangle is a
 * stub. What only a real layout can answer: does the ring land on the control
 * the agent actually moved, does the preparation open the panel that control
 * lives in, and — since the ring is painted ABOVE the pilot lock — can the
 * viewer still press Stop with one on screen.
 */

type Envelope = { content: { type: string; text: string }[]; isError?: boolean }

async function callTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const envelope = await page.evaluate(
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
  return JSON.parse(envelope.content[0]!.text) as Record<string, unknown>
}

/** Fire several steps inside one JS turn, the way an agent's loop does. */
async function burst(
  page: Page,
  steps: { commandId: string; args: unknown[] }[],
): Promise<void> {
  await page.evaluate(async (calls) => {
    const win = window as unknown as {
      webmcp: { execute: (name: string, input: unknown) => Promise<unknown> }
    }
    for (const call of calls) await win.webmcp.execute('execute_command', call)
  }, steps)
}

async function openEditor(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await dismissWelcomeIfPresent(page, 12_000)
  await page.waitForFunction(() => 'webmcp' in window, undefined, {
    timeout: 20_000,
  })
}

/** The on-screen box of the first element matching any of these selectors. */
async function boxOf(page: Page, selectors: string[]) {
  return await page.evaluate((list) => {
    for (const selector of list) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          return { x: rect.left, y: rect.top, width: rect.width }
        }
      }
    }
    return undefined
  }, selectors)
}

/**
 * The ring eases between targets over ~220ms, so a single `boundingBox()` can
 * land mid-flight. Poll until it settles on the control's own box.
 */
async function expectRingOn(page: Page, selectors: string[]) {
  await expect
    .poll(
      async () => {
        const control = await boxOf(page, selectors)
        const frame = await page.getByTestId('pilot-spotlight').boundingBox()
        if (control === undefined || frame === null) return 'not found'
        const off =
          Math.abs(frame.x - control.x) +
          Math.abs(frame.y - control.y) +
          Math.abs(frame.width - control.width)
        return off <= 1 ? 'on target' : `off by ${Math.round(off)}px`
      },
      { timeout: 5_000 },
    )
    .toBe('on target')
}

const GAMMA = [
  '[data-parameter-path="gamma"]',
  '[data-tour-target="gamma-slider"]',
]
const CONTRAST = [
  '[data-parameter-path="contrast"]',
  '[data-tour-target="contrast-slider"]',
]

test.describe('Teach live spotlight', () => {
  test('rings the control the AI just moved', async ({
    page,
    consoleErrors,
  }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'color' })
    const ring = page.getByTestId('pilot-spotlight')
    // Nothing has happened yet, so there is nothing to point at.
    await expect(ring).toHaveCount(0)

    await callTool(page, 'execute_command', {
      commandId: 'flame.setGamma',
      args: [2.4],
    })
    await expect(ring).toBeVisible()

    // The preparation opened the panel gamma lives in, and the ring is on it.
    await expectRingOn(page, GAMMA)

    // And it says which step put it there, in the rail's own words.
    await expect(ring).toContainText('Gamma')
    expect(consoleErrors).toEqual([])
  })

  test('never takes the Stop button away from the viewer', async ({ page }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'color' })
    await callTool(page, 'execute_command', {
      commandId: 'flame.setGamma',
      args: [2.4],
    })
    const ring = page.getByTestId('pilot-spotlight')
    await expect(ring).toBeVisible()

    // The ring is painted above the lock, so a stray `pointer-events` would
    // put an invisible sheet over the banner. Stop has to still work.
    expect(
      await ring.evaluate(
        (el) => globalThis.getComputedStyle(el).pointerEvents,
      ),
    ).toBe('none')
    await page.getByRole('button', { name: /Stop the AI/ }).click()
    await expect(
      page.getByRole('dialog', { name: /Stopped by you/ }),
    ).toBeVisible()
    // The lock is gone and so is the ring: the controls are the viewer's again.
    await expect(ring).toHaveCount(0)
  })

  test('holds one ring through a burst, then lands on the last step', async ({
    page,
  }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'color' })
    const ring = page.getByTestId('pilot-spotlight')

    // Three steps inside a single turn — an agent's tool loop, not a human.
    await burst(page, [
      { commandId: 'flame.setGamma', args: [2.4] },
      { commandId: 'flame.setExposure', args: [0.42] },
      { commandId: 'flame.setContrast', args: [1.1] },
    ])
    await expect(ring).toBeVisible()

    await expectRingOn(page, GAMMA)
    await expect(ring).toContainText('Gamma')

    // When the dwell expires it goes to the step the agent finished on, never
    // the one in the middle.
    await expect(ring).toContainText('Contrast', { timeout: 3_000 })
    await expectRingOn(page, CONTRAST)
  })

  test('opens the transform card before pointing inside it', async ({
    page,
  }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'variations' })
    await callTool(page, 'execute_command', {
      commandId: 'flame.addTransform',
      args: ['linearVar', 't1', 'v1'],
    })
    // A control that only exists once its card is expanded. If the live view
    // skipped replay's preparation, this would resolve to nothing.
    await callTool(page, 'execute_command', {
      commandId: 'flame.setProbability',
      args: ['t1', 0.5],
    })

    const ring = page.getByTestId('pilot-spotlight')
    await expect(ring).toBeVisible()
    // Two tool calls land well inside one dwell, so the ring is still on the
    // first step; the second is queued.
    await expect(ring).toContainText('Add a transform')

    await expect(ring).toContainText('Transform probability', {
      timeout: 3_000,
    })
    await expectRingOn(page, [
      '[data-parameter-path="transform.t1.probability"]',
    ])
  })

  test('leaves the ring where it is while the agent narrates', async ({
    page,
  }) => {
    await openEditor(page)
    await callTool(page, 'arcade_start_lesson', { topic: 'color' })
    await callTool(page, 'execute_command', {
      commandId: 'flame.setGamma',
      args: [2.4],
    })
    const ring = page.getByTestId('pilot-spotlight')
    await expectRingOn(page, GAMMA)
    const before = await ring.boundingBox()

    await callTool(page, 'arcade_narrate', {
      text: 'Gamma lifts the shadows without touching the highlights.',
    })
    await page.waitForTimeout(1200)

    // The sentence is about the edit that is still ringed.
    const after = await ring.boundingBox()
    expect(after).toEqual(before)
    await expect(ring).toContainText('Gamma')
  })
})
