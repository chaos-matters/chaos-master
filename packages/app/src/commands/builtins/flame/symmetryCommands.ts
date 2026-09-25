import { isFlameGraphWithinLimits } from '@/flame/schema/flameSchema'
import { symmetryLayout, symmetryPreAffines, symmetryTransform, symmetryWeight, } from '@/flame/symmetry'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { registerCommand } from '../../registry'
import { num } from '../describeArgs'
import { graphCounts, isSymmetryControlOrigin, symmetryArgsError, symmetryTransformCount, } from './helpers'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'
import type { SymmetryType } from '@/flame/symmetryDetection'

const symmetryType = (type: unknown): SymmetryType =>
  type === 'dihedral' ? 'dihedral' : 'rotational'

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
      // The same transforms applySymmetryToFlame writes, under the ids the
      // normalized args carry so a replay writes them again.
      const layout = symmetryLayout(draft)
      const weight = symmetryWeight(draft.transforms)
      symmetryPreAffines(n as number, symmetryType(type), layout).forEach(
        (preAffine, index) => {
          const pair = pairs[index]
          if (!pair) return
          draft.transforms[pair[0] as TransformId] = symmetryTransform(
            preAffine,
            weight,
            layout,
            pair[1] as VariationId,
          )
        },
      )
    }, 'Apply Symmetry')
  },
})
