import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { PREVIEW_RESOLUTION_BY_TIER } from '@/utils/hardwareTier'
import ui from './GalleryGrid.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

// Reveal cells a few at a time rather than mounting a wall of black placeholders
// (the actual render is still throttled by the ComputeGate below).
const REVEAL_BATCH = 4
const REVEAL_INTERVAL_MS = 100

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
  /** When set, an "inspect" action opens a hi-res preview of the flame. */
  onInspect?: (flame: FlameDescriptor) => void
  /** Min cell width for the responsive grid (default 96px). */
  minCellWidth?: string
  /** When set, the grid scrolls vertically beyond this height. */
  maxHeight?: string
  /** CSS brightness multiplier applied to every preview (inspection aid). */
  brightness?: number
  /**
   * Interaction model:
   * - `true` (sidebar): a single click on a cell applies the flame immediately.
   * - `false`/unset (modal): the first click selects the cell (highlighted
   *   border); clicking the already-selected cell — or pressing Enter — applies.
   */
  applyOnClick?: boolean
  /**
   * For apply-on-click mode: when explicitly `false`, the applied-cell highlight
   * is cleared (another part of the randomizer card became the active selection).
   */
  selectionActive?: boolean
}) {
  // Which cell's chip is revealed by tap. Hover/focus handles desktop via CSS;
  // touch has no hover, so tapping a cell reveals its Apply/Mutate buttons.
  const [activeIndex, setActiveIndex] = createSignal(-1)
  // Selected cell (modal "select then apply" model only). -1 = none.
  const [selectedIndex, setSelectedIndex] = createSignal(-1)

  const handleCellClick = (candidate: FlameDescriptor, index: number) => {
    if (props.applyOnClick) {
      // Mark the applied cell so the user can see which one is active.
      setSelectedIndex(index)
      props.onApply(candidate)
      return
    }
    // Modal: first click selects, a click on the already-selected cell applies.
    if (selectedIndex() === index) {
      props.onApply(candidate)
    } else {
      setSelectedIndex(index)
      setActiveIndex(index)
    }
  }

  // Enter applies the selected cell (modal model). Ignore while typing in the
  // size/brightness inputs.
  createEffect(() => {
    if (props.applyOnClick) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      const candidate = props.candidates[selectedIndex()]
      if (candidate !== undefined) {
        e.preventDefault()
        props.onApply(candidate)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown)
    })
  })

  // Clear the applied-cell highlight when another part of the randomizer card
  // takes over the selection (apply-on-click mode only).
  createEffect(() => {
    if (props.applyOnClick && props.selectionActive === false) {
      setSelectedIndex(-1)
    }
  })

  // Progressive reveal: re-stagger whenever the candidate set or version
  // (re-roll / count change) changes, so previews appear a few at a time.
  const [revealCount, setRevealCount] = createSignal(REVEAL_BATCH)
  createEffect(() => {
    const total = props.candidates.length
    void props.version
    // A fresh page (re-roll / count change / breeding nav) clears the selection.
    setSelectedIndex(-1)
    setRevealCount(Math.min(REVEAL_BATCH, total))
    if (total <= REVEAL_BATCH) return
    const timer = setInterval(() => {
      setRevealCount((c) => {
        const next = Math.min(c + REVEAL_BATCH, total)
        if (next >= total) clearInterval(timer)
        return next
      })
    }, REVEAL_INTERVAL_MS)
    onCleanup(() => {
      clearInterval(timer)
    })
  })
  const visibleCandidates = () => props.candidates.slice(0, revealCount())
  const previewResolution = () =>
    PREVIEW_RESOLUTION_BY_TIER[props.hardwareTier ?? 'mid']
  // Brightness is applied only to the preview image — not the grid — so cell
  // borders and the selected-cell glow aren't brightened along with the flame.
  const brightnessStyle = () =>
    props.brightness !== undefined && props.brightness !== 1
      ? { filter: `brightness(${props.brightness})` }
      : undefined

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
        }}
      >
        <For each={visibleCandidates()}>
          {(candidate, i) => (
            <div
              class={ui.cell}
              classList={{
                [ui.cellActive!]: activeIndex() === i(),
                [ui.cellSelected!]: selectedIndex() === i(),
              }}
              title={
                props.applyOnClick
                  ? selectedIndex() === i()
                    ? 'Applied — click to re-apply'
                    : 'Click to apply this flame'
                  : selectedIndex() === i()
                    ? 'Click again (or press Enter) to apply'
                    : 'Click to select'
              }
              onClick={() => {
                handleCellClick(candidate, i())
              }}
            >
              <div class={ui.previewLayer} style={brightnessStyle()}>
                <VariationPreview
                  version={props.version}
                  isSelected={false}
                  flame={candidate}
                  name={`gallery-${i()}`}
                  hardwareTier={props.hardwareTier ?? null}
                  resolution={previewResolution()}
                />
              </div>
              <div class={ui.actions}>
                {/* In apply-on-click (sidebar) mode the whole cell applies, so
                    the explicit Apply tick is redundant — hide it there. */}
                <Show when={!props.applyOnClick}>
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
                </Show>
                <Show when={props.onInspect}>
                  <button
                    type="button"
                    class={ui.iconBtn}
                    title="Inspect: view this flame at high quality"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onInspect?.(candidate)
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </button>
                </Show>
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
