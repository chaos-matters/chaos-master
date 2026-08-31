/**
 * Module-global seam between the WebMCP tool layer and the workspace.
 *
 * Follows the same pattern as `recorder/documentWriteHook.ts`: this module
 * imports nothing, which is the whole point — it breaks the import cycle
 * between the WebMCP tools (which need the CommandContext to dispatch
 * commands) and MainWorkspace (which constructs the CommandContext but must
 * not be imported by the tools).
 *
 * MainWorkspace installs the live context via `setWebMcpContext` after
 * building its `cmdContext`. The tools read it via `getWebMcpContext`.
 * Until the context is installed, tool calls return errors gracefully.
 */

import type { CommandContext } from '@/commands/types'

let context: CommandContext | undefined

/** Install the live CommandContext. Called once from MainWorkspace. */
export function setWebMcpContext(ctx: CommandContext): void {
  context = ctx
}

/**
 * Read the live CommandContext.
 *
 * Returns `undefined` before MainWorkspace mounts or after it unmounts.
 * Tool implementations must handle the missing-context case with a
 * descriptive error so the LLM can self-correct.
 */
export function getWebMcpContext(): CommandContext | undefined {
  return context
}

/** Tear down the bridge. Called from MainWorkspace's `onCleanup`. */
export function clearWebMcpContext(): void {
  context = undefined
}
