import { cleanup, render } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { project3D } from '@/flame/affine3DView'
import { AffineGrid } from './AffineGrid'
import type { AffineParams } from '@/flame/affineTranform'

const IDENTITY_3D: AffineParams = {
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

/** The grid spans 2*EXTENT world units; mount it as a 320px square. */
const EXTENT = 1.6
const SIZE = 320

/** Screen pixel for a world point, given the stubbed 320px box at (0, 0). */
function px(world: { x: number; y: number }) {
  return {
    clientX: ((world.x / EXTENT + 1) / 2) * SIZE,
    clientY: ((-world.y / EXTENT + 1) / 2) * SIZE,
  }
}

describe('AffineGrid in 3D', () => {
  afterEach(cleanup)

  it('moves depth once per drag, not once per frame', () => {
    // jsdom has no layout: give the svg the box the maths assumes.
    const affine = { current: IDENTITY_3D }
    const { container } = render(() => (
      <AffineGrid
        affine={affine.current}
        ghosts={[]}
        is3D
        onChange={(next) => {
          affine.current = next
        }}
      />
    ))
    const svg = container.querySelector('svg')!
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: SIZE, height: SIZE }),
    })
    const zHandle = container.querySelectorAll('[class*="handleHit"]')[3]!
    Object.defineProperty(zHandle, 'setPointerCapture', { value: () => {} })
    Object.defineProperty(zHandle, 'releasePointerCapture', { value: () => {} })

    // Start on the Z handle (world (0,0,1) projected), then drag along the
    // depth diagonal by exactly one unit of depth, in two half-steps.
    const zStart = project3D(0, 0, 1)
    const one = project3D(0, 0, 1)
    const down = px(zStart)
    zHandle.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, ...down }),
    )
    const half = px({ x: zStart.x + one.x / 2, y: zStart.y + one.y / 2 })
    const full = px({ x: zStart.x + one.x, y: zStart.y + one.y })
    window.dispatchEvent(
      new MouseEvent('pointermove', { shiftKey: true, ...half }),
    )
    window.dispatchEvent(
      new MouseEvent('pointermove', { shiftKey: true, ...full }),
    )
    window.dispatchEvent(new MouseEvent('pointerup', {}))

    // The Z basis image was at depth 1; the drag asked for one more. Reading
    // the live value each move would have landed at 1 + 0.5 + 1 = 2.5.
    expect(affine.current.k).toBeCloseTo(2, 5)
    // And the plane components were held.
    expect(affine.current.c).toBeCloseTo(0, 5)
    expect(affine.current.g).toBeCloseTo(0, 5)
  })
})
