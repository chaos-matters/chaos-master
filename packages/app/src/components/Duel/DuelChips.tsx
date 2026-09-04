import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { AFFINE_CONTROLS, composeAffine, decomposeAffine, } from '@/arcade/affineControls'
import { SAMPLE_VARIATION_TYPES } from '@/arcade/commandHints'
import { executeCommand } from '@/commands/registry'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { ensure3DAffine } from '@/flame/affine3DView'
import { palette } from '@/flame/colorMap'
import { defaultPalettes, paletteToGradientCSS } from '@/flame/palettes'
import { variationTypesFor } from '@/flame/variationRegistry'
import { filterVariations } from '@/flame/variations/search'
import { getVariationPreviewFlame } from '@/flame/variations/utils'
import { Check, ColourWedge, Cross, Minus, Plus, ShapeTriangle, Undo, VariationSpiral, } from '@/icons'
import { createDragHandler } from '@/utils/createDragHandler'
import { createSharedIntersectionObserver } from '@/utils/useIntersectionObserver'
import { AffineGrid, resetAffine } from './AffineGrid'
import ui from './DuelChips.module.css'
import { ScrubField } from './ScrubField'
import type { Accessor } from 'solid-js'
import type { AffineControls } from '@/arcade/affineControls'
import type { CommandContext } from '@/commands/types'
import type { AffineParams } from '@/flame/affineTranform'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor, TransformId } from '@/flame/schema/flameSchema'

type Panel = 'variations' | 'shape' | 'colour'

const CHIPS: { id: Panel; label: string; icon: typeof ColourWedge }[] = [
  { id: 'variations', label: 'Variations', icon: VariationSpiral },
  { id: 'shape', label: 'Shape', icon: ShapeTriangle },
  { id: 'colour', label: 'Colour', icon: ColourWedge },
]

/** Pointer intent, so a cursor crossing the top edge does not detonate a panel. */
const HOVER_IN_MS = 120
const HOVER_OUT_MS = 250

function hoverCapable(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}

/**
 * The viewer's editing surface during a duel.
 *
 * Three quiet chips on the top edge of your own half; touch one and it becomes
 * a strip across the top of that half only. Never the whole screen, never the
 * opponent's half, and capped in height — the duel's whole point is watching
 * the render evolve, so the flame is never traded away for controls.
 *
 * Every control dispatches a registered command through the player's context,
 * so each edit lands in the player's recorder stream as one replayable step
 * and adds nothing for the guard or the recorder to learn.
 */
