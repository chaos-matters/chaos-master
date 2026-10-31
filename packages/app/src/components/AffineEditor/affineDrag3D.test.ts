/**
 * The 3D affine drags, replayed against a Solid store the way the editor runs
 * them: the handle grabs `props.transform` (a node of the flame store), and
 * every pointer move writes a whole new affine back through `reconcile`, as
 * `flame.setTransformAffine` does. `reconcile` updates the stored affine in
 * place, so the node the drag grabbed keeps changing under it. A grab that
 * re-reads that node adds each move's offset to the previous move's result
 * instead of to the transform at pointer-down.
 */
import { createRoot } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { describe, expect, it } from 'vitest'
import { grab3DAffine, pointerTurn, scaledRotated3D, translated3D, } from './affineDrag3D'
import type { AffineParams } from '@/flame/affineTranform'

// 3D Shells' second transform (example33): already in the 3D layout.
const SHELL: AffineParams = {
  a: 0.7,
  b: 0.1,
  c: 0,
  d: 0.25,
  e: -0.1,
  f: 0.7,
  g: 0,
  h: -0.5,
  i: 0,
  j: 0,
  k: 0.7,
  l: 0,
}

type Doc = { transforms: { t1: { preAffine: AffineParams } } }

/** A flame store, and a writer that lands an affine the way the command does. */
function flameStore(affine: AffineParams) {
  const [store, setStore] = createStore<Doc>({
    transforms: { t1: { preAffine: { ...affine } } },
  })
  const write = (next: AffineParams) => {
    setStore(reconcile({ transforms: { t1: { preAffine: { ...next } } } }))
  }
  return { node: () => store.transforms.t1.preAffine, write }
}

describe('a 3D translate drag', () => {
  it('moves the centre by the pointer offset, not by the sum of every move', () => {
    createRoot((dispose) => {
      const { node, write } = flameStore(SHELL)
      const grab = grab3DAffine(node())
      // Ten pointer moves, each 0.05 further from the grab point in x and
      // 0.02 in y: the last one is 0.5, 0.2 from where it grabbed.
      for (let step = 1; step <= 10; step++) {
        write(translated3D(grab, 0.05 * step, 0.02 * step))
      }
      expect(node().d).toBeCloseTo(0.25 + 0.5, 12)
      expect(node().h).toBeCloseTo(-0.5 + 0.2, 12)
      // The rest of the affine is the transform at pointer-down.
      expect({ ...node(), d: 0, h: 0 }).toEqual({ ...SHELL, d: 0, h: 0 })
      dispose()
    })
  })
})

describe('a 3D rotate drag', () => {
  it('turns the local axis by the pointer angle, not by the sum of every move', () => {
    createRoot((dispose) => {
      const { node, write } = flameStore(SHELL)
      const grab = grab3DAffine(node())
      // Ten moves sweeping the pointer 2 degrees further each time: the
      // last one is 20 degrees from the grab, at the same radius.
      const deg = Math.PI / 180
      for (let step = 1; step <= 10; step++) {
        const turn = 2 * step * deg
        write(scaledRotated3D(grab, 'X', Math.cos(turn), Math.sin(turn), 1))
      }
      const c = Math.cos(20 * deg)
      const s = Math.sin(20 * deg)
      expect(node().a).toBeCloseTo(0.7 * c - -0.1 * s, 12)
      expect(node().e).toBeCloseTo(0.7 * s + -0.1 * c, 12)
      expect(node().i).toBe(0)
      // The other two axes and the translation are untouched.
      expect([node().b, node().f, node().j]).toEqual([0.1, 0.7, 0])
      expect([node().c, node().g, node().k]).toEqual([0, 0, 0.7])
      expect([node().d, node().h, node().l]).toEqual([0.25, -0.5, 0])
      dispose()
    })
  })

  it('scales the local axis by the pointer distance ratio, once', () => {
    createRoot((dispose) => {
      const { node, write } = flameStore(SHELL)
      const grab = grab3DAffine(node())
      // The pointer pulled out to 1.1, 1.2 and then 1.5 times its grab radius.
      for (const ratio of [1.1, 1.2, 1.5]) {
        write(scaledRotated3D(grab, 'Z', 1, 0, ratio))
      }
      expect([node().c, node().g, node().k]).toEqual([0, 0, 0.7 * 1.5])
      dispose()
    })
  })
})

describe('the 2D layout', () => {
  it('promotes a 2D affine at the grab, so the drag writes the 3D layout', () => {
    const flat = { a: 2, b: 0.5, c: 0.25, d: -0.5, e: 1.5, f: 0.75 }
    expect(translated3D(grab3DAffine(flat), 0.1, -0.1)).toEqual({
      a: 2,
      b: 0.5,
      c: 0,
      d: 0.35,
      e: -0.5,
      f: 1.5,
      g: 0,
      h: 0.65,
      i: 0,
      j: 0,
      k: 1,
      l: 0,
    })
  })

  it('treats the dashed end as a flip of the axis', () => {
    const t = scaledRotated3D(SHELL, 'Y', 1, 0, -1)
    expect([t.b, t.f, t.j]).toEqual([-0.1, -0.7, -0])
  })
})

describe('the turn a rotate drag reads from the pointer', () => {
  it('turns the axis the way the pointer went round the centre', () => {
    // Grabbed on +x at radius 0.5, pointer moved a quarter turn
    // counter-clockwise to +y at radius 1: the X axis has to end up on +y,
    // twice as long, or the end handle swings away from the pointer.
    const turn = pointerTurn({ x: 0.5, y: 0 }, { x: 0, y: 1 })
    expect(turn).toEqual({ cos: 0, sin: 1, ratio: 2 })
    const t = scaledRotated3D(
      { ...SHELL, a: 0.5, e: 0, i: 0 },
      'X',
      turn.cos,
      turn.sin,
      turn.ratio,
    )
    expect([t.a, t.e, t.i]).toEqual([0, 1, 0])
  })

  it('reads a clockwise turn as a negative angle', () => {
    const c = Math.cos(Math.PI / 6)
    const s = Math.sin(Math.PI / 6)
    const turn = pointerTurn({ x: 1, y: 0 }, { x: c, y: -s })
    expect(turn.cos).toBeCloseTo(c, 12)
    expect(turn.sin).toBeCloseTo(-s, 12)
    expect(turn.ratio).toBeCloseTo(1, 12)
  })
})
