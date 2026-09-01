import { applyColorMapToFlame } from '@/flame/colorMap'
import { examples } from '@/flame/examples'
import { newDefaultTransform } from '@/flame/newTransform'
import { isFlameGraphWithinLimits, isSafeFlameEntityId, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType, isVariationTypeFor, } from '@/flame/variationRegistry'
import { getVariationDefault } from '@/flame/variations/utils'
import { tryValidateTransformColorSnapshot } from '@/recorder/schema'
import { snapshotOriginForCommand, snapshotOriginLabel, tryValidateSnapshotOrigin, } from '@/recorder/snapshotOrigin'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { CommandContext } from '../types'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
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
    return Object.hasOwn(transforms, ref) ? (ref as TransformId) : undefined
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
    return Object.hasOwn(variations, ref) ? (ref as VariationId) : undefined
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

const AFFINE_2D_KEYS = ['a', 'b', 'c', 'd', 'e', 'f']
const AFFINE_3D_KEYS = [...AFFINE_2D_KEYS, 'g', 'h', 'i', 'j', 'k', 'l']
const MAX_PALETTE_ENTRIES = 1024
const MAX_PALETTE_TEXT_LENGTH = 256
const MAX_PALETTE_CHANNEL_MAGNITUDE = 4

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Turn an imported palette argument into a small canonical value. Palettes
 * cross the untrusted session boundary and are written into render settings,
 * so checking only that `entries` is a non-empty array is not enough.
 */
function tryValidatePalette(value: unknown): Palette | undefined {
  if (!isPlainRecord(value)) return undefined
  const { id, name, source, createdAt, entries } = value
  if (
    createdAt !== undefined &&
    (typeof createdAt !== 'number' ||
      !Number.isSafeInteger(createdAt) ||
      createdAt < 0)
  ) {
    return undefined
  }
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > MAX_PALETTE_TEXT_LENGTH ||
    typeof name !== 'string' ||
    name.length > MAX_PALETTE_TEXT_LENGTH ||
    (source !== undefined &&
      source !== 'builtin' &&
      source !== 'custom' &&
      source !== 'imported' &&
      source !== 'official') ||
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.length > MAX_PALETTE_ENTRIES
  ) {
    return undefined
  }

  const ids = new Set<string>()
  const validatedEntries: Palette['entries'] = []
  for (const entry of entries) {
    if (!isPlainRecord(entry)) return undefined
    const { id: entryId, position, a, b } = entry
    if (
      Object.keys(entry).some(
        (key) =>
          key !== 'id' && key !== 'position' && key !== 'a' && key !== 'b',
      ) ||
      typeof entryId !== 'string' ||
      entryId.length === 0 ||
      entryId.length > MAX_PALETTE_TEXT_LENGTH ||
      ids.has(entryId) ||
      typeof position !== 'number' ||
      !Number.isFinite(position) ||
      position < 0 ||
      position > 1 ||
      typeof a !== 'number' ||
      !Number.isFinite(a) ||
      Math.abs(a) > MAX_PALETTE_CHANNEL_MAGNITUDE ||
      typeof b !== 'number' ||
      !Number.isFinite(b) ||
      Math.abs(b) > MAX_PALETTE_CHANNEL_MAGNITUDE
    ) {
      return undefined
    }
    ids.add(entryId)
    validatedEntries.push({ id: entryId, position, a, b })
  }

  return {
    id,
    name,
    source: source ?? 'custom',
    entries: validatedEntries,
    ...(createdAt === undefined ? {} : { createdAt }),
  }
}

/**
 * Exactly the 2D (a–f) or 3D (a–l) coefficient set, every value finite.
 *
 * Checked by key set rather than "an object of numbers": that weaker test
 * accepts `{}` (nothing to fail) and `NaN`/`Infinity` (both are `number`),
 * either of which would be written straight into the document by a
 * hand-edited `.steps.json` and produce a flame that renders as nothing.
 */
