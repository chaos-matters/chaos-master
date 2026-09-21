/**
 * What corresponds to what.
 *
 * Before anything can be interpolated, the planner has to decide which
 * transform in A became which transform in B. Identity first — the same id on
 * both sides pairs immediately, which is the overwhelmingly common case
 * because a glide usually spans a single command — and the residue goes
 * through the similarity matcher `fdiff` already owns, so the animation and
 * the comparison panel cannot disagree about the same pair of flames.
 */

import { diffTransforms } from '@/flame/fdiff'
import { recordEntries } from '@/utils/record'
import type { FlameDescriptor, TransformFunction, } from '@/flame/schema/flameSchema'

export type TransformPairing = {
  matched: { idA: string; idB: string }[]
  onlyA: string[]
  onlyB: string[]
}

/**
 * Below this, two transforms are not the same transform.
 *
 * `fdiff`'s matcher is greedy over a full matrix, so two residues of equal
 * length ALWAYS pair, however unalike — which is the right answer for a
 * similarity report and the wrong one for a transition: a preset load would
 * read as three transforms sliding into three unrelated shapes rather than
 * three fading out while three fade in, and the change would be classified as
 * a scalar tweak and glide for 400 ms.
 *
 * The score is `variationType × 0.5 + affine × 0.3 + colour × 0.2`, so 0.35
 * keeps "same variation type, different shape" (≥ 0.5) and "same shape,
 * different variation type" (≥ 0.5) together, and separates a pair that shares
 * none of the three.
 */
export const GLIDE_PAIR_MIN_SIMILARITY = 0.35

function transformIds(flame: FlameDescriptor): string[] {
  return recordEntries(flame.transforms)
    .map(([id]) => String(id))
    .sort()
}

/** A descriptor carrying only the named transforms, for the residue pass. */
function subsetFlame(
  flame: FlameDescriptor,
  ids: readonly string[],
): FlameDescriptor {
  const transforms: Record<string, TransformFunction> = {}
  for (const id of ids) {
    const transform = (flame.transforms as Record<string, TransformFunction>)[
      id
    ]
    if (transform) transforms[id] = transform
  }
  return {
    ...flame,
    transforms: transforms,
  }
}

export function pairTransforms(
  a: FlameDescriptor,
  b: FlameDescriptor,
): TransformPairing {
  const idsA = transformIds(a)
  const idsB = transformIds(b)
  const inB = new Set(idsB)
  const matched: { idA: string; idB: string }[] = []
  const residueA: string[] = []
  for (const id of idsA) {
    if (inB.has(id)) matched.push({ idA: id, idB: id })
    else residueA.push(id)
  }
  const inA = new Set(idsA)
  const residueB = idsB.filter((id) => !inA.has(id))

  if (residueA.length === 0 || residueB.length === 0) {
    return { matched, onlyA: residueA, onlyB: residueB }
  }

  const similar = diffTransforms(
    subsetFlame(a, residueA),
    subsetFlame(b, residueB),
  )
  const onlyA = [...similar.unmatchedA]
  const onlyB = [...similar.unmatchedB]
  for (const pair of similar.matched) {
    if (pair.similarity < GLIDE_PAIR_MIN_SIMILARITY) {
      onlyA.push(pair.idA)
      onlyB.push(pair.idB)
      continue
    }
    matched.push({ idA: pair.idA, idB: pair.idB })
  }
  return { matched, onlyA: onlyA.sort(), onlyB: onlyB.sort() }
}

export type VariationPairing = {
  /** Same variation, same type: every differing leaf interpolates. */
  matched: { idA: string; idB: string }[]
  /**
   * The same slot holding a different variation type. Not a pair: a type
   * cannot be interpolated, so the old one fades out while the new one fades
   * in, which means both are present in the union at once.
   */
  retyped: { idA: string; idB: string }[]
  onlyA: string[]
  onlyB: string[]
}

type Variations = TransformFunction['variations']
/** The structural part of a variation descriptor that pairing reads. The
 *  schema's own record is keyed by a branded id, which cannot be indexed by a
 *  plain string, and the discriminated union has 400+ members. */
type VariationDescriptor = { type: string; weight: number; visible?: boolean }

function variationEntries(
  variations: Variations,
): [string, VariationDescriptor][] {
  return recordEntries(variations as Record<string, VariationDescriptor>).sort(
    ([left], [right]) => left.localeCompare(right),
  )
}

export function pairVariations(a: Variations, b: Variations): VariationPairing {
  const entriesA = variationEntries(a)
  const entriesB = variationEntries(b)
  const mapB = new Map(entriesB)
  const matched: { idA: string; idB: string }[] = []
  const retyped: { idA: string; idB: string }[] = []
  const usedB = new Set<string>()
  const residueA: string[] = []

  for (const [id, variation] of entriesA) {
    const counterpart = mapB.get(id)
    if (!counterpart) {
      residueA.push(id)
      continue
    }
    usedB.add(id)
    if (counterpart.type === variation.type) matched.push({ idA: id, idB: id })
    else retyped.push({ idA: id, idB: id })
  }

  // Then by type: a variation that was removed and re-added under a fresh id
  // is still the same variation to a viewer, and pairing it keeps its weight
  // moving instead of crossfading two identical shapes.
  const stillA: string[] = []
  for (const id of residueA) {
    const type = (a as Record<string, VariationDescriptor>)[id]?.type
    const candidate = entriesB.find(
      ([otherId, variation]) => !usedB.has(otherId) && variation.type === type,
    )
    if (candidate) {
      usedB.add(candidate[0])
      matched.push({ idA: id, idB: candidate[0] })
    } else {
      stillA.push(id)
    }
  }

  return {
    matched,
    retyped,
    onlyA: stillA,
    onlyB: entriesB.filter(([id]) => !usedB.has(id)).map(([id]) => id),
  }
}
