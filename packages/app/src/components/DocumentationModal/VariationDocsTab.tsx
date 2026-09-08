import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { categoryOf, defaultLinearType, variationTypesFor, } from '@/flame/variationRegistry'
import { CATEGORIES, CATEGORY_LABELS, sortByCategory, } from '@/flame/variations/categories'
import { hasDoc } from '@/flame/variations/docs'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { Info } from '@/icons'
import { Root } from '@/lib/Root'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { VariationPreview, variationPreviewFlames, } from '../VariationSelector/VariationSelector'
import ui from './DocumentationModal.module.css'
import { SelectedVariationPanel } from './SelectedVariationPanel'
import type { AnyVariationType, Dims } from '@/flame/variationRegistry'
import type { VariationCategory } from '@/flame/variations/categories'
import type { HardwareTier } from '@/utils/hardwareTier'

/** Small fuzzy scorer (mirrors QuickVariationPicker); higher is better, -1 = no match. */
function fuzzyScore(needle: string, haystack: string): number {
  if (needle === '') return 0
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()
  if (h.startsWith(n)) return 100
  if (h.includes(n)) return 80
  let hi = 0
  let ni = 0
  let score = 60
  while (ni < n.length && hi < h.length) {
    if (h[hi] === n[ni]) {
      ni++
      score -= hi
    }
    hi++
  }
  return ni === n.length ? Math.max(1, score) : -1
}

// Resolution per cell scaled by hardware tier so high/ultra tiers render
// smooth, continuous-density previews instead of sparse dots. 16:11 matches .galleryCanvas.
const PREVIEW_RESOLUTION_BY_TIER: Record<
  HardwareTier,
  { width: number; height: number }
> = {
  low: { width: 192, height: 132 },
  mid: { width: 256, height: 176 },
  high: { width: 320, height: 220 },
  ultra: { width: 384, height: 264 },
}

