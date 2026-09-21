/**
 * Keyframe decimation — Ramer–Douglas–Peucker against a value tolerance.
 *
 * A decomposed affine path is curved in (a…f) space, so it cannot be two
 * keyframes; it is baked one per frame. A smooth monotone curve reduces from
 * fifty keyframes to a handful without moving by more than the tolerance,
 * which is what keeps a large flame inside the timeline's 4096-keyframe
 * budget.
 *
 * Reduction is lossy by definition, so `planGlide` reaches for it LAST — after
 * downgrading curved channels to straight ones, which costs accuracy in a way
 * the sampler agrees with. When decimation does run, the plan says so in
 * `notes` and the baked tracks no longer match `sampleGlide` exactly, only to
 * within the tolerance this function was given.
 */

import type { Keyframe } from '@/flame/schema/timeline'

/** Keyframes on a straight line between two neighbours, at `frame`. */
function valueOnSegment(
  first: Keyframe,
  last: Keyframe,
  frame: number,
): number {
  const span = last.frame - first.frame
  if (span === 0) return first.value as number
  const t = (frame - first.frame) / span
  return (
    (first.value as number) +
    ((last.value as number) - (first.value as number)) * t
  )
}

/**
 * Reduce a numeric keyframe run, keeping every value within `tolerance` of the
 * original. The first and last keyframes always survive, so the endpoints of a
 * glide are never approximated.
 */
export function reduceTrack(
  keyframes: readonly Keyframe[],
  tolerance: number,
): Keyframe[] {
  if (keyframes.length <= 2 || tolerance <= 0) return [...keyframes]
  if (keyframes.some((keyframe) => typeof keyframe.value !== 'number')) {
    return [...keyframes]
  }
  const keep = new Array<boolean>(keyframes.length).fill(false)
  keep[0] = true
  keep[keyframes.length - 1] = true
  const stack: [number, number][] = [[0, keyframes.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    if (last - first < 2) continue
    let worstIndex = -1
    let worstError = tolerance
    for (let index = first + 1; index < last; index++) {
      const candidate = keyframes[index]!
      const error = Math.abs(
        (candidate.value as number) -
          valueOnSegment(keyframes[first]!, keyframes[last]!, candidate.frame),
      )
      if (error > worstError) {
        worstError = error
        worstIndex = index
      }
    }
    if (worstIndex < 0) continue
    keep[worstIndex] = true
    stack.push([first, worstIndex], [worstIndex, last])
  }

  return keyframes.filter((_, index) => keep[index])
}

/** The largest deviation a reduction introduced, for a test or a note. */
export function reductionError(
  original: readonly Keyframe[],
  reduced: readonly Keyframe[],
): number {
  if (reduced.length < 2) return 0
  let worst = 0
  let segment = 0
  for (const keyframe of original) {
    while (
      segment < reduced.length - 2 &&
      reduced[segment + 1]!.frame < keyframe.frame
    ) {
      segment++
    }
    const value = valueOnSegment(
      reduced[segment]!,
      reduced[segment + 1]!,
      keyframe.frame,
    )
    worst = Math.max(worst, Math.abs((keyframe.value as number) - value))
  }
  return worst
}
