import { hasAtLeastOneElement, hasExactlyOneElement } from './assertArray'
import type { Patch } from 'structurajs'

const { isArray } = Array

/**
 * Given a list of patches, throws out redundant consecutive `replace` patches
 * to the same path and keeps the last one.
 *
 * This solves the most common case of changing a single value over time
 * but wanting to store only the last change.
 */
export function compressPatches(patches: Patch[]): Patch[] {
  if (!hasAtLeastOneElement(patches)) {
    return []
  }
  const [first, ...rest] = patches
  const output = [first]
  for (const patch of rest) {
    const last = output.at(-1)!
    if (
      patch.op === 'replace' &&
      last.op === 'replace' &&
      isArray(patch.path) &&
      isArray(last.path) &&
      patch.path.join(',') === last.path.join(',')
    ) {
      output[output.length - 1] = patch
    } else {
      output.push(patch)
    }
  }
  return output
}

/**
 * This only solves the most basic case of changing the same path
 * from one value to the same value (not changing it).
 */
export function forwardBackwardPatchPairDoesNothing(
  forwardPatches: Patch[],
  backwardPatches: Patch[],
) {
  if (
    !hasExactlyOneElement(forwardPatches) ||
    !hasExactlyOneElement(backwardPatches)
  ) {
    return false
  }
  const [forwardPatch] = forwardPatches
  const [backwardPatch] = backwardPatches
  return (
    forwardPatch.op === 'replace' &&
    backwardPatch.op === 'replace' &&
    isArray(forwardPatch.path) &&
    isArray(backwardPatch.path) &&
    forwardPatch.path.join(',') === backwardPatch.path.join(',') &&
    forwardPatch.value === backwardPatch.value
  )
}