export function DuelChips(props: {
  ctx: CommandContext
  flame: Accessor<FlameDescriptor>
}) {
  const [open, setOpen] = createSignal<Panel | undefined>()
  const [selected, setSelected] = createSignal<TransformId | undefined>()
  let hoverTimer: number | undefined

  const transformIds = () =>
    Object.keys(props.flame().transforms) as TransformId[]
  // Follows the flame: a randomize between two edits can take the transform
  // that was being edited out from under the panel.
  const transformId = () => {
    const ids = transformIds()
    const current = selected()
    return current !== undefined && ids.includes(current) ? current : ids[0]
  }
  const transform = () => {
    const id = transformId()
    return id === undefined ? undefined : props.flame().transforms[id]
  }

  const intend = (panel: Panel | undefined, delay: number) => {
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(() => setOpen(panel), delay)
  }
  const cancelIntent = () => {
    window.clearTimeout(hoverTimer)
  }

  createEffect(() => {
    if (open() === undefined) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      setOpen(undefined)
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('keydown', onKey)
    })
  })

  onCleanup(() => {
    window.clearTimeout(hoverTimer)
  })

  /** Every transform but the one being edited, drawn behind it. */
  const ghostAffines = () => {
    const current = transformId()
    return Object.entries(props.flame().transforms)
      .filter(([id]) => id !== current)
      .map(([, transform]) => transform.preAffine)
      .slice(0, 8)
  }

  const pick = (panel: Panel) => {
    cancelIntent()
    setOpen(open() === panel ? undefined : panel)
  }

  const dispatch = (id: string, ...args: unknown[]) => {
    executeCommand(id, props.ctx, ...args)
  }

  return (
    <div
      class={ui.chips}
      onPointerLeave={() => {
        if (hoverCapable()) intend(undefined, HOVER_OUT_MS)
      }}
      onPointerEnter={cancelIntent}
    >
      {/* The panel takes the chips' place rather than stacking under them —
          the mock puts it at the same inset, and stacked they cost ~50px of
          flame. The chips do not disappear though: they move into the panel's
          header, where the lit one names the panel and the other two are how
          you switch without closing first. */}
      <Show when={open() === undefined}>
        <div class={ui.row} role="toolbar" aria-label="Editing tools">
          <ChipRow
            open={open()}
            onPick={pick}
            onIntend={(panel) => {
              if (hoverCapable()) intend(panel, HOVER_IN_MS)
            }}
          />
        </div>
      </Show>

      <Show when={open() !== undefined && transform()}>
        {(active) => (
          <section
            class={ui.panel}
            aria-label={CHIPS.find((c) => c.id === open())?.label}
          >
            <header class={ui.panelHead}>
              <div
                class={ui.panelIdentity}
                role="toolbar"
                aria-label="Editing tools"
              >
                <ChipRow open={open()} onPick={pick} />
                <TransformPicker
                  ids={transformIds()}
                  current={transformId()}
                  onPick={setSelected}
                />
              </div>
              <button
                type="button"
                class={ui.close}
                aria-label="Close"
                onClick={() => {
                  setOpen(undefined)
                }}
              >
                <Cross aria-hidden="true" />
              </button>
            </header>
            <div class={ui.panelBody}>
              <Show when={open() === 'variations'}>
                <VariationsPanel
                  transform={active()}
                  paused={open() !== 'variations'}
                  onAdd={(type) => {
                    dispatch('flame.addVariation', transformId(), type)
                  }}
                  onWeight={(vid, weight) => {
                    dispatch(
                      'flame.setVariationWeight',
                      transformId(),
                      vid,
                      weight,
                    )
                  }}
                  onRemove={(vid) => {
                    dispatch('flame.deleteVariation', transformId(), vid)
                  }}
                />
              </Show>
              <Show when={open() === 'shape'}>
                <ShapePanel
                  affine={active().preAffine}
                  ghosts={ghostAffines()}
                  is3D={(props.flame().renderSettings.dimensions ?? 2) === 3}
                  onChange={(affine) => {
                    dispatch(
                      'flame.setTransformAffine',
                      transformId(),
                      'pre',
                      affine,
                      'grid',
                    )
                  }}
                />
              </Show>
              <Show when={open() === 'colour'}>
                <ColourPanel
                  flame={props.flame()}
                  transform={active()}
                  onPalette={(palette) => {
                    dispatch('flame.applyPalette', palette)
                  }}
                  onColor={(x) => {
                    dispatch('flame.setTransformColor', transformId(), x, 0)
                  }}
                  onSpeed={(speed) => {
                    dispatch('flame.setColorSpeed', transformId(), speed)
                  }}
                />
              </Show>
            </div>
          </section>
        )}
      </Show>
    </div>
  )
}

function ChipRow(props: {
  open: Panel | undefined
  onPick: (panel: Panel) => void
  onIntend?: (panel: Panel) => void
}) {
  return (
    <For each={CHIPS}>
      {(chip) => (
        <button
          type="button"
          class={ui.chip}
          classList={{ [ui.chipOpen!]: props.open === chip.id }}
          aria-expanded={props.open === chip.id}
          onPointerEnter={() => props.onIntend?.(chip.id)}
          onClick={() => {
            props.onPick(chip.id)
          }}
        >
          <chip.icon class={ui.chipIcon} aria-hidden="true" />
          {chip.label}
        </button>
      )}
    </For>
  )
}