function isAffineLike(affine: unknown): affine is Record<string, number> {
  if (affine === null || typeof affine !== 'object') return false
  const keys = Object.keys(affine)
  const expected =
    keys.length === AFFINE_3D_KEYS.length ? AFFINE_3D_KEYS : AFFINE_2D_KEYS
  if (keys.length !== expected.length) return false
  return expected.every((key) =>
    Number.isFinite((affine as Record<string, unknown>)[key]),
  )
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

function variationTypeMatchesCurrentFlame(
  ctx: CommandContext,
  variationType: unknown,
): variationType is string {
  const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as Dims
  return (
    typeof variationType === 'string' && isVariationTypeFor(dims, variationType)
  )
}

function isKnownVariationType(variationType: unknown): variationType is string {
  return (
    typeof variationType === 'string' &&
    (isVariationTypeFor(2, variationType) ||
      isVariationTypeFor(3, variationType))
  )
}

function variationDescriptorType(descriptor: unknown): string | undefined {
  if (
    descriptor === null ||
    typeof descriptor !== 'object' ||
    Array.isArray(descriptor)
  ) {
    return undefined
  }
  const type = (descriptor as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

function validatedVariationUpdate(
  ctx: CommandContext,
  transformRef: unknown,
  variationRef: unknown,
  descriptor: unknown,
  preAffine?: unknown,
) {
  const type = variationDescriptorType(descriptor)
  if (!type || !variationTypeMatchesCurrentFlame(ctx, type)) return undefined
  if (preAffine !== undefined && !isAffineLike(preAffine)) return undefined

  const candidate = deepClone(ctx.flameDescriptor())
  const transformId = resolveTransformKey(candidate.transforms, transformRef)
  if (!transformId) return undefined
  const transform = candidate.transforms[transformId]
  if (!transform) return undefined
  const variationId = resolveVariationKey(transform.variations, variationRef)
  if (!variationId) return undefined

  transform.variations[variationId] = deepClone(
    descriptor,
  ) as TransformFunction['variations'][VariationId]
  if (preAffine !== undefined) {
    transform.preAffine = deepClone(preAffine) as TransformFunction['preAffine']
  }

  const validated = tryValidateFlame(candidate)
  const validatedTransform = validated?.transforms[transformId]
  const validatedVariation = validatedTransform?.variations[variationId]
  if (!validatedTransform || !validatedVariation) return undefined
  return {
    transformId,
    variationId,
    variation: deepClone(validatedVariation),
    preAffine:
      preAffine === undefined
        ? undefined
        : deepClone(validatedTransform.preAffine),
  }
}

function graphCounts(
  flame: FlameDescriptor,
  includeTransform: (transformId: string) => boolean = () => true,
) {
  let transformCount = 0
  let totalVariationCount = 0
  let largestVariationCount = 0
  for (const [transformId, transform] of Object.entries(flame.transforms)) {
    if (!includeTransform(transformId)) continue
    transformCount++
    const variationCount = Object.keys(transform.variations).length
    totalVariationCount += variationCount
    largestVariationCount = Math.max(largestVariationCount, variationCount)
  }
  return { transformCount, totalVariationCount, largestVariationCount }
}

function canAddTransform(flame: FlameDescriptor): boolean {
  const counts = graphCounts(flame)
  return isFlameGraphWithinLimits(
    counts.transformCount + 1,
    counts.totalVariationCount + 1,
    Math.max(counts.largestVariationCount, 1),
  )
}

function canAddVariation(
  flame: FlameDescriptor,
  transform: TransformFunction,
): boolean {
  const counts = graphCounts(flame)
  const variationCount = Object.keys(transform.variations).length
  return isFlameGraphWithinLimits(
    counts.transformCount,
    counts.totalVariationCount + 1,
    Math.max(counts.largestVariationCount, variationCount + 1),
  )
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
  validateReplayArgs(args) {
    if (args.length !== 3) {
      return 'addTransform expects a type, transform id and variation id'
    }
    const [variationType, transformId, variationId] = args
    if (!isKnownVariationType(variationType)) {
      return 'variation type is not registered'
    }
    if (!isSafeFlameEntityId(transformId) || transformId.startsWith('_sym__')) {
      return 'transform id is unsafe or reserved'
    }
    if (!isSafeFlameEntityId(variationId)) return 'variation id is unsafe'
    return undefined
  },
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
    const flame = ctx.flameDescriptor()
    if (
      !variationTypeMatchesCurrentFlame(ctx, type) ||
      !isSafeFlameEntityId(tid) ||
      tid.startsWith('_sym__') ||
      !isSafeFlameEntityId(vid) ||
      Object.hasOwn(flame.transforms, tid) ||
      !canAddTransform(flame)
    ) {
      console.warn('[cmd] flame.addTransform: rejected unsafe or oversized add')
      return
    }
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
  coalesceKey: ([transformRef, variationRef]) =>
    `weight:${String(transformRef)}:${String(variationRef)}`,
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
  validateReplayArgs(args) {
    if (args.length !== 3) {
      return 'addVariation expects a transform id, type and variation id'
    }
    const [transformId, variationType, variationId] = args
    if (!isSafeFlameEntityId(transformId)) return 'transform id is unsafe'
    if (!isKnownVariationType(variationType)) {
      return 'variation type is not registered'
    }
    if (!isSafeFlameEntityId(variationId)) return 'variation id is unsafe'
    return undefined
  },
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
    const flame = ctx.flameDescriptor()
    const key = resolveTransformKey(flame.transforms, transformRef)
    const transform = key ? flame.transforms[key] : undefined
    if (
      !transform ||
      !variationTypeMatchesCurrentFlame(ctx, type) ||
      !isSafeFlameEntityId(vid) ||
      Object.hasOwn(transform.variations, vid) ||
      !canAddVariation(flame, transform)
    ) {
      console.warn('[cmd] flame.addVariation: rejected unsafe or oversized add')
      return
    }
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
  coalesceKey: ([transformRef]) => `colorSpeed:${String(transformRef)}`,
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
  // Slider-driven, so it folds per gesture.
  coalesceKey: () => 'blendWeight',
  // Writes the document rather than calling ctx.setBlendWeight: the weight
  // LIVES in renderSettings (that is why a single undo reverts a blend), and
  // the workspace's own setter now dispatches this command — going back
  // through the context would recurse. It is not part of the
  // setRenderSetting path vocabulary because it has no schema default.
  execute(ctx, weight?: unknown) {
    const w = typeof weight === 'number' ? Math.max(0, Math.min(1, weight)) : 0
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.blendWeight = w
    }, 'Blend Weight')
  },
})

