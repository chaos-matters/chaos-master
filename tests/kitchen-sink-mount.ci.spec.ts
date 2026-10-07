// Mounts the workspace from share links whose flame turns every optional
// branch on at once, and fails on any page error (refactor WP3, guard G4).
import { deflateSync } from 'node:zlib'
import { expect, test } from './helpers'
import type { Page } from '@playwright/test'

/**
 * The runtime twin of the static eager-order guards in
 * packages/app/src/eagerComputationOrder.test.ts.
 *
 * `createMemo` runs its callback at creation. A memo that reads a binding
 * declared later throws `ReferenceError: Cannot access '<name>' before
 * initialization` in the component body, the error boundary replaces the
 * workspace, and the page is dead. #98 did exactly that to every blended share
 * link, hidden for months behind `blendFlame() &&`: the default flame carries
 * no blend, so no test ever took the branch. After the refactor moves memos
 * into hooks, the same mistake can hide behind any data the flame carries.
 *
 * So these links carry all of it at mount: a blend, a palette with palette
 * mode on, rotational and dihedral symmetry transforms, a camera off its
 * defaults, and an animation that starts playing as the link opens. One is 2D;
 * the 3D one adds auto-exposure, which runs an eager memo in
 * useWorkspaceCamera. Before asserting that the page stayed healthy, the spec
 * reads the flame back through WebMCP and checks each branch really is on, so
 * a payload the schema quietly rejected cannot turn this into a test of the
 * default flame.
 *
 * Audio wiring is the one branch a share link cannot turn on: the link carries
 * a flame, an animation and custom variations, and the audio mapping is
 * session state that starts from the same default on every mount.
 *
 * The software adapter CI runs on loses its WebGPU device about half a second
 * after load, on main as much as anywhere. Nothing here waits on a rendered
 * frame or reads a pixel, and the page errors that loss raises are the only
 * ones let through (GPU_LOSS below). A ReferenceError is never let through.
 */

type Affine2D = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}
type Affine3D = Affine2D & {
  g: number
  h: number
  i: number
  j: number
  k: number
  l: number
}

const IDENTITY_2D: Affine2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
/** Row-major 3x4, as initExample3D writes it: a, f and k on the diagonal. */
const IDENTITY_3D: Affine3D = {
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  f: 1,
  g: 0,
  h: 0,
  i: 0,
  j: 0,
  k: 1,
  l: 0,
}

/** The shape of flame/symmetry.ts's transforms: probability, no colour speed. */
function symmetry<A extends Affine2D>(
  variationId: string,
  preAffine: A,
  postAffine: A,
  type: string,
) {
  return {
    probability: 2,
    colorSpeed: 0,
    color: { x: 0, y: 0 },
    visible: true,
    preAffine,
    postAffine,
    variations: { [variationId]: { type, weight: 1, visible: true } },
  }
}

const turn = (fraction: number) => ({
  cos: Math.cos(2 * Math.PI * fraction),
  sin: Math.sin(2 * Math.PI * fraction),
})

const PALETTE = {
  id: 'kitchen-sink',
  name: 'Kitchen sink',
  entries: [
    { id: 'p0', position: 0, a: 0.1, b: 0.9 },
    { id: 'p1', position: 0.5, a: 0.8, b: 0.3 },
    { id: 'p2', position: 1, a: 0.4, b: 0.1 },
  ],
}

function plain2D(scale: number) {
  return {
    version: '1.0',
    transforms: {
      b1: {
        probability: 1,
        preAffine: { ...IDENTITY_2D, a: scale, e: scale },
        postAffine: IDENTITY_2D,
        color: { x: 0.3, y: 0.6 },
        variations: { bv1: { type: 'linearVar', weight: 1 } },
      },
    },
  }
}

