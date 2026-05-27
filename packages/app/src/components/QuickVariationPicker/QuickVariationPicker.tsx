import { createEffect, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { variationTypes } from '@/flame/variations'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { VariationPreview, variationPreviewFlames, } from '../VariationSelector/VariationSelector'
import ui from './QuickVariationPicker.module.css'
import type { TransformVariationType } from '@/flame/variations'

/* ---- Icons ---- */

function ListIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    >
      <line x1="3" y1="4" x2="13" y2="4" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="12" x2="13" y2="12" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    >
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  )
}

/* ---- Fuzzy scoring ---- */

/**
 * Very small fuzzy scorer. Returns a score >= 0 (higher = better).
 * Returns -1 when there is no match at all.
 */
function fuzzyScore(needle: string, haystack: string): number {
  if (needle === '') return 0
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (h.startsWith(n)) return 100
  if (h.includes(n)) return 80
  // subsequence match
  let hi = 0
  let ni = 0
  let score = 60
  while (ni < n.length && hi < h.length) {
    if (h[hi] === n[ni]) {
      ni++
      score -= hi // penalise gaps
    }
    hi++
  }
  return ni === n.length ? Math.max(1, score) : -1
}

function filterVariations(
  all: typeof variationTypes,
  query: string,
): typeof variationTypes {
  if (!query.trim()) return all
  return all
    .map((t) => ({
      t,
      score: fuzzyScore(query, getNormalizedVariationName(t)),
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t)
}

/* ---- Types ---- */

export type QuickPickerMode = 'list' | 'gallery'

export type QuickVariationPickerProps = {
  currentType: TransformVariationType
  onSelect: (type: TransformVariationType) => void
  onClose: () => void
  onHoverType?: (type: TransformVariationType) => void
  onHoverClear?: () => void
  mode: QuickPickerMode
  onModeChange: (mode: QuickPickerMode) => void
}

/* ---- Component ---- */

export function QuickVariationPicker(props: QuickVariationPickerProps) {
  const [query, setQuery] = createSignal('')
  let inputRef: HTMLInputElement | undefined

  const filtered = () => filterVariations(variationTypes, query())

  onMount(() => {
    // auto-focus the search in list mode; small delay so the slide animation
    // doesn't conflict with focus ring paint
    const tid = setTimeout(() => {
      if (props.mode === 'list') {
        inputRef?.focus()
      }
    }, 60)
    onCleanup(() => {
      clearTimeout(tid)
    })
  })

  // Re-focus when switching to list mode
  createEffect(() => {
    if (props.mode === 'list') {
      setTimeout(() => inputRef?.focus(), 60)
    }
  })

  createEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (query()) {
          setQuery('')
        } else {
          props.onClose()
        }
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    onCleanup(() => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    })
  })

  return (
    <div class={ui.panel}>
      {/* Header */}
      <div class={ui.header}>
        <span class={ui.headerTitle}>Select Variation</span>
        <button
          class={ui.headerBtn}
          classList={{ [ui.headerBtnActive!]: props.mode === 'list' }}
          title="List mode"
          onClick={() => {
            props.onModeChange('list')
          }}
        >
          <ListIcon />
        </button>
        <button
          class={ui.headerBtn}
          classList={{ [ui.headerBtnActive!]: props.mode === 'gallery' }}
          title="Preview gallery mode"
          onClick={() => {
            props.onModeChange('gallery')
          }}
        >
          <GridIcon />
        </button>
        <button
          class={ui.headerBtn}
          title="Close (Esc)"
          onClick={props.onClose}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Mode A: list */}
      <Show when={props.mode === 'list'}>
        <div class={ui.searchWrap}>
          <input
            ref={inputRef}
            class={ui.searchInput}
            type="search"
            placeholder="Search variations..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            autocomplete="off"
            spellcheck={false}
          />
        </div>
        <Show when={query() && filtered().length > 0}>
          <div class={ui.searchCount}>
            {filtered().length} / {variationTypes.length}
          </div>
        </Show>
        <div
          class={ui.pillList}
          tabIndex={-1}
          onContextMenu={(e) => {
            e.preventDefault()
          }}
        >
          <Show
            when={filtered().length > 0}
            fallback={
              <div class={ui.noResults}>No variations match "{query()}"</div>
            }
          >
            <For each={filtered()}>
              {(type) => {
                let longPressTimer: ReturnType<typeof setTimeout> | undefined
                let didLongPress = false

                function onTouchStart(_e: TouchEvent) {
                  didLongPress = false
                  longPressTimer = setTimeout(() => {
                    didLongPress = true
                    props.onHoverType?.(type)
                  }, 300)
                }

                function onTouchEnd(e: TouchEvent) {
                  clearTimeout(longPressTimer)
                  if (didLongPress) {
                    // Was a long press (preview) -- just clear preview, don't select
                    e.preventDefault()
                    props.onHoverClear?.()
                  }
                  // Short tap falls through to onClick
                }

                function onTouchCancel() {
                  clearTimeout(longPressTimer)
                  if (didLongPress) {
                    props.onHoverClear?.()
                  }
                }

                return (
                  <button
                    class={ui.pill}
                    classList={{ [ui.pillActive!]: type === props.currentType }}
                    title={getNormalizedVariationName(type)}
                    onMouseEnter={() => props.onHoverType?.(type)}
                    onMouseLeave={() => props.onHoverClear?.()}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchCancel}
                    onClick={() => {
                      if (didLongPress) {
                        didLongPress = false
                        return
                      }
                      props.onHoverClear?.()
                      props.onSelect(type)
                      props.onClose()
                    }}
                  >
                    {getNormalizedVariationName(type)}
                  </button>
                )
              }}
            </For>
          </Show>
        </div>
      </Show>

      {/* Mode B: compact GPU gallery */}
      <Show when={props.mode === 'gallery'}>
        <div class={ui.galleryList}>
          {(() => {
            const previewFlames = variationPreviewFlames(
              'pointInitGaussianDisk',
            )
            return (
              <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
                <For each={variationTypes}>
                  {(type, i) => {
                    const flame = () => previewFlames[type]
                    return (
                      <button
                        class={ui.galleryItem}
                        classList={{
                          [ui.galleryItemActive!]: type === props.currentType,
                        }}
                        title={getNormalizedVariationName(type)}
                        onMouseEnter={() => props.onHoverType?.(type)}
                        onMouseLeave={() => props.onHoverClear?.()}
                        onClick={() => {
                          props.onHoverClear?.()
                          props.onSelect(type)
                          props.onClose()
                        }}
                      >
                        <Show when={flame()} keyed>
                          {(f) => (
                            <DelayedShow delayMs={i() * 30}>
                              <div class={ui.galleryCanvas}>
                                <VariationPreview
                                  version={1}
                                  isSelected={type === props.currentType}
                                  name={type}
                                  flame={f}
                                />
                              </div>
                            </DelayedShow>
                          )}
                        </Show>
                        <div class={ui.galleryItemName}>
                          {getNormalizedVariationName(type)}
                        </div>
                      </button>
                    )
                  }}
                </For>
              </ComputeGate>
            )
          })()}
        </div>
      </Show>
    </div>
  )
}
