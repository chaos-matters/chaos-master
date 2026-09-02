export type WebMcpAvailability = 'detected' | 'mock' | 'none'

/**
 * What the status pill shows.
 *
 * `document.modelContext` is the current spec surface and
 * `navigator.modelContext` the deprecated fallback (see webmcp/types.ts). The
 * dev mock is installed on `window.webmcp` by `registerWebMcp` when the
 * browser has neither, which is how Playwright and the console drive tools.
 */
export function detectWebMcp(win: Window = window): WebMcpAvailability {
  const doc = win.document as unknown as { modelContext?: unknown }
  const nav = win.navigator as unknown as { modelContext?: unknown }
  if (doc.modelContext ?? nav.modelContext) return 'detected'
  if ((win as unknown as { webmcp?: unknown }).webmcp) return 'mock'
  return 'none'
}