registerCommand({
  id: 'flame.setBlendFlame',
  label: 'Set Blend Flame',
  description: 'Set or clear the flame being blended with (null clears)',
  // The descriptor travels in the args, like flame.load, so a session that
  // picked a blend partner replays without needing that file again.
  execute(ctx, flame?: unknown) {
    const next = isAbsentRef(flame) ? undefined : tryValidateFlame(flame)
    if (!isAbsentRef(flame) && !next) {
      console.warn('[cmd] flame.setBlendFlame: not a valid flame', flame)
      return
    }
    ctx.setFlameDescriptor(
      (draft) => {
        if (next === undefined) delete draft.renderSettings.blendFlame
        else draft.renderSettings.blendFlame = next
      },
      next ? 'Set Blend Flame' : 'Remove Blend Flame',
    )
  },
})

registerCommand({
  id: 'flame.setupMorph',
  label: 'Morph Setup',
  description:
    'Make this flame the blend partner at full weight, ready for a morph animation',
  // Only the flame half: the keyframes the editor adds afterwards live on the
  // timeline's own undo stack, which the session format does not cover yet.
  execute(ctx, endFlame?: unknown) {
    const next = tryValidateFlame(endFlame)
    if (!next) {
      console.warn('[cmd] flame.setupMorph: not a valid flame', endFlame)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.blendFlame = next
      draft.renderSettings.blendWeight = 1
    }, 'Morph Setup')
  },
})

registerCommand({
  id: 'flame.updateRenderSettings',
  label: 'Update Render Settings',
  description: 'Merge a partial render-settings object into the flame',
  coalesceKey: ([settings, origin]) =>
    isPlainRecord(settings)
      ? `${typeof origin === 'string' ? origin : 'legacy'}:${Object.keys(settings).sort().join(',')}`
      : undefined,
  // A bulk merge, used where a panel applies several settings at once. The
  // per-key flame.setRenderSetting is the better-behaved command; this one
  // exists because those call sites genuinely apply a batch as one edit.
  execute(ctx, settings?: unknown) {
    if (settings === null || typeof settings !== 'object') {
      throw new Error('[cmd] flame.updateRenderSettings: not an object')
    }
    const patch = deepClone(settings) as Record<string, unknown>
    const candidate = deepClone(ctx.flameDescriptor())
    const currentSettings = (candidate.renderSettings ?? {}) as Record<
      string,
      unknown
    >
    const mergedSettings: Record<string, unknown> = {
      ...currentSettings,
      ...patch,
    }
    if (patch.camera && typeof patch.camera === 'object') {
      mergedSettings.camera = {
        ...(currentSettings.camera ?? {}),
        ...(patch.camera as Record<string, unknown>),
      }
    }
    if (patch.camera3D && typeof patch.camera3D === 'object') {
      mergedSettings.camera3D = {
        ...(currentSettings.camera3D ?? {}),
        ...(patch.camera3D as Record<string, unknown>),
      }
    }
    candidate.renderSettings =
      mergedSettings as unknown as FlameDescriptor['renderSettings']
    const validated = tryValidateFlame(candidate)
    if (!validated) {
      console.warn(
        '[cmd] flame.updateRenderSettings: invalid render settings',
        settings,
      )
      return
    }
    if (
      patch.camera ||
      patch.camera3D ||
      currentSettings.dimensions === 3 ||
      patch.dimensions === 3
    ) {
      ctx.timeline.setPreviewHeld?.(false)
    }
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings = deepClone(validated.renderSettings)
    }, 'Render Settings')
  },
})