function TransformPicker(props: {
  ids: readonly TransformId[]
  current?: TransformId
  onPick: (id: TransformId) => void
}) {
  return (
    <div class={ui.transforms} role="group" aria-label="Transform">
      <For each={props.ids}>
        {(id, index) => (
          <button
            type="button"
            class={ui.transformChip}
            classList={{ [ui.transformOn!]: id === props.current }}
            aria-pressed={id === props.current}
            onClick={() => {
              props.onPick(id)
            }}
          >
            {index() + 1}
          </button>
        )}
      </For>
    </div>
  )
}

/**
 * The catalogue the Add tile offers.
 *
 * Deliberately a curated handful rather than the ~370 registered types: each
 * tile that scrolls into view mounts a live WebGPU preview, and a duel already
 * has two full-size seat canvases running. The sidebar is where the whole
 * catalogue lives.
 */
/**
 * Every variation the editor has, not the eight the agent's brief names.
 *
 * `SAMPLE_VARIATION_TYPES` is a prompt hint — a handful of well-known names to
 * show a model what a type id looks like — and using it here meant the strip
 * offered eight of the app's 268 and a search could never reach the rest.
 * 2D deliberately: a duel refuses 3D flames, so there is no dimension to pick.
 */
const CATALOGUE = variationTypesFor(2)

/**
 * What the resting row offers after what you already have.
 *
 * Named, not sliced: the registry is alphabetical, so the first twelve were
 * Acosech, Acosh, Acoth, Apocarpet — a shortcut row nobody would use. These
 * are the same well-known handful the agent's brief names, which is what
 * `SAMPLE_VARIATION_TYPES` is for. Everything else is behind Add.
 */
const QUICK_PICKS: readonly string[] = SAMPLE_VARIATION_TYPES

/** One page of the add gallery: about three rows at this tile pitch. */
const GALLERY_PAGE = 30

/**
 * Search results shown at once. A duel is three minutes long — twenty ranked
 * matches is already more than anyone reads under a clock, and rendering them
 * costs a GPU preview each.
 */
const SEARCH_LIMIT = 20

function VariationTile(props: {
  type: string
  name: string
  weight?: number
  active: boolean
  paused: boolean
  /**
   * Registers this tile with its scroller's observer. A preview is a GPU job
   * behind a two-slot gate, so a tile far from the viewport asks for nothing
   * and shows an empty well instead.
   */
  track?: (el: Accessor<Element | undefined>) => Accessor<boolean>
  onPrimary: () => void
  onWeight?: (weight: number) => void
}) {
  const [el, setEl] = createSignal<HTMLElement>()
  const near = props.track?.(el) ?? (() => true)
  return (
    <div class={ui.tile} classList={{ [ui.tileOn!]: props.active }} ref={setEl}>
      <button
        type="button"
        class={ui.tileButton}
        aria-label={props.active ? `Remove ${props.name}` : `Add ${props.name}`}
        onClick={() => {
          props.onPrimary()
        }}
      >
        {/* The preview is square because the thumbnail is: a 16:9 render
            inside it letterboxed the motif into the middle third, and most
            of what the row showed was the black bars. */}
        <span class={ui.tileThumb}>
          <Show when={near()}>
            <VariationPreview
              version={0}
              isSelected={props.active}
              flame={getVariationPreviewFlame(props.type)}
              name={props.name}
              resolution={{ width: 112, height: 112 }}
              paused={props.paused}
            />
          </Show>
        </span>
        <span class={ui.tileName}>{props.name}</span>
        <span class={ui.tileBadge} aria-hidden="true">
          {props.active ? <Minus /> : <Plus />}
        </span>
      </button>
      <Show when={props.onWeight}>
        {(onWeight) => (
          <label class={ui.tileWeightRow}>
            <input
              class={ui.tileWeight}
              type="range"
              min={-1}
              max={2}
              step={0.01}
              value={props.weight ?? 0}
              aria-label={`${props.name} weight`}
              onInput={(ev) => {
                onWeight()(Number(ev.currentTarget.value))
              }}
            />
            <span class={ui.tileValue}>{(props.weight ?? 0).toFixed(2)}</span>
          </label>
        )}
      </Show>
    </div>
  )
}

