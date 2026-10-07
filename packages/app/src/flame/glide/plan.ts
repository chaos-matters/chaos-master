/**
 * `planGlide(a, b, opts)` — everything a transition needs, as data.
 *
 * The whole trick is the union descriptor: give the base a document that
 * contains everything EITHER side needs, and let weight decide what is
 * visible. A transform only B has is inserted at B's shape with probability
 * zero and rises; a transform only A has falls to zero; a variation whose type
 * changed is a removal and an addition, both present at once, crossfading.
 *
 * Two invariants hold everywhere below:
 *
 *  - **Σp = 1 at every sample.** The chaos game uses `p_i / Σp`, so fading one
 *    transform out while another rises silently re-weights every UNTOUCHED
 *    transform. The fix is analytic, not per-frame: normalise both endpoints
 *    so they each sum to 1, force `linear` interpolation on probability, and
 *    ease every probability channel with the SAME curve. Then
 *    `Σp(t) = (1-u)·1 + u·1 = 1` for every t and every easing.
 *  - **The end state is exactly B.** Normalising changes the stored numbers,
 *    so the glide is not the thing that writes the end state: `plan.settle` is
 *    the exact canonical B and the runtime applies it when the glide finishes.
 */

import { isSafeFlameEntityId, MAX_FLAME_ENTITY_ID_LENGTH, MAX_FLAME_TRANSFORMS, MAX_FLAME_VARIATIONS, MAX_VARIATIONS_PER_TRANSFORM, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { MAX_TIMELINE_KEYFRAMES } from '@/flame/schema/timeline'
import { deepClone } from '@/utils/clone'
import { recordEntries } from '@/utils/record'
import { decomposedDeviation, isNearSingular, isReflection, lerpAngleShortest, lerpNumber, lerpScaleLog, } from './affine'
import { clampGlideMs, classifyChange, easingFor, GLIDE_DURATIONS, GLIDE_ENTER_EASING, GLIDE_EXIT_EASING, glideFrameCount, } from './durations'
import { pairTransforms, pairVariations } from './pairing'
import { resolveGlideQuality } from './quality'
import { APPLIED_SCALAR_SETTINGS, APPLIED_STRING_SETTINGS, APPLIED_VECTOR_SETTINGS, identityAffine2D, RESERVED_PATH_HEADS, UNSUNK_RENDER_SETTINGS, } from './sample'
import { buildGlideTracks, glideTrackCost } from './tracks'
import type { GlideAffine, GlideChangeClass, GlideChannel, GlideNote, GlideOptions, GlidePlan, GlideRefusal, } from './types'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'
import type { EasingCurve } from '@/flame/schema/timeline'

/** Frames per second a plan assumes when the caller does not say. */
export const DEFAULT_GLIDE_FPS = 24

type Transform = TransformFunction
/** The structural part of a variation descriptor the planner reads and writes.
 *  The schema's record is keyed by a branded id and its value is a 400-member
 *  discriminated union; neither can be indexed or rebuilt generically. */
type MutableVariation = {
  type: string
  weight: number
  visible?: boolean
  params?: Record<string, number>
}

const EPSILON = 1e-12

function canonicalise(input: unknown): FlameDescriptor | undefined {
  // `tryValidateFlame` migrates legacy variation names IN PLACE, so a planner
  // must not be handed the caller's object.
  const source =
    input !== null && typeof input === 'object' ? deepClone(input) : input
  return tryValidateFlame(source)
}

function transformsOf(flame: FlameDescriptor): Record<string, Transform> {
  return flame.transforms
}

function variationsOf(transform: Transform): Record<string, MutableVariation> {
  return transform.variations
}

/** What this transform actually contributes to the chaos game. */
function effectiveProbability(transform: Transform): number {
  if (!transform.visible) return 0
  return Math.max(0, transform.probability)
}

function effectiveWeight(variation: MutableVariation): number {
  return variation.visible === false ? 0 : variation.weight
}

function probabilitySum(flame: FlameDescriptor): number {
  let sum = 0
  for (const [, transform] of recordEntries(transformsOf(flame))) {
    sum += effectiveProbability(transform)
  }
  return sum
}

function paramsOf(variation: MutableVariation): Record<string, number> {
  const params = variation.params
  if (params === undefined || params === null) return {}
  const numeric: Record<string, number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'number' && Number.isFinite(value))
      numeric[key] = value
  }
  return numeric
}

