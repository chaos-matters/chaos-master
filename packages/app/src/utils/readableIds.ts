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
  let tIdx = 0
  let sIdx = 0
  sortedTids.forEach((tid) => {
    const isSym = tid.startsWith('_sym__')
    const tLabel = isSym ? `S${++sIdx}` : `T${++tIdx}`
    transformLabel[tid] = tLabel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    if (path.startsWith('camera.') || path.startsWith('camera3D.')) return path

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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