function VariationsPanel(props: {
  transform: {
    variations: Record<string, { type: string; weight: number }>
  }
  paused: boolean
  onWeight: (variationId: string, weight: number) => void
  onRemove: (variationId: string) => void
  onAdd: (type: string) => void
}) {
  const [adding, setAdding] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [shown, setShown] = createSignal(GALLERY_PAGE)
  const [rowEl, setRowEl] = createSignal<HTMLDivElement>()
  const [galleryEl, setGalleryEl] = createSignal<HTMLDivElement>()
  // A preview is a GPU job. 268 of them is not a strip, it is a render farm,
  // so a tile only asks for one once it is near the scroller's viewport.
  const trackRow = createSharedIntersectionObserver(rowEl, {
    rootMargin: '200px',
  })
  const trackGallery = createSharedIntersectionObserver(galleryEl, {
    rootMargin: '160px',
  })

  const entries = () => Object.entries(props.transform.variations)
  const present = () => new Set(entries().map(([, v]) => v.type))
  const rest = () => CATALOGUE.filter((type) => !present().has(type))
  const quick = () => QUICK_PICKS.filter((type) => !present().has(type))
  const matches = () => filterVariations(rest(), query())
  const searching = () => query().trim() !== ''
  const visible = () =>
    searching() ? matches().slice(0, SEARCH_LIMIT) : matches().slice(0, shown())
  const hidden = () => matches().length - visible().length

  const openAdd = () => {
    setShown(GALLERY_PAGE)
    setAdding(true)
  }
  const closeAdd = () => {
    setAdding(false)
    setQuery('')
  }

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div class={ui.variations}>
        {/* The search bar sits ABOVE the scroller, not inside it: as a flex
            item of a horizontally scrolling row it scrolled away with the
            tiles and the first thing a search did was cut off its own box. */}
        <Show when={adding()}>
          <div class={ui.addBar}>
            <input
              class={ui.search}
              type="search"
              placeholder={`Search ${CATALOGUE.length} variations`}
              value={query()}
              aria-label="Search variations"
              onInput={(ev) => {
                setQuery(ev.currentTarget.value)
              }}
            />
            <span class={ui.addCount}>
              {searching()
                ? `${matches().length} match${matches().length === 1 ? '' : 'es'}`
                : `${matches().length} to add`}
            </span>
            <button type="button" class={ui.addBack} onClick={closeAdd}>
              Done
            </button>
          </div>
        </Show>
        <Show
          when={adding()}
          fallback={
            <div class={ui.tiles} ref={setRowEl}>
              <button type="button" class={ui.addTile} onClick={openAdd}>
                <Plus aria-hidden="true" />
                Add
              </button>
              <For each={entries()}>
                {([id, variation]) => (
                  <VariationTile
                    type={variation.type}
                    name={readableType(variation.type)}
                    weight={variation.weight}
                    active
                    paused={props.paused}
                    track={trackRow}
                    onPrimary={() => {
                      props.onRemove(id)
                    }}
                    onWeight={(weight) => {
                      props.onWeight(id, weight)
                    }}
                  />
                )}
              </For>
              {/* Then a few you could add. A panel listing only what a
                  transform already has is emptiest exactly when you most need
                  it: one variation opened a 790px slab to show one tile. The
                  whole catalogue lives behind Add — this row is the shortcut,
                  not the library. */}
              <Show when={quick().length > 0}>
                <span class={ui.tileRule} aria-hidden="true" />
              </Show>
              <For each={quick()}>
                {(type) => (
                  <VariationTile
                    type={type}
                    name={readableType(type)}
                    active={false}
                    paused={props.paused}
                    track={trackRow}
                    onPrimary={() => {
                      props.onAdd(type)
                    }}
                  />
                )}
              </For>
            </div>
          }
        >
          {/* Rows rather than a corridor: the catalogue is 268 long, and a
              single scrolling line makes you drag past everything you do not
              want to reach anything you do. */}
          <div class={ui.gallery} ref={setGalleryEl}>
            <For each={visible()}>
              {(type) => (
                <VariationTile
                  type={type}
                  name={readableType(type)}
                  active={false}
                  paused={props.paused}
                  track={trackGallery}
                  onPrimary={() => {
                    props.onAdd(type)
                  }}
                />
              )}
            </For>
            <Show when={hidden() > 0 && !searching()}>
              <button
                type="button"
                class={ui.showMore}
                onClick={() => setShown((n) => n + GALLERY_PAGE)}
              >
                Show {Math.min(hidden(), GALLERY_PAGE)} more
              </button>
            </Show>
            <Show when={hidden() > 0 && searching()}>
              <p class={ui.moreNote}>
                {hidden()} more match. Keep typing to narrow it down.
              </p>
            </Show>
            <Show when={matches().length === 0}>
              <p class={ui.empty}>No variations match "{query()}".</p>
            </Show>
          </div>
        </Show>
      </div>
    </ComputeGate>
  )
}

