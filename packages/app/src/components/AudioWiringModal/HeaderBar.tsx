import { Show } from 'solid-js'
import type { AudioMappingEntry } from '../../utils/audioAnalysis'
import styles from './AudioWiringModal.module.css'

export function HeaderBar(props: {
  presets: Record<string, AudioMappingEntry[]>
  activePreset: string | null
  canUndo: boolean
  canRedo: boolean
  totalConnections: number
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
            onClick={() => props.onSelectPreset(name)}
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
        <button type="button" class={styles.undoBtn} onClick={props.onUndo}>
          ↩
        </button>
      </Show>
      <Show when={props.canRedo}>
        <button type="button" class={styles.undoBtn} onClick={props.onRedo}>
          ↪
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
        onClick={props.onExportJSON}
        title="Copy wiring to clipboard as JSON"
      >
        Export
      </button>
      <button
        type="button"
        class={styles.undoBtn}
        onClick={props.onImportJSON}
        title="Paste wiring JSON from clipboard"
      >
        Import
      </button>
      <div class={styles.headerSpacer} />
      <button type="button" class={styles.closeBtn} onClick={props.onClose}>
        ×
      </button>
    </div>
  )
}
