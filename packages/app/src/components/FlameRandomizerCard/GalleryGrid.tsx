import { createSignal, For } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import ui from './GalleryGrid.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

/**
 * Responsive grid of flame previews with a subtle top-right Apply / Mutate
 * action chip (revealed on hover/focus, or tap on touch). Shared by the sidebar
 * gallery and the advanced gallery modal. Cells reuse the off-screen,
 * intersection-gated {@link VariationPreview}, wrapped in a single
 * {@link ComputeGate} so concurrent WebGPU renders stay throttled even with many
 * cells (they fill in as you scroll).
 */
export function GalleryGrid(props: {
  candidates: FlameDescriptor[]
  /** Bump to force previews to discard their cached image and re-render. */
  version: number
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  onMutate: (flame: FlameDescriptor) => void
  /** Min cell width for the responsive grid (default 96px). */
  minCellWidth?: string
  /** When set, the grid scrolls vertically beyond this height. */
  maxHeight?: string
  /** CSS brightness multiplier applied to every preview (inspection aid). */
  brightness?: number
}) {
  // Which cell's chip is revealed by tap. Hover/focus handles desktop via CSS;
  // touch has no hover, so tapping a cell reveals its Apply/Mutate buttons.
  const [activeIndex, setActiveIndex] = createSignal(-1)

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div
        class={ui.grid}
        classList={{ [ui.scroll!]: props.maxHeight !== undefined }}
        style={{
          '--cell-min': props.minCellWidth ?? '96px',
          ...(props.maxHeight !== undefined
            ? { 'max-height': props.maxHeight }
            : {}),
          ...(props.brightness !== undefined && props.brightness !== 1
            ? { filter: `brightness(${props.brightness})` }
            : {}),
        }}
      >
        <For each={props.candidates}>
          {(candidate, i) => (
            <div
              class={ui.cell}
              classList={{ [ui.cellActive!]: activeIndex() === i() }}
              onClick={() => setActiveIndex(i())}
            >
              <VariationPreview
                version={props.version}
                isSelected={false}
                flame={candidate}
                name={`gallery-${i()}`}
                hardwareTier={props.hardwareTier ?? null}
              />
              <div class={ui.actions}>
                <button
                  type="button"
                  class={ui.iconBtn}
                  title="Apply this flame"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onApply(candidate)
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
                <button
                  type="button"
                  class={ui.iconBtn}
                  title="Mutate: breed variations of this flame"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onMutate(candidate)
                  }}
                >
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <rect
                      x="1.5"
                      y="1.5"
                      width="13"
                      height="13"
                      rx="3"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                    />
                    <circle cx="5.2" cy="5.2" r="1.4" />
                    <circle cx="10.8" cy="10.8" r="1.4" />
                    <circle cx="10.8" cy="5.2" r="1.4" />
                    <circle cx="5.2" cy="10.8" r="1.4" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </ComputeGate>
  )
}
