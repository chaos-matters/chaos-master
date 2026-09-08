import { isFlameGraphWithinLimits } from '@/flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType } from '@/flame/variationRegistry'
import { getVariationDefault } from '@/flame/variations/utils'
import { registerCommand } from '../../registry'
import { num } from '../describeArgs'
import { graphCounts, isSymmetryControlOrigin, symmetryArgsError, symmetryTransformCount, } from './helpers'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'

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
