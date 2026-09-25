/**
 * Placement keeps a fighter's shape: conjugating every map by the placement
 * moves the attractor and nothing else. Checked on the CPU by running the
 * same chaos game in the fighter's own space and in the arena.
 */
import { describe, expect, it } from 'vitest'
import { applyAffine, composeAffine, fighterFrame, IDENTITY_AFFINE, invertAffine, PLACEMENT_AT_ORIGIN, placementAffine, placeTransform, } from './placement'
import type { Affine3, Placement, Vec3 } from './placement'

const close = (a: Vec3, b: Vec3, digits = 9) => {
  for (let n = 0; n < 3; n++) expect(a[n]).toBeCloseTo(b[n]!, digits)
}

/** A seeded generator, so a failure replays. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const randomAffine = (next: () => number): Affine3 => {
  const r = () => next() * 2 - 1
  return {
    a: 0.6 + r() * 0.3,
    b: r() * 0.4,
    c: r() * 0.4,
    d: r(),
    e: r() * 0.4,
    f: 0.6 + r() * 0.3,
    g: r() * 0.4,
    h: r(),
    i: r() * 0.4,
    j: r() * 0.4,
    k: 0.6 + r() * 0.3,
    l: r(),
  }
}

const placement: Placement = {
  position: [1.7, -0.4, 0.9],
  yaw: 0.8,
  lean: -0.3,
  scale: 0.65,
  squash: 1.4,
}

describe('invertAffine', () => {
  it('undoes the map it inverts', () => {
    const next = rng(7)
    for (let n = 0; n < 20; n++) {
      const m = randomAffine(next)
      const inverse = invertAffine(m)
      expect(inverse).toBeDefined()
      const p: Vec3 = [next() * 4 - 2, next() * 4 - 2, next() * 4 - 2]
      close(applyAffine(inverse!, applyAffine(m, p)), p)
      close(applyAffine(m, applyAffine(inverse!, p)), p)
    }
  })

  it('has no inverse for a map that flattens space', () => {
    expect(invertAffine({ ...IDENTITY_AFFINE, k: 0 })).toBeUndefined()
  })
})

describe('placementAffine', () => {
  it('is the identity at the origin', () => {
    const m = placementAffine(PLACEMENT_AT_ORIGIN)
    for (const [key, value] of Object.entries(IDENTITY_AFFINE)) {
      expect(m[key as keyof Affine3]).toBeCloseTo(value, 12)
    }
  })

  it('carries the fighter centre to its position', () => {
    close(applyAffine(placementAffine(placement), [0, 0, 0]), [1.7, -0.4, 0.9])
  })

  it('scales lengths by its scale when nothing squashes', () => {
    const m = placementAffine({ ...placement, squash: 1 })
    const [x, y, z] = applyAffine(m, [0, 1, 0])
    const [x0, y0, z0] = applyAffine(m, [0, 0, 0])
    expect(Math.hypot(x - x0, y - y0, z - z0)).toBeCloseTo(0.65, 12)
  })

  it('tips the top toward +x for a positive lean', () => {
    const m = placementAffine({ ...PLACEMENT_AT_ORIGIN, lean: 0.4 })
    const [x, y] = applyAffine(m, [0, 1, 0])
    expect(x).toBeCloseTo(Math.sin(0.4), 12)
    expect(y).toBeCloseTo(Math.cos(0.4), 12)
  })

  it('turns the front toward +x for a positive yaw', () => {
    const m = placementAffine({ ...PLACEMENT_AT_ORIGIN, yaw: 0.5 })
    close(applyAffine(m, [0, 0, 1]), [Math.sin(0.5), 0, Math.cos(0.5)])
  })

  it('keeps the volume through a squash', () => {
    const m = placementAffine({ ...PLACEMENT_AT_ORIGIN, squash: 1.8 })
    expect(m.a * m.f * m.k).toBeCloseTo(1, 12)
  })
})

describe('placeTransform', () => {
  // A small nonlinear IFS: two affines and a spherical variation between
  // the pre- and post-affine, exactly as a transform is evaluated.
  const next = rng(11)
  const maps = [0, 1, 2].map(() => ({
    preAffine: randomAffine(next),
    postAffine: randomAffine(next),
  }))
  const spherical = ([x, y, z]: Vec3): Vec3 => {
    const r2 = x * x + y * y + z * z + 1e-9
    return [x / r2, y / r2, z / r2]
  }
  const step = (t: (typeof maps)[number], p: Vec3) =>
    applyAffine(t.postAffine, spherical(applyAffine(t.preAffine, p)))

  it('draws the placed attractor exactly: G . f = f_placed . G', () => {
    const frame = placementAffine(placement)
    const inverse = invertAffine(frame)!
    const placed = maps.map((t) => placeTransform(t, frame, inverse))
    const pick = rng(3)
    let own: Vec3 = [0.1, 0.2, 0.3]
    let arena = applyAffine(frame, own)
    for (let n = 0; n < 40; n++) {
      const which = Math.floor(pick() * maps.length)
      own = step(maps[which]!, own)
      arena = step(placed[which]!, arena)
      close(arena, applyAffine(frame, own), 6)
    }
  })

  it('folds an invertible final transform into the frame', () => {
    const final = randomAffine(rng(5))
    const place = placementAffine(placement)
    const frame = fighterFrame(place, final)
    const p: Vec3 = [0.3, -0.2, 0.5]
    close(applyAffine(frame, p), applyAffine(place, applyAffine(final, p)))
  })

  it('drops a final transform that has no inverse', () => {
    const place = placementAffine(placement)
    const flat = { ...IDENTITY_AFFINE, k: 0 }
    expect(fighterFrame(place, flat)).toBe(place)
    expect(fighterFrame(place, undefined)).toBe(place)
  })

  it('composes like the maps it combines', () => {
    const a = randomAffine(rng(1))
    const b = randomAffine(rng(2))
    const p: Vec3 = [0.4, 0.1, -0.7]
    close(
      applyAffine(composeAffine(a, b), p),
      applyAffine(a, applyAffine(b, p)),
    )
  })
})
