/**
 * In-memory mock of the WebMCP ModelContext interface.
 *
 * Used by:
 * - Vitest tests: verify tool registration, schemas, execution, errors
 * - Dev overlay: interactive tool invocation during development
 */

import type { ModelContext, WebMcpTool } from './types'

function validateInputSchema(
  schema: Record<string, unknown> | undefined,
  args: unknown,
): string[] {
  const errs: string[] = []
  const schemaObj = schema as
    | {
        required?: string[]
        properties?: Record<string, { type?: string }>
      }
    | undefined

  const argsObj = args as Record<string, unknown> | undefined

  for (const key of schemaObj?.required ?? []) {
    if (argsObj?.[key] === undefined) {
      errs.push(`missing required parameter "${key}"`)
    }
  }

  if (argsObj && typeof argsObj === 'object') {
    for (const [key, val] of Object.entries(argsObj)) {
      if (val === undefined) continue
      const expected = schemaObj?.properties?.[key]?.type
      if (!expected) continue
      const actual = Array.isArray(val) ? 'array' : typeof val
      const ok = Array.isArray(expected)
        ? expected.some((t) =>
            t === 'integer' ? Number.isInteger(val) : actual === t,
          )
        : expected === 'integer'
          ? Number.isInteger(val)
          : actual === expected
      if (!ok) {
        errs.push(
          `parameter "${key}" should be ${Array.isArray(expected) ? expected.join(' or ') : expected}, got ${actual}`,
        )
      }
    }
  }

  return errs
}

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

    const validationErrors = validateInputSchema(tool.inputSchema, input)
    if (validationErrors.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Validation error for tool "${name}": ${validationErrors.join('; ')}`,
          },
        ],
        isError: true,
      }
    }

    const controller = new AbortController()
    return await tool.execute(input, { signal: controller.signal })
  }

  /** Alias for executeTool */
  async execute(name: string, input: unknown): Promise<unknown> {
    return await this.executeTool(name, input)
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
