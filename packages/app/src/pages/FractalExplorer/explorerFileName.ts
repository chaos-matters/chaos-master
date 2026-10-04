/**
 * The name Save PNG gives a deep-zoom picture: what it shows, how far in, and
 * when, so two saves never ask to overwrite each other.
 */
import { formatMagnification } from '@chaos-master/core'
import type { ExplorerLocation } from '@chaos-master/core'

function twoDigits(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * `mandelbrot-x1_10e12-1004-122045.png`: the set (both, for the split view),
 * the magnification, then month, day and local time to the second. The year
 * is left out, and a second keeps a save after a quick colour tweak apart
 * from the one before it.
 */
export function explorerFileName(location: ExplorerLocation, at: Date): string {
  const name = location.split ? 'mandelbrot-julia' : location.kind
  const zoom = formatMagnification(location.view.zoomLog2).replace('.', '_')
  const date = `${twoDigits(at.getMonth() + 1)}${twoDigits(at.getDate())}`
  const time = [at.getHours(), at.getMinutes(), at.getSeconds()]
    .map(twoDigits)
    .join('')
  return `${name}-x${zoom}-${date}-${time}.png`
}
