import { createSignal, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { createCompletedThroughputTracker } from '@/benchmarks/completedThroughput'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import type { CompletedThroughput } from '@/benchmarks/completedThroughput'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type BenchmarkHostResult = CompletedThroughput & {
  /** Small deterministic readback of the last presented frame, for A/B smoke checks. */
  signature?: readonly number[]
}

type BenchmarkRunnerHostProps = {
  flame: FlameDescriptor
  width: number
  height: number
  pointCountPerBatch: number
  minimumCompletedPoints: number
  minimumElapsedMs: number
  maximumElapsedMs: number
  stochasticFilterEnabled: boolean
  persistChains: boolean
  onProgress: (result: CompletedThroughput) => void
  onComplete: (result: BenchmarkHostResult) => void
  onError: (error: unknown) => void
}

const SIGNATURE_SIZE = 24

/**
 * Copies a tiny luminance signature while the queue-completed canvas is still
 * mounted. It is intentionally not a pixel-perfect oracle: stochastic
 * reconstruction and RNG experiments may be visually valid without matching
 * pixels. The Variation Lab uses it as a smoke check for blank/failed output.
 */
function captureCanvasSignature(
  source: HTMLCanvasElement | undefined,
): readonly number[] | undefined {
  if (!source || source.width === 0 || source.height === 0) return undefined

  try {
    const sample = document.createElement('canvas')
    sample.width = SIGNATURE_SIZE
    sample.height = SIGNATURE_SIZE
    const context = sample.getContext('2d', { willReadFrequently: true })
    if (!context) return undefined
    context.drawImage(source, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE)
    const pixels = context.getImageData(
      0,
      0,
      SIGNATURE_SIZE,
      SIGNATURE_SIZE,
    ).data
    const signature = new Array<number>(SIGNATURE_SIZE * SIGNATURE_SIZE)
    for (let index = 0; index < signature.length; index += 1) {
      const offset = index * 4
      signature[index] =
        pixels[offset]! * 0.2126 +
        pixels[offset + 1]! * 0.7152 +
        pixels[offset + 2]! * 0.0722
    }
    return signature
  } catch {
    // Some browser/driver combinations do not expose the current WebGPU
    // swap-chain image to 2D readback. Throughput remains valid in that case.
    return undefined
  }
}

export function BenchmarkRunnerHost(props: BenchmarkRunnerHostProps) {
  const tracker = createCompletedThroughputTracker()
  const [stopped, setStopped] = createSignal(false)
  let canvas: HTMLCanvasElement | undefined
  let completed = false
  let disposed = false
  const watchdog = globalThis.setTimeout(() => {
    if (completed || disposed) return
    completed = true
    setStopped(true)
    props.onError(
      new Error(
        `Benchmark sample exceeded its ${(props.maximumElapsedMs / 1000).toFixed(0)} s watchdog.`,
      ),
    )
  }, props.maximumElapsedMs)

  onCleanup(() => {
    disposed = true
    completed = true
    globalThis.clearTimeout(watchdog)
  })

  function fail(error: unknown): void {
    if (completed || disposed) return
    completed = true
    globalThis.clearTimeout(watchdog)
    setStopped(true)
    props.onError(error)
  }

  const flameView = () => (
    <Flam3
      quality={0.999}
      pointCountPerBatch={props.pointCountPerBatch}
      renderInterval={0}
      adaptiveFilterEnabled={false}
      stochasticFilterEnabled={props.stochasticFilterEnabled}
      animationEnabled={false}
      flameDescriptor={props.flame}
      edgeFadeColor={vec4f(0)}
      exportDriver={true}
      disableQualityLimit={true}
      persistChains={props.persistChains}
      onCompletedPointCount={(info) => {
        if (completed || disposed || stopped()) return
        try {
          const result = tracker.observe(info)
          if (!result) return
          if (
            result.points >= props.minimumCompletedPoints &&
            result.elapsedMs >= props.minimumElapsedMs
          ) {
            const signature = captureCanvasSignature(canvas)
            completed = true
            globalThis.clearTimeout(watchdog)
            setStopped(true)
            // UI work happens only after the scored interval has closed.
            props.onProgress(result)
            props.onComplete({
              ...result,
              signature,
            })
          }
        } catch (error) {
          fail(error)
        }
      }}
      onCompletedPointCountError={fail}
    />
  )

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        width: '1px',
        height: '1px',
        left: '-10000px',
        top: '-10000px',
        overflow: 'hidden',
        'pointer-events': 'none',
      }}
    >
      <Show when={!stopped()}>
        <AutoCanvas
          ref={(element) => {
            canvas = element
          }}
          fixedResolution={{ width: props.width, height: props.height }}
          pixelRatio={1}
          alphaMode="opaque"
        >
          <Show
            when={(props.flame.renderSettings.dimensions ?? 2) === 3}
            fallback={
              <Camera2D
                position={vec2f(...props.flame.renderSettings.camera.position)}
                zoom={props.flame.renderSettings.camera.zoom}
              >
                {flameView()}
              </Camera2D>
            }
          >
            <Default3DPreviewCamera
              camera3D={props.flame.renderSettings.camera3D}
            >
              {flameView()}
            </Default3DPreviewCamera>
          </Show>
        </AutoCanvas>
      </Show>
    </div>
  )
}
