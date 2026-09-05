import { onCleanup } from 'solid-js'
import { registerWebMcpTools } from '@/webmcp/registerWebMcp'
import type { CommandContext } from '@/commands/types'

/**
 * Hook to manage workspace command context lifecycle, WebMCP tools registration
 * and automated cleanup on workspace unmount.
 */
export function useWorkspaceCommands(
  cmdContext: CommandContext,
): CommandContext {
  const cleanupWebMcp = registerWebMcpTools(cmdContext)
  onCleanup(cleanupWebMcp)
  return cmdContext
}
