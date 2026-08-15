import { tryValidateTransformColorSnapshot } from './schema'
import type { TransformColorSnapshot } from './schema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'

export type { TransformColorSnapshot } from './schema'

function cloneTransformColors(
  colors: TransformColorSnapshot,
): TransformColorSnapshot {
  return Object.fromEntries(
    Object.entries(colors).map(([id, color]) => [
      id,
      { x: color.x, y: color.y },
    ]),
  )
}

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
  args: readonly unknown[],
  flameBeforeCommand: FlameDescriptor,
  current: TransformColorSnapshot,
): TransformColorSnapshot {
  if (
    commandId === 'flame.load' ||
    commandId === 'recorder.restoreWorkspaceSnapshot'
  ) {
    if (args.length >= 3) {
      return tryValidateTransformColorSnapshot(args[2]) ?? {}
    }
    // Old load actions predate palette provenance. A whole-document load is
    // a hard boundary; the natural colours behind its palette are unknowable.
    // Old timeline workspace snapshots, however, were not document loads and
    // should not discard the viewer's still-valid stash.
    return commandId === 'flame.load' ? {} : current
  }
  if (commandId === 'flame.removePalette') {
    return {}
  }
  if (commandId !== 'flame.applyPalette') return current

  return Object.keys(current).length > 0
    ? current
    : captureTransformColors(flameBeforeCommand)
}

/**
 * Keep the editor-only palette provenance atomic with an ordinary flame
 * history entry. Palette apply/remove and whole-document loads all change
 * what a later Palette “Unselect” is allowed to restore; undo/redo therefore
 * has to move that provenance together with the document patches.
 */
export function runPaletteRestoreTransition(
  history: Pick<ChangeHistory<FlameDescriptor>, 'startPreview' | 'commit'>,
  before: TransformColorSnapshot,
  after: TransformColorSnapshot,
  setColors: (colors: TransformColorSnapshot) => void,
  description: string,
  writeDocument: () => void,
): void {
  const previous = cloneTransformColors(before)
  const next = cloneTransformColors(after)

  history.startPreview(description)
  writeDocument()
  setColors(cloneTransformColors(next))
  history.commit({
    undoEffect: () => {
      setColors(cloneTransformColors(previous))
    },
    redoEffect: () => {
      setColors(cloneTransformColors(next))
    },
  })
}
