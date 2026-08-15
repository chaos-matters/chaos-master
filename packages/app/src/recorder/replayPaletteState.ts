import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type TransformColorSnapshot = Record<string, { x: number; y: number }>

/** Capture the exact transform colours that Palette “Unselect” must restore. */
export function captureTransformColors(
  flame: FlameDescriptor,
): TransformColorSnapshot {
  return Object.fromEntries(
    Object.entries(flame.transforms).map(([id, transform]) => [
      id,
      { x: transform.color.x, y: transform.color.y },
    ]),
  )
}

/**
 * Keep the editor-only palette restore stash coherent with replayed document
 * commands. A loaded flame has no recoverable pre-palette provenance, so an
 * empty stash is the only honest state; the first subsequent palette apply
 * captures that flame's exact colours before the command recolours it.
 */
export function paletteRestoreColorsAfterReplayCommand(
  commandId: string,
  flameBeforeCommand: FlameDescriptor,
  current: TransformColorSnapshot,
): TransformColorSnapshot {
  if (commandId === 'flame.load' || commandId === 'flame.removePalette') {
    return {}
  }
  if (commandId !== 'flame.applyPalette') return current

  return Object.keys(current).length > 0
    ? current
    : captureTransformColors(flameBeforeCommand)
}
