import { createSignal, Show } from 'solid-js'
import ui from './AnimationGenerator.module.css'
import { buildPresets, randomizeColorsParams, randomizeParams } from './presets'
import type { PresetDef } from './presets'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineState } from '@/utils/timeline'

/* ──── AnimationControls (inline buttons for header) ──── */

type AnimationControlsProps = {
  flameDescriptor: FlameDescriptor
  timeline: TimelineState
  presetsExpanded: boolean
  onTogglePresets: () => void
}

export function AnimationControls(props: AnimationControlsProps) {
  const [subtleMode, setSubtleMode] = createSignal(false)

  return (
    <span class={ui.controlsRow}>
      <button
        class={ui.genBtn}
        onClick={() => {
          randomizeParams(props.flameDescriptor, props.timeline, subtleMode())
        }}
        title="Generate random keyframes from current flame parameters"
      >
        Gen
      </button>
      <button
        class={ui.genBtn}
        onClick={() => {
          randomizeColorsParams(
            props.flameDescriptor,
            props.timeline,
            subtleMode(),
          )
        }}
        title="Generate random color keyframes for transforms and palette"
      >
        Colors
      </button>
      <button
        class={ui.genBtn}
        onClick={() => {
          props.timeline.clearAllTracks()
        }}
        title="Clear all keyframes (undoable)"
      >
        Clear
      </button>
      <button
        class={ui.genBtn}
        classList={{ [ui.active as string]: subtleMode() }}
        onClick={() => setSubtleMode(!subtleMode())}
        title={
          subtleMode()
            ? 'Subtle mode on — values stay close to originals'
            : 'Subtle mode off — full randomization'
        }
      >
        Subtle
      </button>
      <button
        class={ui.presetsToggle}
        classList={{
          [ui.presetsToggleActive as string]: props.presetsExpanded,
        }}
        onClick={props.onTogglePresets}
        title="Animation presets"
      >
        Presets
      </button>
    </span>
  )
}

/* ──── AnimationGenerator (presets panel) ──── */

type AnimationGeneratorProps = {
  flameDescriptor: FlameDescriptor
  timeline: TimelineState
  expanded: boolean
}

export function AnimationGenerator(props: AnimationGeneratorProps) {
  const presets: PresetDef[] = buildPresets()

  return (
    <Show when={props.expanded}>
      <div class={ui.wrapper}>
        <div class={ui.presetsPanel}>
          {presets.map((preset) => (
            <button
              class={ui.pill}
              onClick={() => {
                preset.apply(props.flameDescriptor, props.timeline)
              }}
              title={preset.label}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </Show>
  )
}
