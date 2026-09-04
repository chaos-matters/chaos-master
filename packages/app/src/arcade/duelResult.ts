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
  /** The card's title when the player wins: their flame's name, or `You`. */
  playerName: string
  /** The same for the rival: the name the agent declared, or `The agent`. */
  rivalName: string
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
  /**
   * The exported card, once it has been rendered.
   *
   * Cached here rather than in the component so a remount does not re-run a
   * multi-second GPU still. Download and Share both want the same bytes.
   */
  card?: Blob
  /** The share link, once the Worker has answered (or refused). */
  shareUrl?: string
}

const [duelResult, setDuelResult] = createSignal<DuelResult | undefined>()

export { duelResult }

export function showDuelResult(result: DuelResult): void {
  setDuelResult(result)
}

/**
 * Attach the rendered card, if the same duel is still on screen.
 *
 * The id guard matters: rendering the still takes seconds, and a viewer who
 * closes the card and starts another duel in that window must not have the
 * old PNG land on the new result.
 */
export function setDuelCard(id: string, card: Blob): void {
  setDuelResult((prev) => (prev && prev.id === id ? { ...prev, card } : prev))
}

export function setDuelShareUrl(id: string, shareUrl: string): void {
  setDuelResult((prev) =>
    prev && prev.id === id ? { ...prev, shareUrl } : prev,
  )
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
