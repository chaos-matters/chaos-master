/**
 * GPU renderer name via WebGL's UNMASKED_RENDERER_WEBGL. Used as a fallback for
 * browsers that return empty WebGPU `adapter.info` fields — notably Firefox,
 * which gates vendor/architecture/description for privacy, leaving the device
 * panels blank. The WebGL string may be masked/generic depending on the
 * browser's privacy settings, but is usually the real GPU. Best-effort: returns
 * undefined if WebGL or the extension is unavailable.
 */
export function getWebglRenderer(): string | undefined {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return undefined
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string)
    // Release the throwaway context promptly instead of waiting for GC.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return renderer || undefined
  } catch {
    return undefined
  }
}
