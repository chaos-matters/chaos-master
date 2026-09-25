// The symmetry a bred child inherits: the copies of the parent it takes the most user transforms from, as that parent shows them.
import { deepClone } from '@/utils/clone'
import { isSymmetryCopyId } from './mutationOperators'
import { reweighSymmetryCopies } from './symmetry'
import type { FlameDescriptor } from './schema/flameSchema'

/** Which parent a gene came from. A cross-bred pair of both has none. */
export type BreedParent = 'a' | 'b'

/** A flame's transforms without its `_sym__` copies: what Breed breeds from. */
export function breedableEntries<T>(
  transforms: Record<string, T>,
): [string, T][] {
  return Object.entries(transforms).filter(([tid]) => !isSymmetryCopyId(tid))
}

/**
 * Gives a child the symmetry copies of the parent it takes the most user
 * transforms from (the first parent on a tie), or none when that parent has
 * none.
 *
 * The copies are that parent's own, deep-cloned under their own ids, so the
 * child shows the symmetry the parent shows: angles set with the angle editor
 * and copies hidden on the Symmetry card come along as they are. Re-deriving
 * the set from the copies would have given a clean, fully visible n-fold set
 * instead. The parents share their dimensions (Breed refuses a mismatch), so
 * the copies are in a layout the child's renderer reads the same way. Only
 * the weight is the child's: `symmetryWeight` of its own user transforms.
 */
export function inheritSymmetry(
  child: FlameDescriptor,
  parentA: FlameDescriptor,
  parentB: FlameDescriptor,
  fromA: number,
  fromB: number,
): FlameDescriptor {
  const source = fromA >= fromB ? parentA : parentB
  const parentCopies = Object.entries(source.transforms).filter(([tid]) =>
    isSymmetryCopyId(tid),
  )
  if (parentCopies.length === 0) return child
  const transforms = {
    ...child.transforms,
    ...deepClone(Object.fromEntries(parentCopies)),
  }
  reweighSymmetryCopies(transforms)
  return { ...child, transforms }
}