function affinesEqual(a: GlideAffine, b: GlideAffine): boolean {
  return (
    a.a === b.a &&
    a.b === b.b &&
    a.c === b.c &&
    a.d === b.d &&
    a.e === b.e &&
    a.f === b.f
  )
}

function differingAffineComponents(a: GlideAffine, b: GlideAffine): string[] {
  const left = a as unknown as Record<string, number>
  const right = b as unknown as Record<string, number>
  return ['a', 'b', 'c', 'd', 'e', 'f'].filter(
    (component) => left[component] !== right[component],
  )
}

/**
 * How far a curved channel strays from the straight line between its ends.
 *
 * Used twice: as the cheap precheck that keeps a translation-only edit down to
 * two keyframes per coefficient, and as the order in which curved channels are
 * straightened when the baked form will not fit the keyframe budget.
 */
function channelDeviation(channel: GlideChannel): number {
  if (channel.kind === 'affine') {
    return channel.mode === 'decompose'
      ? decomposedDeviation(channel.from, channel.to)
      : 0
  }
  if (channel.kind !== 'scalar' || channel.mode === 'linear') return 0
  let worst = 0
  for (let index = 1; index < 8; index++) {
    const t = index / 8
    const curved =
      channel.mode === 'angle'
        ? lerpAngleShortest(channel.from, channel.to, t)
        : lerpScaleLog(channel.from, channel.to, t)
    worst = Math.max(
      worst,
      Math.abs(curved - lerpNumber(channel.from, channel.to, t)),
    )
  }
  return worst
}

/** Below this the curved path and the straight one are the same picture. */
const DEVIATION_EPSILON = 1e-6

function mintUnusedId(preferred: string, taken: Set<string>): string {
  if (!taken.has(preferred) && isSafeFlameEntityId(preferred)) return preferred
  for (let index = 1; index < 1000; index++) {
    const candidate = `${preferred}_g${index}`.slice(
      0,
      MAX_FLAME_ENTITY_ID_LENGTH,
    )
    if (!taken.has(candidate) && isSafeFlameEntityId(candidate)) {
      return candidate
    }
  }
  return `glide_${taken.size}`
}