registerCommand({
  id: 'flame.setProbability',
  label: 'Set Transform Probability',
  description: 'Set the probability weight of a transform by id or index',
  normalizeArgs(ctx, [transformRef, probability]) {
    return [normalizeTransformRef(ctx, transformRef), probability]
  },
  coalesceKey: ([transformRef]) => `probability:${String(transformRef)}`,
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
  coalesceKey: ([transformRef, affineType, param]) =>
    `affine:${String(transformRef)}:${String(affineType)}:${String(param)}`,
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
  normalizeArgs(ctx, [transformRef, x, y, origin]) {
    const normalized = [normalizeTransformRef(ctx, transformRef), x, y]
    return origin === 'grid' ||
      origin === 'x' ||
      origin === 'y' ||
      origin === 'randomize' ||
      origin === 'card-randomize' ||
      origin === 'reset'
      ? [...normalized, origin]
      : normalized
  },
  coalesceKey: ([transformRef, , , origin]) =>
    `color:${String(transformRef)}:${typeof origin === 'string' ? origin : 'grid'}`,
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
  coalesceKey: ([transformRef, variationRef, paramName]) =>
    `param:${String(transformRef)}:${String(variationRef)}:${String(paramName)}`,
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

registerCommand({
  id: 'flame.setTransformVisible',
  label: 'Set Transform Visibility',
  description: 'Show or hide a transform',
  // An explicit target state, never a toggle: a recorded toggle would flip
  // whatever the replayed document happened to be showing.
  normalizeArgs(ctx, [transformRef, visible]) {
    return [normalizeTransformRef(ctx, transformRef), visible === true]
  },
  execute(ctx, transformRef?: unknown, visible?: unknown) {
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (transform) transform.visible = visible === true
    }, 'Toggle Transform')
  },
})

registerCommand({
  id: 'flame.setVariationVisible',
  label: 'Set Variation Visibility',
  description: 'Show or hide a variation on a transform',
  normalizeArgs(ctx, [transformRef, variationRef, visible]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      normalizeVariationRef(ctx, transformRef, variationRef),
      visible === true,
    ]
  },
  execute(
    ctx,
    transformRef?: unknown,
    variationRef?: unknown,
    visible?: unknown,
  ) {
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (!transform) return
      const vKey = resolveVariationKey(transform.variations, variationRef)
      const variation = vKey ? transform.variations[vKey] : undefined
      if (variation) variation.visible = visible === true
    }, 'Toggle Variation')
  },
})

registerCommand({
  id: 'flame.setVariation',
  label: 'Set Variation',
  description:
    'Replace a variation descriptor wholesale (type, weight and params)',
  validateReplayArgs(args) {
    if (args.length !== 3 && args.length !== 4) {
      return 'setVariation expects two entity ids, a descriptor and optional UI origin'
    }
    if (!isSafeFlameEntityId(args[0])) return 'transform id is unsafe'
    if (!isSafeFlameEntityId(args[1])) return 'variation id is unsafe'
    if (!isKnownVariationType(variationDescriptorType(args[2]))) {
      return 'variation descriptor type is not registered'
    }
    if (
      args.length === 4 &&
      args[3] !== 'type' &&
      args[3] !== 'randomize' &&
      args[3] !== 'params'
    ) {
      return 'setVariation UI origin is invalid'
    }
    return undefined
  },
  normalizeArgs(ctx, [transformRef, variationRef, descriptor, focusOrigin]) {
    const normalized = [
      normalizeTransformRef(ctx, transformRef),
      normalizeVariationRef(ctx, transformRef, variationRef),
      descriptor,
    ]
    if (
      focusOrigin === 'type' ||
      focusOrigin === 'randomize' ||
      focusOrigin === 'params'
    ) {
      normalized.push(focusOrigin)
    }
    return normalized
  },
  // Also used by the parametric-params editors, which are scrub/slider
  // driven, so repeats on one variation fold per gesture.
  coalesceKey: ([transformRef, variationRef]) =>
    `variation:${String(transformRef)}:${String(variationRef)}`,
  execute(
    ctx,
    transformRef?: unknown,
    variationRef?: unknown,
    descriptor?: unknown,
  ) {
    // The whole descriptor rather than a diff: the variation browser and the
    // "randomize this variation" button both compute a new one outright, and
    // recording the result keeps replay exact without re-running their
    // randomness.
    const update = validatedVariationUpdate(
      ctx,
      transformRef,
      variationRef,
      descriptor,
    )
    if (!update) {
      console.warn('[cmd] flame.setVariation: not a variation', descriptor)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      const transform = draft.transforms[update.transformId]
      if (
        transform &&
        Object.hasOwn(transform.variations, update.variationId)
      ) {
        transform.variations[update.variationId] = update.variation
      }
    }, 'Set Variation')
  },
})

registerCommand({
  id: 'flame.deleteTransform',
  label: 'Delete Transform',
  description:
    'Delete a transform, or reset it to a blank one when it is the last',
  // The editor never leaves a flame with zero transforms: deleting the last
  // one resets it instead. That replacement mints a variation id, so it is
  // pre-minted here — the branch itself is state-dependent and replay takes
  // the same one from the same document.
  validateReplayArgs(args) {
    if (args.length !== 2) {
      return 'deleteTransform expects a transform id and reset variation id'
    }
    if (!isSafeFlameEntityId(args[0])) return 'transform id is unsafe'
    if (!isSafeFlameEntityId(args[1])) return 'reset variation id is unsafe'
    return undefined
  },
  normalizeArgs(ctx, [transformRef, resetVariationId]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      typeof resetVariationId === 'string' && resetVariationId !== ''
        ? resetVariationId
        : generateVariationId(),
    ]
  },
  execute(ctx, transformRef?: unknown, resetVariationId?: unknown) {
    const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as Dims
    const vid = resolveNewVariationId(resetVariationId)
    if (!isSafeFlameEntityId(vid)) {
      console.warn('[cmd] flame.deleteTransform: unsafe reset variation id')
      return
    }
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      if (!key) return
      if (Object.keys(draft.transforms).length === 1) {
        draft.transforms[key] = newDefaultTransform(dims, vid)
      } else {
        delete draft.transforms[key]
      }
    }, 'Delete Transform')
  },
})

