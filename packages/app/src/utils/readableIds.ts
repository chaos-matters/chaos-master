import type { TransformRecord } from '@/flame/schema/flameSchema'

interface ReadableIds {
  transformLabel: Record<string, string>
  variationLabel: Record<string, string>
  formatTrackPath: (path: string) => string
}

export function buildReadableIds(transforms: TransformRecord): ReadableIds {
  const transformLabel: Record<string, string> = {}
  const variationLabel: Record<string, string> = {}

  const sortedTids = Object.keys(transforms).sort()
  sortedTids.forEach((tid, i) => {
    const tLabel = `T${i + 1}`
    transformLabel[tid] = tLabel
    const variations = (transforms as Record<string, any>)[tid]?.variations
    if (variations) {
      const sortedVids = Object.keys(variations).sort()
      sortedVids.forEach((vid, j) => {
        variationLabel[vid] = `${tLabel}-V${j + 1}`
      })
    }
  })

  function formatTrackPath(path: string): string {
    // Render settings paths — keep as-is
    if (
      [
        'exposure',
        'skipIters',
        'vibrancy',
        'drawMode',
        'colorInitMode',
        'pointInitMode',
        'palettePhase',
        'paletteSpeed',
        'backgroundColor',
        'edgeFadeColor',
      ].includes(path)
    ) {
      return path
    }
    // Camera paths
    if (path.startsWith('camera.')) return path

    const parts = path.split('.')
    // transform.{tid}.{prop}
    if (parts[0] === 'transform') {
      const tLabel = transformLabel[parts[1]!] ?? parts[1]
      if (parts.length === 3) {
        // transform.{tid}.probability
        return `${tLabel} ${parts[2]}`
      }
      if (parts.length === 4) {
        // transform.{tid}.preAffine.{coef} or transform.{tid}.color.{x,y}
        return `${tLabel} ${parts[2]}.${parts[3]}`
      }
      return path
    }
    // {tid}.{vid} — variation weight
    if (parts.length === 2) {
      const vLabel = variationLabel[parts[1]!] ?? parts[1]
      const tLabel = transformLabel[parts[0]!] ?? parts[0]
      return `${vLabel} weight`
    }
    // {tid}.{vid}.{param} — variation param
    if (parts.length === 3) {
      const vLabel = variationLabel[parts[1]!] ?? parts[1]
      return `${vLabel} ${parts[2]}`
    }
    return path
  }

  return { transformLabel, variationLabel, formatTrackPath }
}