export function planGlide(
  flameA: unknown,
  flameB: unknown,
  options: GlideOptions = {},
): GlidePlan | GlideRefusal {
  const a = canonicalise(flameA)
  const b = canonicalise(flameB)
  if (!a) return { refused: true, reason: 'The starting flame is not valid.' }
  if (!b) return { refused: true, reason: 'The target flame is not valid.' }

  const dimensionsA = a.renderSettings.dimensions ?? 2
  const dimensionsB = b.renderSettings.dimensions ?? 2
  if (dimensionsA !== dimensionsB) {
    return {
      refused: true,
      // The wording the blend picker already uses: a 3D transform's affine
      // carries g..l and a 2D one does not, so the pairing fails validation.
      reason:
        'A glide needs both flames in the same dimension — a 3D transform carries affine components a 2D one does not.',
    }
  }
  if (dimensionsA === 3) {
    return {
      refused: true,
      reason:
        'Gliding a 3D flame is not supported yet: the timeline has no sink for a 3D final transform, camera roll or camera target.',
    }
  }

  const quality = resolveGlideQuality(options.quality, options.qualityPreset)
  const fps =
    options.fps !== undefined && Number.isFinite(options.fps) && options.fps > 0
      ? Math.round(options.fps)
      : DEFAULT_GLIDE_FPS

  const notes: GlideNote[] = []
  const channels: GlideChannel[] = []

  const sumA = probabilitySum(a)
  const sumB = probabilitySum(b)
  if (Math.abs(sumA - 1) > 1e-9 || Math.abs(sumB - 1) > 1e-9) {
    notes.push({ kind: 'probabilityNormalised', sumA, sumB })
  }
  const scaleA = sumA > EPSILON ? 1 / sumA : 1
  const scaleB = sumB > EPSILON ? 1 / sumB : 1

  const transformsA = transformsOf(a)
  const transformsB = transformsOf(b)
  const pairing = pairTransforms(a, b)

  let variationsAdded = 0
  let variationsRemoved = 0
  const baseTransforms: Record<string, Transform> = {}
  const takenTransformIds = new Set<string>([
    ...pairing.matched.map((pair) => pair.idA),
    ...pairing.onlyA,
  ])

  /** A transform id a track can never address is one the glide cannot animate. */
  function addressable(id: string): boolean {
    if (!RESERVED_PATH_HEADS.has(id)) return true
    notes.push({
      kind: 'snapAtSettle',
      path: id,
      reason: `"${id}" collides with a timeline path head, so this transform snaps instead of gliding`,
    })
    return false
  }

  const classEasing = easingFor('scalar')

  function unionVariations(
    id: string,
    from: Transform,
    to: Transform,
    canAnimate: boolean,
  ): Record<string, MutableVariation> {
    const variationsA = variationsOf(from)
    const variationsB = variationsOf(to)
    const pair = pairVariations(from.variations, to.variations)
    const result: Record<string, MutableVariation> = {}
    // Only ids that will actually appear in the union. Seeding this with B's
    // ids too would push every added variation onto a minted key, which is a
    // different variation from the one the settle then writes.
    const taken = new Set<string>(Object.keys(variationsA))

    const emitWeight = (
      vid: string,
      fromWeight: number,
      toWeight: number,
      easing: EasingCurve,
    ) => {
      if (!canAnimate || fromWeight === toWeight) return
      channels.push({
        kind: 'scalar',
        path: `${id}.${vid}`,
        from: fromWeight,
        to: toWeight,
        mode: 'linear',
        easing,
      })
    }

    for (const { idA, idB } of pair.matched) {
      const left = variationsA[idA]!
      const right = variationsB[idB]!
      const paramsLeft = paramsOf(left)
      const paramsRight = paramsOf(right)
      const params: Record<string, number> = { ...paramsRight, ...paramsLeft }
      result[idA] = {
        ...deepClone(left),
        weight: effectiveWeight(left),
        visible: left.visible !== false || right.visible !== false,
        ...(Object.keys(params).length > 0 ? { params } : {}),
      }
      emitWeight(
        idA,
        effectiveWeight(left),
        effectiveWeight(right),
        classEasing,
      )
      if (!canAnimate) continue
      for (const key of Object.keys(params)) {
        const fromValue = paramsLeft[key] ?? paramsRight[key]!
        const toValue = paramsRight[key] ?? paramsLeft[key]!
        if (fromValue === toValue) continue
        channels.push({
          kind: 'scalar',
          path: `${id}.${idA}.${key}`,
          from: fromValue,
          to: toValue,
          mode: 'linear',
          easing: classEasing,
        })
      }
    }

    // A type change is a removal and an addition, both present at once — there
    // is no path between two variation types, and snapping one to the other at
    // t = 0.5 is the artefact the prior art is remembered for.
    for (const { idA, idB } of pair.retyped) {
      const left = variationsA[idA]!
      const right = variationsB[idB]!
      result[idA] = {
        ...deepClone(left),
        weight: effectiveWeight(left),
        visible: true,
      }
      emitWeight(idA, effectiveWeight(left), 0, GLIDE_EXIT_EASING)
      const minted = mintUnusedId(`${idB}_g`, taken)
      taken.add(minted)
      result[minted] = { ...deepClone(right), weight: 0, visible: true }
      emitWeight(minted, 0, effectiveWeight(right), GLIDE_ENTER_EASING)
      variationsAdded++
      variationsRemoved++
      notes.push({
        kind: 'structural',
        entity: `${id}.${idA}`,
        change: 'variationTypeChanged',
      })
    }

    for (const vid of pair.onlyA) {
      const left = variationsA[vid]!
      result[vid] = {
        ...deepClone(left),
        weight: effectiveWeight(left),
        visible: true,
      }
      emitWeight(vid, effectiveWeight(left), 0, GLIDE_EXIT_EASING)
      variationsRemoved++
      notes.push({
        kind: 'structural',
        entity: `${id}.${vid}`,
        change: 'variationRemoved',
      })
    }

    for (const vid of pair.onlyB) {
      const right = variationsB[vid]!
      const minted = mintUnusedId(vid, taken)
      taken.add(minted)
      result[minted] = { ...deepClone(right), weight: 0, visible: true }
      emitWeight(minted, 0, effectiveWeight(right), GLIDE_ENTER_EASING)
      variationsAdded++
      notes.push({
        kind: 'structural',
        entity: `${id}.${minted}`,
        change: 'variationAdded',
      })
    }

    return result
  }

  function emitAffine(
    prefix: string,
    from: GlideAffine,
    to: GlideAffine,
  ): void {
    if (affinesEqual(from, to)) return
    const differing = differingAffineComponents(from, to)
    const probe: GlideChannel = {
      kind: 'affine',
      prefix,
      from: { ...from },
      to: { ...to },
      components: ['a', 'b', 'c', 'd', 'e', 'f'],
      mode: 'decompose',
      easing: classEasing,
    }
    if (isNearSingular(from) || isNearSingular(to)) {
      // A matrix that close to collapsing has no stable decomposition: the
      // rotation it reports is noise. Lerp the coefficients and say so.
      notes.push({ kind: 'nearSingular', entity: prefix })
      channels.push({ ...probe, components: differing, mode: 'linear' })
      return
    }
    if (isReflection(from, to)) {
      // No rotation-plus-positive-scale path exists between a matrix and its
      // mirror. The policy is to let one scale cross zero — a genuine squash
      // and flip, which is what the transform actually does.
      notes.push({ kind: 'reflection', entity: prefix })
    }
    if (channelDeviation(probe) <= DEVIATION_EPSILON) {
      // The decomposed path and the straight one are the same picture, so take
      // the cheap one: two keyframes per differing coefficient.
      channels.push({ ...probe, components: differing, mode: 'linear' })
      return
    }
    channels.push(probe)
  }

  for (const { idA, idB } of pairing.matched) {
    const left = transformsA[idA]!
    const right = transformsB[idB]!
    const canAnimate = addressable(idA)
    const fromProbability = effectiveProbability(left) * scaleA
    const toProbability = effectiveProbability(right) * scaleB
    const base: Transform = {
      ...deepClone(left),
      probability: fromProbability,
      visible: left.visible || right.visible,
      variations: unionVariations(
        idA,
        left,
        right,
        canAnimate,
      ) as unknown as Transform['variations'],
    }
    baseTransforms[idA] = base
    if (!canAnimate) continue
    if (fromProbability !== toProbability) {
      channels.push({
        kind: 'scalar',
        path: `transform.${idA}.probability`,
        from: fromProbability,
        to: toProbability,
        mode: 'linear',
        easing: classEasing,
      })
    }
    emitAffine(`transform.${idA}.preAffine`, left.preAffine, right.preAffine)
    emitAffine(`transform.${idA}.postAffine`, left.postAffine, right.postAffine)
    for (const axis of ['x', 'y'] as const) {
      if (left.color[axis] === right.color[axis]) continue
      channels.push({
        kind: 'scalar',
        path: `transform.${idA}.color.${axis}`,
        from: left.color[axis],
        to: right.color[axis],
        mode: 'linear',
        easing: classEasing,
      })
    }
    const colorSpeedFrom = left.colorSpeed ?? 0.4
    const colorSpeedTo = right.colorSpeed ?? 0.4
    if (colorSpeedFrom !== colorSpeedTo) {
      channels.push({
        kind: 'scalar',
        path: `transform.${idA}.colorSpeed`,
        from: colorSpeedFrom,
        to: colorSpeedTo,
        mode: 'linear',
        easing: classEasing,
      })
    }
  }

  for (const idA of pairing.onlyA) {
    const left = transformsA[idA]!
    const from = effectiveProbability(left) * scaleA
    baseTransforms[idA] = {
      ...deepClone(left),
      probability: from,
      visible: true,
    }
    notes.push({
      kind: 'structural',
      entity: idA,
      change: 'transformRemoved',
    })
    if (!addressable(idA) || from === 0) continue
    channels.push({
      kind: 'scalar',
      path: `transform.${idA}.probability`,
      from,
      to: 0,
      mode: 'linear',
      easing: classEasing,
    })
  }

  for (const idB of pairing.onlyB) {
    const right = transformsB[idB]!
    // A new transform grows from weight 0, not from identity: its affines are
    // already at B's values, because a ghost wandering in from the origin at
    // probability 0 is invisible and costs twice the keyframes.
    const minted = mintUnusedId(idB, takenTransformIds)
    takenTransformIds.add(minted)
    const to = effectiveProbability(right) * scaleB
    baseTransforms[minted] = {
      ...deepClone(right),
      probability: 0,
      visible: true,
    }
    notes.push({
      kind: 'structural',
      entity: minted,
      change: 'transformAdded',
    })
    if (!addressable(minted) || to === 0) continue
    channels.push({
      kind: 'scalar',
      path: `transform.${minted}.probability`,
      from: 0,
      to,
      mode: 'linear',
      easing: classEasing,
    })
  }

  const base: FlameDescriptor = {
    ...deepClone(a),
    transforms: baseTransforms,
  }

  // ── Final transform ───────────────────────────────────────────────────────
  if (a.finalTransform && b.finalTransform) {
    emitAffine('finalTransform', a.finalTransform, b.finalTransform)
  } else if (a.finalTransform && !b.finalTransform) {
    emitAffine('finalTransform', a.finalTransform, identityAffine2D())
    notes.push({
      kind: 'snapAtSettle',
      path: 'finalTransform',
      reason:
        'the target has no final transform; the glide relaxes to the identity and the settle removes it',
    })
  } else if (!a.finalTransform && b.finalTransform) {
    base.finalTransform = identityAffine2D()
    emitAffine('finalTransform', identityAffine2D(), b.finalTransform)
  }

  // ── Render settings ───────────────────────────────────────────────────────
  const settingsA = a.renderSettings as unknown as Record<string, unknown>
  const settingsB = b.renderSettings as unknown as Record<string, unknown>

  for (const key of APPLIED_SCALAR_SETTINGS) {
    const from = settingsA[key]
    const to = settingsB[key]
    if (typeof from !== 'number' || typeof to !== 'number' || from === to) {
      continue
    }
    channels.push({
      kind: 'scalar',
      path: key,
      from,
      to,
      mode: 'linear',
      easing: classEasing,
    })
  }

  for (const key of APPLIED_STRING_SETTINGS) {
    const from = settingsA[key]
    const to = settingsB[key]
    if (typeof from !== 'string' || typeof to !== 'string' || from === to) {
      continue
    }
    channels.push({ kind: 'text', path: key, from, to })
  }

  for (const [key, arity] of Object.entries(APPLIED_VECTOR_SETTINGS)) {
    const from = settingsA[key]
    const to = settingsB[key]
    if (!Array.isArray(from) || !Array.isArray(to)) {
      if (
        JSON.stringify(from ?? null) !== JSON.stringify(to ?? null) &&
        (from !== undefined || to !== undefined)
      ) {
        notes.push({
          kind: 'snapAtSettle',
          path: key,
          reason: 'present on only one side, so there is nothing to blend into',
        })
      }
      continue
    }
    if (
      from.length !== arity ||
      to.length !== arity ||
      from.every((value, index) => value === to[index])
    ) {
      continue
    }
    channels.push({
      kind: 'vector',
      path: key,
      from: from as number[],
      to: to as number[],
      easing: classEasing,
    })
  }

  const cameraA = a.renderSettings.camera
  const cameraB = b.renderSettings.camera
  let cameraChanged = false
  if (cameraA && cameraB) {
    const axes: [string, number, number][] = [
      ['camera.x', cameraA.position[0], cameraB.position[0]],
      ['camera.y', cameraA.position[1], cameraB.position[1]],
    ]
    for (const [path, from, to] of axes) {
      if (from === to) continue
      cameraChanged = true
      channels.push({
        kind: 'scalar',
        path,
        from,
        to,
        mode: 'linear',
        easing: classEasing,
      })
    }
    if (cameraA.zoom !== cameraB.zoom) {
      cameraChanged = true
      channels.push({
        kind: 'scalar',
        path: 'camera.zoom',
        from: cameraA.zoom,
        to: cameraB.zoom,
        // A linear 1 → 100 zoom spends 90% of the glide already zoomed out.
        mode: 'log',
        easing: classEasing,
      })
    }
    if (cameraA.rotation !== cameraB.rotation) {
      cameraChanged = true
      channels.push({
        kind: 'scalar',
        path: 'camera.rotation',
        from: cameraA.rotation,
        to: cameraB.rotation,
        mode: 'angle',
        easing: classEasing,
      })
    }
  }

  for (const [key, reason] of Object.entries(UNSUNK_RENDER_SETTINGS)) {
    const from = settingsA[key]
    const to = settingsB[key]
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue
    notes.push({ kind: 'snapAtSettle', path: key, reason })
  }

  // ── Caps ──────────────────────────────────────────────────────────────────
  const refusal = checkUnionCaps(baseTransforms)
  if (refusal) return refusal

  // ── Duration, easing, frames ──────────────────────────────────────────────
  const changeClass: GlideChangeClass = classifyChange({
    transformsAdded: pairing.onlyB.length,
    transformsRemoved: pairing.onlyA.length,
    variationsAdded,
    variationsRemoved,
    unionTransforms: Object.keys(baseTransforms).length,
    cameraChanged,
    anyChange: channels.length > 0,
  })
  const tableMs = GLIDE_DURATIONS[changeClass] * quality.durationScale
  const durationMs =
    changeClass === 'none' && options.durationMs === undefined
      ? 0
      : clampGlideMs(options.durationMs ?? tableMs)
  const easing = easingFor(changeClass)
  for (const channel of channels) {
    if (channel.kind === 'text') continue
    // Appear/disappear keeps its asymmetric curve; everything else adopts the
    // class curve now that the class is known.
    if (
      channel.easing === GLIDE_ENTER_EASING ||
      channel.easing === GLIDE_EXIT_EASING
    ) {
      continue
    }
    channel.easing = easing
  }

  const frames = glideFrameCount(durationMs, fps)
  straightenToFitBudget(channels, frames, notes)
  const baked = buildGlideTracks(channels, frames)

  return {
    base,
    settle: deepClone(b),
    channels,
    tracks: baked.tracks,
    fps,
    frames,
    durationMs,
    changeClass,
    quality,
    notes: [...notes, ...baked.notes],
  }
}

