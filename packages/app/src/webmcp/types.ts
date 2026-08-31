/**
 * WebMCP browser API type definitions.
 *
 * The WebMCP spec is still evolving. `document.modelContext` is the current
 * standard; `navigator.modelContext` is deprecated but still checked as a
 * fallback. `provideContext()` was removed from the spec in March 2026.
 *
 * This module imports nothing from the rest of the app — anyone can depend
 * on it without risking import cycles.
 */

// ── Browser API surface ─────────────────────────────────────────────────────

export interface ModelContext {
  registerTool(tool: WebMcpTool): void
}

export interface WebMcpTool {
  name: string
  /** Tool description for the LLM. Must be <= 500 characters. */
  description: string
  /** JSON Schema describing the tool's input. */
  inputSchema: Record<string, unknown>
  /** Execute the tool. Return any JSON-serializable value. */
  execute: (
    input: unknown,
    context: { signal?: AbortSignal },
  ) => Promise<unknown> | unknown
  annotations?: {
    /** True when the tool only reads state and never mutates it. */
    readOnlyHint?: boolean
  }
}

// ── Feature detection ───────────────────────────────────────────────────────

/**
 * Resolve the WebMCP ModelContext from the browser environment.
 *
 * Returns `undefined` when running outside a WebMCP-capable browser
 * (standard dev, tests, non-ChatGPT Chrome without the flag, etc.).
 */
export function getModelContext(): ModelContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = document as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any
  return (
    (doc.modelContext as ModelContext | undefined) ??
    (nav.modelContext as ModelContext | undefined)
  )
}
