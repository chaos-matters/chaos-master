import { createSignal, Show } from 'solid-js'
import { example46 } from '@/flame/examples/example46'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { posterFor, PREVIEW_QUALITY, ROSE_LANDING } from '../lib/flame'
import EarthVariantsModal from './EarthVariantsModal'
import OpenInApp from './OpenInApp'
import PosterFlame from './PosterFlame'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * A drag-to-orbit 3D flame for the community showcase cards. Reuses the app's
 * real renderer (Flam3) + WheelZoomCamera3D via FlameView's interactive3D, with a
 * premultiplied (transparent) canvas so the deep-space tint behind it shows
 * through. A static poster (the default preview angle) shows until the live flame
 * converges, and whenever WebGPU is unavailable / has failed; the live flame
 * mounts only while the card is on-screen so concurrent GPU contexts stay
 * bounded. The "Open in app" link is always present.
 */
const FLAMES: Record<string, FlameDescriptor> = {
  earth: example46,
  rose: ROSE_LANDING,
}

export default function OrbitFlame(props: { which: 'earth' | 'rose' }) {
  const flame = FLAMES[props.which]
  const [container, setContainer] = createSignal<HTMLElement>()
  const intersection = useIntersectionObserver(container)
  const visible = () => intersection()?.isIntersecting ?? false
  const [explore, setExplore] = createSignal(false)

  return (
    <div
      class="orbit-mount"
      ref={setContainer}
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      <PosterFlame
        flame={flame}
        poster={posterFor(props.which)}
        posterClass="plate-canvas"
        inView={visible}
        quality={PREVIEW_QUALITY}
        canvasClass="plate-canvas"
        interactive3D
        autoSpin
        alphaMode="premultiplied"
        outputAlpha
      />
      <OpenInApp flame={flame} />
      <Show when={props.which === 'earth'}>
        <button
          class="explore-btn"
          type="button"
          onClick={() => setExplore(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect
              x="3"
              y="3"
              width="7"
              height="7"
              rx="1.6"
              fill="currentColor"
            />
            <rect
              x="14"
              y="3"
              width="7"
              height="7"
              rx="1.6"
              fill="currentColor"
            />
            <rect
              x="3"
              y="14"
              width="7"
              height="7"
              rx="1.6"
              fill="currentColor"
            />
            <rect
              x="14"
              y="14"
              width="7"
              height="7"
              rx="1.6"
              fill="currentColor"
            />
          </svg>
          Explore Earth Flame
        </button>
        <EarthVariantsModal
          open={explore()}
          onClose={() => setExplore(false)}
        />
      </Show>
    </div>
  )
}