registerCommand({
  id: 'flame.deleteVariation',
  label: 'Delete Variation',
  description:
    'Delete a variation, or reset it to its type default when it is the last',
  normalizeArgs(ctx, [transformRef, variationRef]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      normalizeVariationRef(ctx, transformRef, variationRef),
    ]
  },
  execute(ctx, transformRef?: unknown, variationRef?: unknown) {
    ctx.setFlameDescriptor((draft) => {
      const key = resolveTransformKey(draft.transforms, transformRef)
      const transform = key ? draft.transforms[key] : undefined
      if (!transform) return
      const vKey = resolveVariationKey(transform.variations, variationRef)
      if (!vKey) return
      const existing = transform.variations[vKey]
      if (Object.keys(transform.variations).length === 1 && existing) {
        // Same rule as transforms: a transform never ends up with none.
        transform.variations[vKey] = deepClone(
          getVariationDefault(existing.type, 1),
        )
      } else {
        delete transform.variations[vKey]
      }
    }, 'Delete Variation')
  },
})

registerCommand({
  id: 'flame.setFinalTransform',
  label: 'Set Final Transform',
  description: 'Set or clear the flame-wide final affine transform',
  normalizeArgs(_ctx, [affine, origin]) {
    return origin === 'grid' || origin === 'randomize'
      ? [affine, origin]
      : [affine]
  },
  coalesceKey: ([, origin]) =>
    `final-affine-matrix:${typeof origin === 'string' ? origin : 'grid'}`,
  execute(ctx, affine?: unknown) {
    if (affine !== null && affine !== undefined && !isAffineLike(affine)) {
      console.warn('[cmd] flame.setFinalTransform: invalid affine', affine)
      return
    }
    const next = isAbsentRef(affine)
      ? undefined
      : (deepClone(affine) as FlameDescriptor['finalTransform'])
    const candidate = deepClone(ctx.flameDescriptor())
    candidate.finalTransform = next
    const validated = tryValidateFlame(candidate)
    if (!validated) {
      console.warn('[cmd] flame.setFinalTransform: invalid for flame', affine)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      draft.finalTransform = deepClone(validated.finalTransform)
    }, 'Final Transform')
  },
})

registerCommand({
  id: 'flame.setFinalAffine',
  label: 'Set Final Affine Coefficient',
  description: 'Set one coefficient on the flame-wide final transform',
  coalesceKey: ([param]) => `final-affine:${String(param)}`,
  execute(ctx, param?: unknown, value?: unknown) {
    if (
      typeof param !== 'string' ||
      !AFFINE_3D_KEYS.includes(param) ||
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      console.warn('[cmd] flame.setFinalAffine: invalid coefficient', {
        param,
        value,
      })
      return
    }
    ctx.setFlameDescriptor((draft) => {
      const affine = draft.finalTransform as Record<string, number> | undefined
      if (affine && Object.hasOwn(affine, param)) affine[param] = value
    }, 'Final Transform')
  },
})

registerCommand({
  id: 'flame.applyVariationSelection',
  label: 'Apply Variation Selection',
  description:
    "Apply the variation browser's result: a transform's pre-affine and one variation, together",
  // One command rather than setAffine + setVariation, because the browser
  // applies both in a single setter and so is a single undo step. Two
  // commands would replay as two, and a recorded undo would then only get
  // half of it back.
  validateReplayArgs(args) {
    if (args.length !== 4) {
      return 'applyVariationSelection expects two ids, an affine and a variation'
    }
    if (!isSafeFlameEntityId(args[0])) return 'transform id is unsafe'
    if (!isSafeFlameEntityId(args[1])) return 'variation id is unsafe'
    if (!isAffineLike(args[2])) return 'pre-affine is invalid'
    if (!isKnownVariationType(variationDescriptorType(args[3]))) {
      return 'variation descriptor type is not registered'
    }
    return undefined
  },
  normalizeArgs(ctx, [transformRef, variationRef, preAffine, variation]) {
    return [
      normalizeTransformRef(ctx, transformRef),
      normalizeVariationRef(ctx, transformRef, variationRef),
      preAffine,
      variation,
    ]
  },
  execute(
    ctx,
    transformRef?: unknown,
    variationRef?: unknown,
    preAffine?: unknown,
    variation?: unknown,
  ) {
    const update = validatedVariationUpdate(
      ctx,
      transformRef,
      variationRef,
      variation,
      preAffine,
    )
    if (!update || !update.preAffine) {
      console.warn('[cmd] flame.applyVariationSelection: rejected', {
        preAffine,
        variation,
      })
      return
    }
    const validatedPreAffine = update.preAffine
    ctx.setFlameDescriptor((draft) => {
      const transform = draft.transforms[update.transformId]
      if (!transform) return
      if (!Object.hasOwn(transform.variations, update.variationId)) return
      transform.preAffine = validatedPreAffine
      transform.variations[update.variationId] = update.variation
    }, 'Apply Variation')
  },
})

