/**
 * The fight flame: both fighters tagged with their teams, one shader for a
 * whole bout, and the fight uniforms carried through to the renderer.
 */
import { describe, expect, it } from 'vitest'
import { clashTeamsOf, clashTeamsSignature } from '../clashTeams'
import { examples } from '../examples'
import { resolveIfsWgsl } from '../ifsPipelineWgsl.testUtils'
import { shaderShapeOf } from '../shaderShape'
import { extractFlameUniforms3D } from '../transformFunction3D'
import { BEAM_FRONT, BOUT_SECONDS, boutFrame, wallTime } from './choreographer'
import { BEAM_FULL_LENGTH, BEAM_SHARE, beamId, clashFighter, fightFlame, STAGE_SETTINGS, unfitReason, } from './fightFlame'
import { applyAffine } from './placement'
import type { FlameDescriptor, TransformFunction, TransformId, } from '../schema/flameSchema'
import type { BoutFrame } from './choreographer'
import type { Affine3, Vec3 } from './placement'

const galaxy = clashFighter(examples.example37)
const gasket = clashFighter(examples.goldenApollonianGasket)
const options = { winner: 'A' as const, reducedMotion: false }

/** Where a beam sends the point `p`: its pre-affine, variation, post-affine. */
function throughBeam(beam: TransformFunction, p: Vec3): Vec3 {
  const [u, v, w] = applyAffine(beam.preAffine as Affine3, p)
  const [variation] = Object.values(beam.variations)
  const bent: Vec3 =
    variation?.type === 'sinusoidal3D'
      ? [Math.sin(u), Math.sin(v), Math.sin(w)]
      : [u, v, w]
  if (variation?.type !== 'sinusoidal3D' && variation?.type !== 'linear3D') {
    throw new Error(`a beam of ${String(variation?.type)}`)
  }
  return applyAffine(beam.postAffine as Affine3, bent)
}

