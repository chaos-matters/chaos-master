// Settles every clash the arena was asked for: with its result, or with why it stopped.
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'

export type ClashCancelled = { cancelled: true; reason: string }
export type ClashOutcome = SimulateClashResult | ClashCancelled

/**
 * The promise `arena.startClash` hands out, kept so it always settles.
 *
 * A clash can end without a verdict: a newer clash replaces it, the arena
 * closes, the opponent is rerolled, a fighter is reloaded, or it never starts
 * for want of a fighter. `arena_start_clash` awaits this promise, so an end
 * that did not settle it left the agent's call hanging for good.
 */
export function createClashRequests() {
  let pending: ((outcome: ClashOutcome) => void) | null = null
  const settle = (outcome: ClashOutcome) => {
    const resolve = pending
    pending = null
    resolve?.(outcome)
  }
  return {
    /** The clash just started; returns what its caller awaits. */
    track(): Promise<ClashOutcome> {
      settle({ cancelled: true, reason: 'A new clash replaced it.' })
      return new Promise((resolve) => {
        pending = resolve
      })
    },
    complete(result: SimulateClashResult): void {
      settle(result)
    },
    cancel(reason: string): void {
      settle({ cancelled: true, reason })
    },
  }
}
