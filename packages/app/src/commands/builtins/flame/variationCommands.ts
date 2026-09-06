import { isSafeFlameEntityId } from '@/flame/schema/flameSchema'
import { allTransformVariations, TransformVariationDescriptor, } from '@/flame/variations'
import { getVariationDefault } from '@/flame/variations/utils'
import { deepClone } from '@/utils/clone'
import * as v from '@/valibot'
import { registerCommand } from '../../registry'
import { num, str } from '../describeArgs'
import { canAddVariation, isAffineLike, isKnownVariationType, normalizeTransformRef, normalizeVariationRef, resolveNewVariationId, resolveTransformKey, resolveVariationKey, resolveVariationType, validatedVariationUpdate, variationDescriptorType, variationTypeMatchesCurrentFlame, } from './helpers'

registerCommand({
  id: 'flame.setVariationWeight',
  describe: ([, , weight]) => {
    const w = num(weight)
    return w === undefined ? 'Set a variation weight' : `Variation weight: ${w}`
  },
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
  describe: ([, type]) =>
    `Add a variation${str(type) ? `: ${String(type)}` : ''}`,
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
  id: 'flame.setVariationParams',
  describe: ([, , name, value]) => {
    const n = str(name)
    if (n === undefined) return 'Set a variation parameter'
    const v = num(value) ?? String(value)
    return `Variation ${n}: ${v}`
  },
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
      if (variation) {
        const vtype = (variation as { type?: unknown }).type
        const variationDef =
          typeof vtype === 'string'
            ? (
                allTransformVariations as Record<
                  string,
                  { paramDefaults?: Record<string, number> }
                >
              )[vtype]
            : undefined
        const defaults = variationDef?.paramDefaults
        const existingParams = (
          variation as { params?: Record<string, number> }
        ).params
        const isKnownParam =
          (existingParams && Object.hasOwn(existingParams, name)) ||
          (defaults && Object.hasOwn(defaults, name))
        if (!isKnownParam) {
          console.warn(
            `[cmd] flame.setVariationParams: "${name}" is not a parameter of ${String(vtype)} (has ${Object.keys(existingParams ?? defaults ?? {}).join(', ')})`,
          )
          return
        }
        const currentParams = (variation as { params?: Record<string, number> })
          .params
        ;(variation as { params: Record<string, number> }).params = {
          ...(defaults ?? {}),
          ...(currentParams ?? {}),
          [name]: value,
        }
      }
    })
  },
})

registerCommand({
  id: 'flame.setVariationVisible',
  describe: ([, , visible]) =>
    visible === true ? 'Show a variation' : 'Hide a variation',
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
  describe: ([, , descriptor]) => {
    const type = str(variationDescriptorType(descriptor))
    return type === undefined
      ? 'Replace a variation'
      : `Replace a variation with ${type}`
  },
  label: 'Set Variation',
  description:
    'Replace a variation descriptor wholesale (type, weight and params)',
  validateReplayArgs(args) {
    if (args.length !== 3 && args.length !== 4) {
      return 'setVariation expects two entity ids, a descriptor and optional UI origin'
    }
    if (!isSafeFlameEntityId(args[0])) return 'transform id is unsafe'
    if (!isSafeFlameEntityId(args[1])) return 'variation id is unsafe'
    const descriptorType = variationDescriptorType(args[2])
    if (!isKnownVariationType(descriptorType)) {
      return 'variation descriptor type is not registered'
    }
    if (!v.safeParse(TransformVariationDescriptor, args[2]).success) {
      return `variation descriptor for "${descriptorType}" is incomplete: send the whole descriptor, including weight (and params for a parametric variation). Read the current one with get_flame_detail.`
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
  coalesceKey: ([transformRef, variationRef]) =>
    `variation:${String(transformRef)}:${String(variationRef)}`,
  execute(
    ctx,
    transformRef?: unknown,
    variationRef?: unknown,
    descriptor?: unknown,
  ) {
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
  id: 'flame.deleteVariation',
  describe: () => 'Delete a variation',
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
  id: 'flame.applyVariationSelection',
  label: 'Apply Variation Selection',
  description:
    "Apply the variation browser's result: a transform's pre-affine and one variation, together",
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
