import { createSignal, Show } from 'solid-js'
import { ColourWedge, ShapeTriangle, VariationSpiral } from '@/icons'
import { TouchControlSurface } from './TouchControlSurface'
import ui from './TouchSurface.module.css'
import type { MobileBottomSurfaceProps, TouchTab } from './types'

export function MobileBottomSurface(props: MobileBottomSurfaceProps) {
  const [expanded, setExpanded] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<TouchTab>('variations')

  const openTab = (tab: TouchTab) => {
    setActiveTab(tab)
    setExpanded(true)
  }

  return (
    <div class={ui.bottomSheet} role="region" aria-label="Mobile Controls">
      {/* 1. Collapsed Pill State - single clean row */}
      <Show when={!expanded()}>
        <div class={ui.collapsedPillBar}>
          <button
            type="button"
            class={ui.tabChip}
            onClick={() => {
              openTab('variations')
            }}
            aria-label="Open Variations"
          >
            <VariationSpiral class={ui.tabIcon} />
            Variations
          </button>
          <button
            type="button"
            class={ui.tabChip}
            onClick={() => {
              openTab('shape')
            }}
            aria-label="Open Shape Controls"
          >
            <ShapeTriangle class={ui.tabIcon} />
            Shape
          </button>
          <button
            type="button"
            class={ui.tabChip}
            onClick={() => {
              openTab('colour')
            }}
            aria-label="Open Colour Controls"
          >
            <ColourWedge class={ui.tabIcon} />
            Colour
          </button>
        </div>
      </Show>

      {/* 2. Expanded Bottom Sheet State */}
      <Show when={expanded()}>
        <div class={ui.expandedSheet}>
          <div
            class={ui.sheetHandleRow}
            onClick={() => setExpanded(false)}
            title="Collapse Controls"
          >
            <div class={ui.sheetHandle} />
          </div>

          <TouchControlSurface
            ctx={props.ctx}
            flame={props.flame}
            mode="bottom-sheet"
            initialTab={activeTab()}
            onOpenDrawer={props.onOpenDrawer}
            onRandomize={props.onRandomize}
            onMutate={props.onMutate}
            onUndo={props.onUndo}
            onRedo={props.onRedo}
            canUndo={props.canUndo}
            canRedo={props.canRedo}
            onSnapshot={props.onSnapshot}
          />
        </div>
      </Show>
    </div>
  )
}
