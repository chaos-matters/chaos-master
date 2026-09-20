import { deflateSync } from 'node:zlib'
import { expect, test } from './helpers'
import type { Page } from '@playwright/test'

/**
 * A flame that arrives with a blend already on it must open.
 *
 * `MainWorkspace`'s `resolvedBlendWeight` memo read `timeline` from a line
 * above the one that declares it. `createMemo` runs its callback at creation,
 * so the read happened while `timeline` was still in its temporal dead zone --
 * except that `blendFlame() && ...` short-circuited first, and with no blend
 * flame the callback never reached the read. A flame that ARRIVES blended made
 * that operand truthy on the first eager run and the component body died with
 * `ReferenceError: Cannot access '<name>' before initialization`, so the error
 * boundary replaced the workspace. Every share link of a blended flame was
 * broken, on production and on the fork deploy alike.
 *
 * The control case below is the same flame with `blendFlame` removed. It
 * pins the trigger: if both cases fail, share links are broken generally and
 * this spec is pointing at the wrong thing.
 *
 * The assertions are deliberately about the ReferenceError and about the
 * workspace being on screen, not about the page being free of errors. The
 * software adapter CI runs on loses the WebGPU device by itself -- main does
 * it too -- and a blanket "no pageerror" would fail for that instead.
 */

type Affine = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const affine = (a: number, d: number): Affine => ({
  a,
  b: 0,
  c: 0,
  d,
  e: 0,
  f: 0,
})

/** The smallest thing `FlameDescriptor` accepts: one transform, one variation. */
function plainFlame(scale: number) {
  return {
    version: '1.0',
    transforms: {
      t1: {
        probability: 1,
        preAffine: affine(scale, scale),
        postAffine: affine(1, 1),
        color: { x: 0.25, y: 0.75 },
        variations: { v1: { type: 'linearVar', weight: 1 } },
      },
    },
  }
}

/** The same flame with a second one blended into it at mount. */
function blendedFlame() {
  return {
    ...plainFlame(0.5),
    // `exposure` and `skipIters` are the two render settings the schema
    // requires; everything else in there has a default. A partial
    // renderSettings without them is rejected and the app never sees a blend.
    renderSettings: {
      exposure: 1,
      skipIters: 20,
      blendWeight: 0.5,
      blendFlame: plainFlame(0.8),
    },
  }
}

/**
 * The `?flame=` parameter, built the way the app writes it: JSON, zlib
 * deflate, base64url with the padding stripped (utils/jsonQueryParam.ts,
 * utils/base64.ts).
 */
function shareParam(flame: unknown): string {
  const json = JSON.stringify({ flame })
  return deflateSync(Buffer.from(json, 'utf8'), { level: 9 }).toString(
    'base64url',
  )
}

const TDZ = /ReferenceError|before initialization/i

function collectErrors(page: Page): string[] {
  const seen: string[] = []
  page.on('pageerror', (err) => seen.push(`[pageerror] ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.push(`[console] ${msg.text()}`)
  })
  return seen
}

/** Present only once MainWorkspace itself has rendered. */
const workspaceMenu = (page: Page) =>
  page.getByRole('button', { name: /^Lumen Apeiron v\S+ menu$/ })

/** What the error boundary puts there instead (components/ErrorHandling). */
const crashScreen = (page: Page) =>
  page.getByText('Something went wrong', { exact: false })

async function openShared(page: Page, flame: unknown) {
  const seen = collectErrors(page)
  await page.goto(`/?flame=${shareParam(flame)}`, {
    waitUntil: 'domcontentloaded',
  })
  return seen
}

test.describe('a flame that arrives blended', () => {
  test('opens from a share link instead of crashing the workspace', async ({
    page,
  }) => {
    const seen = await openShared(page, blendedFlame())

    // Settle on whichever arrives: the workspace, or the crash screen that
    // replaces it. Then report the ReferenceError before the missing button,
    // so a failure says what went wrong rather than only what is not there.
    await expect(workspaceMenu(page).or(crashScreen(page)).first()).toBeVisible(
      { timeout: 20_000 },
    )
    expect(seen.filter((line) => TDZ.test(line))).toEqual([])

    // The workspace menu only exists once MainWorkspace has rendered. When the
    // component body throws, the error boundary replaces the whole thing and
    // nothing below is on the page at all.
    await expect(workspaceMenu(page)).toBeVisible()
    await expect(page.locator('canvas').first()).toBeAttached()
  })

  test('control: the same flame without the blend also opens', async ({
    page,
  }) => {
    const seen = await openShared(page, plainFlame(0.5))

    await expect(workspaceMenu(page).or(crashScreen(page)).first()).toBeVisible(
      { timeout: 20_000 },
    )
    expect(seen.filter((line) => TDZ.test(line))).toEqual([])
    await expect(workspaceMenu(page)).toBeVisible()
    await expect(page.locator('canvas').first()).toBeAttached()
  })
})
