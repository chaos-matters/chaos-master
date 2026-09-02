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

import { agentDriving } from '@/arcade/pilot'
import { clearWebMcpContext, setWebMcpContext } from './contextBridge'
import { MockModelContext } from './mockModelContext'
import { allTools } from './tools'
import { getModelContext } from './types'
import type { WebMcpTool } from './types'
import type { CommandContext } from '@/commands/types'

const isEnvelope = (r: unknown): r is { content: unknown[] } =>
  Boolean(
    r &&
    typeof r === 'object' &&
    Array.isArray((r as Record<string, unknown>).content),
  )

export const toMcpResult = (raw: unknown) => {
  if (isEnvelope(raw)) return raw
  const isError = Boolean(
    raw &&
    typeof raw === 'object' &&
    'error' in (raw as Record<string, unknown>),
  )
  return {
    content: [{ type: 'text', text: JSON.stringify(raw, null, 2) }],
    ...(isError ? { isError: true } : {}),
  }
}

/** Write tools that stay usable while an Arcade pilot drives, because they
 *  enforce the guard themselves. */
const DRIVING_SAFE_TOOLS = new Set(['execute_command'])

export const wrapTool = (tool: WebMcpTool): WebMcpTool => ({
  ...tool,
  execute: async (args: unknown, context: { signal?: AbortSignal }) => {
    // One lock, one door. While the Arcade drives, every mutation goes
    // through the guarded escape hatch or an arcade_* tool; the document-level
    // tools (set_flame, undo, load_share_link, ...) would otherwise write
    // straight past the mode's allow-list and the step budget.
    if (
      agentDriving() &&
      tool.annotations?.readOnlyHint !== true &&
      !tool.name.startsWith('arcade_') &&
      !DRIVING_SAFE_TOOLS.has(tool.name)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `${tool.name} is unavailable while an Arcade session is active. Use execute_command (guarded) or the arcade_* tools.`,
          },
        ],
        isError: true,
      }
    }
    try {
      const raw = await tool.execute(args, context)
      return toMcpResult(raw)
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
        isError: true,
      }
    }
  },
})

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
        modelContext.registerTool(wrapTool(tool))
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
  } else {
    if (import.meta.env.DEV) {
      console.info(
        '[WebMCP] No ModelContext detected — using MockModelContext for dev/testing.',
      )
    }
    const mockContext = new MockModelContext()
    for (const tool of allTools) {
      mockContext.registerTool(wrapTool(tool))
    }
    if (typeof window !== 'undefined') {
      // Expose on window for easy testing in console, Playwright, and dev overlay
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).webmcp = mockContext
    }
  }

  // 4. Return cleanup.
  return () => {
    clearWebMcpContext()
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).webmcp
    }
    if (import.meta.env.DEV) {
      console.info('[WebMCP] Context bridge cleared.')
    }
  }
}
