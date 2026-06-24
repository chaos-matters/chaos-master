import { createEffect, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Portal } from 'solid-js/web'
import { EARTH_VARIANTS } from '../lib/earthVariants'
import { PREVIEW_QUALITY } from '../lib/flame'
import OpenInApp from './OpenInApp'
import PosterFlame from './PosterFlame'
import type { EarthVariant } from '../lib/earthVariants'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * "Explore Earth Flame" gallery. A large, continuously-spinning drag-to-orbit
 * view plus a poster-thumbnail strip and an Auto-play button.
 *
 * Every variant shares the same flame STRUCTURE — only transform colors (+ a few
 * probabilities / render scalars) differ — so the live view is one reactive store
 * that we lerp between variants on rAF (the same trick as the Studio "animate"
 * button); no pipeline recompile, no remount. Auto-play cycles through all six on
 * a loop; clicking a thumbnail pauses and morphs to it. Portal'd to <body>; one
 * live flame at a time, with poster fallback.
 */
const MORPH_MS = 1800
const HOLD_MS = 1400
// renderSettings scalars that differ across variants — morphed alongside colors.
const RENDER_KEYS = ['exposure', 'vibrancy', 'contrast', 'gamma'] as const

type Vals = {
  t: { x: number; y: number; p: number }[]
  r: number[]
}

export default function EarthVariantsModal(props: {
  open: boolean
  onClose: () => void
  initialId?: string
}) {
  const initial = (): EarthVariant =>
    EARTH_VARIANTS.find((v) => v.id === props.initialId) ?? EARTH_VARIANTS[0]

  const [selectedId, setSelectedId] = createSignal(initial().id)
  const [playing, setPlaying] = createSignal(false)
  const selected = (): EarthVariant =>
    EARTH_VARIANTS.find((v) => v.id === selectedId()) ?? EARTH_VARIANTS[0]

  // The single live flame — a clone we mutate in place so swaps/morphs never
  // remount the renderer.
  const [flame, setFlame] = createStore<FlameDescriptor>(
    structuredClone(initial().flame),
  )
  const tids = Object.keys(flame.transforms)

  const valsOf = (f: FlameDescriptor): Vals => ({
    t: tids.map((tid) => {
      const tr = f.transforms[tid]
      return { x: tr.color.x, y: tr.color.y, p: tr.probability }
    }),
    r: RENDER_KEYS.map((k) => (f.renderSettings[k] as number | undefined) ?? 0),
  })

  const writeVals = (v: Vals) => {
    tids.forEach((tid, i) => {
      setFlame('transforms', tid, 'color', { x: v.t[i].x, y: v.t[i].y })
      setFlame('transforms', tid, 'probability', v.t[i].p)
    })
    RENDER_KEYS.forEach((k, i) => {
      setFlame('renderSettings', k, v.r[i])
    })
  }

  let raf = 0
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  const cancelMorph = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    clearTimeout(holdTimer)
  }

  const morphTo = (target: EarthVariant) => {
    cancelMorph()
    const from = valsOf(flame)
    const to = valsOf(target.flame)
    const start = globalThis.performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MORPH_MS)
      const e = t * t * (3 - 2 * t) // smoothstep
      writeVals({
        t: from.t.map((f, i) => ({
          x: f.x + (to.t[i].x - f.x) * e,
          y: f.y + (to.t[i].y - f.y) * e,
          p: f.p + (to.t[i].p - f.p) * e,
        })),
        r: from.r.map((f, i) => f + (to.r[i] - f) * e),
      })
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = 0
        if (playing()) holdTimer = setTimeout(advance, HOLD_MS)
      }
    }
    raf = requestAnimationFrame(tick)
  }

  function advance() {
    const i = EARTH_VARIANTS.findIndex((v) => v.id === selectedId())
    const next = EARTH_VARIANTS[(i + 1) % EARTH_VARIANTS.length]
    setSelectedId(next.id)
    morphTo(next)
  }

  function togglePlay() {
    if (playing()) {
      setPlaying(false)
      cancelMorph()
    } else {
      setPlaying(true)
      advance()
    }
  }

  function pick(v: EarthVariant) {
    setPlaying(false)
    cancelMorph()
    setSelectedId(v.id)
    morphTo(v)
  }

  // Reset to the initial variant whenever the modal opens; stop everything on
  // close.
  createEffect(() => {
    if (props.open) {
      cancelMorph()
      setPlaying(false)
      setSelectedId(initial().id)
      writeVals(valsOf(initial().flame))
    } else {
      cancelMorph()
      setPlaying(false)
    }
  })

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => {
      window.removeEventListener('keydown', onKey)
    })
  })

  createEffect(() => {
    document.body.style.overflow = props.open ? 'hidden' : ''
  })
  onCleanup(() => {
    cancelMorph()
    document.body.style.overflow = ''
  })

  return (
    <Show when={props.open}>
      <Portal>
        <div class="ev-backdrop" onClick={props.onClose}>
          <div
            class="ev-modal"
            role="dialog"
            aria-label="Explore Earth Flame variants"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div class="ev-head">
              <div>
                <p class="ev-kicker">Explore Earth Flame</p>
                <h3 class="ev-title">{selected().name}</h3>
                <p class="ev-tag">{selected().tag}</p>
              </div>
              <div class="ev-actions">
                <button
                  class="ev-play"
                  classList={{ playing: playing() }}
                  type="button"
                  onClick={togglePlay}
                >
                  <Show
                    when={playing()}
                    fallback={
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
                      </svg>
                    }
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <rect
                        x="4"
                        y="3.5"
                        width="2.6"
                        height="9"
                        fill="currentColor"
                      />
                      <rect
                        x="9.4"
                        y="3.5"
                        width="2.6"
                        height="9"
                        fill="currentColor"
                      />
                    </svg>
                  </Show>
                  <span class="ev-play-label">
                    {playing() ? 'Pause' : 'Auto-play'}
                  </span>
                </button>
                <button
                  class="ev-close"
                  type="button"
                  aria-label="Close"
                  onClick={props.onClose}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div
              class="ev-stage"
              onContextMenu={(e) => {
                e.preventDefault()
              }}
            >
              <PosterFlame
                flame={flame}
                poster={selected().poster}
                posterClass="plate-canvas"
                quality={PREVIEW_QUALITY}
                canvasClass="plate-canvas"
                interactive3D
                autoSpinAlways
                alphaMode="premultiplied"
                outputAlpha
              />
              <span class="ev-stage-hint">
                drag to orbit · scroll / pinch to zoom
              </span>
              <OpenInApp flame={selected().flame} />
            </div>

            <div class="ev-thumbs">
              <For each={EARTH_VARIANTS}>
                {(v) => (
                  <button
                    class="ev-thumb"
                    classList={{ active: v.id === selectedId() }}
                    type="button"
                    title={v.name}
                    onClick={() => {
                      pick(v)
                    }}
                  >
                    <img src={v.poster} alt={v.name} loading="lazy" />
                    <span>{v.name}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
