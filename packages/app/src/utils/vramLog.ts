import { DEBUG_VRAM } from '@/defaults'

export function vramLog(...args: unknown[]) {
  if (DEBUG_VRAM) {
    console.info('[VRAM]', ...args)
  }
}
