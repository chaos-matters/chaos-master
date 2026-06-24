import { createEffect, createMemo, createSignal, onCleanup, Show, splitProps, } from 'solid-js'
import { markLiveRender, webgpuLive } from '../lib/webgpuHealth'
import FlameStage from './FlameStage'
import type { FlameViewProps } from './FlameView'

/** Freeze once the live quality reaches this fraction of its target. */
const FREEZE_QUALITY_FRACTION = 0.98

type PosterFlameProps = FlameViewProps & {
  /** Static poster shown until the live flame has accumulated, and whenever the
   *  live flame can't run (no WebGPU / GPU failure / off-screen). */
  poster: string
  posterAlt?: string
  /** Extra class on the poster <img> (e.g. 'plate-canvas' to match the canvas box). */
  posterClass?: string
  /** Additional live gate beyond WebGPU health — e.g. in-view / ComputeGate. */
  inView?: () => boolean
  /** Once the flame has converged, unmount the live render and keep the static
   *  poster (which is the same converged image) — frees the GPU so it's not
   *  re-rendered forever. ONLY for non-interactive previews; a pannable / orbitable
   *  flame must stay live. */
  freezeWhenConverged?: boolean
}

/**
 * A live GPU flame with a static-poster fallback. The poster sits behind the
 * canvas and is revealed whenever the live render can't run: WebGPU unsupported,
 * a GPU failure (webgpuLive() === false), the card is off-screen, or the flame
 * hasn't accumulated yet. With `freezeWhenConverged`, once the flame reaches its
 * quality target the live render unmounts and the poster takes over for good
 * (same image, zero ongoing GPU) — "live by default, poster on failure, freeze
 * when done".
 */
export default function PosterFlame(props: PosterFlameProps) {
  const [local, viewProps] = splitProps(props, [
    'poster',
    'posterAlt',
    'posterClass',
    'inView',
    'onReady',
    'freezeWhenConverged',
    'onQualityGetter',
  ])

  const [ready, setReady] = createSignal(false)
  const [frozen, setFrozen] = createSignal(false)
  const live = createMemo(
    () => webgpuLive() && (local.inView?.() ?? true) && !frozen(),
  )
  // Reset the poster cross-fade whenever the live flame stops (off-screen or GPU
  // failure) so it re-accumulates from the poster, no blank flash, on re-entry.
  createEffect(() => {
    if (!live()) setReady(false)
  })
  const posterHidden = () => live() && ready()

  let convergeRaf = 0
  onCleanup(() => {
    cancelAnimationFrame(convergeRaf)
  })

  // Flam3 hands us its live-quality getter; when freezing, poll it until the
  // flame has essentially reached its target, then swap to the static poster.
  const onQualityGetter = (get: () => number) => {
    local.onQualityGetter?.(get)
    if (!local.freezeWhenConverged) return
    const target = (viewProps.quality ?? 0.6) * FREEZE_QUALITY_FRACTION
    cancelAnimationFrame(convergeRaf)
    const tick = () => {
      if (frozen() || !live()) return
      if (get() >= target) {
        setFrozen(true)
        return
      }
      convergeRaf = requestAnimationFrame(tick)
    }
    convergeRaf = requestAnimationFrame(tick)
  }

  return (
    <>
      <img
        class={`flame-poster ${local.posterClass ?? ''}`}
        classList={{ 'is-hidden': posterHidden(), 'is-frozen': frozen() }}
        src={local.poster}
        alt={local.posterAlt ?? ''}
        aria-hidden="true"
        loading="lazy"
        draggable={false}
      />
      <Show when={live()}>
        <FlameStage
          {...viewProps}
          onReady={() => {
            markLiveRender()
            setReady(true)
            local.onReady?.()
          }}
          onQualityGetter={onQualityGetter}
        />
      </Show>
    </>
  )
}
