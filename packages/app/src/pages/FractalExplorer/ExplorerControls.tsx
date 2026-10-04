/**
 * The explorer's settings panel: which fractal, the Julia constant, the
 * iteration limit, colouring, render quality, and the view actions.
 */
import { clampIterations, explorerDecimal, MAX_COLOUR_CYCLE, MIN_COLOUR_CYCLE, } from '@chaos-master/core'
import { createSignal, For, Show } from 'solid-js'
import { PaletteSelector } from '@/components/PaletteSelector/PaletteSelector'
import { Slider } from '@/components/Sliders/Slider'
import { Copy, DeepZoom, Download, Home, Minus, Plus } from '@/icons'
import { createInputScrub } from '@/utils/createInputScrub'
import { C_PER_PIXEL, clampedLog2, PIXELS_PER_DOUBLING, scrubbedDecimal, scrubbedIterations, } from './explorerScrub'
import ui from './FractalExplorerPage.module.css'
import type { ComplexString, ExplorerLocation } from '@chaos-master/core'
import type { ExplorerMode } from './explorerModes'
import type { ExplorerStatus } from './ExplorerRenderer'
import type { Palette } from '@/flame/colorMap'

/** How hard the explorer works on a picture: its pixel budget and supersamples. */
export type Quality = 'fast' | 'balanced' | 'sharp'

export interface ExplorerControlsProps {
  location: ExplorerLocation
  mode: ExplorerMode
  status: ExplorerStatus | undefined
  palette: Palette
  period: number
  phase: number
  relief: number
  quality: Quality
  onMode: (mode: ExplorerMode) => void
  onJuliaC: (c: ComplexString) => void
  onJuliaHere: () => void
  onIterations: (n: number) => void
  onPalette: (palette: Palette) => void
  onPeriod: (period: number) => void
  onPhase: (phase: number) => void
  onRelief: (relief: number) => void
  onQuality: (quality: Quality) => void
  onHome: () => void
  onCopyLink: () => void
  onSave: () => void
}

const MODES: { id: ExplorerMode; label: string }[] = [
  { id: 'mandelbrot', label: 'Mandelbrot' },
  { id: 'julia', label: 'Julia' },
  { id: 'split', label: 'Both' },
]

const QUALITIES: { id: Quality; label: string }[] = [
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'sharp', label: 'Sharp' },
]

function Segmented<T extends string>(props: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div class={ui.segmented} role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === option.id}
            class={ui.segment}
            onClick={() => {
              props.onChange(option.id)
            }}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  )
}

/**
 * A decimal field that only commits text that parses. Dragged sideways, it
 * scrubs the value instead.
 */
