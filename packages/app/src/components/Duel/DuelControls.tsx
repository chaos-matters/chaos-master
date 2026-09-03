import { executeCommand } from '@/commands/registry'
import { Focus, Lineage, Redo, Shuffle, Undo } from '@/icons'
import ui from './DuelStage.module.css'
import type { CommandContext } from '@/commands/types'

/**
 * The viewer's controls during a duel.
 *
 * Deliberately not the sidebar: two canvases plus the full editor is cramped
 * and slow to read, and a duel rewards a few high-impact moves over parameter
 * nudging. Every button is an existing registered command, so the strip adds
 * no new surface for the recorder or the guard to learn.
 *
 * `onCommand` exists so a test can watch the dispatch without a store; the
 * real dispatch always happens.
 */
const CONTROLS: { id: string; label: string; icon: typeof Shuffle }[] = [
  { id: 'flame.randomize', label: 'Randomize', icon: Shuffle },
  { id: 'flame.mutate', label: 'Mutate', icon: Lineage },
  { id: 'camera.center', label: 'Centre the camera', icon: Focus },
  { id: 'history.undo', label: 'Undo', icon: Undo },
  { id: 'history.redo', label: 'Redo', icon: Redo },
]

export function DuelControls(props: {
  ctx: CommandContext
  onCommand?: (id: string) => void
}) {
  return (
    <div class={ui.controls} role="toolbar" aria-label="Your duel controls">
      {CONTROLS.map((control) => (
        <button
          type="button"
          class={ui.control}
          aria-label={control.label}
          title={control.label}
          onClick={() => {
            executeCommand(control.id, props.ctx)
            props.onCommand?.(control.id)
          }}
        >
          <control.icon aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