function kitchenSink2D() {
  const third = turn(1 / 3)
  const twoThirds = turn(2 / 3)
  return {
    version: '1.0',
    metadata: { name: 'Kitchen sink 2D', author: 'e2e', description: '' },
    transforms: {
      t1: {
        probability: 1,
        preAffine: { ...IDENTITY_2D, a: 0.5, e: 0.5, c: 0.25 },
        postAffine: IDENTITY_2D,
        color: { x: 0.2, y: 0.8 },
        variations: { v1: { type: 'linearVar', weight: 1 } },
      },
      t2: {
        probability: 0.5,
        preAffine: { ...IDENTITY_2D, a: 0.6, e: 0.6, f: -0.3 },
        postAffine: IDENTITY_2D,
        color: { x: 0.7, y: 0.1 },
        variations: { v2: { type: 'sinusoidalVar', weight: 0.8 } },
      },
      _sym__rot1: symmetry(
        'sv1',
        { a: third.cos, b: -third.sin, c: 0, d: third.sin, e: third.cos, f: 0 },
        IDENTITY_2D,
        'linearVar',
      ),
      _sym__rot2: symmetry(
        'sv2',
        {
          a: twoThirds.cos,
          b: -twoThirds.sin,
          c: 0,
          d: twoThirds.sin,
          e: twoThirds.cos,
          f: 0,
        },
        IDENTITY_2D,
        'linearVar',
      ),
      _sym__dih: symmetry(
        'sv3',
        { ...IDENTITY_2D, a: -1 },
        IDENTITY_2D,
        'linearVar',
      ),
    },
    renderSettings: {
      exposure: 1,
      skipIters: 20,
      dimensions: 2,
      paletteMode: 1,
      palettePhase: 0.25,
      paletteSpeed: 0.5,
      palette: PALETTE,
      blendWeight: 0.5,
      blendFlame: plain2D(0.8),
      backgroundColor: [0.05, 0.05, 0.1],
      camera: { zoom: 1.2, position: [0.1, -0.1], rotation: 0.3 },
    },
  }
}

function plain3D(scale: number) {
  return {
    version: '1.0',
    transforms: {
      b1: {
        probability: 1,
        preAffine: { ...IDENTITY_3D, a: scale, f: scale, k: scale },
        postAffine: IDENTITY_3D,
        color: { x: 0.3, y: 0.6 },
        variations: { bv1: { type: 'linear3D', weight: 1 } },
      },
    },
    renderSettings: { exposure: 0.25, skipIters: 1, dimensions: 3 },
  }
}

function kitchenSink3D() {
  const half = turn(1 / 2)
  return {
    version: '1.0',
    metadata: { name: 'Kitchen sink 3D', author: 'e2e', description: '' },
    transforms: {
      t1: {
        probability: 1,
        preAffine: { ...IDENTITY_3D, a: 0.5, f: 0.5, k: 0.5, d: 0.25 },
        postAffine: IDENTITY_3D,
        color: { x: 0.2, y: 0.8 },
        variations: { v1: { type: 'linear3D', weight: 1 } },
      },
      _sym__rot1: symmetry(
        'sv1',
        { ...IDENTITY_3D, a: half.cos, b: -half.sin, e: half.sin, f: half.cos },
        IDENTITY_3D,
        'linear3D',
      ),
      _sym__dih: symmetry(
        'sv2',
        { ...IDENTITY_3D, a: -1 },
        IDENTITY_3D,
        'linear3D',
      ),
    },
    renderSettings: {
      exposure: 0.25,
      skipIters: 1,
      dimensions: 3,
      pointInitMode: 'pointInitUnitBall',
      colorInitMode: 'colorInitPosition',
      autoExposure3D: true,
      autoExposure3DStrength: 1,
      autoExposure3DRefRadius: 5,
      lightPower: 1,
      depthColorPower: 1,
      paletteMode: 1,
      palettePhase: 0.5,
      palette: PALETTE,
      blendWeight: 0.4,
      blendFlame: plain3D(0.7),
      camera: { zoom: 1, position: [0, 0] },
      camera3D: {
        theta: 0.4,
        phi: 1.2,
        radius: 6,
        target: [0, 0, 0],
        fov: 55,
        roll: 0.1,
      },
    },
  }
}

/** An end frame no default uses, so seeing it proves the animation loaded. */
const END_FRAME = 97

function animation(cameraPath: string) {
  return {
    config: { fps: 24, startFrame: 0, endFrame: END_FRAME, loop: true },
    tracks: [
      {
        parameterPath: 'blendWeight',
        keyframes: [
          { frame: 0, value: 0.2 },
          { frame: END_FRAME, value: 0.9 },
        ],
      },
      {
        parameterPath: 'palettePhase',
        keyframes: [
          { frame: 0, value: 0 },
          { frame: END_FRAME, value: 1 },
        ],
      },
      {
        parameterPath: cameraPath,
        keyframes: [
          { frame: 0, value: 0.1 },
          { frame: END_FRAME, value: 0.6 },
        ],
      },
    ],
  }
}

/** `?flame=` as the app writes it: JSON, zlib deflate, unpadded base64url. */
function shareParam(payload: unknown): string {
  return deflateSync(Buffer.from(JSON.stringify(payload), 'utf8'), {
    level: 9,
  }).toString('base64url')
}

/**
 * Page errors the lost software WebGPU device raises, and nothing else: the
 * GPU patterns tests/smoke.ci.spec.ts lets through, plus the WebGPU interface
 * names (the loss surfaces as "Failed to execute 'createBuffer' on
 * 'GPUDevice'"). A ReferenceError is asserted on separately and never let
 * through, whatever its message says.
 */
