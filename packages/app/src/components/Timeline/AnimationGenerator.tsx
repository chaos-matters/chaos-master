import { createSignal, For, Show } from 'solid-js'
import { Sparkle } from '@/icons'
import ui from './AnimationGenerator.module.css'
import { buildPresets, randomizeColorsParams } from './presets'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineState } from '@/utils/timeline'

/* ──── AnimationControls (inline buttons for header) ──── */

type AnimationControlsProps = {
  flameDescriptor: FlameDescriptor
  timeline: TimelineState
  presetsExpanded: boolean
  onTogglePresets: () => void
  /** Reveals the sidebar's animation generator (Flame Randomizer card). */
  onOpenAnimationGenerator?: () => void
}

export function AnimationControls(props: AnimationControlsProps) {
  return (
    <span class={ui.controlsRow}>
      <button
        class={ui.genBtn}
        onClick={() => props.onOpenAnimationGenerator?.()}
        title="Open the animation generator (randomize or smart-animate this flame)"
      >
        <Sparkle class={ui.genBtnIcon} />
        Animate
      </button>
      <button
        class={ui.genBtn}
        onClick={() => {
          randomizeColorsParams(props.flameDescriptor, props.timeline)
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
  const [filter, setFilter] = createSignal<
    'All' | 'Camera' | 'Render' | 'Color' | 'Affine'
  >('All')

  const presets = () =>
    buildPresets(props.flameDescriptor.renderSettings.dimensions === 3)

  const visiblePresets = () => {
    const activeFilter = filter()
    const allPresets = presets()
    if (activeFilter === 'All') {
      return allPresets
    }
    return allPresets.filter((p) => p.category === activeFilter)
  }

  const categories = ['All', 'Camera', 'Render', 'Color', 'Affine'] as const

  return (
    <Show when={props.expanded}>
      <div class={ui.wrapper}>
        <div class={ui.filterBar}>
          <For each={categories}>
            {(cat) => (
              <button
                class={ui.filterTab}
                classList={{ [ui.activeTab as string]: filter() === cat }}
                onClick={() => setFilter(cat)}
              >
                {cat}
              </button>
            )}
          </For>
        </div>
        <div class={ui.presetsPanel}>
          <For each={visiblePresets()}>
            {(preset) => (
              <button
                class={ui.pill}
                onClick={() => {
                  preset.apply(props.flameDescriptor, props.timeline)
                }}
                title={preset.label}
              >
                {preset.label}
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
