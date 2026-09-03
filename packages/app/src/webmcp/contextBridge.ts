/**
 * Module-global seam between the WebMCP tool layer and the workspace.
 *
 * Follows the same pattern as `recorder/documentWriteHook.ts`: this module
 * imports nothing but types, which is the whole point — it breaks the import
 * cycle between the WebMCP tools (which need the CommandContext to dispatch
 * commands) and MainWorkspace (which constructs the CommandContext but must
 * not be imported by the tools).
 *
 * MainWorkspace installs the live context via `setWebMcpContext` after
 * building its `cmdContext`; a duel installs a second one for its rival seat
 * and moves the target. The tools read it via `getWebMcpContext`. Until a
 * context is installed, tool calls return errors gracefully.
 */

import { DEFAULT_SEAT } from '@/seats/seatId'
import type { CommandContext } from '@/commands/types'
import type { SeatId } from '@/seats/seatId'

const contexts = new Map<SeatId, CommandContext>()

/**
 * Which seat the tools act on.
 *
 * Every tool reads `getWebMcpContext()` with no argument, so moving this is
 * how a duel points the whole tool surface at the rival's flame without
 * touching a single tool. It returns to the player whenever the targeted
 * seat is cleared, and `finishPilot` resets it when a session ends.
 */
let target: SeatId = DEFAULT_SEAT

/** Install the live CommandContext for a seat. Called from MainWorkspace for
 *  the player, and from the duel for the rival. */
export function setWebMcpContext(
  ctx: CommandContext,
  seatId: SeatId = DEFAULT_SEAT,
): void {
  contexts.set(seatId, ctx)
}

/**
 * Read a seat's live CommandContext; with no argument, the current target.
 *
 * Returns `undefined` before MainWorkspace mounts or after it unmounts. Tool
 * implementations must handle the missing-context case with a descriptive
 * error so the LLM can self-correct.
 */
export function getWebMcpContext(seatId?: SeatId): CommandContext | undefined {
  return contexts.get(seatId ?? target)
}

/** Tear down one seat's bridge entry. Called from MainWorkspace's `onCleanup`
 *  and when a duel disposes its rival seat. */
export function clearWebMcpContext(seatId: SeatId = DEFAULT_SEAT): void {
  contexts.delete(seatId)
  // A target pointing at a seat that no longer exists would make every tool
  // report "workspace not ready" with no way back — and so would one pointing
  // at a live seat after the workspace under it went away, which is what
  // stranded things: unmounting mid-duel cleared `player` while the target sat
  // on `rival`, and the duel tools, which read `player` explicitly, never
  // recovered. Losing the default seat takes the target home either way.
  if (target === seatId || seatId === DEFAULT_SEAT) target = DEFAULT_SEAT
}

export function setWebMcpTarget(seatId: SeatId): void {
  target = seatId
}

export function getWebMcpTarget(): SeatId {
  return target
}