const GPU_LOSS = [
  /external instance/i,
  /device.*lost/i,
  /\bGPU[A-Z]\w*\b/,
  /webgpu/i,
  /wgpu/i,
  /\bgpu\b/i,
  /adapter/i,
]
const TDZ = /ReferenceError|before initialization/i

/**
 * Uncaught page errors, and console errors. The console matters for the
 * ReferenceError: the error boundary that replaces the workspace catches it,
 * so it never becomes a page error, and it reaches the console instead.
 */
function collectErrors(page: Page) {
  const seen = { page: [] as string[], console: [] as string[] }
  page.on('pageerror', (err) => seen.page.push(`${err.name}: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.console.push(msg.text())
  })
  return seen
}

/** Present only once MainWorkspace itself has rendered. */
const workspaceMenu = (page: Page) =>
  page.getByRole('button', { name: /^Lumen Apeiron v\S+ menu$/ })

/** What the error boundary puts there instead (components/ErrorHandling). */
const crashScreen = (page: Page) =>
  page.getByText('Something went wrong', { exact: false })

type LoadedFlame = {
  transforms: Record<string, unknown>
  renderSettings: {
    dimensions?: number
    blendFlame?: unknown
    blendWeight?: number
    palette?: { id: string }
    paletteMode?: number
    autoExposure3D?: boolean
  }
}

/** The whole flame the workspace holds, read through WebMCP. */
async function loadedFlame(page: Page): Promise<LoadedFlame> {
  const text = await page.evaluate(async () => {
    const win = window as unknown as {
      webmcp?: {
        executeTool: (
          name: string,
          input: unknown,
        ) => Promise<{ content: { text: string }[] }>
      }
    }
    const result = await win.webmcp?.executeTool('get_flame_detail', {
      section: 'full',
    })
    return result?.content[0]?.text ?? '{}'
  })
  return JSON.parse(text) as LoadedFlame
}

async function openAndCheck(page: Page, payload: unknown, dimensions: 2 | 3) {
  const errors = collectErrors(page)
  await page.goto(`/?flame=${shareParam(payload)}`, {
    waitUntil: 'domcontentloaded',
  })

  // Settle on the workspace or the crash screen, then report a
  // ReferenceError before a missing button, so a failure says what broke.
  await expect(workspaceMenu(page).or(crashScreen(page)).first()).toBeVisible({
    timeout: 20_000,
  })
  const referenceErrors = () =>
    [...errors.page, ...errors.console].filter((line) => TDZ.test(line))
  expect(referenceErrors()).toEqual([])
  await expect(workspaceMenu(page)).toBeVisible()

  // Every branch this link exists to exercise is really on.
  const flame = await loadedFlame(page)
  const symmetryIds = Object.keys(flame.transforms).filter((id) =>
    id.startsWith('_sym__'),
  )
  expect({
    dimensions: flame.renderSettings.dimensions ?? 2,
    blended: flame.renderSettings.blendFlame !== undefined,
    palette: flame.renderSettings.palette?.id,
    paletteMode: flame.renderSettings.paletteMode,
    symmetryTransforms: symmetryIds.length,
    ...(dimensions === 3
      ? { autoExposure3D: flame.renderSettings.autoExposure3D }
      : {}),
  }).toEqual({
    dimensions,
    blended: true,
    palette: 'kitchen-sink',
    paletteMode: 1,
    symmetryTransforms: dimensions === 3 ? 2 : 3,
    ...(dimensions === 3 ? { autoExposure3D: true } : {}),
  })
  // The shared animation loaded: its end frame is on the timeline.
  await expect(page.getByTestId('end-frame')).toHaveText(String(END_FRAME), {
    timeout: 10_000,
  })

  // A live canvas: in the document, laid out, and not replaced.
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeAttached()
  const box = await canvas.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(0)
  expect(box?.height ?? 0).toBeGreaterThan(0)

  // Let the playing animation run for a while, then judge every page error
  // seen since the link opened.
  await page.waitForTimeout(2_000)
  await expect(workspaceMenu(page)).toBeVisible()
  await expect(crashScreen(page)).toHaveCount(0)
  expect(referenceErrors()).toEqual([])
  expect(
    errors.page.filter(
      (line) => TDZ.test(line) || !GPU_LOSS.some((re) => re.test(line)),
    ),
  ).toEqual([])
}

test.describe('a share link with every optional branch on', () => {
  test('mounts a 2D flame without a page error', async ({ page }) => {
    await openAndCheck(
      page,
      { flame: kitchenSink2D(), animation: animation('camera.rotation') },
      2,
    )
  })

  test('mounts a 3D flame without a page error', async ({ page }) => {
    await openAndCheck(
      page,
      { flame: kitchenSink3D(), animation: animation('camera3D.theta') },
      3,
    )
  })
})
