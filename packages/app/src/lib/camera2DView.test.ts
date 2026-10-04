import { mat3x3f, vec3f } from 'typegpu/data'
import { mul } from 'typegpu/std'
import { describe, expect, it } from 'vitest'
import { mat3 } from 'wgpu-matrix'
import { applyTracksToFlame } from '@/utils/timeline'
import { createTestFlame } from '@/webmcp/testUtils'
import { camera2DViewMatrix, zoomedPosition } from './camera2DView'
import type { Camera2DView } from './camera2DView'

/** Where a world point lands on screen, in clip units (-1..1 is the canvas). */
const project = (view: Camera2DView, wx: number, wy: number) => {
  const clip = mul(camera2DViewMatrix(view), vec3f(wx, wy, 1))
  return { x: clip.x / clip.z, y: clip.y / clip.z }
}

/** The pointer's way home: the inverse the pan gesture drags the world with. */
const unproject = (view: Camera2DView, cx: number, cy: number) => {
  const world = mul(
    mat3.inverse(camera2DViewMatrix(view), mat3x3f()),
    vec3f(cx, cy, 1),
  )
  return { x: world.x / world.z, y: world.y / world.z }
}

const VIEW: Camera2DView = { x: 0, y: 0, zoom: 1, rotation: 0, aspect: 1 }

describe('the 2D camera view matrix', () => {
  it('shows two world units of height at zoom 1', () => {
    expect(project(VIEW, 0, 1)).toMatchObject({ x: 0, y: 1 })
    expect(project(VIEW, 0, -1).y).toBeCloseTo(-1)
  })

  it('halves what fits for every doubling of the zoom', () => {
    expect(project({ ...VIEW, zoom: 2 }, 0, 0.5).y).toBeCloseTo(1)
  })

  it('puts the camera centre in the middle of the canvas', () => {
    const panned = { ...VIEW, x: 3, y: -2 }
    expect(project(panned, 3, -2).x).toBeCloseTo(0)
    expect(project(panned, 3, -2).y).toBeCloseTo(0)
  })

  it('spends the extra width on x, so a wide canvas shows more world', () => {
    // The height is the fixed side: aspect only ever widens the x range.
    expect(project({ ...VIEW, aspect: 2 }, 2, 0).x).toBeCloseTo(1)
    expect(project({ ...VIEW, aspect: 2 }, 0, 1).y).toBeCloseTo(1)
  })
})

describe('the 2D camera rotation', () => {
  it('turns the picture', () => {
    // The whole bug in one line: a flame exported with a rotation sweep came
    // back a still, because rotation reached the descriptor, the timeline and
    // the dope sheet but never the matrix.
    const still = project(VIEW, 1, 0)
    const turned = project({ ...VIEW, rotation: 0.7 }, 1, 0)
    expect(Math.hypot(turned.x - still.x, turned.y - still.y)).toBeGreaterThan(
      0.5,
    )
  })

  it('comes back to where it started after a full turn', () => {
    // A spin preset keyframes 0 -> 2*PI, and the loop has to close.
    const full = project({ ...VIEW, rotation: 2 * Math.PI }, 0.4, -0.9)
    expect(full.x).toBeCloseTo(project(VIEW, 0.4, -0.9).x)
    expect(full.y).toBeCloseTo(project(VIEW, 0.4, -0.9).y)
  })

  it('turns the way the 3D camera rolls', () => {
    // `cameraBasis` in lib/cameraMath.ts rotates the right/up pair by +roll,
    // which swings the picture the other way: what was at screen-right at
    // roll 0 is at screen-bottom at +90 degrees. The 2D camera is the same
    // camera, so it agrees.
    const turned = project({ ...VIEW, rotation: Math.PI / 2 }, 1, 0)
    expect(turned.x).toBeCloseTo(0)
    expect(turned.y).toBeCloseTo(-1)
  })

  it('turns around the camera centre, so a pan still frames what it framed', () => {
    const panned = { ...VIEW, x: 3, y: -2, rotation: 0.7 }
    const centre = project(panned, 3, -2)
    expect(centre.x).toBeCloseTo(0)
    expect(centre.y).toBeCloseTo(0)
    // And a point one world unit from the centre stays one clip unit away.
    const off = project(panned, 4, -2)
    expect(Math.hypot(off.x, off.y)).toBeCloseTo(1)
  })

  it('leaves the aspect correction in screen space', () => {
    // Order matters: pan, then rotate, then zoom, and only then divide x by
    // the aspect. Rotating after that division squashes the turn — the same
    // offset would land at half the distance on a 2:1 canvas.
    const wide = { ...VIEW, aspect: 2 }
    expect(project(wide, 1, 0).x).toBeCloseTo(0.5)
    const turned = project({ ...wide, rotation: Math.PI / 2 }, 1, 0)
    expect(turned.x).toBeCloseTo(0)
    expect(turned.y).toBeCloseTo(-1)
  })

  it('scales the turned frame by the zoom, not the other way round', () => {
    const one = project({ ...VIEW, rotation: 0.7 }, 0.3, 0.6)
    const two = project({ ...VIEW, rotation: 0.7, zoom: 2 }, 0.3, 0.6)
    expect(two.x).toBeCloseTo(one.x * 2)
    expect(two.y).toBeCloseTo(one.y * 2)
  })

  it('still knows where the pointer is, so a drag pans straight', () => {
    // The drag handler grabs the world point under the cursor through the
    // inverse; a rotation the inverse did not know about would send the flame
    // off sideways.
    const turned = { ...VIEW, x: 3, y: -2, rotation: 0.7, zoom: 1.5 }
    const clip = project(turned, 3.4, -1.1)
    const back = unproject(turned, clip.x, clip.y)
    expect(back.x).toBeCloseTo(3.4)
    expect(back.y).toBeCloseTo(-1.1)
  })

  it('moves with a keyframed rotation, frame by frame', () => {
    // End to end over the resolver the exporter uses: a track on
    // `camera.rotation` has to come out of `applyTracksToFlame` as a
    // different picture at a different frame.
    const tracks = [
      {
        parameterPath: 'camera.rotation',
        keyframes: [
          { frame: 0, value: 0 },
          { frame: 60, value: Math.PI / 2 },
        ],
      },
    ]
    const frame = (n: number) => {
      const flame = createTestFlame()
      applyTracksToFlame(tracks, flame, n)
      const { camera } = flame.renderSettings
      return project(
        {
          x: camera.position[0],
          y: camera.position[1],
          zoom: camera.zoom,
          rotation: camera.rotation,
          aspect: 1,
        },
        1,
        0,
      )
    }
    expect(frame(0).y).toBeCloseTo(0)
    expect(frame(30).y).toBeCloseTo(-Math.SQRT1_2)
    expect(frame(60).y).toBeCloseTo(-1)
  })
})

