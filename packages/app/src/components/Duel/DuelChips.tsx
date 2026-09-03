import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { AFFINE_CONTROLS, composeAffine, decomposeAffine, } from '@/arcade/affineControls'
import { executeCommand } from '@/commands/registry'
import { ColourWedge, Cross, ShapeTriangle, VariationSpiral } from '@/icons'
import ui from './DuelChips.module.css'
import type { Accessor } from 'solid-js'
import type { AffineControls } from '@/arcade/affineControls'
import type { CommandContext } from '@/commands/types'
import type { AffineParams } from '@/flame/affineTranform'
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
      <div class={ui.row} role="toolbar" aria-label="Editing tools">
        <For each={CHIPS}>
          {(chip) => (
            <button
              type="button"
              class={ui.chip}
              classList={{ [ui.chipOpen!]: open() === chip.id }}
              aria-expanded={open() === chip.id}
              onPointerEnter={() => {
                if (hoverCapable()) intend(chip.id, HOVER_IN_MS)
              }}
              onClick={() => {
                cancelIntent()
                setOpen(open() === chip.id ? undefined : chip.id)
              }}
            >
              <chip.icon class={ui.chipIcon} aria-hidden="true" />
              {chip.label}
            </button>
          )}
        </For>
      </div>

      <Show when={open() !== undefined && transform()}>
        {(active) => (
          <section
            class={ui.panel}
            aria-label={CHIPS.find((c) => c.id === open())?.label}
          >
            <header class={ui.panelHead}>
              <TransformPicker
                ids={transformIds()}
                current={transformId()}
                onPick={setSelected}
              />
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
                  transform={active()}
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

function VariationsPanel(props: {
  transform: { variations: Record<string, { type: string; weight: number }> }
  onWeight: (variationId: string, weight: number) => void
  onRemove: (variationId: string) => void
}) {
  const entries = () => Object.entries(props.transform.variations)
  return (
    <div class={ui.tiles}>
      <For each={entries()}>
        {([id, variation]) => (
          <div class={ui.tile}>
            <span class={ui.tileName}>{readableType(variation.type)}</span>
            <input
              class={ui.tileWeight}
              type="range"
              min={-1}
              max={2}
              step={0.01}
              value={variation.weight}
              aria-label={`${readableType(variation.type)} weight`}
              onInput={(ev) => {
                props.onWeight(id, Number(ev.currentTarget.value))
              }}
            />
            <span class={ui.tileValue}>{variation.weight.toFixed(2)}</span>
            <button
              type="button"
              class={ui.tileRemove}
              aria-label={`Remove ${readableType(variation.type)}`}
              onClick={() => {
                props.onRemove(id)
              }}
            >
              <Cross aria-hidden="true" />
            </button>
          </div>
        )}
      </For>
      <Show when={entries().length === 0}>
        <p class={ui.empty}>
          This transform has no variations. Add one from the sidebar.
        </p>
      </Show>
    </div>
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
  onChange: (affine: AffineParams) => void
}) {
  const controls = () => decomposeAffine(props.affine)
  return (
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
                  [spec.key]: spec.fromDisplay(Number(ev.currentTarget.value)),
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
          props.onChange(
            composeAffine(
              {
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                shear: 0,
                offsetX: 0,
                offsetY: 0,
              },
              props.affine,
            ),
          )
        }}
      >
        Reset
      </button>
    </div>
  )
}

function ColourPanel(props: {
  transform: { color: { x: number; y: number }; colorSpeed?: number }
  onColor: (x: number) => void
  onSpeed: (speed: number) => void
}) {
  return (
    <div class={ui.colour}>
      <label class={ui.field}>
        <span class={ui.fieldLabel}>Colour position</span>
        <input
          class={`${ui.fieldInput} ${ui.colourTrack}`}
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
      <label class={ui.field}>
        <span class={ui.fieldLabel}>Speed</span>
        <input
          class={ui.fieldInput}
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
