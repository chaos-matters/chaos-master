import { Show } from 'solid-js'
import { Copy, Redo, Undo } from '@/icons'
import styles from './AudioWiringModal.module.css'
import type { AudioMappingEntry } from '../../utils/audioAnalysis'

export function HeaderBar(props: {
  presets: Record<string, AudioMappingEntry[]>
  activePreset: string | null
  canUndo: boolean
  canRedo: boolean
  totalConnections: number
  exportCopied: boolean
  onSelectPreset: (name: string) => void
  onUndo: () => void
  onRedo: () => void
  onRandomize: () => void
  onExportJSON: () => void
  onImportJSON: () => void
  onClose: () => void
}) {
  function formatPresetName(name: string): string {
    if (name === 'clear') return 'Clear'
    return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div class={styles.header}>
      <span class={styles.headerTitle}>
        Audio Wiring
        {props.totalConnections > 0 && (
          <span class={styles.headerWireCount}>{props.totalConnections}</span>
        )}
      </span>
      <div class={styles.presetRow}>
        {Object.keys(props.presets).map((name) => (
          <button
            type="button"
            class={styles.presetBtn}
            classList={{
              [styles.presetBtnActive as string]: props.activePreset === name,
            }}
            onClick={() => {
              props.onSelectPreset(name)
            }}
            title={
              name === 'clear'
                ? 'Remove all connections'
                : `${formatPresetName(name)}: ${
                    props.presets[name]
                      ?.map(
                        (e) =>
                          `${e.audioFeature} → ${e.target.kind}.${'param' in e.target ? e.target.param : ''}`,
                      )
                      .join(', ') ?? ''
                  }`
            }
          >
            {formatPresetName(name)}
          </button>
        ))}
      </div>
      <Show when={props.canUndo}>
        <button
          type="button"
          class={styles.undoBtn}
          onClick={props.onUndo}
          title="Undo"
          aria-label="Undo"
        >
          <Undo />
        </button>
      </Show>
      <Show when={props.canRedo}>
        <button
          type="button"
          class={styles.undoBtn}
          onClick={props.onRedo}
          title="Redo"
          aria-label="Redo"
        >
          <Redo />
        </button>
      </Show>
      <button
        type="button"
        class={styles.randomBtn}
        onClick={props.onRandomize}
      >
        Randomize
      </button>
      <button
        type="button"
        class={styles.undoBtn}
        classList={{ [styles.copiedBtn as string]: props.exportCopied }}
        onClick={props.onExportJSON}
        title="Copy the current wiring to the clipboard as JSON"
      >
        <Copy />
        {props.exportCopied ? 'Copied' : 'Copy JSON'}
      </button>
      <button
        type="button"
        class={styles.undoBtn}
        onClick={props.onImportJSON}
        title="Import wiring JSON — from clipboard, pasted text, or a file"
      >
        Import…
      </button>
      <div class={styles.headerSpacer} />
      <button type="button" class={styles.closeBtn} onClick={props.onClose}>
        ×
      </button>
    </div>
  )
}