function checkUnionCaps(
  transforms: Record<string, Transform>,
): GlideRefusal | undefined {
  const entries = Object.entries(transforms)
  if (entries.length > MAX_FLAME_TRANSFORMS) {
    return {
      refused: true,
      reason: `The two flames together need ${entries.length} transforms and a flame may hold ${MAX_FLAME_TRANSFORMS}.`,
    }
  }
  let total = 0
  for (const [id, transform] of entries) {
    const count = Object.keys(transform.variations).length
    total += count
    if (count > MAX_VARIATIONS_PER_TRANSFORM) {
      return {
        refused: true,
        reason: `Transform "${id}" would need ${count} variations during the glide and a transform may hold ${MAX_VARIATIONS_PER_TRANSFORM}. A variation type change needs the old and the new one at the same time.`,
      }
    }
  }
  if (total > MAX_FLAME_VARIATIONS) {
    return {
      refused: true,
      reason: `The two flames together need ${total} variations and a flame may hold ${MAX_FLAME_VARIATIONS}.`,
    }
  }
  return undefined
}

/**
 * Straighten curved channels, least-curved first, until the baked keyframe
 * form fits. Straightening changes what the glide LOOKS like, so it is always
 * recorded — and it changes `sampleGlide` too, which is why it happens here
 * and not inside the track builder: the two must never disagree.
 */
