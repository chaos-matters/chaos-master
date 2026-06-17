/**
 * Export resolution + aspect-ratio model, shared by the image and animation
 * export paths. The user picks a longest-edge resolution (1K/2K/4K) and an
 * aspect ratio; we resolve those to an exact pixel {width, height} that the
 * main canvas renders at during export (see MainWorkspace exportDimensions).
 */

export const EXPORT_RESOLUTIONS = [
  { value: 1024, label: '1K' },
  { value: 2048, label: '2K' },
  { value: 4096, label: '4K' },
] as const

export const DEFAULT_EXPORT_RESOLUTION = 2048

export type ExportAspectKey = 'auto' | '1:1' | '16:9' | '9:16' | '4:3'

export const EXPORT_ASPECTS: {
  key: ExportAspectKey
  label: string
  /** Width / height. `null` means "match the current viewport aspect". */
  ratio: number | null
}[] = [
  { key: 'auto', label: 'Auto', ratio: null },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
  { key: '9:16', label: '9:16', ratio: 9 / 16 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
]

export const DEFAULT_EXPORT_ASPECT: ExportAspectKey = 'auto'

export type ExportDimensions = { width: number; height: number }

/** Round to the nearest even integer (>= 2). Video encoders require even
 *  dimensions, and even sizes keep the image path consistent with animation. */
function toEven(n: number): number {
  const r = Math.max(2, Math.round(n))
  return r % 2 === 0 ? r : r + 1
}

/** Resolve an aspect key to a concrete width/height ratio. */
export function resolveAspectRatio(
  aspect: ExportAspectKey,
  viewportAspect: number,
): number {
  if (aspect === 'auto') {
    return isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 1
  }
  return EXPORT_ASPECTS.find((a) => a.key === aspect)?.ratio ?? 1
}

/**
 * Resolve a longest-edge resolution + aspect to exact, even pixel dimensions.
 * The chosen resolution applies to the longer edge: a 16:9 2K export is
 * 2048 x 1152, a 9:16 2K export is 1152 x 2048.
 */
export function computeExportDimensions(
  longEdge: number,
  aspect: ExportAspectKey,
  viewportAspect: number,
): ExportDimensions {
  const ratio = resolveAspectRatio(aspect, viewportAspect)
  if (ratio >= 1) {
    return { width: toEven(longEdge), height: toEven(longEdge / ratio) }
  }
  return { width: toEven(longEdge * ratio), height: toEven(longEdge) }
}