registerCommand({
  id: 'flame.setTransformAffine',
  label: 'Set Transform Affine',
  description:
    "Replace a transform's whole pre- or post-affine (the affine editor's drag)",
  // A drag recomputes the entire matrix each frame, so this takes the whole
  // affine rather than one coefficient: with the per-coefficient command a
  // single drag would log six actions instead of one.
  normalizeArgs(ctx, [transformRef, which, affine, origin]) {
    const normalized = [
      normalizeTransformRef(ctx, transformRef),
      which === 'post' ? 'post' : 'pre',
      affine,
    ]
    return origin === 'grid' || origin === 'randomize' || origin === 'reset'
      ? [...normalized, origin]
      : normalized
  },
  coalesceKey: ([transformRef, which, , origin]) =>
    `affineMatrix:${String(transformRef)}:${String(which)}:${typeof origin === 'string' ? origin : 'grid'}`,
  execute(ctx, transformRef?: unknown, which?: unknown, affine?: unknown) {
    if (!isAffineLike(affine)) {
      console.warn('[cmd] flame.setTransformAffine: not an affine', affine)
      return
    }
    const key = which === 'post' ? 'postAffine' : 'preAffine'
    const next = deepClone(affine) as TransformFunction['preAffine']
    ctx.setFlameDescriptor((draft) => {
      const tKey = resolveTransformKey(draft.transforms, transformRef)
      const transform = tKey ? draft.transforms[tKey] : undefined
      if (transform) transform[key] = next
    }, 'Affine')
  },
})

registerCommand({
  id: 'flame.applyPalette',
  label: 'Apply Palette',
  description:
    'Recolour every transform from a palette and record the palette itself',
  // One command for both halves, because applying is one history entry: the
  // colours AND renderSettings.palette, so a single undo fully reverts it.
  // `applyColorMapToFlame` is index-based and deterministic, so the palette
  // is all replay needs.
  validateReplayArgs(args) {
    return args.length === 1 && tryValidatePalette(args[0])
      ? undefined
      : 'apply palette expects one bounded palette'
  },
  execute(ctx, palette?: unknown) {
    const next = tryValidatePalette(palette)
    if (!next) {
      console.warn('[cmd] flame.applyPalette: not a palette', palette)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      applyColorMapToFlame(draft, {
        id: next.id,
        name: next.name,
        entries: next.entries.map((entry) => ({ a: entry.a, b: entry.b })),
      })
      draft.renderSettings.palette = {
        id: next.id,
        name: next.name,
        entries: next.entries.map(({ id, position, a, b }) => ({
          id,
          position,
          a,
          b,
        })),
      }
    }, 'Apply Palette')
  },
})

registerCommand({
  id: 'flame.removePalette',
  label: 'Remove Palette',
  description:
    'Drop the palette, restoring the colours transforms had before it',
  // The colours to restore are passed in rather than read from the document:
  // the editor stashes them in a signal when the palette is applied, and UI
  // state is not something a log can replay. Without them the palette is
  // simply dropped and the current colours stay.
  validateReplayArgs(args) {
    return args.length === 1 && tryValidateTransformColorSnapshot(args[0])
      ? undefined
      : 'remove palette expects one bounded transform-colour snapshot'
  },
  execute(ctx, restoreColors?: unknown) {
    const saved = tryValidateTransformColorSnapshot(restoreColors)
    if (!saved) {
      console.warn('[cmd] flame.removePalette: invalid restore colours')
      return
    }
    ctx.setFlameDescriptor((draft) => {
      for (const [tid, transform] of Object.entries(draft.transforms)) {
        const color = saved[tid]
        if (color && Number.isFinite(color.x) && Number.isFinite(color.y)) {
          transform.color = { x: color.x, y: color.y }
        }
      }
      delete draft.renderSettings.palette
    }, 'Remove Palette')
  },
})