export function VariationDocsTab(props: {
  hardwareTier: () => HardwareTier | null
}) {
  const [dims, setDims] = createSignal<Dims>(2)
  const [query, setQuery] = createSignal('')
  const [categoryFilter, setCategoryFilter] =
    createSignal<VariationCategory | null>(null)
  const [selected, setSelected] = createSignal<AnyVariationType>(
    defaultLinearType(2),
  )

  // When the dimension flips, reset to a documented variation in that registry
  // (or its default linear) and clear the category filter.
  createEffect(() => {
    const types = variationTypesFor(dims()) as readonly AnyVariationType[]
    const firstDocumented = types.find((t) => hasDoc(t))
    setSelected(firstDocumented ?? defaultLinearType(dims()))
    setCategoryFilter(null)
  })

  const allTypes = () =>
    variationTypesFor(dims()) as readonly AnyVariationType[]

  const filtered = () => {
    const q = query().trim()
    if (!q) return [...allTypes()]
    return allTypes()
      .map((t) => ({ t, score: fuzzyScore(q, getNormalizedVariationName(t)) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.t)
  }

  const grouped = () => {
    const sel = categoryFilter()
    const groups = new Map<VariationCategory, AnyVariationType[]>()
    for (const type of filtered()) {
      const cat = categoryOf(dims(), type)
      if (!cat) continue
      if (sel && cat !== sel) continue
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(type)
    }
    return [...groups.entries()]
      .sort(([a], [b]) => sortByCategory(a, b))
      .map(([category, types]) => ({
        category,
        label: CATEGORY_LABELS[category],
        types,
      }))
  }

  const activeCategories = () => {
    const cats = new Set<VariationCategory>()
    for (const t of filtered()) {
      const c = categoryOf(dims(), t)
      if (c) cats.add(c)
    }
    return CATEGORIES.filter((c) => cats.has(c))
  }

  // Stable 0..N-1 index over the current set so the staggered reveal is bounded.
  const galleryIndexOf = createMemo(() => {
    const map = new Map<string, number>()
    let i = 0
    for (const group of grouped()) {
      for (const type of group.types) {
        map.set(type, i)
        i += 1
      }
    }
    return map
  })

  const previewFlames = createMemo(() =>
    variationPreviewFlames('pointInitGaussianDisk', dims()),
  )

  const previewTier = createMemo<HardwareTier>(
    () => props.hardwareTier() ?? 'high',
  )
  const previewResolution = createMemo(
    () => PREVIEW_RESOLUTION_BY_TIER[previewTier()],
  )

  return (
    <div class={ui.docsLayout}>
      <div class={ui.galleryPane}>
        <div class={ui.searchRow}>
          <div class={ui.searchWrap}>
            <svg
              class={ui.searchIcon}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              class={ui.searchInput}
              type="search"
              placeholder="Search variations…"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              autocomplete="off"
              spellcheck={false}
            />
          </div>
          <div class={ui.dimsToggle}>
            <button
              class={ui.dimBtn}
              classList={{ [ui.dimBtnActive!]: dims() === 2 }}
              onClick={() => setDims(2)}
            >
              2D
            </button>
            <button
              class={ui.dimBtn}
              classList={{ [ui.dimBtnActive!]: dims() === 3 }}
              onClick={() => setDims(3)}
            >
              3D
            </button>
          </div>
        </div>

        <Show when={activeCategories().length > 1}>
          <div class={ui.categoryRow}>
            <button
              class={ui.categoryPill}
              classList={{
                [ui.categoryPillActive!]: categoryFilter() === null,
              }}
              onClick={() => setCategoryFilter(null)}
            >
              All
            </button>
            <For each={activeCategories()}>
              {(cat) => (
                <button
                  class={ui.categoryPill}
                  classList={{
                    [ui.categoryPillActive!]: categoryFilter() === cat,
                  }}
                  onClick={() =>
                    setCategoryFilter(categoryFilter() === cat ? null : cat)
                  }
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class={ui.galleryScroll}>
          {/* The modal is Portal'd outside the app's <Root>, so the preview
              AutoCanvases can't see the app's RootContext — provide a fresh
              Root here (same pattern as RandomizerGalleryModal). */}
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <Show
              when={filtered().length > 0}
              fallback={
                <div class={ui.emptyNoticeCard}>
                  <div class={ui.emptyNoticeIcon}>
                    <Info width="16" height="16" />
                  </div>
                  <div class={ui.emptyNoticeContent}>
                    <div class={ui.emptyNoticeTitle}>
                      No Matching Variations
                    </div>
                    <div class={ui.emptyNoticeText}>
                      No variations match &ldquo;{query()}&rdquo;.
                    </div>
                  </div>
                </div>
              }
            >
              <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
                <For each={grouped()}>
                  {(group) => (
                    <>
                      <div class={ui.sectionHeader}>
                        <span class={ui.sectionLabel}>{group.label}</span>
                        <span class={ui.sectionCount}>
                          {group.types.length}
                        </span>
                        <span class={ui.sectionLine} />
                      </div>
                      <div class={ui.galleryGrid}>
                        <For each={group.types}>
                          {(type) => {
                            const flame = () => previewFlames()[type]
                            const idx = galleryIndexOf().get(type) ?? 0
                            return (
                              <button
                                class={ui.galleryItem}
                                classList={{
                                  [ui.galleryItemActive!]: type === selected(),
                                }}
                                title={getNormalizedVariationName(type)}
                                onClick={() => setSelected(type)}
                              >
                                <Show when={flame()} keyed>
                                  {(f) => (
                                    <DelayedShow delayMs={idx * 25}>
                                      <div class={ui.galleryCanvas}>
                                        <VariationPreview
                                          version={1}
                                          isSelected={type === selected()}
                                          name={type}
                                          flame={f}
                                          hardwareTier={previewTier()}
                                          resolution={previewResolution()}
                                        />
                                      </div>
                                    </DelayedShow>
                                  )}
                                </Show>
                                <Show when={hasDoc(type)}>
                                  <span
                                    class={ui.docDot}
                                    title="Documented formula"
                                  />
                                </Show>
                                <span class={ui.galleryItemName}>
                                  {getNormalizedVariationName(type)}
                                </span>
                              </button>
                            )
                          }}
                        </For>
                      </div>
                    </>
                  )}
                </For>
              </ComputeGate>
            </Show>
          </Root>
        </div>
      </div>

      <div class={ui.detailPane}>
        <SelectedVariationPanel type={selected()} dims={dims()} />
      </div>
    </div>
  )
}
