import { examples } from '@/flame/examples'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType } from '@/flame/variationRegistry'
import { getVariationDefault } from '@/flame/variations/utils'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { CommandContext } from '../types'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'

/**
 * Resolve a transform reference — a stable `TransformId` or a 0-based index —
 * against a transform record. Commands accept both; `normalizeArgs` converts
 * indices to ids at execution time so recorded logs address transforms by
 * identity and survive reordering (semantic-recorder-plan, M2). A missing ref
 * means "the first transform", preserving the old index-default behavior —
 * and missing covers `null` as well as `undefined`, because recorded args
 * make a JSON round-trip (in `deepClone` and in `.steps.json`) that turns
 * every `undefined` into `null`.
 */
function resolveTransformKey(
  transforms: Record<string, unknown>,
  ref: unknown,
): TransformId | undefined {
  if (typeof ref === 'string') {
    return ref in transforms ? (ref as TransformId) : undefined
  }
  const index = typeof ref === 'number' ? ref : 0
  const keys = Object.keys(transforms) as TransformId[]
  return index >= 0 && index < keys.length ? keys[index] : undefined
}

/** Same contract as {@link resolveTransformKey}, for variations. */
function resolveVariationKey(
  variations: Record<string, unknown>,
  ref: unknown,
): VariationId | undefined {
  if (typeof ref === 'string') {
    return ref in variations ? (ref as VariationId) : undefined
  }
  const index = typeof ref === 'number' ? ref : 0
  const keys = Object.keys(variations) as VariationId[]
  return index >= 0 && index < keys.length ? keys[index] : undefined
}

/** No reference supplied. `null` counts because recorded args make a JSON
 *  round-trip (in `deepClone` and in `.steps.json`) that rewrites every
 *  `undefined` to `null`. */
function isAbsentRef(ref: unknown): boolean {
  return ref === undefined || ref === null
}

/** normalizeArgs helper: an id when the ref resolves, the original arg
 *  otherwise (so an unresolvable ref replays as the same no-op). */
function normalizeTransformRef(ctx: CommandContext, ref: unknown): unknown {
  return resolveTransformKey(ctx.flameDescriptor().transforms, ref) ?? ref
}

/** normalizeArgs helper for a (transformRef, variationRef) pair. */
function normalizeVariationRef(
  ctx: CommandContext,
  transformRef: unknown,
  variationRef: unknown,
): unknown {
  const transforms = ctx.flameDescriptor().transforms
  const key = resolveTransformKey(transforms, transformRef)
  const transform = key ? transforms[key] : undefined
  if (!transform) return variationRef
  return resolveVariationKey(transform.variations, variationRef) ?? variationRef
}

registerCommand({
  id: 'flame.setSkipIters',
  label: 'Set Skip Iters',
  description: 'Set the number of initial skip iterations',
  shortcut: 'Shift+I',
  execute(ctx, iters?: unknown) {
    const value = typeof iters === 'number' ? iters : 1
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.skipIters = value
    })
  },
})

/**
 * Ids for added entities are minted by `normalizeArgs`, never inside a store
 * setter: normalized args are what the session recorder logs, so a replayed
 * add creates the same `TransformId`/`VariationId` and every later
 * id-addressed action still finds its target.
 *
 * These resolvers are shared by `normalizeArgs` and `execute` so the two can
 * never drift. They are idempotent — running them on already-normalized args
 * (the registry path) returns those args unchanged, while a direct
 * `execute()` call still gets sane values.
 */
function resolveVariationType(ctx: CommandContext, variationType: unknown) {
  const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as Dims
  return typeof variationType === 'string'
    ? variationType
    : defaultLinearType(dims)
}

function resolveNewTransformId(transformId: unknown): TransformId {
  return (
    typeof transformId === 'string' && transformId !== ''
      ? transformId
      : generateTransformId()
  ) as TransformId
}

function resolveNewVariationId(variationId: unknown): VariationId {
  return (
    typeof variationId === 'string' && variationId !== ''
      ? variationId
      : generateVariationId()
  ) as VariationId
}

