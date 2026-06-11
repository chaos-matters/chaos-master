import { examples } from '@/flame/examples'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { getVariationDefault } from '@/flame/variations/utils'
import { deepClone } from '@/utils/clone'
import { registerCommand } from '../registry'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'

function getTransformKey(
  transforms: Record<string, unknown>,
  index: number,
): TransformId | undefined {
  const keys = Object.keys(transforms) as TransformId[]
  return index >= 0 && index < keys.length ? keys[index] : undefined
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

registerCommand({
  id: 'flame.addTransform',
  label: 'Add Transform',
  description: 'Add a new transform with an optional variation type',
  shortcut: 'Shift+T',
  execute(ctx, variationType?: unknown) {
    const type = typeof variationType === 'string' ? variationType : 'linearVar'
    ctx.setFlameDescriptor((draft) => {
      draft.transforms[generateTransformId()] = {
        probability: 1,
        colorSpeed: 0.4,
        color: { x: 0, y: 0 },
        visible: true,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        variations: {
          [generateVariationId()]: getVariationDefault(type, 1),
        },
      }
    })
  },
})

registerCommand({
  id: 'flame.removeTransform',
  label: 'Remove Transform',
  description: 'Remove a transform by index (0-based)',
  execute(ctx, index?: unknown) {
    const idx = typeof index === 'number' ? index : -1
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, idx)
      if (key) delete draft.transforms[key]
    })
  },
})

registerCommand({
  id: 'flame.setVariationWeight',
  label: 'Set Variation Weight',
  description: 'Set the weight of a variation on a specific transform',
  execute(
    ctx,
    transformIndex?: unknown,
    variationIndex?: unknown,
    weight?: unknown,
  ) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const vidx = typeof variationIndex === 'number' ? variationIndex : 0
    const w = typeof weight === 'number' ? weight : 1
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const transform = draft.transforms[key]
        if (transform) {
          const vKeys = Object.keys(transform.variations) as VariationId[]
          if (vidx >= 0 && vidx < vKeys.length) {
            const vKey = vKeys[vidx]
            if (vKey) {
              const variation = transform.variations[vKey]
              if (variation) {
                variation.weight = w
              }
            }
          }
        }
      }
    })
  },
})

registerCommand({
  id: 'flame.addVariation',
  label: 'Add Variation',
  description: 'Add a variation type to a specific transform',
  execute(ctx, transformIndex?: unknown, variationType?: unknown) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const type = typeof variationType === 'string' ? variationType : 'linearVar'
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const transform = draft.transforms[key]
        if (transform) {
          transform.variations[generateVariationId()] = getVariationDefault(
            type,
            1,
          )
        }
      }
    })
  },
})

registerCommand({
  id: 'flame.setColorSpeed',
  label: 'Set Color Speed',
  description: 'Set the color speed of a specific transform',
  execute(ctx, transformIndex?: unknown, speed?: unknown) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const s = typeof speed === 'number' ? speed : 0.5
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const transform = draft.transforms[key]
        if (transform) {
          transform.colorSpeed = s
        }
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
  description: 'Set the probability weight of a transform by index',
  execute(ctx, transformIndex?: unknown, probability?: unknown) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const p = typeof probability === 'number' ? probability : 1
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const t = draft.transforms[key]
        if (t) t.probability = p
      }
    })
  },
})

registerCommand({
  id: 'flame.setAffine',
  label: 'Set Affine Coefficient',
  description: 'Set a pre/post affine coefficient on a transform',
  execute(
    ctx,
    transformIndex?: unknown,
    affineType?: unknown,
    param?: unknown,
    value?: unknown,
  ) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const type =
      typeof affineType === 'string' && affineType === 'post'
        ? 'postAffine'
        : 'preAffine'
    const p = typeof param === 'string' ? param : 'a'
    const v = typeof value === 'number' ? value : 1
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const t = draft.transforms[key]
        if (t && p in t[type]) {
          ;(t[type] as Record<string, number>)[p] = v
        }
      }
    })
  },
})

registerCommand({
  id: 'flame.setTransformColor',
  label: 'Set Transform Color',
  description: 'Set the color x/y coordinates of a transform',
  execute(ctx, transformIndex?: unknown, x?: unknown, y?: unknown) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const cx = typeof x === 'number' ? x : 0
    const cy = typeof y === 'number' ? y : 0
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const t = draft.transforms[key]
        if (t) t.color = { x: cx, y: cy }
      }
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
  execute(
    ctx,
    transformIndex?: unknown,
    variationIndex?: unknown,
    paramName?: unknown,
    paramValue?: unknown,
  ) {
    const tidx = typeof transformIndex === 'number' ? transformIndex : 0
    const vidx = typeof variationIndex === 'number' ? variationIndex : 0
    const name = typeof paramName === 'string' ? paramName : ''
    const value = typeof paramValue === 'number' ? paramValue : 0
    if (!name) return
    ctx.setFlameDescriptor((draft) => {
      const key = getTransformKey(draft.transforms, tidx)
      if (key) {
        const transform = draft.transforms[key]
        if (transform) {
          const vKeys = Object.keys(transform.variations) as VariationId[]
          if (vidx >= 0 && vidx < vKeys.length) {
            const vKey = vKeys[vidx]
            if (vKey) {
              const variation = transform.variations[vKey]
              if (variation && 'params' in variation) {
                ;(variation.params as Record<string, number>)[name] = value
              }
            }
          }
        }
      }
    })
  },
})
