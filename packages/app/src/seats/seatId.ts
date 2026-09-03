/**
 * A seat is one editing unit: a flame with its history, a camera, and a
 * recorder stream. The workspace is the `player` seat; a duel adds `rival`.
 *
 * Deliberately a leaf that imports nothing: `recorder/documentWriteHook.ts`
 * and `webmcp/contextBridge.ts` both exist to break import cycles, and both
 * need this type without gaining a dependency.
 */
export type SeatId = 'player' | 'rival'

export const DEFAULT_SEAT: SeatId = 'player'

export const SEAT_IDS: readonly SeatId[] = ['player', 'rival']

export function isSeatId(value: unknown): value is SeatId {
  return (
    typeof value === 'string' && (SEAT_IDS as readonly string[]).includes(value)
  )
}