registerCommand({
  id: 'flame.addTransform',
  label: 'Add Transform',
  description: 'Add a new transform with an optional variation type',
  shortcut: 'Shift+T',
  normalizeArgs(ctx, [variationType, transformId, variationId]) {
    return [
      resolveVariationType(ctx, variationType),
      resolveNewTransformId(transformId),
      resolveNewVariationId(variationId),
    ]
  },
  execute(
    ctx,
    variationType?: unknown,
    transformId?: unknown,
    variationId?: unknown,
  ) {
    const type = resolveVariationType(ctx, variationType)
    const tid = resolveNewTransformId(transformId)
    const vid = resolveNewVariationId(variationId)
    ctx.setFlameDescriptor((draft) => {
      draft.transforms[tid] = {
        probability: 1,
        colorSpeed: 0.4,
        color: { x: 0, y: 0 },
        visible: true,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        variations: {
          [vid]: getVariationDefault(type, 1),
        },
      }
    })
  },
})

registerCommand({
  id: 'flame.removeTransform',
  label: 'Remove Transform',
  description: 'Remove a transform by id or index (0-based)',
  normalizeArgs(ctx, [ref]) {
    // Deliberately no first-transform default: an absent ref stays absent
    // (and no-ops), matching the old index-default of -1. Treating null as
    // absent is what keeps that true after a JSON round-trip — otherwise a
    // live no-op would replay as deleting the first transform.
    return [isAbsentRef(ref) ? ref : normalizeTransformRef(ctx, ref)]
  },
  execute(ctx, ref?: unknown) {
    if (isAbsentRef(ref)) return
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, ref)
      if (key) delete draft.transforms[key]
    })
  },
})

registerCommand({
  id: 'flame.setVariationWeight',
  label: 'Set Variation Weight',
  description: 'Set the weight of a variation on a specific transform',
  normalizeArgs(ctx, [transformRef, variationRef, weight]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      normalizeVariationRef(ctx, transformRef, variationRef),
      weight,
    ]
  },
  execute(
    ctx,
    transformRef?: unknown,
    variationRef?: unknown,
    weight?: unknown,
  ) {
    const w = typeof weight === 'number' ? weight : 1
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (!transform) return
      const vKey = resolveVariationKey(transform.variations, variationRef)
      const variation = vKey ? transform.variations[vKey] : undefined
      if (variation) {
        variation.weight = w
      }
    })
  },
})

registerCommand({
  id: 'flame.addVariation',
  label: 'Add Variation',
  description: 'Add a variation type to a specific transform',
  normalizeArgs(ctx, [transformRef, variationType, variationId]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      resolveVariationType(ctx, variationType),
      resolveNewVariationId(variationId),
    ]
  },
  execute(
    ctx,
    transformRef?: unknown,
    variationType?: unknown,
    variationId?: unknown,
  ) {
    const type = resolveVariationType(ctx, variationType)
    const vid = resolveNewVariationId(variationId)
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (transform) {
        transform.variations[vid] = getVariationDefault(type, 1)
      }
    })
  },
})

registerCommand({
  id: 'flame.setColorSpeed',
  label: 'Set Color Speed',
  description: 'Set the color speed of a specific transform',
  normalizeArgs(ctx, [transformRef, speed]) {
    return [normalizeTransformRef(ctx, transformRef), speed]
  },
  execute(ctx, transformRef?: unknown, speed?: unknown) {
    const s = typeof speed === 'number' ? speed : 0.5
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (transform) {
        transform.colorSpeed = s
      }
    })
  },
})

registerCommand({
  id: 'flame.loadPreset',
  label: 'Load Preset',
  description: 'Load an example flame by its key name',
  execute(ctx, presetName?: unknown) {
    const name = typeof presetName === 'string' ? presetName : 'initExample'
    const flame = examples[name as keyof typeof examples]
    if (flame) {
      ctx.setFlameDescriptor(() => deepClone(flame))
    }
  },
})

registerCommand({
  id: 'flame.setBlendWeight',
  label: 'Set Blend Weight',
  description: 'Set the blend weight for crossfading (0-1)',
  execute(ctx, weight?: unknown) {
    const w = typeof weight === 'number' ? Math.max(0, Math.min(1, weight)) : 0
    ctx.setBlendWeight(w)
  },
})

registerCommand({
  id: 'flame.setProbability',
  label: 'Set Transform Probability',
  description: 'Set the probability weight of a transform by id or index',
  normalizeArgs(ctx, [transformRef, probability]) {
    return [normalizeTransformRef(ctx, transformRef), probability]
  },
  execute(ctx, transformRef?: unknown, probability?: unknown) {
    const p = typeof probability === 'number' ? probability : 1
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const t = key ? draft.transforms[key] : undefined
      if (t) t.probability = p
    })
  },
})

