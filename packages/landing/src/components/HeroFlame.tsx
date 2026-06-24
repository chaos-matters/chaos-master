import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { example45 } from '@/flame/examples/example45'
import { PREVIEW_QUALITY } from '../lib/flame'
import { markLiveRender, webgpuLive } from '../lib/webgpuHealth'
import FlameStage from './FlameStage'
import { createFlameParallax } from './useFlameParallax'

/**
 * Live, real-time GPU flame for the hero — the same renderer the editor draws
 * with, reused via FlameStage. Mounted as a `client:only="solid-js"` island.
 *
 * The hero poster (hero-flame.jpg, a render of this same example45) sits behind
 * this island in Hero.astro as the fallback. Once the flame accumulates we flag
 * the hero (`is-gpu-ready`) so the poster cross-fades out; if WebGPU is
 * unavailable or later fails (webgpuLive() === false) we don't mount / we drop
 * the flag so the poster stays. The cursor parallaxes the camera over the flame.
 */
export default function HeroFlame() {
  const cameraPosition = createFlameParallax({
    selector: '.hero',
    base: example45.renderSettings.camera.position,
  })

  const [ready, setReady] = createSignal(false)
  // Don't render the hero flame while it's scrolled out of view (the static
  // hero-flame.jpg poster behind it shows instead).
  const [inView, setInView] = createSignal(true)
  onMount(() => {
    const hero = document.querySelector('.hero')
    if (!hero) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting)
      },
      { rootMargin: '200px' },
    )
    io.observe(hero)
    onCleanup(() => {
      io.disconnect()
    })
  })

  // Only hide the poster while the live flame is actually running AND converged;
  // a GPU failure / scroll-away flips this false → poster shows.
  createEffect(() => {
    const show = webgpuLive() && inView() && ready()
    document.querySelector('.hero')?.classList.toggle('is-gpu-ready', show)
  })

  return (
    <Show when={webgpuLive() && inView()}>
      <FlameStage
        flame={example45}
        quality={PREVIEW_QUALITY}
        canvasClass="hero-gpu-canvas"
        cameraPosition={cameraPosition}
        onReady={() => {
          markLiveRender()
          setReady(true)
        }}
      />
    </Show>
  )
}
