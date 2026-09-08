import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { AFFINE_CONTROLS, composeAffine, decomposeAffine, } from '@/arcade/affineControls'
import { SAMPLE_VARIATION_TYPES, SAMPLE_VARIATION_TYPES_3D, } from '@/arcade/commandHints'
import { executeCommand } from '@/commands/registry'
import { AffineGrid, resetAffine } from '@/components/Duel/AffineGrid'
import { ScrubField } from '@/components/Duel/ScrubField'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { defaultPalettes, paletteToGradientCSS } from '@/flame/palettes'
import { variationTypesFor } from '@/flame/variationRegistry'
import { filterVariations } from '@/flame/variations/search'
import { getNormalizedVariationName } from '@/flame/variations/utils'
import { ColourWedge, Cross, Minus, Plus, Reset, ShapeTriangle, Shuffle, SidebarPanel, Sparkle, VariationSpiral, } from '@/icons'
import { createHorizontalScrollDrag } from '@/utils/createHorizontalScrollDrag'
import { createSharedIntersectionObserver } from '@/utils/useIntersectionObserver'
import { VariationPreview, variationPreviewFlames, } from '../VariationSelector/VariationSelector'
import ui from './TouchSurface.module.css'
import type { TouchControlSurfaceProps, TouchTab } from './types'
import type { AffineControls } from '@/arcade/affineControls'
import type { AffineParams } from '@/flame/affineTranform'
import type { Palette } from '@/flame/colorMap'
import type { TransformId, VariationId } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'

/** Helper to compute palette average hue for 14 spread swatches */
function paletteHue(paletteItem: Palette): number {
  const a =
    paletteItem.entries.reduce((sum, entry) => sum + entry.a, 0) /
    paletteItem.entries.length
  const b =
    paletteItem.entries.reduce((sum, entry) => sum + entry.b, 0) /
    paletteItem.entries.length
  return Math.atan2(b, a)
}

function isChromatic(paletteItem: Palette): boolean {
  return paletteItem.entries.some(
    (entry) => Math.hypot(entry.a, entry.b) > 0.02,
  )
}

const TOUCH_PALETTES = (() => {
  const BUCKETS = 14
  const chromatic = defaultPalettes.filter(isChromatic)
  const taken = new Map<number, Palette>()
  for (const p of chromatic) {
    const bucket = Math.floor(
      ((paletteHue(p) + Math.PI) / (2 * Math.PI)) * BUCKETS,
    )
    if (!taken.has(bucket)) taken.set(bucket, p)
  }
  const spread = [...taken.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, p]) => p)
  for (const p of chromatic) {
    if (spread.length >= BUCKETS) break
    if (!spread.includes(p)) spread.push(p)
  }
  return spread.slice(0, BUCKETS)
})()

function readableType(type: string): string {
  const name = getNormalizedVariationName(type)
  if (type.startsWith('custom_')) return name
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1')
}