registerCommand({
  id: 'flame.load',
  label: 'Load Flame',
  description:
    'Replace the whole document — opening a saved flame, an import, a bred child',
  describe: (args) =>
    snapshotOriginLabel(snapshotOriginForCommand('flame.load', args)) ??
    (typeof args[1] === 'string' && args[1] !== '' ? args[1] : undefined),
  // Carries the descriptor itself, so a session that begins by opening a file
  // still replays: the log never depends on what happened to be on disk.
  // Validated through the normal migrate-on-parse path, the same one saved
  // flames and imports go through.
  validateReplayArgs(args) {
    if (args.length < 1 || args.length > 4) {
      return 'load expects a flame, optional label, palette snapshot, and semantic origin'
    }
    if (!tryValidateFlame(deepClone(args[0]))) {
      return 'flame descriptor is invalid'
    }
    if (
      args[1] !== undefined &&
      (typeof args[1] !== 'string' || args[1].length > 512)
    ) {
      return 'load label must be a short string'
    }
    if (args.length >= 3 && !tryValidateTransformColorSnapshot(args[2])) {
      return 'load palette provenance is invalid'
    }
    if (args.length === 4 && !tryValidateSnapshotOrigin(args[3])) {
      return 'load semantic origin is invalid'
    }
    return undefined
  },
  execute(ctx, descriptor?: unknown, label?: unknown) {
    const flame = tryValidateFlame(deepClone(descriptor))
    if (!flame) {
      console.warn('[cmd] flame.load: not a valid flame', descriptor)
      return
    }
    ctx.setFlameDescriptor(
      () => flame,
      typeof label === 'string' && label !== '' ? label : 'Load Flame',
    )
  },
})

/** How many transforms an n-fold symmetry of this type adds. */
const MAX_SYMMETRY_FOLDS = 64
type SymmetryControlOrigin = 'add' | 'type' | 'folds'

function isSymmetryControlOrigin(
  value: unknown,
): value is SymmetryControlOrigin {
  return value === 'add' || value === 'type' || value === 'folds'
}

function symmetryTransformCount(n: unknown, type: unknown): number {
  const folds =
    typeof n === 'number' &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= MAX_SYMMETRY_FOLDS
      ? n
      : 0
  if (folds === 0) return type === 'dihedral' ? 1 : 0
  return folds - 1 + (type === 'dihedral' ? 1 : 0)
}

function symmetryArgsError(args: readonly unknown[]): string | undefined {
  if (args.length !== 3 && args.length !== 4) {
    return 'symmetry expects three arguments and an optional control origin'
  }
  const [n, type, ids, origin] = args
  if (
    typeof n !== 'number' ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > MAX_SYMMETRY_FOLDS
  ) {
    return `fold count must be an integer from 1 to ${MAX_SYMMETRY_FOLDS}`
  }
  if (type !== 'rotational' && type !== 'dihedral') {
    return 'symmetry type must be rotational or dihedral'
  }
  if (args.length === 4 && !isSymmetryControlOrigin(origin)) {
    return 'symmetry control origin must be add, type, or folds'
  }

  const count = symmetryTransformCount(n, type)
  if (!Array.isArray(ids) || ids.length !== count) {
    return 'symmetry transform ids do not match the fold count'
  }

  const transformIds: string[] = []
  const variationIds: string[] = []
  for (const pair of ids) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return 'each symmetry id pair must contain exactly two ids'
    }
    const [transformId, variationId] = pair
    if (
      !isSafeFlameEntityId(transformId) ||
      !transformId.startsWith('_sym__') ||
      transformId.length === '_sym__'.length
    ) {
      return 'symmetry transform ids must use the reserved _sym__ prefix'
    }
    if (!isSafeFlameEntityId(variationId)) {
      return 'symmetry variation ids are unsafe'
    }
    transformIds.push(transformId)
    variationIds.push(variationId)
  }

  if (
    new Set(transformIds).size !== transformIds.length ||
    new Set(variationIds).size !== variationIds.length
  ) {
    return 'symmetry transform and variation ids must be unique'
  }
  return undefined
}

