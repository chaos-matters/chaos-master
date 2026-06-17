/**
 * GPU renderer name for browsers that return empty WebGPU `adapter.info` fields
 * — notably Firefox, which gates vendor/architecture/description for privacy,
 * leaving the device panels blank.
 *
 * Prefers the plain WebGL `RENDERER` string: modern Firefox and Chrome expose
 * the real GPU there, and Firefox has DEPRECATED `WEBGL_debug_renderer_info`
 * (touching that extension logs a console warning and it will be removed). We
 * only fall back to the older unmasked extension when `RENDERER` is missing or
 * a generic placeholder (older Chrome masks `RENDERER` and needs the
 * extension). The string may still be masked/generic depending on the browser's
 * privacy settings, but is usually the real GPU. Best-effort: returns undefined
 * if WebGL or the value is unavailable.
 */
export function getWebglRenderer(): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return undefined

    let renderer = (gl.getParameter(gl.RENDERER) as string | null) ?? undefined
    if (!renderer || isGenericRenderer(renderer)) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as
          | string
          | null
        if (unmasked) renderer = unmasked
      }
    }

    // No explicit loseContext(): for this single throwaway 1x1 context GC is
    // fine, and force-losing it just logs "WebGL context was lost." noise.
    return renderer || undefined
  } catch {
    return undefined
  }
}

/** Masked/placeholder RENDERER values that warrant the unmasked fallback. */
function isGenericRenderer(name: string): boolean {
  const n = name.trim().toLowerCase()
  return (
    n === '' ||
    n === 'webgl' ||
    n === 'webkit webgl' ||
    n === 'mozilla' ||
    n === 'generic renderer'
  )
}