describe('fightFlame', () => {
  const flame = fightFlame(galaxy, gasket, boutFrame(4, options))

  it('puts every transform of each fighter, and its beam, on its team', () => {
    const teams = clashTeamsOf(flame.transforms)
    expect(teams.enabled).toBe(true)
    expect(teams.a).toEqual([
      ...Object.keys(examples.example37.transforms).map((t) => `a_${t}`),
      beamId('A'),
    ])
    expect(teams.b).toEqual([
      ...Object.keys(examples.goldenApollonianGasket.transforms).map(
        (t) => `b_${t}`,
      ),
      beamId('B'),
    ])
  })

  it('compiles one shader for the whole bout', () => {
    const key = (f: FlameDescriptor) =>
      JSON.stringify([
        shaderShapeOf(f.transforms),
        clashTeamsSignature(clashTeamsOf(f.transforms)),
      ])
    const first = key(fightFlame(galaxy, gasket, boutFrame(0, options)))
    for (let wall = 0; wall <= BOUT_SECONDS; wall += 0.25) {
      const f = fightFlame(galaxy, gasket, boutFrame(wall, options))
      expect(key(f)).toBe(first)
    }
  })

  it('compiles the team kernel for it', () => {
    const wgsl = resolveIfsWgsl({ transforms: flame.transforms, dims: 3 })
    expect(wgsl).toContain('fn clashIndexHash(')
  })

  it('carries the fight uniforms and the flash', () => {
    const frame = boutFrame(4, options)
    expect(flame.renderSettings.clash).toEqual({
      split: frame.split,
      leakA: frame.leakA,
      leakB: frame.leakB,
    })
    const flash = fightFlame(galaxy, gasket, { ...frame, exposure: 2 })
    expect(flash.renderSettings.exposure).toBeCloseTo(
      STAGE_SETTINGS.exposure + Math.log(2),
      12,
    )
  })

  it('renders on the neutral 3D stage, without a palette', () => {
    expect(flame.renderSettings.dimensions).toBe(3)
    expect(flame.renderSettings.palette).toBeUndefined()
  })

  it('gives the renderer finite uniforms for every transform', () => {
    const uniforms = extractFlameUniforms3D(flame)
    expect(Object.keys(uniforms)).toHaveLength(
      Object.keys(flame.transforms).length,
    )
    const numbers = JSON.stringify(uniforms).match(/-?[\d.e+-]+|null/g) ?? []
    expect(numbers).not.toContain('null')
  })

  it('draws no beam outside one, and a beam steps in step with its length', () => {
    // The beam's share of all the steps its team's walkers take.
    const share = (f: FlameDescriptor, team: 'A' | 'B') => {
      const steps = Object.values(f.transforms).filter(
        (t) => t.team === team && t.visible,
      )
      const total = steps.reduce((sum, t) => sum + t.probability, 0)
      return f.transforms[beamId(team)]!.probability / total
    }
    const length = (pose: BoutFrame['a']) => {
      const x = pose.placement.position[0]
      const front =
        x + Math.sign(pose.beam.to - x) * BEAM_FRONT * pose.placement.scale
      return Math.abs(pose.beam.to - front)
    }
    expect(share(flame, 'A')).toBe(0)
    // Lit as brightly along its length whether it is long or short: a beam
    // of unit length takes BEAM_SHARE, a longer one more.
    const frame = boutFrame(6.6, options)
    const clash = fightFlame(galaxy, gasket, frame)
    expect(share(clash, 'A')).toBeCloseTo(BEAM_SHARE * length(frame.a), 9)
    expect(share(clash, 'B')).toBeCloseTo(BEAM_SHARE * length(frame.b), 9)
    expect(share(clash, 'A')).toBeGreaterThan(share(clash, 'B'))
    // Past BEAM_FULL_LENGTH a beam takes no more of its fighter's walkers:
    // the fighter would be left hollow behind it.
    const long = boutFrame(wallTime(8.45), options)
    expect(length(long.a)).toBeGreaterThan(BEAM_FULL_LENGTH)
    expect(share(fightFlame(galaxy, gasket, long), 'A')).toBeCloseTo(
      BEAM_SHARE * BEAM_FULL_LENGTH,
      9,
    )
    // Never less than half the share, nor more than that.
    for (let wall = 0; wall <= BOUT_SECONDS; wall += 0.1) {
      const f = fightFlame(galaxy, gasket, boutFrame(wall, options))
      for (const team of ['A', 'B'] as const) {
        expect(share(f, team)).toBeLessThanOrEqual(
          BEAM_SHARE * BEAM_FULL_LENGTH + 1e-12,
        )
      }
    }
  })

  it('lays a beam from its fighter to the contact point', () => {
    const frame = boutFrame(6.6, options)
    const clash = fightFlame(galaxy, gasket, frame)
    const beam = clash.transforms[beamId('A')]!
    const [x, y, z] = frame.a.placement.position
    const size = frame.a.placement.scale
    // The fighter's far side lands on the contact point, its near side on
    // its front, and its whole body on a thin rod.
    const far = throughBeam(beam, [x + size, y + size, z])
    expect(far[0]).toBeCloseTo(frame.a.beam.to, 9)
    expect(Math.abs(far[1] - y)).toBeLessThan(0.15 * size)
    const near = throughBeam(beam, [x - size, y, z])
    expect(near[0]).toBeCloseTo(x + 0.3 * size, 9)
  })

  it('never throws a point past either end of its beam, wherever it starts', () => {
    // A walker far from its own fighter, one a leak carried into the other,
    // lands on the rod too: the Devour's stream must end at the winner.
    const moments = [
      [6.6, 'A'],
      [6.6, 'B'],
      [8.45, 'A'],
      [9.0, 'B'],
      [9.4, 'B'],
    ] as const
    for (const [story, team] of moments) {
      const frame = boutFrame(wallTime(story), options)
      const pose = team === 'A' ? frame.a : frame.b
      expect(pose.beam.amount).toBeGreaterThan(0)
      const beam = fightFlame(galaxy, gasket, frame).transforms[beamId(team)]!
      const [x, y, z] = pose.placement.position
      const size = pose.placement.scale
      const front = x + Math.sign(pose.beam.to - x) * 0.3 * size
      const low = Math.min(front, pose.beam.to) - 1e-9
      const high = Math.max(front, pose.beam.to) + 1e-9
      for (let px = -6; px <= 6; px += 0.25) {
        for (const offset of [-2, 0, 2]) {
          const [bx, by, bz] = throughBeam(beam, [px, y + offset, z - offset])
          expect(bx).toBeGreaterThanOrEqual(low)
          expect(bx).toBeLessThanOrEqual(high)
          expect(Math.abs(by - y)).toBeLessThanOrEqual(0.2 * size + 1e-9)
          expect(Math.abs(bz - z)).toBeLessThanOrEqual(0.2 * size + 1e-9)
        }
      }
    }
  })

  it('fills its rod across with the body it carries, not just its edges', () => {
    // Across the rod the body's own spread survives nearly unbent, so the
    // beam is lit through its core rather than drawn as two bright edges.
    const frame = boutFrame(6.6, options)
    const beam = fightFlame(galaxy, gasket, frame).transforms[beamId('A')]!
    const [x, y, z] = frame.a.placement.position
    const size = frame.a.placement.scale
    const across = (d: number) => throughBeam(beam, [x, y + d, z])[1] - y
    for (const part of [0.25, 0.5, 0.75]) {
      const ratio = across(part * size) / across(size)
      expect(Math.abs(ratio - part)).toBeLessThan(0.05)
    }
    expect(across(size)).toBeCloseTo(0.1 * size, 9)
  })

  it('keeps a fighter transform whose id is the word beam', () => {
    const named = structuredClone(examples.example37)
    const [first, ...rest] = Object.entries(named.transforms)
    named.transforms = Object.fromEntries([['beam', first![1]], ...rest])
    const f = fightFlame(clashFighter(named), gasket, boutFrame(6.6, options))
    const fighters =
      Object.keys(named.transforms).length +
      Object.keys(examples.goldenApollonianGasket.transforms).length
    expect(Object.keys(f.transforms)).toHaveLength(fighters + 2)
    expect(f.transforms['a_beam' as TransformId]?.probability).toBe(
      first![1].probability,
    )
  })

  it('keeps a hidden transform hidden', () => {
    const hidden = structuredClone(examples.example37)
    Object.values(hidden.transforms)[0]!.visible = false
    const f = fightFlame(clashFighter(hidden), gasket, boutFrame(4, options))
    expect(Object.values(f.transforms)[0]!.visible).toBe(false)
  })
})

describe('unfitReason', () => {
  it('accepts a flame with a live transform', () => {
    expect(unfitReason(examples.example37)).toBeUndefined()
  })

  it('refuses a flame whose transforms are all hidden or weightless', () => {
    const dead = structuredClone(examples.example2)
    for (const t of Object.values(dead.transforms)) t.visible = false
    expect(unfitReason(dead)).toMatch(/no visible transform/)
    const weightless = structuredClone(examples.example2)
    for (const t of Object.values(weightless.transforms)) t.probability = 0
    expect(unfitReason(weightless)).toMatch(/no visible transform/)
  })
})