registerCommand({
  id: 'flame.applySymmetry',
  label: 'Apply Symmetry',
  description:
    'Replace the generated symmetry transforms with an n-fold rotational or dihedral set',
  validateReplayArgs(args) {
    return symmetryArgsError(args)
  },
  // Every symmetry transform it creates needs an id, and minting them inside
  // the setter would hand replay different UUIDs. normalizeArgs pre-mints one
  // (transform, variation) pair per transform the command is about to add, so
  // the log carries them. Re-running with the same n and type reuses them.
  normalizeArgs(_ctx, [n, type, ids, origin]) {
    const count = symmetryTransformCount(n, type)
    const existing = Array.isArray(ids) ? ids : []
    const normalized = [
      n,
      type === 'dihedral' ? 'dihedral' : 'rotational',
      Array.from({ length: count }, (_, i) => {
        const pair = existing[i]
        return Array.isArray(pair) &&
          typeof pair[0] === 'string' &&
          typeof pair[1] === 'string'
          ? pair
          : [generateTransformId('sym'), generateVariationId()]
      }),
    ]
    return isSymmetryControlOrigin(origin)
      ? [...normalized, origin]
      : normalized
  },
  execute(ctx, n?: unknown, type?: unknown, ids?: unknown) {
    const args = [n, type, ids] as const
    const argsError = symmetryArgsError(args)
    if (argsError) {
      console.warn(`[cmd] flame.applySymmetry: ${argsError}`)
      return
    }
    // No early return on count === 0: "1-fold rotational" means NO symmetry,
    // and its job is then to clear the set a previous call created. Bailing
    // out left the old mirror transforms in place.
    const count = symmetryTransformCount(n, type)
    const pairs = ids as [string, string][]
    const dims = (ctx.flameDescriptor().renderSettings.dimensions ?? 2) as Dims
    const linear = () => getVariationDefault(defaultLinearType(dims), 1)
    const folds = n as number
    const retainedCounts = graphCounts(
      ctx.flameDescriptor(),
      (transformId) => !transformId.startsWith('_sym__'),
    )
    if (
      !isFlameGraphWithinLimits(
        retainedCounts.transformCount + count,
        retainedCounts.totalVariationCount + count,
        Math.max(retainedCounts.largestVariationCount, count > 0 ? 1 : 0),
      )
    ) {
      console.warn('[cmd] flame.applySymmetry: renderer graph limit exceeded')
      return
    }
    ctx.setFlameDescriptor((draft) => {
      // Regenerating replaces the previous set rather than stacking on it.
      for (const tid of Object.keys(draft.transforms) as TransformId[]) {
        if (tid.startsWith('_sym__')) delete draft.transforms[tid]
      }
      const totalWeight = Object.values(draft.transforms).reduce(
        (total, t) => total + t.probability,
        0,
      )
      const symWeight = Math.max(totalWeight, 1)
      const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
      const add = (
        index: number,
        preAffine: {
          a: number
          b: number
          c: number
          d: number
          e: number
          f: number
        },
      ) => {
        const pair = pairs[index]
        if (!pair) return
        draft.transforms[pair[0] as TransformId] = {
          probability: symWeight,
          colorSpeed: 0,
          color: { x: 0, y: 0 },
          visible: true,
          preAffine,
          postAffine: identity,
          variations: { [pair[1] as VariationId]: linear() },
        }
      }
      for (let i = 1; i < folds; i++) {
        const angle = (2 * Math.PI * i) / folds
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        add(i - 1, { a: cos, b: -sin, c: 0, d: sin, e: cos, f: 0 })
      }
      if (type === 'dihedral') {
        add(count - 1, { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 })
      }
    }, 'Apply Symmetry')
  },
})

registerCommand({
  id: 'flame.setMetadata',
  label: 'Set Flame Metadata',
  description: 'Set the flame name, author or description',
  coalesceKey: ([field]) =>
    typeof field === 'string' ? `metadata:${field}` : undefined,
  describe: ([field]) =>
    typeof field === 'string' ? `Set flame ${field}` : 'Set flame metadata',
  execute(ctx, field?: unknown, value?: unknown) {
    if (isPlainRecord(field) && value === undefined) {
      const keys = Object.keys(field)
      if (
        keys.length === 0 ||
        !keys.every(
          (key) =>
            (key === 'name' || key === 'author' || key === 'description') &&
            typeof field[key] === 'string' &&
            field[key].length <= 16_384,
        )
      ) {
        console.warn('[cmd] flame.setMetadata: rejected patch', field)
        return
      }
      ctx.setFlameDescriptor((draft) => {
        draft.metadata ??= { name: '', description: '', author: '' }
        for (const key of keys) {
          draft.metadata[key as 'name' | 'author' | 'description'] = field[
            key
          ] as string
        }
      }, 'Flame Metadata')
      return
    }
    if (
      (field !== 'name' && field !== 'author' && field !== 'description') ||
      typeof value !== 'string'
    ) {
      console.warn('[cmd] flame.setMetadata: rejected', field, value)
      return
    }
    ctx.setFlameDescriptor((draft) => {
      // The document may predate metadata entirely.
      draft.metadata ??= { name: '', description: '', author: '' }
      draft.metadata[field] = value
    }, 'Flame Metadata')
  },
})

registerCommand({
  id: 'flame.setAllTransformColors',
  label: 'Randomize All Colors',
  description: 'Set every transform colour at once, by transform id',
  // The colours are rolled by the caller and recorded as data, so replay
  // reproduces them without a seed — same shape as the per-transform dice.
  execute(ctx, colors?: unknown) {
    if (colors === null || typeof colors !== 'object') {
      console.warn('[cmd] flame.setAllTransformColors: not a record', colors)
      return
    }
    const next = deepClone(colors) as Record<string, { x: number; y: number }>
    ctx.setFlameDescriptor((draft) => {
      for (const [tid, color] of Object.entries(next)) {
        const transform = draft.transforms[tid as TransformId]
        if (
          transform &&
          Number.isFinite(color?.x) &&
          Number.isFinite(color?.y)
        ) {
          transform.color = { x: color.x, y: color.y }
        }
      }
    }, 'Randomize All Colors')
  },
})