describe('the 2D camera view shift', () => {
  // A 1180 x 820 landscape tablet with the deck floating: the canvas is
  // 1100 px wide and the deck covers its right 380 (lib/canvasFraming.ts).
  const WIDE: Camera2DView = { ...VIEW, aspect: 1100 / 820 }
  const SHIFT = { x: -190 / 550, y: 0 }
  const shifted = (view: Camera2DView): Camera2DView => ({
    ...view,
    shift: SHIFT,
  })

  it('puts the camera centre where the shift says, in clip units', () => {
    const panned = { ...WIDE, x: 3, y: -2, rotation: 0.7, zoom: 1.5 }
    const centre = project(shifted(panned), 3, -2)
    expect(centre.x).toBeCloseTo(SHIFT.x)
    expect(centre.y).toBeCloseTo(0)
  })

  it('moves every point by the same amount, so the picture keeps its scale', () => {
    const panned = { ...WIDE, x: 0.4, y: 0.1, rotation: -0.3, zoom: 2 }
    for (const [wx, wy] of [
      [0, 0],
      [1.2, -0.7],
      [-3, 2],
    ] as const) {
      const plain = project(panned, wx, wy)
      const moved = project(shifted(panned), wx, wy)
      expect(moved.x - plain.x).toBeCloseTo(SHIFT.x)
      expect(moved.y - plain.y).toBeCloseTo(0)
    }
  })

  it('is no shift at all when left out, or zero', () => {
    const plain = camera2DViewMatrix(WIDE)
    const zero = camera2DViewMatrix({ ...WIDE, shift: { x: 0, y: 0 } })
    expect(Array.from(zero)).toEqual(Array.from(plain))
  })

  it('still knows where the pointer is', () => {
    const turned = shifted({ ...WIDE, x: 3, y: -2, rotation: 0.7, zoom: 1.5 })
    const clip = project(turned, 3.4, -1.1)
    const back = unproject(turned, clip.x, clip.y)
    expect(back.x).toBeCloseTo(3.4)
    expect(back.y).toBeCloseTo(-1.1)
  })

  it('pans the flame as far for the same drag as without it', () => {
    // WheelZoomCamera2D pans by the world distance between the grab point
    // and the pointer, both through the inverse: the shift cancels out.
    const panned = { ...WIDE, x: 1, y: 2, rotation: 0.4, zoom: 1.2 }
    const drag = (view: Camera2DView) => {
      const from = unproject(view, -0.5, 0.2)
      const to = unproject(view, -0.1, -0.3)
      return { x: to.x - from.x, y: to.y - from.y }
    }
    const plain = drag(panned)
    const moved = drag(shifted(panned))
    expect(moved.x).toBeCloseTo(plain.x)
    expect(moved.y).toBeCloseTo(plain.y)
  })

  it('keeps the point under the pointer still while zooming', () => {
    // The zoom WheelZoomCamera2D makes, which knows nothing of the shift,
    // run against a shifted camera.
    const before = shifted({ ...WIDE, x: 1, y: 2, rotation: 0.4, zoom: 1.2 })
    const pointer = { x: -0.6, y: 0.25 }
    const world = unproject(before, pointer.x, pointer.y)
    const ratio = before.zoom / (before.zoom * 1.5)
    const after = {
      ...before,
      zoom: before.zoom * 1.5,
      ...zoomedPosition(before, world, ratio),
    }
    const landed = project(after, world.x, world.y)
    expect(landed.x).toBeCloseTo(pointer.x)
    expect(landed.y).toBeCloseTo(pointer.y)
  })
})