/** `linearVar` reads as "Linear" once, here, rather than in four places. */
function readableType(type: string): string {
  const trimmed = type.replace(/Var$/, '')
  return (
    trimmed.charAt(0).toUpperCase() +
    trimmed.slice(1).replace(/([A-Z])/g, ' $1')
  )
}

/**
 * The three translations, which are the only part of a 3D transform a scrub
 * field can state honestly.
 *
 * The 2D panel decomposes into scale, rotation and shear because a 2x3 matrix
 * decomposes cleanly. A 3x4 does not: rotation needs three angles, the order
 * matters, and a naive Euler triple gimbal-locks at exactly the default camera
 * angle. So shape comes from dragging the basis handles — which is what the
 * grid was always for — and the fields say where the transform sits.
 */
const OFFSET_3D = [
  { key: 'd', label: 'X offset' },
  { key: 'h', label: 'Y offset' },
  { key: 'l', label: 'Z offset' },
] as const

function ShapePanel(props: {
  affine: AffineParams
  ghosts: readonly AffineParams[]
  is3D?: boolean
  onChange: (affine: AffineParams) => void
}) {
  const controls = () => decomposeAffine(props.affine)
  return (
    <div class={ui.shape}>
      <div class={ui.shapeCanvas}>
        <AffineGrid
          affine={props.affine}
          ghosts={props.ghosts}
          is3D={props.is3D}
          onChange={props.onChange}
        />
      </div>
      <Show when={props.is3D === true}>
        <p class={ui.shapeHint}>
          Drag a handle to move it flat; hold Shift to move it in depth.
        </p>
      </Show>
      <div class={ui.fields}>
        <Show when={props.is3D === true}>
          <For each={OFFSET_3D}>
            {(spec) => (
              <ScrubField
                label={spec.label}
                value={ensure3DAffine(props.affine)[spec.key] ?? 0}
                step={0.01}
                perPixel={0.005}
                decimals={3}
                onChange={(next) => {
                  props.onChange({
                    ...ensure3DAffine(props.affine),
                    [spec.key]: next,
                  })
                }}
              />
            )}
          </For>
        </Show>
        <For each={props.is3D === true ? [] : AFFINE_CONTROLS}>
          {(spec) => (
            <ScrubField
              label={spec.label}
              value={spec.toDisplay(controls()[spec.key])}
              step={spec.nudge}
              perPixel={spec.perPixel}
              decimals={spec.decimals}
              unit={spec.unit}
              onChange={(next) => {
                const controlsNext: AffineControls = {
                  ...controls(),
                  [spec.key]: spec.fromDisplay(next),
                }
                props.onChange(composeAffine(controlsNext, props.affine))
              }}
            />
          )}
        </For>
        <button
          type="button"
          class={ui.reset}
          onClick={() => {
            props.onChange(resetAffine(props.affine))
          }}
        >
          <Undo class={ui.resetIcon} aria-hidden="true" />
          Reset
        </button>
      </div>
    </div>
  )
}

/**
 * How many palettes the strip offers.
 *
 * `defaultPalettes` holds 53 and is synchronous, module-level, and free. The
 * official flam3 set is a 1.5 MB XML fetch parsed on the main thread, which is
 * not something to spend a duel's clock on — the sidebar can offer those.
 */
