import { createSignal } from 'solid-js'
import { closeDuelView } from './duel'
import type { DuelVerdict } from './duelJudge'
import type { PilotEndReason } from './pilot'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * What a finished duel leaves on screen.
 *
 * Module-global for the same reason the duel itself is: the clock, the End
 * button and the pilot's own ending all finish a duel, and none of them owns
 * the screen that reports it.
 *
 * It carries a snapshot rather than live accessors because `stopDuel()`
 * disposes the rival seat on its way out — by the time the card renders, the
 * rival's store is gone, and a card that reads through it would show nothing.
 */
export type DuelResult = {
  verdict: DuelVerdict
  /** Ends the same way the pilot does, so the card can name the reason. */
  reason: PilotEndReason
  playerTitle: string
  rivalTitle: string
  /** The winning flame, kept whole so the share link can encode it. */
  winnerFlame: FlameDescriptor
  /** `calculateFlameStats().type` for the winner: the badge's archetype word. */
  archetype: string
  /** The clock the duel was set to. */
  durationMs: number
  /** Short, stable, and only ever shown — nothing resolves it yet. */
  id: string
  /** How many takes reached the library; 0 for a solo duel. */
  savedTakes: number
}

const [duelResult, setDuelResult] = createSignal<DuelResult | undefined>()

export { duelResult }

export function showDuelResult(result: DuelResult): void {
  setDuelResult(result)
}

/**
 * The viewer is done with the card. This is the only thing that frees the
 * rival's seat — `stopDuel` deliberately leaves it alive so both flames keep
 * rendering under the verdict.
 */
export function clearDuelResult(): void {
  setDuelResult(undefined)
  closeDuelView()
}

/**
 * Seven hex characters, which is enough to name one duel in a conversation
 * and short enough to read out.
 */
export function newDuelId(): string {
  const bytes = new Uint8Array(4)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 7)
}