function DecimalField(props: {
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = createSignal<string | undefined>()
  const text = () => draft() ?? props.value
  const valid = () => explorerDecimal(text()) !== undefined
  let dragged = 0
  const scrub = createInputScrub({
    onStart: () => {
      dragged = Number(props.value)
    },
    onScrub: (dx) => {
      dragged += dx * C_PER_PIXEL
      const next = scrubbedDecimal(dragged)
      if (next !== undefined && next !== props.value) props.onCommit(next)
    },
  })
  return (
    <label class={ui.field}>
      <span class={ui.fieldLabel}>{props.label}</span>
      <input
        class={ui.input}
        inputmode="decimal"
        spellcheck={false}
        value={text()}
        aria-invalid={!valid()}
        onPointerDown={scrub}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onChange={() => {
          const value = explorerDecimal(text())
          if (value !== undefined) props.onCommit(value)
          setDraft(undefined)
        }}
      />
    </label>
  )
}

function statusLine(status: ExplorerStatus | undefined): string {
  if (!status) return 'Starting the GPU'
  if (status.error) return `Error: ${status.error}`
  if (status.orbitPending) {
    return `Computing the reference orbit, ${Math.floor(status.orbitProgress * 100)}%`
  }
  const orbit =
    status.orbitMs === undefined
      ? ''
      : `, reference in ${Math.round(status.orbitMs)} ms`
  const samples =
    status.sampleTarget > 1
      ? `, ${status.samples} of ${status.sampleTarget} samples`
      : ''
  const cap =
    status.iterationCap === undefined
      ? ''
      : `. This GPU holds orbits of ${status.iterationCap} iterations at most`
  return `${status.grid.width} x ${status.grid.height} px, ${status.stepBudget} steps per frame${samples}${orbit}${cap}`
}

export function ExplorerControls(props: ExplorerControlsProps) {
  const iterations = () => props.location.maxIterations
  let draggedLog2 = 0
  const scrubIterations = createInputScrub({
    onStart: () => {
      draggedLog2 = Math.log2(iterations())
    },
    onScrub: (dx) => {
      draggedLog2 = clampedLog2(draggedLog2 + dx / PIXELS_PER_DOUBLING)
      const n = scrubbedIterations(draggedLog2)
      if (n !== iterations()) props.onIterations(n)
    },
  })
  return (
    <div class={ui.controls}>
      <section class={ui.section}>
        <Segmented
          label="Fractal"
          options={MODES}
          value={props.mode}
          onChange={(mode) => {
            props.onMode(mode)
          }}
        />
        <Show when={props.mode !== 'mandelbrot'}>
          <div class={ui.pair}>
            <DecimalField
              label="c, real"
              value={props.location.juliaC.re}
              onCommit={(re) => {
                props.onJuliaC({ ...props.location.juliaC, re })
              }}
            />
            <DecimalField
              label="c, imaginary"
              value={props.location.juliaC.im}
              onCommit={(im) => {
                props.onJuliaC({ ...props.location.juliaC, im })
              }}
            />
          </div>
        </Show>
        <Show when={props.mode !== 'julia'}>
          <button
            type="button"
            class={ui.action}
            onClick={() => {
              props.onJuliaHere()
            }}
          >
            <DeepZoom />
            {props.mode === 'split'
              ? 'Move the point to the view centre'
              : 'Julia set of the view centre'}
          </button>
        </Show>
      </section>

      <section class={ui.section}>
        <span class={ui.fieldLabel}>Iteration limit</span>
        <div class={ui.stepper}>
          <button
            type="button"
            class={ui.iconButton}
            aria-label="Halve the iteration limit"
            onClick={() => {
              props.onIterations(clampIterations(iterations() / 2))
            }}
          >
            <Minus />
          </button>
          <input
            class={ui.input}
            inputmode="numeric"
            value={iterations()}
            aria-label="Iteration limit"
            onPointerDown={scrubIterations}
            onChange={(e) => {
              // Number('') is 0, so an emptied field would commit the lowest
              // limit; blank goes back to the limit, like text that is no
              // number at all.
              const text = e.currentTarget.value.trim()
              const n = Number(text)
              if (text !== '' && Number.isFinite(n)) {
                props.onIterations(clampIterations(n))
              }
              e.currentTarget.value = String(iterations())
            }}
          />
          <button
            type="button"
            class={ui.iconButton}
            aria-label="Double the iteration limit"
            onClick={() => {
              props.onIterations(clampIterations(iterations() * 2))
            }}
          >
            <Plus />
          </button>
        </div>
      </section>

      <section class={ui.section}>
        <Slider
          label="Colour cycle"
          value={Math.log2(props.period)}
          min={Math.log2(MIN_COLOUR_CYCLE)}
          max={Math.log2(MAX_COLOUR_CYCLE)}
          step={0.05}
          formatValue={(v) => `${Math.round(2 ** v)}`}
          onInput={(v) => {
            props.onPeriod(2 ** v)
          }}
        />
        <Slider
          label="Colour shift"
          value={props.phase}
          min={0}
          max={1}
          step={0.005}
          onInput={(v) => {
            props.onPhase(v)
          }}
        />
        <Slider
          label="Relief"
          value={props.relief}
          min={0}
          max={1}
          step={0.01}
          onInput={(v) => {
            props.onRelief(v)
          }}
        />
      </section>

      <section class={ui.section}>
        <span class={ui.fieldLabel}>Render quality</span>
        <Segmented
          label="Render quality"
          options={QUALITIES}
          value={props.quality}
          onChange={(q) => {
            props.onQuality(q)
          }}
        />
      </section>

      <section class={ui.section}>
        <div class={ui.actions}>
          <button
            type="button"
            class={ui.action}
            onClick={() => {
              props.onHome()
            }}
          >
            <Home />
            Home
          </button>
          <button
            type="button"
            class={ui.action}
            onClick={() => {
              props.onCopyLink()
            }}
          >
            <Copy />
            Copy link
          </button>
          <button
            type="button"
            class={ui.action}
            onClick={() => {
              props.onSave()
            }}
          >
            <Download />
            Save PNG
          </button>
        </div>
        <p class={ui.status}>{statusLine(props.status)}</p>
        <p class={ui.hint}>
          Drag to pan. Scroll or pinch to zoom. Double-click zooms in, with
          Shift out. Drag a number field sideways to change it, with Shift in
          finer steps.
          {props.mode === 'split'
            ? ' Drag the ring on the Mandelbrot set, or drag there with the right mouse button, to choose c.'
            : ''}
        </p>
      </section>

      <section class={ui.section}>
        <span class={ui.fieldLabel}>Palette</span>
        <PaletteSelector
          selectedPaletteId={props.palette.id}
          onSelect={(p) => {
            props.onPalette(p)
          }}
        />
      </section>
    </div>
  )
}