/** A palette's own hue, in radians, from the mean chroma of its stops. */
function paletteHue(palette: Palette): number {
  const a =
    palette.entries.reduce((sum, entry) => sum + entry.a, 0) /
    palette.entries.length
  const b =
    palette.entries.reduce((sum, entry) => sum + entry.b, 0) /
    palette.entries.length
  return Math.atan2(b, a)
}

/**
 * Fourteen palettes chosen to look like fourteen palettes.
 *
 * `defaultPalettes` is ordered by family, so the first fourteen are five reds
 * and three blues — a strip you cannot pick from at a glance, which is the
 * only kind of picking a duel allows. Taking one from each hue bucket spends
 * the same fourteen slots on the whole wheel instead.
 *
 * Chroma is also the filter: a swatch draws a palette's colour and takes its
 * lightness from the flame's density, so the greyscale palettes have nothing
 * to draw and rendered as identical flat blocks. They keep their place in the
 * sidebar, where they are labelled and picked deliberately.
 */
/**
 * Has colour to draw.
 *
 * A swatch renders a palette's chroma and takes its lightness from the flame's
 * density, so a palette with no chroma has nothing to draw and comes out as a
 * flat block indistinguishable from the next one.
 */
function isChromatic(palette: Palette): boolean {
  return palette.entries.some((entry) => Math.hypot(entry.a, entry.b) > 0.02)
}

const STRIP_PALETTES = (() => {
  const BUCKETS = 14
  const chromatic = defaultPalettes.filter(isChromatic)
  const taken = new Map<number, Palette>()
  for (const palette of chromatic) {
    const bucket = Math.floor(
      ((paletteHue(palette) + Math.PI) / (2 * Math.PI)) * BUCKETS,
    )
    if (!taken.has(bucket)) taken.set(bucket, palette)
  }
  const spread = [...taken.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, palette]) => palette)
  // Buckets can come up empty; top up in order rather than shipping a short
  // strip, and never repeat one already taken.
  for (const palette of chromatic) {
    if (spread.length >= BUCKETS) break
    if (!spread.includes(palette)) spread.push(palette)
  }
  return spread.slice(0, BUCKETS)
})()

/**
 * The whole synchronous set, behind "Show more" — the same `defaultPalettes`
 * the sidebar's gallery lists.
 *
 * The hue spread stays first so the strip does not reorder under the viewer's
 * hand, then the rest of the coloured ones in family order, then the
 * greyscale ones last: they all draw the same flat block (see `isChromatic`),
 * so they are worth reaching by name but not worth crowding the front of a
 * strip anyone is picking from against a clock.
 *
 * The official flam3 set is not here: it is a 1.5 MB XML fetch parsed on the
 * main thread, which is not something to spend a duel's clock on.
 */
const ALL_PALETTES: Palette[] = (() => {
  const rest = defaultPalettes.filter(
    (palette) => !STRIP_PALETTES.includes(palette),
  )
  return [
    ...STRIP_PALETTES,
    ...rest.filter(isChromatic),
    ...rest.filter((palette) => !isChromatic(palette)),
  ]
})()

