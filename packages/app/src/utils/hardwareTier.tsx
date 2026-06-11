import { qualityPresets } from '@/components/Quality/QualityPresets'
import type { QualityPreset } from '@/components/Quality/QualityPresets'

export type HardwareTier = 'low' | 'mid' | 'high' | 'ultra'

export const hardwareTiers: HardwareTier[] = ['low', 'mid', 'high', 'ultra']

export const hardwareTierToQuality: Record<HardwareTier, number> = {
  low: qualityPresets.low,
  mid: qualityPresets.mid,
  high: qualityPresets.high,
  ultra: qualityPresets.ultra,
}

const HARDWARE_TIER_TO_PRESET: Record<HardwareTier, QualityPreset> = {
  low: 'low',
  mid: 'mid',
  high: 'high',
  ultra: 'ultra',
}

export function hardwareTierToPreset(tier: HardwareTier): QualityPreset {
  return HARDWARE_TIER_TO_PRESET[tier]
}

const DETECTION_SECONDS = 4

function bpsToTier(bps: number): HardwareTier {
  if (bps >= 3) return 'ultra'
  if (bps >= 1) return 'high'
  if (bps >= 0.3) return 'mid'
  return 'low'
}

/**
 * Detect hardware tier by rendering the benchmark flame offscreen for a few
 * seconds and measuring actual BPS (billions of points per second). Uses a
 * hidden SolidJS component tree mounted into a zero-size DOM container so the
 * full Flam3 WebGPU rendering pipeline is exercised — the same code path real
 * rendering uses.
 *
 * Falls back to 'mid' when WebGPU is unavailable, the adapter can't be
 * acquired, or the safety timeout fires.
 */
export async function detectHardwareTier(): Promise<HardwareTier> {
  if (!('gpu' in globalThis.navigator)) return 'mid'

  // Dynamic imports — these modules pull in the WebGPU rendering pipeline and
  // SolidJS component tree. Loading them lazily avoids bloating the initial
  // bundle for returning users who already have a persisted tier.
  const [
    { render },
    { vec2f, vec4f },
    { examples },
    { Flam3 },
    { AutoCanvas },
    { Camera2D },
    { Root },
  ] = await Promise.all([
    import('solid-js/web'),
    import('typegpu/data'),
    import('@/flame/examples'),
    import('@/flame/Flam3'),
    import('@/lib/AutoCanvas'),
    import('@/lib/Camera2D'),
    import('@/lib/Root'),
  ])

  const DEFAULT_POINT_COUNT = 100_000

  const benchmarkFlame = examples.benchmark

  return new Promise((resolve) => {
    const container = document.createElement('div')
    container.style.cssText =
      'position:absolute;width:10px;height:10px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;'
    document.body.appendChild(container)

    let totalPoints = 0
    let startTime = 0
    let running = true

    const dispose = render(
      () => (
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <AutoCanvas
            fixedResolution={{ width: 256, height: 256 }}
            alphaMode="opaque"
          >
            <Camera2D
              position={vec2f(...benchmarkFlame.renderSettings.camera.position)}
              zoom={benchmarkFlame.renderSettings.camera.zoom}
            >
              <Flam3
                quality={0.9}
                pointCountPerBatch={DEFAULT_POINT_COUNT}
                adaptiveFilterEnabled={false}
                animationEnabled={false}
                flameDescriptor={benchmarkFlame}
                renderInterval={0}
                disableQualityLimit={true}
                edgeFadeColor={vec4f(0)}
                palette={() => undefined}
                outputAlpha={false}
                onAccumulatedPointCount={(count: number) => {
                  if (!running) return
                  if (count === 0) return
                  if (startTime === 0) {
                    startTime = globalThis.performance.now()
                  }
                  totalPoints = count
                  const elapsed =
                    (globalThis.performance.now() - startTime) / 1000

                  // Simple throttle for logging every ~1 second
                  if (elapsed >= DETECTION_SECONDS) {
                    running = false
                    const bps = totalPoints / elapsed / 1e9
                    const tier = bpsToTier(bps)
                    dispose()
                    container.remove()
                    resolve(tier)
                  }
                }}
              />
            </Camera2D>
          </AutoCanvas>
        </Root>
      ),
      container,
    )

    setTimeout(
      () => {
        if (running) {
          running = false
          dispose()
          container.remove()
          resolve('mid')
        }
      },
      (DETECTION_SECONDS + 10) * 1000,
    )
  })
}
