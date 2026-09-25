/**
 * The deep-zoom explorer page: a full-bleed canvas, a heads-up readout and
 * a settings panel. The pictures are `ExplorerRenderer`s; this file only
 * owns the state a person can change and how it is shown.
 *
 * The split view puts the Julia set of a point beside the Mandelbrot set. A
 * second renderer draws it, and dragging the point (`JuliaMarker`) across
 * the Mandelbrot pane changes it as you watch.
 */
import { formatMagnification } from '@chaos-master/core'
import { batch, createMemo, createSignal, onCleanup, Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { ChevronLeft, Settings, SplitView } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { downloadBlob } from '@/utils/blob'
import { ExplorerControls } from './ExplorerControls'
import { explorerFileName } from './explorerFileName'
import { createExplorerLocation } from './explorerLocation'
import { explorerMode, withHome, withJuliaFromCentre, withMode, } from './explorerModes'
import { resolvePalette } from './explorerPalette'
import { ExplorerRenderer } from './ExplorerRenderer'
import ui from './FractalExplorerPage.module.css'
import { JuliaMarker, shortComplex } from './JuliaMarker'
import type { ExplorerLocation } from '@chaos-master/core'
import type { Quality } from './ExplorerControls'
import type { ExplorerGpu } from './explorerGpu'
import type { ExplorerMode } from './explorerModes'
import type { ExplorerScene, ExplorerStatus } from './ExplorerRenderer'
import type { ColourSetup } from './explorerTypes'
import type { Palette } from '@/flame/colorMap'

/** Render pixels at most, and supersamples per pixel once finished. */
const QUALITY: Record<Quality, { pixels: number; samples: number }> = {
  fast: { pixels: 640_000, samples: 1 },
  balanced: { pixels: 2_200_000, samples: 8 },
  sharp: { pixels: 4_200_000, samples: 16 },
}

type ReadDisplay = ExplorerGpu['readDisplay']
type Shot = NonNullable<Awaited<ReturnType<ReadDisplay>>>

/** Pictures side by side, or stacked, on one canvas. */
function drawShots(
  shots: readonly Shot[],
  sideBySide: boolean,
): HTMLCanvasElement | undefined {
  const widths = shots.map((s) => s.size.width)
  const heights = shots.map((s) => s.size.height)
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
  const canvas = document.createElement('canvas')
  canvas.width = sideBySide ? sum(widths) : Math.max(...widths)
  canvas.height = sideBySide ? Math.max(...heights) : sum(heights)
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  let at = 0
  for (const shot of shots) {
    const { width, height } = shot.size
    const image = new ImageData(shot.data, width, height)
    ctx.putImageData(image, sideBySide ? at : 0, sideBySide ? 0 : at)
    at += sideBySide ? width : height
  }
  return canvas
}

function ProgressBar(props: { value: number }) {
  return (
    <div
      class={ui.progress}
      style={{ transform: `scaleX(${props.value})` }}
      data-done={props.value >= 1 ? '' : undefined}
      aria-hidden="true"
    />
  )
}

const PAN_HINT =
  'Drag or use the arrow keys to pan; scroll, pinch or press plus and minus to zoom.'

export function FractalExplorerPage() {
  const { showToast } = useToast()
  const previousTitle = document.title
  document.title = 'Mandelbrot Explorer — Lumen Apeiron'
  onCleanup(() => {
    document.title = previousTitle
  })
  const { location, update, link } = createExplorerLocation()
  const [picked, setPicked] = createSignal<Palette | undefined>()
  // Read from the location, so a link pasted into this tab brings its
  // palette along with its view. The id has a memo of its own: a custom
  // palette is parsed from storage into a new object on every lookup, and
  // each new object recolours both panes, so a pan or a move of the point
  // must not reach the lookup.
  const paletteId = createMemo(() => location().paletteId)
  const palette = createMemo(() => resolvePalette(paletteId(), picked()))
  // The colour settings are part of the location too, so a link brings the
  // look along with the view. A memo each: a pan makes a new location, and
  // the colour pass must not hear about it.
  const colourCycle = createMemo(() => location().colourCycle)
  const colourShift = createMemo(() => location().colourShift)
  const relief = createMemo(() => location().relief)
  const [quality, setQuality] = createSignal<Quality>('balanced')
  const [panelOpen, setPanelOpen] = createSignal(
    typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 900px)').matches,
  )
  const [status, setStatus] = createSignal<ExplorerStatus | undefined>()
  const [juliaStatus, setJuliaStatus] = createSignal<
    ExplorerStatus | undefined
  >()
  const readers: { main?: ReadDisplay; julia?: ReadDisplay } = {}
  let mainPane: HTMLDivElement | undefined
  let juliaPane: HTMLDivElement | undefined

  const split = () => location().split
  const mode = () => explorerMode(location())

  const scene = createMemo<ExplorerScene>(() => {
    const l = location()
    return {
      kind: l.split ? 'mandelbrot' : l.kind,
      view: l.view,
      juliaC: l.juliaC,
      maxIterations: l.maxIterations,
    }
  })

  const juliaScene = createMemo<ExplorerScene>(() => {
    const l = location()
    return {
      kind: 'julia',
      view: l.juliaView,
      juliaC: l.juliaC,
      maxIterations: l.maxIterations,
    }
  })

  // Each pane of the split gets half the pixels, so the two together cost
  // what one full view does.
  const pixelCap = () => QUALITY[quality()].pixels / (split() ? 2 : 1)
  const samples = () => QUALITY[quality()].samples

  const colour = createMemo<ColourSetup>(() => ({
    period: colourCycle(),
    phase: colourShift(),
    relief: relief(),
    interior: [0.015, 0.015, 0.02],
    background: [0.05, 0.055, 0.07],
  }))

  /** Moves to a location from explorerModes.ts; the same one is no change. */
  function go(next: ExplorerLocation) {
    if (next !== location()) update(next)
  }

  function setMode(next: ExplorerMode) {
    go(withMode(location(), next))
  }

  async function copyLink() {
    try {
      await globalThis.navigator.clipboard.writeText(link())
      showToast('Link copied: it reopens this view in these colours.')
    } catch {
      showToast(
        'Could not reach the clipboard. The address bar has the same link.',
      )
    }
  }

  async function savePicture() {
    const main = await readers.main?.()
    if (!main) return
    const julia = split() ? await readers.julia?.() : undefined
    // Stacked panes (a portrait screen) save stacked.
    const sideBySide =
      !mainPane || !juliaPane || juliaPane.offsetLeft > mainPane.offsetLeft
    const canvas = drawShots(julia ? [main, julia] : [main], sideBySide)
    // Named for the moment Save was pressed, not when the encoder finished.
    const fileName = explorerFileName(location(), new Date())
    canvas?.toBlob((blob) => {
      if (blob) downloadBlob(blob, fileName)
    }, 'image/png')
  }

  const progress = () => status()?.progress ?? 0
  /** The heads-up Done readout: why the picture stopped, or how far it got. */
  const done = () => {
    if (status()?.error) return 'Error'
    if (status()?.orbitPending) return 'Reference'
    return `${Math.floor(progress() * 100)}%`
  }

  return (
    <div
      class={ui.page}
      data-split={split() ? '' : undefined}
      data-panel={panelOpen() ? '' : undefined}
    >
      <div class={ui.stage}>
        <div ref={mainPane} class={ui.pane}>
          <AutoCanvas
            class={ui.canvas}
            pixelRatio={window.devicePixelRatio || 1}
            role="application"
            ariaLabel={
              split()
                ? `Mandelbrot set. ${PAN_HINT} Move the ring, or drag with the right mouse button, to choose the Julia set beside it.`
                : `Fractal view. ${PAN_HINT}`
            }
          >
            <ExplorerRenderer
              scene={scene}
              setView={(view) => {
                update({ view })
              }}
              colour={colour}
              palette={palette}
              pixelCap={pixelCap}
              samples={samples}
              onStatus={setStatus}
              onReady={(api) => {
                readers.main = api.readDisplay
              }}
            />
            <Show when={split()}>
              <JuliaMarker
                view={() => location().view}
                point={() => location().juliaC}
                setPoint={(juliaC) => {
                  update({ juliaC })
                }}
              />
            </Show>
          </AutoCanvas>
          <ProgressBar value={progress()} />
        </div>

        <Show when={split()}>
          <div ref={juliaPane} class={ui.pane}>
            <AutoCanvas
              class={ui.canvas}
              pixelRatio={window.devicePixelRatio || 1}
              role="application"
              ariaLabel={`Julia set of the point. ${PAN_HINT}`}
            >
              <ExplorerRenderer
                scene={juliaScene}
                setView={(juliaView) => {
                  update({ juliaView })
                }}
                colour={colour}
                palette={palette}
                pixelCap={pixelCap}
                samples={samples}
                onStatus={setJuliaStatus}
                onReady={(api) => {
                  readers.julia = api.readDisplay
                }}
                debugName="__explorerJuliaDebug"
              />
            </AutoCanvas>
            <ProgressBar value={juliaStatus()?.progress ?? 0} />
            <p class={ui.paneLabel}>
              Julia set, c = {shortComplex(location().juliaC)}
            </p>
          </div>
        </Show>
      </div>

      <header class={ui.hud}>
        <a class={ui.iconButton} href="/" aria-label="Back to Lumen Apeiron">
          <ChevronLeft />
        </a>
        <div class={ui.titleBlock}>
          <span class={ui.title}>Deep zoom</span>
          <span class={ui.subtitle}>
            {split()
              ? 'Mandelbrot and Julia'
              : location().kind === 'julia'
                ? 'Julia set'
                : 'Mandelbrot set'}
          </span>
        </div>
        <dl class={ui.readouts}>
          <div>
            <dt>Zoom</dt>
            <dd>{formatMagnification(location().view.zoomLog2)}</dd>
          </div>
          <div>
            <dt>Done</dt>
            <dd>{done()}</dd>
          </div>
        </dl>
        <button
          type="button"
          class={ui.iconButton}
          aria-label="Show the Julia set of a point beside the Mandelbrot set"
          aria-pressed={split()}
          onClick={() => {
            setMode(split() ? 'mandelbrot' : 'split')
          }}
        >
          <SplitView />
        </button>
        <button
          type="button"
          class={ui.iconButton}
          aria-label={panelOpen() ? 'Hide settings' : 'Show settings'}
          aria-expanded={panelOpen()}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <Settings />
        </button>
      </header>

      <Show when={panelOpen()}>
        <aside class={ui.panel} aria-label="Explorer settings">
          <ExplorerControls
            location={location()}
            mode={mode()}
            status={status()}
            palette={palette()}
            period={colourCycle()}
            phase={colourShift()}
            relief={relief()}
            quality={quality()}
            onMode={setMode}
            onJuliaC={(juliaC) => {
              update({ juliaC })
            }}
            onJuliaHere={() => {
              go(withJuliaFromCentre(location()))
            }}
            onIterations={(maxIterations) => {
              update({ maxIterations })
            }}
            onPalette={(next) => {
              // Together, or the old id is looked up again in between and
              // both panes recolour twice.
              batch(() => {
                setPicked(next)
                update({ paletteId: next.id })
              })
            }}
            onPeriod={(colourCycle) => {
              update({ colourCycle })
            }}
            onPhase={(colourShift) => {
              update({ colourShift })
            }}
            onRelief={(relief) => {
              update({ relief })
            }}
            onQuality={setQuality}
            onHome={() => {
              go(withHome(location()))
            }}
            onCopyLink={() => void copyLink()}
            onSave={() => void savePicture()}
          />
        </aside>
      </Show>
    </div>
  )
}
