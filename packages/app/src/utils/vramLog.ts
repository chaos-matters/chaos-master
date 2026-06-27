import { DEBUG_VRAM } from '@/defaults'

export function vramLog(...args: unknown[]) {
  if (DEBUG_VRAM) {
    console.info('[VRAM]', ...args)
  }
}

// Running VRAM ledger (gated on VITE_DEBUG_VRAM). Call with a positive delta on
// allocation and the matching negative delta on free. The monotonic `total`
// climbing without ever dropping while scrolling the gallery is the single most
// diagnostic signal of the mount-accumulation / buffer leak.
let _vramTotalBytes = 0

export function vramTrack(label: string, deltaBytes: number) {
  if (!DEBUG_VRAM) {
    return
  }
  _vramTotalBytes += deltaBytes
  const mib = (n: number) => (n / 1048576).toFixed(2)
  const sign = deltaBytes >= 0 ? '+' : ''
  console.info(
    '[VRAM]',
    `${sign}${mib(deltaBytes)}MiB`,
    label,
    '| total',
    `${mib(_vramTotalBytes)}MiB`,
  )
}
