import '@/commands/builtins'
import { describe, expect, it } from 'vitest'
import { getCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { focusForCommand } from '../focus'
import { parseSession, serializeSession, SESSION_FORMAT_VERSION, validateSession, } from '../schema'
import { canonicalFlame, canonicallyEqual, diffPaths } from './canonical'
import { planCreation } from './planCreation'
import { replaySessionHeadless } from './replaySandbox'
import { SYNTHESIS_STRATEGIES } from './strategies'
import type { RecordedSession } from '../schema'
import type { SynthesisOptions } from './planCreation'

const AFFINE = (
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
) => ({ a, b, c, d, e, f })

function plan(
  target: unknown,
  options: SynthesisOptions = {},
): RecordedSession {
  const session = planCreation(target, {
    createdAt: '2026-09-18T00:00:00.000Z',
    ...options,
  })
  expect(session).toBeDefined()
  return session!
}

/** The whole claim in one helper: replay the plan, compare with the target. */
function rebuild(session: RecordedSession) {
  const flame = replaySessionHeadless(session)
  expect(flame).toBeDefined()
  return canonicalFlame(flame)
}

function expectRebuilds(target: unknown, options: SynthesisOptions = {}) {
  const session = plan(target, options)
  const expected = canonicalFlame(target)
  expect(diffPaths(rebuild(session), expected)).toEqual([])
  return session
}

const twoTransforms = {
  renderSettings: {
    exposure: 0.4,
    skipIters: 12,
    gamma: 2.6,
    vibrancy: 1.2,
    backgroundColor: [0.1, 0.05, 0.2],
    camera: { zoom: 1.8, position: [0.25, -0.5], rotation: 0.3 },
  },
  transforms: {
    tx_one: {
      probability: 0.8,
      colorSpeed: 0.2,
      color: { x: 0.3, y: 0.7 },
      preAffine: AFFINE(0.6, -0.2, 0.1, 0.35, 0.9, -0.4),
      postAffine: AFFINE(1, 0, 0.2, 0, 1, 0),
      variations: {
        v_one: { type: 'sphericalVar', weight: 0.75 },
        v_two: {
          type: 'juliaNVar',
          weight: 0.4,
          params: { power: 3, dist: 1.5 },
        },
      },
    },
    tx_two: {
      probability: 1,
      colorSpeed: 0.4,
      color: { x: 0.9, y: 0.1 },
      preAffine: AFFINE(1, 0, 0, 0, 1, 0),
      postAffine: AFFINE(0.5, 0.5, 0, -0.5, 0.5, 0),
      variations: { v_three: { type: 'swirlVar', weight: 1 } },
    },
  },
}

describe('planCreation', () => {
  it.each(SYNTHESIS_STRATEGIES)(
    'rebuilds a flame exactly with the %s strategy',
    (strategy) => {
      const session = expectRebuilds(twoTransforms, { strategy, seed: 7 })
      expect(session.synthetic?.strategy).toBe(strategy)
      expect(session.synthetic?.seed).toBe(7)
      expect(session.synthetic?.snapped).toBe(false)
      expect(session.synthetic?.residual).toEqual([])
      // Nothing was snapped, so nothing replaced the whole document.
      expect(session.actions.some((a) => a.id === 'flame.load')).toBe(false)
    },
  )

  it('starts from the app default flame and clears it as its first step', () => {
    const session = plan(twoTransforms)
    expect(canonicallyEqual(session.initial, examples.initExample)).toBe(true)
    expect(session.actions[0]?.id).toBe('flame.clearTransforms')
  })

  it('emits only existing, replayable commands, one per step', () => {
    const session = plan(twoTransforms)
    expect(session.actions.length).toBeGreaterThan(5)
    for (const action of session.actions) {
      expect(getCommand(action.id)).toBeDefined()
    }
    // The session survives the app's own front door, which is the only
    // definition of "the loader accepts this" that matters.
    expect(parseSession(serializeSession(session))).toBeDefined()
  })

  it('labels and focuses each step the way a real recording of it would', () => {
    const session = plan(twoTransforms)
    for (const action of session.actions) {
      const cmd = getCommand(action.id)!
      expect(action.label).toBe(cmd.describe?.([...action.args]) ?? cmd.label)
      expect(action.focus).toBe(focusForCommand(cmd, [...action.args]))
      expect(action.holdMs).toBe(700)
    }
    expect(session.actions.some((a) => a.focus?.startsWith('focus:'))).toBe(
      true,
    )
  })

  it('drops steps that would change nothing', () => {
    // Every transform value here is what `flame.addTransform` already creates,
    // so only the structural steps and the render settings are left.
    const session = plan({
      transforms: {
        tx_a: {
          probability: 1,
          colorSpeed: 0.4,
          color: { x: 0, y: 0 },
          preAffine: AFFINE(1, 0, 0, 0, 1, 0),
          postAffine: AFFINE(1, 0, 0, 0, 1, 0),
          variations: { v_a: { type: 'linearVar', weight: 1 } },
        },
      },
    })
    const ids = session.actions.map((a) => a.id)
    expect(ids).toContain('flame.addTransform')
    expect(ids).not.toContain('flame.setTransformAffine')
    expect(ids).not.toContain('flame.setProbability')
    expect(ids).not.toContain('flame.setVariationWeight')
    expect(ids).not.toContain('flame.setTransformColor')
  })

  it('builds a flame with many transforms', () => {
    const transforms: Record<string, unknown> = {}
    for (let index = 0; index < 12; index++) {
      transforms[`tx_${index}`] = {
        probability: 0.5 + index / 24,
        colorSpeed: 0.3,
        color: { x: index / 12, y: 1 - index / 12 },
        preAffine: AFFINE(0.5, index / 12, 0, -index / 12, 0.5, 0),
        postAffine: AFFINE(1, 0, 0, 0, 1, 0),
        variations: { [`v_${index}`]: { type: 'sinusoidalVar', weight: 0.6 } },
      }
    }
    expectRebuilds({ transforms })
  })

  it('builds variations that sit on one transform only', () => {
    expectRebuilds({
      transforms: {
        tx_heavy: {
          probability: 1,
          colorSpeed: 0.4,
          color: { x: 0, y: 0 },
          preAffine: AFFINE(1, 0, 0, 0, 1, 0),
          postAffine: AFFINE(1, 0, 0, 0, 1, 0),
          variations: {
            v_1: { type: 'linearVar', weight: 0.2 },
            v_2: { type: 'sphericalVar', weight: 0.9 },
            v_3: { type: 'swirlVar', weight: 0.35, visible: false },
            v_4: {
              type: 'pdjVar',
              weight: 0.5,
              params: { a: 1.1, b: -2.2, c: 0.3, d: 0.4 },
            },
          },
        },
        tx_bare: {
          probability: 1,
          colorSpeed: 0.4,
          color: { x: 0.5, y: 0.5 },
          preAffine: AFFINE(1, 0, 0, 0, 1, 0),
          postAffine: AFFINE(1, 0, 0, 0, 1, 0),
          variations: { v_5: { type: 'linearVar', weight: 1 } },
        },
      },
    })
  })

  it('builds a final transform', () => {
    const session = expectRebuilds({
      ...twoTransforms,
      finalTransform: AFFINE(0.9, 0.1, 0.05, -0.1, 0.9, -0.05),
    })
    expect(
      session.actions.some((a) => a.id === 'flame.setFinalTransform'),
    ).toBe(true)
  })

  it('migrates a legacy descriptor before planning it', () => {
    // Short variation names and no schema defaults — a 2023 export.
    const legacy = {
      transforms: {
        tx_legacy: {
          probability: 1,
          color: { x: 0.2, y: 0.4 },
          preAffine: AFFINE(0.7, 0, 0, 0, 0.7, 0),
          postAffine: AFFINE(1, 0, 0, 0, 1, 0),
          variations: { v_legacy: { type: 'spherical', weight: 0.8 } },
        },
      },
    }
    const session = expectRebuilds(legacy)
    const added = session.actions.find((a) => a.id === 'flame.addTransform')
    expect(added?.args[0]).toBe('sphericalVar')
  })

  it('accepts the { flame, animation } wrapper a PNG can carry', () => {
    expectRebuilds({
      flame: twoTransforms,
      animation: { tracks: [], config: { fps: 30 } },
    })
  })

  it('reproduces the same journey for the same seed, and differs for another', () => {
    const ids = (seed: number) =>
      plan(twoTransforms, { strategy: 'surprise', seed }).actions.map(
        (a) => a.id,
      )
    expect(ids(11)).toEqual(ids(11))
    expect(ids(11)).not.toEqual(ids(12))
  })

  it('snaps, and says what it snapped, when a step cap is reached', () => {
    const session = plan(twoTransforms, { maxSteps: 3 })
    expect(session.actions).toHaveLength(4)
    expect(session.actions.at(-1)?.id).toBe('flame.load')
    expect(session.synthetic?.snapped).toBe(true)
    expect(
      session.synthetic?.residual.some((r) => r.startsWith('truncated:')),
    ).toBe(true)
    expect(diffPaths(rebuild(session), canonicalFlame(twoTransforms))).toEqual(
      [],
    )
  })

  it('snaps a symmetry transform no command can recreate', () => {
    const target = {
      ...twoTransforms,
      transforms: {
        ...twoTransforms.transforms,
        _sym__abc: {
          probability: 1,
          colorSpeed: 0.4,
          color: { x: 0.1, y: 0.1 },
          preAffine: AFFINE(0, -1, 0, 1, 0, 0),
          postAffine: AFFINE(1, 0, 0, 0, 1, 0),
          variations: { v_sym: { type: 'linearVar', weight: 1 } },
        },
      },
    }
    const session = plan(target)
    expect(session.synthetic?.snapped).toBe(true)
    expect(session.synthetic?.residual.join(' ')).toContain('_sym__abc')
    // The journey is incomplete, the destination is not.
    expect(diffPaths(rebuild(session), canonicalFlame(target))).toEqual([])
  })

  it('honours holdMs and stamps steps with it', () => {
    const session = plan(twoTransforms, { holdMs: 1200 })
    expect(session.actions[0]?.t).toBe(0)
    expect(session.actions[1]?.t).toBe(1200)
    expect(session.actions.every((a) => a.holdMs === 1200)).toBe(true)
  })

  it('refuses something that is not a flame', () => {
    expect(planCreation({ nope: true })).toBeUndefined()
    expect(planCreation(null)).toBeUndefined()
  })
})

describe('the synthetic marker', () => {
  it('is absent from a recorded session, which still validates', () => {
    const recorded = validateSession({
      version: SESSION_FORMAT_VERSION,
      app: { version: '0.0.0', flameSchemaVersion: '1.0' },
      createdAt: '2026-01-01T00:00:00.000Z',
      initial: examples.initExample,
      actions: [],
      unnamedWriteCount: 0,
    })
    expect(recorded).toBeDefined()
    expect(recorded?.synthetic).toBeUndefined()
  })

  it('survives a serialize/parse round trip', () => {
    const session = plan(twoTransforms, { strategy: 'layered', seed: 3 })
    const reparsed = parseSession(serializeSession(session))
    expect(reparsed?.synthetic).toEqual(session.synthetic)
  })

  it('is refused when it claims an out-of-range seed', () => {
    const session = plan(twoTransforms)
    expect(
      validateSession({
        ...session,
        synthetic: { strategy: 'layered', seed: -1 },
      }),
    ).toBeUndefined()
  })
})