function ColourPanel(props: {
  flame: FlameDescriptor
  transform: { color: { x: number; y: number }; colorSpeed?: number }
  onPalette: (palette: Palette) => void
  onColor: (x: number) => void
  onSpeed: (speed: number) => void
}) {
  const applied = () => props.flame.renderSettings.palette
  const selectedId = () => applied()?.id ?? ''
  const [showAll, setShowAll] = createSignal(false)
  const strip = () => (showAll() ? ALL_PALETTES : STRIP_PALETTES)
  /**
   * The strip, with the flame's own palette on the front if it is not already
   * in it. Without this the strip marks nothing as selected and the position
   * track falls back to grey — the two things that tell you where you are.
   */
  const swatches = (): Palette[] => {
    const live = applied()
    if (live === undefined || strip().some((p) => p.id === live.id)) {
      return strip()
    }
    // The descriptor stores a palette without the provenance a `Palette`
    // carries, so it is rebuilt rather than cast.
    return [palette(live.id, live.name, live.entries, 'custom'), ...strip()]
  }
  // The position track carries the palette actually in use, so the slider
  // shows you the colours you are moving through rather than a stock rainbow.
  const trackGradient = () => {
    const live = swatches().find((p) => p.id === selectedId())
    return live === undefined
      ? 'linear-gradient(to right, #1b1f2a, #6f7a92)'
      : paletteToGradientCSS(live)
  }

  /**
   * The strip pans with a mouse drag, as well as scrolling.
   *
   * Fifty-three palettes do not fit, and a horizontal scrollbar under a row
   * of buttons is a target you have to aim at. Touch already flicks natively,
   * so only mouse pointers are taken over.
   */
  const [dragged, setDragged] = createSignal(false)
  const startPan = createDragHandler(
    (down) => {
      if (down.pointerType !== 'mouse') return undefined
      const el = down.currentTarget as HTMLElement
      const startX = down.clientX
      const startLeft = el.scrollLeft
      el.dataset.panning = ''
      return {
        onPointerMove(move) {
          el.scrollLeft = startLeft - (move.clientX - startX)
          setDragged(true)
        },
        onDone() {
          delete el.dataset.panning
          // The click that ends a pan must not pick a palette. Clearing on the
          // next task leaves the flag readable by the swatch's own onClick,
          // which fires first.
          window.setTimeout(() => setDragged(false), 0)
        },
      }
    },
    // A shaky hand is still a click; `preventDefault: false` so the swatches
    // keep taking focus.
    { deadZoneRadius: 6, preventDefault: false },
  )

  return (
    <div class={ui.colour}>
      <div
        class={ui.swatches}
        role="group"
        aria-label="Palette"
        onPointerDown={startPan}
      >
        <For each={swatches()}>
          {(palette) => (
            <button
              type="button"
              class={ui.swatch}
              classList={{ [ui.swatchOn!]: palette.id === selectedId() }}
              aria-pressed={palette.id === selectedId()}
              onClick={() => {
                if (dragged()) return
                props.onPalette(palette)
              }}
            >
              <span
                class={ui.swatchBand}
                style={{ background: paletteToGradientCSS(palette) }}
              />
              <span class={ui.swatchName}>{palette.name}</span>
              <Show when={palette.id === selectedId()}>
                <span class={ui.swatchCheck} aria-hidden="true">
                  <Check />
                </span>
              </Show>
            </button>
          )}
        </For>
        {/* At the tail of the strip rather than above it: the row already
            reads left to right, and "more this way" is where the eye is. */}
        <Show when={!showAll() && ALL_PALETTES.length > STRIP_PALETTES.length}>
          <button
            type="button"
            class={ui.swatchMore}
            onClick={() => {
              if (dragged()) return
              setShowAll(true)
            }}
          >
            {ALL_PALETTES.length - STRIP_PALETTES.length}
            <span class={ui.swatchMoreWord}>more</span>
          </button>
        </Show>
      </div>

      <label class={ui.field}>
        <span class={ui.fieldLabel}>Colour position</span>
        <input
          class={`${ui.fieldInput} ${ui.colourTrack}`}
          style={{ '--duel-track': trackGradient() }}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.transform.color.x}
          onInput={(ev) => {
            props.onColor(Number(ev.currentTarget.value))
          }}
        />
        <span class={ui.fieldValue}>{props.transform.color.x.toFixed(2)}</span>
      </label>

      {/* Deliberately the lesser of the two: a hairline track and a plain
          knob, because colour position is what a player reaches for. */}
      <label class={`${ui.field} ${ui.speedField}`}>
        <span class={ui.fieldLabel}>Speed</span>
        <input
          class={`${ui.fieldInput} ${ui.speedTrack}`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.transform.colorSpeed ?? 0.4}
          onInput={(ev) => {
            props.onSpeed(Number(ev.currentTarget.value))
          }}
        />
        <span class={ui.fieldValue}>
          {(props.transform.colorSpeed ?? 0.4).toFixed(2)}
        </span>
      </label>
    </div>
  )
}
