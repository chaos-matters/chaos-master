/**
 * In-memory mock of the WebMCP ModelContext interface.
 *
 * Used by:
 * - Vitest tests: verify tool registration, schemas, execution, errors
 * - Dev overlay: interactive tool invocation during development
 */

import type { ModelContext, WebMcpTool } from './types'

export class MockModelContext implements ModelContext {
  readonly tools = new Map<string, WebMcpTool>()

  registerTool(tool: WebMcpTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[MockModelContext] Duplicate tool name: "${tool.name}"`)
    }
    this.tools.set(tool.name, tool)
  }

  /** Execute a registered tool by name. Throws if the tool is not found. */
  async executeTool(name: string, input: unknown): Promise<unknown> {
    await Promise.resolve()
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered`)
    }
    const controller = new AbortController()
    return await tool.execute(input, { signal: controller.signal })
  }

  /** All registered tool names, in registration order. */
  getToolNames(): string[] {
    return [...this.tools.keys()]
  }

  /** Get the JSON Schema for a tool's input, or undefined if not found. */
  getToolSchema(name: string): Record<string, unknown> | undefined {
    return this.tools.get(name)?.inputSchema
  }

  /** Get the full tool definition, or undefined if not found. */
  getTool(name: string): WebMcpTool | undefined {
    return this.tools.get(name)
  }

  /** Clear all registered tools (useful between test cases). */
  clear(): void {
    this.tools.clear()
  }
}