function straightenToFitBudget(
  channels: GlideChannel[],
  frames: number,
  notes: GlideNote[],
): void {
  if (glideTrackCost(channels, frames).keyframes <= MAX_TIMELINE_KEYFRAMES) {
    return
  }
  const curved = channels
    .map((channel, index) => ({ index, deviation: channelDeviation(channel) }))
    .filter(({ index }) => {
      const channel = channels[index]!
      return (
        (channel.kind === 'affine' && channel.mode === 'decompose') ||
        (channel.kind === 'scalar' && channel.mode !== 'linear')
      )
    })
    .sort((left, right) => left.deviation - right.deviation)

  for (const { index } of curved) {
    if (glideTrackCost(channels, frames).keyframes <= MAX_TIMELINE_KEYFRAMES) {
      return
    }
    const channel = channels[index]!
    if (channel.kind === 'affine') {
      channel.mode = 'linear'
      channel.components = differingAffineComponents(channel.from, channel.to)
      notes.push({
        kind: 'linearFallback',
        entity: channel.prefix,
        reason: 'straightened so the baked keyframes fit the timeline budget',
      })
    } else if (channel.kind === 'scalar') {
      channel.mode = 'linear'
      notes.push({
        kind: 'linearFallback',
        entity: channel.path,
        reason: 'straightened so the baked keyframes fit the timeline budget',
      })
    }
  }
}
