import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { AFFINE_CONTROLS, composeAffine, decomposeAffine, } from '@/arcade/affineControls'
import { SAMPLE_VARIATION_TYPES } from '@/arcade/commandHints'
import { executeCommand } from '@/commands/registry'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { defaultPalettes, paletteToGradientCSS } from '@/flame/palettes'
import { getVariationPreviewFlame } from '@/flame/variations/utils'
import { Check, ColourWedge, Cross, Minus, Plus, ShapeTriangle, VariationSpiral, } from '@/icons'
import { AffineGrid, resetAffine } from './AffineGrid'
import ui from './DuelChips.module.css'
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
const CATALOGUE = SAMPLE_VARIATION_TYPES

function VariationTile(props: {
  type: string
  name: string
  weight?: number
  active: boolean
  paused: boolean
  onPrimary: () => void
  onWeight?: (weight: number) => void
}) {
  return (
    <div class={ui.tile} classList={{ [ui.tileOn!]: props.active }}>
      <button
        type="button"
        class={ui.tileButton}
        aria-label={props.active ? `Remove ${props.name}` : `Add ${props.name}`}
        onClick={() => {
          props.onPrimary()
        }}
      >
        <span class={ui.tileThumb}>
          <VariationPreview
            version={0}
            isSelected={props.active}
            flame={getVariationPreviewFlame(props.type)}
            name={props.name}
            resolution={{ width: 128, height: 72 }}
            paused={props.paused}
          />
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
  const entries = () => Object.entries(props.transform.variations)
  const present = () => new Set(entries().map(([, v]) => v.type))
  const matches = () =>
    CATALOGUE.filter(
      (type) =>
        !present().has(type) &&
        readableType(type).toLowerCase().includes(query().trim().toLowerCase()),
    )

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div class={ui.tiles}>
        <Show
          when={adding()}
          fallback={
            <>
              <button
                type="button"
                class={ui.addTile}
                onClick={() => setAdding(true)}
              >
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
                    onPrimary={() => {
                      props.onRemove(id)
                    }}
                    onWeight={(weight) => {
                      props.onWeight(id, weight)
                    }}
                  />
                )}
              </For>
              <Show when={entries().length === 0}>
                <p class={ui.empty}>
                  This transform has no variations yet. Add one.
                </p>
              </Show>
            </>
          }
        >
          <div class={ui.addBar}>
            <input
              class={ui.search}
              type="search"
              placeholder="Search variations"
              value={query()}
              aria-label="Search variations"
              onInput={(ev) => setQuery(ev.currentTarget.value)}
            />
            <button
              type="button"
              class={ui.addBack}
              onClick={() => {
                setAdding(false)
                setQuery('')
              }}
            >
              Done
            </button>
          </div>
          <For each={matches()}>
            {(type) => (
              <VariationTile
                type={type}
                name={readableType(type)}
                active={false}
                paused={props.paused}
                onPrimary={() => {
                  props.onAdd(type)
                }}
              />
            )}
          </For>
          <Show when={matches().length === 0}>
            <p class={ui.empty}>No variations match "{query()}".</p>
          </Show>
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

function ShapePanel(props: {
  affine: AffineParams
  ghosts: readonly AffineParams[]
  onChange: (affine: AffineParams) => void
}) {
  const controls = () => decomposeAffine(props.affine)
  return (
    <div class={ui.shape}>
      <div class={ui.shapeCanvas}>
        <AffineGrid
          affine={props.affine}
          ghosts={props.ghosts}
          onChange={props.onChange}
        />
      </div>
      <div class={ui.fields}>
        <For each={AFFINE_CONTROLS}>
          {(spec) => (
            <label class={ui.field}>
              <span class={ui.fieldLabel}>{spec.label}</span>
              <input
                class={ui.fieldInput}
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={spec.toDisplay(controls()[spec.key])}
                onInput={(ev) => {
                  const next: AffineControls = {
                    ...controls(),
                    [spec.key]: spec.fromDisplay(
                      Number(ev.currentTarget.value),
                    ),
                  }
                  props.onChange(composeAffine(next, props.affine))
                }}
              />
              <span class={ui.fieldValue}>
                {spec
                  .toDisplay(controls()[spec.key])
                  .toFixed(spec.key === 'rotation' ? 0 : 2)}
              </span>
            </label>
          )}
        </For>
        <button
          type="button"
          class={ui.reset}
          onClick={() => {
            props.onChange(resetAffine(props.affine))
          }}
        >
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
const STRIP_PALETTES = defaultPalettes.slice(0, 14)

function ColourPanel(props: {
  flame: FlameDescriptor
  transform: { color: { x: number; y: number }; colorSpeed?: number }
  onPalette: (palette: Palette) => void
  onColor: (x: number) => void
  onSpeed: (speed: number) => void
}) {
  const selectedId = () => props.flame.renderSettings.palette?.id ?? ''
  // The position track carries the palette actually in use, so the slider
  // shows you the colours you are moving through rather than a stock rainbow.
  const trackGradient = () => {
    const applied = STRIP_PALETTES.find((p) => p.id === selectedId())
    return applied
      ? paletteToGradientCSS(applied)
      : 'linear-gradient(to right, #1b1f2a, #6f7a92)'
  }

  return (
    <div class={ui.colour}>
      <div class={ui.swatches} role="group" aria-label="Palette">
        <For each={STRIP_PALETTES}>
          {(palette) => (
            <button
              type="button"
              class={ui.swatch}
              classList={{ [ui.swatchOn!]: palette.id === selectedId() }}
              aria-pressed={palette.id === selectedId()}
              onClick={() => {
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
