import { newDefaultTransform } from '@/flame/newTransform'
import { isFlameGraphWithinLimits, isSafeFlameEntityId, tryValidateFlame, } from '@/flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType } from '@/flame/variationRegistry'
import { getVariationDefault } from '@/flame/variations/utils'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../../registry'
import { num, str } from '../describeArgs'
import { AFFINE_3D_KEYS, canAddTransform, graphCounts, isAbsentRef, isAffineLike, isKnownVariationType, isSymmetryControlOrigin, normalizeTransformRef, resolveNewTransformId, resolveNewVariationId, resolveTransformKey, resolveVariationType, symmetryArgsError, symmetryTransformCount, variationTypeMatchesCurrentFlame, } from './helpers'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'

registerCommand({
  id: 'flame.addTransform',
  describe: ([type]) =>
    `Add a transform${str(type) ? `: ${String(type)}` : ''}`,
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
  id: 'flame.setColorSpeed',
  describe: ([, speed]) => {
    const s = num(speed)
    return s === undefined ? 'Set a colour speed' : `Colour speed: ${s}`
  },
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
  id: 'flame.setProbability',
  describe: ([, probability]) => {
    const p = num(probability)
    return p === undefined
      ? 'Set a transform probability'
      : `Transform probability: ${p}`
  },
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
  describe: ([, which, param, value]) => {
    const p = str(param)
    const v = num(value, 3)
    if (p === undefined || v === undefined) return 'Set an affine coefficient'
    return `${which === 'post' ? 'Post' : 'Pre'}-affine ${p}: ${v}`
  },
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
  describe: ([, x, y]) => {
    const cx = num(x)
    const cy = num(y)
    return cx === undefined || cy === undefined
      ? 'Set a transform colour'
      : `Transform colour: ${cx}, ${cy}`
  },
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
  id: 'flame.setTransformVisible',
  label: 'Set Transform Visibility',
  description: 'Show or hide a transform',
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
  id: 'flame.deleteTransform',
  describe: () => 'Delete a transform',
  label: 'Delete Transform',
  description:
    'Delete a transform, or reset it to a blank one when it is the last',
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
  id: 'flame.setFinalTransform',
  describe: ([affine]) =>
    affine === null || affine === undefined
      ? 'Clear the final transform'
      : 'Set the final transform',
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
  describe: ([param, value]) => {
    const p = str(param)
    const v = num(value, 3)
    return p === undefined || v === undefined
      ? 'Set a final affine coefficient'
      : `Final affine ${p}: ${v}`
  },
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
  id: 'flame.setTransformAffine',
  describe: ([, which]) =>
    `Reshape a transform (${which === 'post' ? 'post' : 'pre'}-affine)`,
  label: 'Set Transform Affine',
  description:
    "Replace a transform's whole pre- or post-affine (the affine editor's drag)",
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
  id: 'flame.applySymmetry',
  describe: ([n, type]) => {
    const fold = num(n, 0)
    const kind = type === 'dihedral' ? 'dihedral' : 'rotational'
    return fold === undefined
      ? `Apply ${kind} symmetry`
      : `Apply ${fold}-fold ${kind} symmetry`
  },
  label: 'Apply Symmetry',
  description:
    'Replace the generated symmetry transforms with an n-fold rotational or dihedral set',
  validateReplayArgs(args) {
    return symmetryArgsError(args)
  },
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
  id: 'flame.setAllTransformColors',
  describe: ([colors]) => {
    const count =
      colors !== null && typeof colors === 'object'
        ? Object.keys(colors).length
        : 0
    return count === 0
      ? 'Randomize every transform colour'
      : `Randomize ${count} transform colours`
  },
  label: 'Randomize All Colors',
  description: 'Set every transform colour at once, by transform id',
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
