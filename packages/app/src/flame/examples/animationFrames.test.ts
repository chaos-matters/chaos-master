/**
 * Every frame a bundled animation can show is a valid flame.
 *
 * A frame is what playback, scrubbing, replay and export hand the renderer
 * and embed in what they write, so an invalid one is a PNG that will not open
 * again and a document that will not share. Keyframes alone prove nothing:
 * interpolation between two whole numbers is a fraction, and an eased or
 * spline segment overshoots its ends.
 *
 * Sampled at every keyframe, every midpoint between neighbouring keyframes and
 * a seeded set of random times, under each loop mode, because loop synthesis
 * resolves times the keyframes never name.
 */
import { flameDomainPlans, projectNumber } from '@chaos-master/core'
import { describe, expect, it } from 'vitest'
import { validateFlameWithErrors } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { applyTracksToFlame, defaultConfig, getUserEndFrame, loopOptsFromConfig, } from '@/utils/timeline'
import { animationDefs, getAnimationFlame } from './animations'
import type { DomainPlan, NumberDomain } from '@chaos-master/core'
import type { AnimationDef } from './animations'
import type { LoopMode, TimelineConfig } from '@/utils/timeline'

const RANDOM_TIMES_PER_ANIMATION = 24
const LOOP_MODES: readonly LoopMode[] = ['off', 'seamless', 'cycle']

/** mulberry32: small, seeded, and the same on every machine. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleTimes(anim: AnimationDef, span: number, seed: number) {
  const keyed = [
    ...new Set(anim.tracks.flatMap((t) => t.keyframes.map((k) => k.frame))),
  ].sort((a, b) => a - b)
  const midpoints = keyed.slice(1).map((f, i) => (f + keyed[i]!) / 2)
  const random = seededRandom(seed)
  const randomTimes = Array.from(
    { length: RANDOM_TIMES_PER_ANIMATION },
    () => random() * span,
  )
  return [...keyed, ...midpoints, ...randomTimes]
}

function configFor(anim: AnimationDef, loopMode: LoopMode): TimelineConfig {
  const userEnd = getUserEndFrame(anim.tracks, 0)
  return { ...defaultConfig(), endFrame: Math.max(1, userEnd), loopMode }
}

function invalidFrames(anim: AnimationDef, seed: number): string[] {
  const base = getAnimationFlame(anim)
  const failures: string[] = []
  for (const loopMode of LOOP_MODES) {
    const config = configFor(anim, loopMode)
    const loop = loopOptsFromConfig(config, anim.tracks)
    // Seamless plays the synthesized return tail after the user's content.
    const span = loopMode === 'seamless' ? config.endFrame * 2 : config.endFrame
    for (const frame of sampleTimes(anim, span, seed)) {
      const flame = deepClone(base)
      applyTracksToFlame(anim.tracks, flame, frame, loop)
      const errors: string[] = []
      validateFlameWithErrors(flame, (err) => errors.push(err))
      if (errors.length > 0) {
        failures.push(
          `${anim.id} ${loopMode} frame ${frame.toFixed(3)}: ${errors.join('; ')}`,
        )
      }
    }
  }
  return failures
}

describe('bundled animation frames', () => {
  it('covers the whole bundled set', () => {
    expect(animationDefs.length).toBeGreaterThanOrEqual(81)
  })

  it('every sampled frame of every bundled animation validates', () => {
    const failures = animationDefs.flatMap((anim, i) =>
      invalidFrames(anim, 0x5eed + i),
    )
    const byAnimation = new Set(failures.map((f) => f.split(' ')[0]))
    const summary = [...byAnimation].join('\n')
    const first = failures.slice(0, 12).join('\n')
    expect(
      failures,
      `${failures.length} invalid frames in ${byAnimation.size} animations:\n${summary}\n\nfirst failures:\n${first}`,
    ).toEqual([])
  })
})

/** The schema domain a render-setting track writes into, if it has one. */
function trackDomain(parameterPath: string): DomainPlan | undefined {
  const { flat } = flameDomainPlans()
  let plan: DomainPlan | undefined = flat
  for (const key of ['renderSettings', ...parameterPath.split('.')]) {
    if (plan?.kind !== 'fields') return undefined
    plan = plan.fields.find(([k]) => k === key)?.[1]
  }
  return plan
}

function outside(value: unknown, plan: DomainPlan | undefined): boolean {
  if (!plan) return false
  const inDomain = (v: unknown, d: NumberDomain) =>
    typeof v !== 'number' || projectNumber(v, d) === v
  if (plan.kind === 'number') {
    return !plan.domain.cyclic && !inDomain(value, plan.domain)
  }
  if (plan.kind === 'fields' && Array.isArray(value)) {
    return plan.fields.some(
      ([i, item]) =>
        item.kind === 'number' && !inDomain(value[i as number], item.domain),
    )
  }
  return false
}

describe('bundled keyframes', () => {
  // A cyclic field is exempt: palettePhase keyed 0 -> 2 is two turns of the
  // palette, which no pair of in-range keys can say, and every frame of it
  // still lands in range. ex11-dark-pulse, ex12-color-refraction,
  // ex14-hex-drift and ex16-ngon-crystallize key it that way on purpose.
  it('hold every bounded render setting inside its schema domain', () => {
    const outOfRange = animationDefs.flatMap((anim) =>
      anim.tracks.flatMap((track) =>
        track.keyframes
          .filter((kf) => outside(kf.value, trackDomain(track.parameterPath)))
          .map(
            (kf) =>
              `${anim.id} ${track.parameterPath} @${kf.frame} = ${String(kf.value)}`,
          ),
      ),
    )
    expect(outOfRange).toEqual([])
  })
})
