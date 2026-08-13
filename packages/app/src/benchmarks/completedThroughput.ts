import type { CompletedPointCountInfo } from '@/flame/Flam3'

export type CompletedThroughput = {
  points: number
  elapsedMs: number
  pointsPerSecond: number
}

/**
 * Builds a queue-completed throughput window.
 *
 * The first completed submission is deliberately the baseline rather than a
 * scored sample: pipeline setup, first-use driver work, and the cold queue are
 * warmed without crediting their points while excluding their execution time.
 */
export function createCompletedThroughputTracker() {
  let baseline: CompletedPointCountInfo | undefined
  let previousCount = 0

  return {
    reset() {
      baseline = undefined
      previousCount = 0
    },

    observe(info: CompletedPointCountInfo): CompletedThroughput | undefined {
      if (
        baseline === undefined ||
        info.count < previousCount ||
        info.completedAtMs < baseline.completedAtMs
      ) {
        baseline = info
        previousCount = info.count
        return undefined
      }

      previousCount = info.count
      const points = info.count - baseline.count
      const elapsedMs = info.completedAtMs - baseline.completedAtMs
      if (points <= 0 || elapsedMs <= 0) return undefined

      return {
        points,
        elapsedMs,
        pointsPerSecond: points / (elapsedMs / 1000),
      }
    },
  }
}
