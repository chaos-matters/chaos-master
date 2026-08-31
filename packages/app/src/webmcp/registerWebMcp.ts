/**
 * WebMCP registration entry point.
 *
 * Called once from MainWorkspace after the CommandContext is fully constructed.
 * Responsibilities:
 *   1. Install the CommandContext into the module-global bridge.
 *   2. Feature-detect `document.modelContext` / `navigator.modelContext`.
 *   3. Register all Tier 1 tools if a ModelContext is available.
 *   4. Return a cleanup function for SolidJS `onCleanup`.
 *
 * When no ModelContext is detected (standard dev, non-WebMCP browser), this
 * module installs the context bridge but skips tool registration. The bridge
 * is still useful for the dev overlay and Vitest tests.
 */

import { clearWebMcpContext, setWebMcpContext } from './contextBridge'
import { MockModelContext } from './mockModelContext'
import { allTools } from './tools'
import { getModelContext } from './types'
import type { CommandContext } from '@/commands/types'

/**
 * Register all WebMCP tools and wire the context bridge.
 *
 * @param cmdContext The live CommandContext from MainWorkspace.
 * @returns A cleanup function that tears down the bridge.
 */
export function registerWebMcpTools(cmdContext: CommandContext): () => void {
  // 1. Install the bridge so tools can reach the app state.
  setWebMcpContext(cmdContext)

  // 2. Feature-detect the WebMCP ModelContext.
  const modelContext = getModelContext()

  if (modelContext) {
    // 3. Register all tools.
    for (const tool of allTools) {
      try {
        modelContext.registerTool(tool)
      } catch (err) {
        console.error(`[WebMCP] Failed to register tool "${tool.name}":`, err)
      }
    }

    if (import.meta.env.DEV) {
      console.info(
        `[WebMCP] Registered ${allTools.length} tools:`,
        allTools.map((t) => t.name).join(', '),
      )
    }
  } else if (import.meta.env.DEV) {
    console.info(
      '[WebMCP] No ModelContext detected — using MockModelContext for dev/testing.',
    )
    const mockContext = new MockModelContext()
    for (const tool of allTools) {
      mockContext.registerTool(tool)
    }
    // Expose on window for easy testing in console
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).webmcp = mockContext
  }

  // 4. Return cleanup.
  return () => {
    clearWebMcpContext()
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).webmcp
    }
    if (import.meta.env.DEV) {
      console.info('[WebMCP] Context bridge cleared.')
    }
  }
}
