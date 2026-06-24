import { createSignal, onMount, Show } from 'solid-js'
import { earthVariantById } from '../lib/earthVariants'
import { applyFlameRecipe, LANDING_FLAMES } from '../lib/flame'
import FlameStage from './FlameStage'
import type { FlameRecipe } from '../lib/flame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Dev-only island for the `poster-capture` page: renders one flame at a high
 * fixed resolution and exposes its live-quality getter on `window` so a headed
 * Playwright script can wait for full convergence, then screenshot the canvas
 * into a poster JPG. Not shipped / linked anywhere.
 *
 * Input modes (all via the URL, read once on mount):
 *  - ?name=<key>     → render LANDING_FLAMES[key] verbatim (poster regen).
 *  - ?variant=<id>   → render an EARTH_VARIANTS entry (variant poster regen).
 *  - ?recipe=<json>  → derive an ad-hoc candidate: {base, transforms?, render?}
 *    overriding transform colors/probabilities (by index) + merging
 *    renderSettings, for previewing tuning candidates. JSON is URL-encoded.
 */
type CaptureRecipe = FlameRecipe & { base: keyof typeof LANDING_FLAMES }
type CaptureWindow = Window & {
  __captureQuality?: () => number
  __captureError?: string
}

export default function PosterCapture() {
  const [flame, setFlame] = createSignal<FlameDescriptor>()
  const [size, setSize] = createSignal(1280)

  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    const s = Number(params.get('size'))
    if (Number.isFinite(s) && s > 0) setSize(s)
    const fail = (msg: string) => {
      ;(window as CaptureWindow).__captureError = msg
    }

    const recipeRaw = params.get('recipe')
    const variantId = params.get('variant')
    const name = params.get('name') ?? ''

    if (recipeRaw) {
      try {
        const r = JSON.parse(recipeRaw) as CaptureRecipe
        setFlame(applyFlameRecipe(LANDING_FLAMES[r.base], r))
      } catch {
        fail('bad recipe json')
      }
    } else if (variantId) {
      const v = earthVariantById(variantId)
      if (v) setFlame(v.flame)
      else fail(`unknown variant: ${variantId}`)
    } else if (name in LANDING_FLAMES) {
      setFlame(LANDING_FLAMES[name as keyof typeof LANDING_FLAMES])
    } else {
      fail(`unknown flame: ${name}`)
    }
  })

  return (
    <Show when={flame()}>
      {(f) => (
        <div
          style={{
            width: `${size()}px`,
            height: `${size()}px`,
            background: '#000',
          }}
        >
          <FlameStage
            flame={f()}
            quality={0.995}
            pointCountPerBatch={256}
            canvasClass="plate-canvas"
            fixedResolution={{ width: size(), height: size() }}
            onQualityGetter={(get) => {
              ;(window as CaptureWindow).__captureQuality = get
            }}
          />
        </div>
      )}
    </Show>
  )
}