registerCommand({
  id: 'flame.setAffine',
  label: 'Set Affine Coefficient',
  description: 'Set a pre/post affine coefficient on a transform',
  normalizeArgs(ctx, [transformRef, affineType, param, value]) {
    return [normalizeTransformRef(ctx, transformRef), affineType, param, value]
  },
  execute(
    ctx,
    transformRef?: unknown,
    affineType?: unknown,
    param?: unknown,
    value?: unknown,
  ) {
    const type =
      typeof affineType === 'string' && affineType === 'post'
        ? 'postAffine'
        : 'preAffine'
    const p = typeof param === 'string' ? param : 'a'
    const v = typeof value === 'number' ? value : 1
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const t = key ? draft.transforms[key] : undefined
      if (t && p in t[type]) {
        ;(t[type] as Record<string, number>)[p] = v
      }
    })
  },
})

registerCommand({
  id: 'flame.setTransformColor',
  label: 'Set Transform Color',
  description: 'Set the color x/y coordinates of a transform',
  normalizeArgs(ctx, [transformRef, x, y]) {
    return [normalizeTransformRef(ctx, transformRef), x, y]
  },
  execute(ctx, transformRef?: unknown, x?: unknown, y?: unknown) {
    const cx = typeof x === 'number' ? x : 0
    const cy = typeof y === 'number' ? y : 0
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const t = key ? draft.transforms[key] : undefined
      if (t) t.color = { x: cx, y: cy }
    })
  },
})

registerCommand({
  id: 'flame.setExposure',
  label: 'Set Exposure',
  description: 'Set the flame exposure value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 0.25
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.exposure = v
    })
  },
})

registerCommand({
  id: 'flame.setVibrancy',
  label: 'Set Vibrancy',
  description: 'Set the flame vibrancy value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 0.5
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.vibrancy = v
    })
  },
})

registerCommand({
  id: 'flame.setGamma',
  label: 'Set Gamma',
  description: 'Set the flame gamma value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 2.2
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.gamma = v
    })
  },
})

registerCommand({
  id: 'flame.setContrast',
  label: 'Set Contrast',
  description: 'Set the flame contrast value',
  execute(ctx, value?: unknown) {
    const v = typeof value === 'number' ? value : 1
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.contrast = v
    })
  },
})

registerCommand({
  id: 'flame.setBackgroundColor',
  label: 'Set Background Color',
  description: 'Set the background color (RGB, values 0-1)',
  execute(ctx, r?: unknown, g?: unknown, b?: unknown) {
    const cr = typeof r === 'number' ? r : 0
    const cg = typeof g === 'number' ? g : 0
    const cb = typeof b === 'number' ? b : 0
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.backgroundColor = [cr, cg, cb]
    })
  },
})

registerCommand({
  id: 'flame.setDrawMode',
  label: 'Set Draw Mode',
  description: 'Set the render draw mode (light or paint)',
  execute(ctx, mode?: unknown) {
    const m = typeof mode === 'string' && mode === 'paint' ? 'paint' : 'light'
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.drawMode = m
    })
  },
})

registerCommand({
  id: 'flame.clearTransforms',
  label: 'Clear Transforms',
  description: 'Remove all transforms to start from a blank canvas',
  execute(ctx) {
    ctx.setFlameDescriptor((draft) => {
      draft.transforms = {}
    })
  },
})

registerCommand({
  id: 'flame.reset',
  label: 'Reset Flame',
  description: 'Reset flame to default starting state (initExample)',
  execute(ctx) {
    ctx.setFlameDescriptor(() => deepClone(examples.initExample))
  },
})

registerCommand({
  id: 'flame.setVariationParams',
  label: 'Set Variation Params',
  description:
    'Set a parametric variation parameter by name on a specific transform/variation',
  normalizeArgs(ctx, [transformRef, variationRef, paramName, paramValue]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      normalizeVariationRef(ctx, transformRef, variationRef),
      paramName,
      paramValue,
    ]
  },
  execute(
    ctx,
    transformRef?: unknown,
    variationRef?: unknown,
    paramName?: unknown,
    paramValue?: unknown,
  ) {
    const name = typeof paramName === 'string' ? paramName : ''
    const value = typeof paramValue === 'number' ? paramValue : 0
    if (!name) return
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (!transform) return
      const vKey = resolveVariationKey(transform.variations, variationRef)
      const variation = vKey ? transform.variations[vKey] : undefined
      if (variation && 'params' in variation) {
        ;(variation.params as Record<string, number>)[name] = value
      }
    })
  },
})