export function TouchControlSurface(props: TouchControlSurfaceProps) {
  const [activeTab, setActiveTab] = createSignal<TouchTab>(
    props.initialTab ?? 'variations',
  )
  createEffect(() => {
    if (props.initialTab) {
      setActiveTab(props.initialTab)
    }
  })

  const [selectedTransformId, setSelectedTransformId] =
    createSignal<TransformId>()
  const [addingVar, setAddingVar] = createSignal(false)
  const [varQuery, setVarQuery] = createSignal('')

  const dims = createMemo(
    (): Dims => ((props.flame().renderSettings.dimensions ?? 2) === 3 ? 3 : 2),
  )

  const [galleryListEl, setGalleryListEl] = createSignal<HTMLDivElement>()
  const trackTileVisibility = createSharedIntersectionObserver(galleryListEl, {
    rootMargin: '200px',
  })
  createHorizontalScrollDrag(galleryListEl, {
    draggingClass: ui.isDragging,
  })

  const previewFlames = createMemo(() =>
    variationPreviewFlames('pointInitGaussianDisk', dims()),
  )

  const transformIds = createMemo(
    () => Object.keys(props.flame().transforms) as TransformId[],
  )

  const currentTransformId = createMemo(() => {
    const ids = transformIds()
    const sel = selectedTransformId()
    return sel !== undefined && ids.includes(sel) ? sel : ids[0]
  })

  const currentTransform = createMemo(() => {
    const id = currentTransformId()
    return id !== undefined ? props.flame().transforms[id] : undefined
  })

  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  const ghostAffines = () => {
    const current = currentTransformId()
    return Object.entries(props.flame().transforms)
      .filter(([id]) => id !== current)
      .map(([, t]) => t.preAffine)
      .slice(0, 8)
  }

  const isVariationActive = (type: string) => {
    const current = currentTransform()
    return Boolean(
      current && Object.values(current.variations).some((v) => v.type === type),
    )
  }

  const galleryVariationTypes = createMemo(() => {
    const samples =
      dims() === 3 ? SAMPLE_VARIATION_TYPES_3D : SAMPLE_VARIATION_TYPES
    const all = variationTypesFor(dims()) as readonly string[]
    const rest = all.filter((t) => !samples.includes(t as never))
    return [...samples, ...rest].slice(0, 36)
  })

  const searchMatches = createMemo(() => {
    const all = variationTypesFor(dims()) as readonly string[]
    return filterVariations(all, varQuery()).slice(0, 16)
  })

  return (
    <div class={ui.surfaceRoot}>
      {/* 1. Transform Selector Strip */}
      <div class={ui.transformNav}>
        <div class={ui.transformPills} role="group" aria-label="Transforms">
          <For each={transformIds()}>
            {(id, index) => (
              <button
                type="button"
                class={ui.transformPill}
                classList={{
                  [ui.transformPillActive!]: id === currentTransformId(),
                }}
                aria-pressed={id === currentTransformId()}
                onClick={() => setSelectedTransformId(id)}
              >
                T{index() + 1}
              </button>
            )}
          </For>
        </div>

        <div class={ui.transformActions}>
          <button
            type="button"
            class={ui.iconBtnSmall}
            title="Add Transform"
            aria-label="Add Transform"
            onClick={() => {
              dispatch('flame.addTransform')
            }}
          >
            <Plus class={ui.hudButtonIcon} />
          </button>
          <Show when={transformIds().length > 1}>
            <button
              type="button"
              class={ui.iconBtnSmall}
              title="Delete Transform"
              aria-label="Delete Transform"
              onClick={() => {
                dispatch('flame.deleteTransform', currentTransformId())
              }}
            >
              <Cross class={ui.hudButtonIcon} />
            </button>
          </Show>
        </div>
      </div>

      {/* 2. Primary Tabs */}
      <div class={ui.tabRow} role="tablist">
        <button
          type="button"
          class={ui.tabChip}
          classList={{ [ui.tabChipActive!]: activeTab() === 'variations' }}
          role="tab"
          aria-selected={activeTab() === 'variations'}
          onClick={() => setActiveTab('variations')}
        >
          <VariationSpiral class={ui.tabIcon} />
          Variations
        </button>
        <button
          type="button"
          class={ui.tabChip}
          classList={{ [ui.tabChipActive!]: activeTab() === 'shape' }}
          role="tab"
          aria-selected={activeTab() === 'shape'}
          onClick={() => setActiveTab('shape')}
        >
          <ShapeTriangle class={ui.tabIcon} />
          Shape
        </button>
        <button
          type="button"
          class={ui.tabChip}
          classList={{ [ui.tabChipActive!]: activeTab() === 'colour' }}
          role="tab"
          aria-selected={activeTab() === 'colour'}
          onClick={() => setActiveTab('colour')}
        >
          <ColourWedge class={ui.tabIcon} />
          Colour
        </button>
      </div>

      {/* 3. Panel Body */}
      <div class={ui.panelContent}>
        <Show when={currentTransform()}>
          {(t) => (
            <>
              {/* TAB A: VARIATIONS */}
              <Show when={activeTab() === 'variations'}>
                <div class={ui.variationsContainer}>
                  <div class={ui.activeVariationsList}>
                    <For each={Object.keys(t().variations) as VariationId[]}>
                      {(vid) => {
                        const variation = () => t().variations[vid]
                        return (
                          <Show when={variation()}>
                            {(v) => (
                              <div class={ui.activeVarRow}>
                                <span class={ui.varName}>
                                  {readableType(v().type)}
                                </span>
                                <input
                                  type="range"
                                  class={ui.varWeightSlider}
                                  min={-1}
                                  max={2}
                                  step={0.02}
                                  value={v().weight}
                                  aria-label={`${readableType(v().type)} weight`}
                                  onInput={(ev) => {
                                    dispatch(
                                      'flame.setVariationWeight',
                                      currentTransformId(),
                                      vid,
                                      Number(ev.currentTarget.value),
                                    )
                                  }}
                                />
                                <span class={ui.varWeightVal}>
                                  {v().weight.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  class={ui.iconBtnSmall}
                                  title={`Remove ${readableType(v().type)}`}
                                  aria-label={`Remove ${readableType(v().type)}`}
                                  onClick={() => {
                                    dispatch(
                                      'flame.deleteVariation',
                                      currentTransformId(),
                                      vid,
                                    )
                                  }}
                                >
                                  <Minus class={ui.hudButtonIcon} />
                                </button>
                              </div>
                            )}
                          </Show>
                        )
                      }}
                    </For>
                  </div>

                  {/* Visual Variation Gallery Strip */}
                  <div class={ui.variationGalleryContainer}>
                    <div class={ui.variationGalleryHeader}>
                      <span class={ui.variationGalleryTitle}>
                        Variation Gallery
                      </span>
                      <button
                        type="button"
                        class={ui.searchToggleBtn}
                        onClick={() => setAddingVar((v) => !v)}
                      >
                        {addingVar() ? 'Close Search' : 'Search All…'}
                      </button>
                    </div>

                    <div
                      class={ui.variationsCarousel}
                      ref={setGalleryListEl}
                      role="region"
                      aria-label="Variation Previews"
                    >
                      <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
                        <For each={galleryVariationTypes()}>
                          {(varType) => {
                            const flame = () => previewFlames()[varType]
                            const [tileEl, setTileEl] =
                              createSignal<HTMLElement>()
                            const nearViewport = trackTileVisibility(tileEl)
                            const active = () => isVariationActive(varType)

                            return (
                              <button
                                ref={setTileEl}
                                type="button"
                                class={ui.variationTile}
                                classList={{
                                  [ui.variationTileSelected!]: active(),
                                }}
                                title={getNormalizedVariationName(varType)}
                                aria-label={`${readableType(varType)}${active() ? ' (active)' : ''}`}
                                onClick={() => {
                                  if (!active()) {
                                    dispatch(
                                      'flame.addVariation',
                                      currentTransformId(),
                                      varType,
                                    )
                                  }
                                }}
                              >
                                <Show when={nearViewport() && flame()} keyed>
                                  {(f) => (
                                    <div class={ui.variationTileCanvas}>
                                      <VariationPreview
                                        version={1}
                                        isSelected={active()}
                                        name={varType}
                                        flame={f}
                                      />
                                    </div>
                                  )}
                                </Show>
                                <span class={ui.variationTileName}>
                                  {readableType(varType)}
                                </span>
                              </button>
                            )
                          }}
                        </For>
                      </ComputeGate>
                    </div>
                  </div>

                  <Show when={addingVar()}>
                    <div class={ui.activeVariationsList}>
                      <input
                        type="search"
                        placeholder="Search all variations..."
                        value={varQuery()}
                        onInput={(e) => setVarQuery(e.currentTarget.value)}
                        style={{
                          padding: '6px 10px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          'border-radius': '6px',
                          color: '#fff',
                        }}
                      />
                      <div
                        style={{
                          display: 'grid',
                          'grid-template-columns':
                            'repeat(auto-fill, minmax(90px, 1fr))',
                          gap: '6px',
                          'max-height': '120px',
                          'overflow-y': 'auto',
                        }}
                      >
                        <For each={searchMatches()}>
                          {(varType) => (
                            <button
                              type="button"
                              class={ui.quickPickCard}
                              onClick={() => {
                                dispatch(
                                  'flame.addVariation',
                                  currentTransformId(),
                                  varType,
                                )
                                setAddingVar(false)
                              }}
                            >
                              <span class={ui.quickPickName}>
                                {readableType(varType)}
                              </span>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>
                  <Show when={!addingVar()}>
                    <button
                      type="button"
                      class={ui.actionPillBtn}
                      onClick={() => setAddingVar(true)}
                    >
                      <Plus class={ui.hudButtonIcon} /> Browse Full Library
                    </button>
                  </Show>
                </div>
              </Show>

              {/* TAB B: SHAPE */}
              <Show when={activeTab() === 'shape'}>
                <div class={ui.shapeContainer}>
                  <div class={ui.affineGridWrap}>
                    <AffineGrid
                      affine={t().preAffine}
                      ghosts={ghostAffines()}
                      is3D={dims() === 3}
                      onChange={(nextAffine: AffineParams) => {
                        dispatch(
                          'flame.setTransformAffine',
                          currentTransformId(),
                          'pre',
                          nextAffine,
                          'grid',
                        )
                      }}
                    />
                  </div>

                  <div class={ui.shapeFieldsGrid}>
                    <For each={AFFINE_CONTROLS}>
                      {(spec) => {
                        const controls = () => decomposeAffine(t().preAffine)
                        return (
                          <ScrubField
                            label={spec.label}
                            value={spec.toDisplay(controls()[spec.key])}
                            step={spec.nudge}
                            perPixel={spec.perPixel}
                            decimals={spec.decimals}
                            unit={spec.unit}
                            onChange={(val) => {
                              const nextControls: AffineControls = {
                                ...controls(),
                                [spec.key]: spec.fromDisplay(val),
                              }
                              dispatch(
                                'flame.setTransformAffine',
                                currentTransformId(),
                                'pre',
                                composeAffine(nextControls, t().preAffine),
                                'grid',
                              )
                            }}
                          />
                        )
                      }}
                    </For>
                  </div>

                  <button
                    type="button"
                    class={ui.resetShapeBtn}
                    onClick={() => {
                      dispatch(
                        'flame.setTransformAffine',
                        currentTransformId(),
                        'pre',
                        resetAffine(t().preAffine),
                        'grid',
                      )
                    }}
                  >
                    <Reset class={ui.hudButtonIcon} /> Reset Shape
                  </button>
                </div>
              </Show>

              {/* TAB C: COLOUR */}
              <Show when={activeTab() === 'colour'}>
                <div class={ui.colourContainer}>
                  <div class={ui.paletteStrip}>
                    <For each={TOUCH_PALETTES}>
                      {(p) => (
                        <button
                          type="button"
                          class={ui.paletteSwatch}
                          style={{ background: paletteToGradientCSS(p) }}
                          title={p.name}
                          onClick={() => {
                            dispatch('flame.applyPalette', p)
                          }}
                        />
                      )}
                    </For>
                  </div>

                  <div class={ui.colourControlRow}>
                    <div class={ui.colourControlLabel}>
                      <span>Color Coordinate</span>
                      <span>{(t().color?.x ?? 0).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      class={ui.colourSlider}
                      min={0}
                      max={1}
                      step={0.01}
                      value={t().color?.x ?? 0}
                      onInput={(ev) => {
                        dispatch(
                          'flame.setTransformColor',
                          currentTransformId(),
                          Number(ev.currentTarget.value),
                          t().color?.y ?? 0,
                        )
                      }}
                    />
                  </div>

                  <div class={ui.colourControlRow}>
                    <div class={ui.colourControlLabel}>
                      <span>Color Speed</span>
                      <span>{(t().colorSpeed ?? 0.5).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      class={ui.colourSlider}
                      min={0}
                      max={1}
                      step={0.01}
                      value={t().colorSpeed ?? 0.5}
                      onInput={(ev) => {
                        dispatch(
                          'flame.setColorSpeed',
                          currentTransformId(),
                          Number(ev.currentTarget.value),
                        )
                      }}
                    />
                  </div>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>

      {/* 4. Action Footer */}
      <div class={ui.surfaceFooter}>
        <button
          type="button"
          class={ui.actionPillBtn}
          title="Mutate Flame"
          onClick={() => {
            if (props.onMutate) props.onMutate()
            else dispatch('flame.mutate')
          }}
        >
          <Sparkle class={ui.hudButtonIcon} /> Mutate
        </button>
        <button
          type="button"
          class={`${ui.actionPillBtn} ${ui.actionPillBtnPrimary}`}
          title="Randomize Flame"
          onClick={() => {
            if (props.onRandomize) props.onRandomize()
            else dispatch('flame.randomize')
          }}
        >
          <Shuffle class={ui.hudButtonIcon} /> Randomize
        </button>
        <Show when={props.onOpenDrawer}>
          <button
            type="button"
            class={ui.actionPillBtn}
            title="More Tools"
            onClick={props.onOpenDrawer}
          >
            <SidebarPanel class={ui.hudButtonIcon} /> More
          </button>
        </Show>
      </div>
    </div>
  )
}
