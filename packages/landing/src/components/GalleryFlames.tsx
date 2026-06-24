import { createMemo, createSignal, For } from 'solid-js'
import { ComputeGate, useComputeGate } from '@/contexts/ComputeGateContext'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { LANDING_FLAMES, posterFor, PREVIEW_QUALITY, PREVIEW_QUALITY_IDLE, variationSummary, } from '../lib/flame'
import OpenInApp from './OpenInApp'
import PosterFlame from './PosterFlame'

/**
 * Gallery grid as a single Solid island so every live preview shares one
 * <ComputeGate> (mirrors the editor's LoadFlameModal). Each plate renders the
 * app's real Flam3 via PosterFlame — a static poster shows until the live flame
 * converges (and whenever WebGPU is unavailable / has failed); the live flame
 * mounts only once scrolled into view and unmounts when scrolled away, so
 * concurrent GPU contexts stay bounded.
 *
 * Flames are pulled from LANDING_FLAMES by name (the single source of truth), so
 * any landing-only overrides (e.g. NAUTILUS_LANDING) render here AND match the
 * captured poster of the same name.
 */
type Plate = {
  name: keyof typeof LANDING_FLAMES
  cls: string
  title: string
  /** Interactive 3D plate: hover-spin (desktop) / tap-to-spin (touch) +
   *  drag-orbit + pinch-zoom, like the community cards. */
  spin?: boolean
}

const PLATES: Plate[] = [
  { name: 'example1', cls: 'wide span8', title: 'First Light' },
  { name: 'example29', cls: 'tall span4', title: 'Aurora Drift' },
  { name: 'example33', cls: 'span4', title: 'Ember Lattice', spin: true },
  { name: 'example40', cls: 'span4', title: 'Tidal Bloom' },
  { name: 'example45', cls: 'span4', title: 'Spectrum Swirl' },
]

// Cursor-following 3D tilt for the gallery plates (mouse only; skipped under
// prefers-reduced-motion). Applied as an inline transform that supersedes the
// CSS :hover lift while pointing, cleared on leave so CSS eases it back.
const TILT_DEG = 7
const prefersReducedMotion = () =>
  typeof globalThis.matchMedia === 'function' &&
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches

function tiltPlate(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || prefersReducedMotion()) return
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  el.style.transition = 'transform 0.1s ease-out'
  el.style.transform =
    `perspective(900px) rotateX(${(-py * TILT_DEG).toFixed(2)}deg) ` +
    `rotateY(${(px * TILT_DEG).toFixed(2)}deg) translateY(-6px) scale(1.02)`
}

function untiltPlate(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.style.transition = '' // fall back to the CSS transform transition (0.3s)
  el.style.transform = ''
}

function PlatePreview(props: { plate: Plate }) {
  const flame = () => LANDING_FLAMES[props.plate.name]
  const [container, setContainer] = createSignal<HTMLElement>()
  const intersection = useIntersectionObserver(container)
  const isVisible = createMemo(() => intersection()?.isIntersecting ?? false)
  const allowed = useComputeGate(() => ({
    isVisible: isVisible(),
    renderStatus: 'done' as const,
    isSelected: false,
  }))

  // Render only while visible (or gate-allowed) and UNMOUNT when scrolled away,
  // so the number of concurrent live GPU flames stays bounded to a viewport —
  // weak WebGPU impls (Firefox/Linux/AMD) OOM with many at once. The poster
  // bridges the re-accumulation on re-entry (no blank flash).
  const [hovered, setHovered] = createSignal(false)

  // Hoist conditional flame props into memos owned by this component. Passed
  // straight as a JSX prop, a ternary compiles to a lazily-created memo that
  // Flam3's rAF loop reads first (ownerless) → Solid's "computations created
  // outside a createRoot … will never be disposed" leak warning.
  // See memory: solid-conditional-prop-memo-leak.
  const quality = createMemo(() =>
    props.plate.spin
      ? hovered()
        ? PREVIEW_QUALITY
        : PREVIEW_QUALITY_IDLE
      : PREVIEW_QUALITY,
  )
  const alphaMode = createMemo<GPUCanvasAlphaMode | undefined>(() =>
    props.plate.spin ? 'premultiplied' : undefined,
  )

  return (
    <div
      class={`plate ${props.plate.cls}`}
      ref={setContainer}
      onPointerEnter={() => setHovered(true)}
      onPointerMove={props.plate.spin ? undefined : tiltPlate}
      onPointerLeave={(e) => {
        setHovered(false)
        if (!props.plate.spin) untiltPlate(e)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      <PosterFlame
        flame={flame()}
        poster={posterFor(props.plate.name)}
        posterClass="plate-canvas"
        inView={() => allowed() || isVisible()}
        quality={quality()}
        // Still plates: once converged, drop the live canvas and keep the poster
        // (same image, zero ongoing GPU). The spinnable plate stays live.
        freezeWhenConverged={!props.plate.spin}
        canvasClass="plate-canvas"
        interactive3D={props.plate.spin}
        autoSpin={props.plate.spin}
        alphaMode={alphaMode()}
        outputAlpha={props.plate.spin}
      />
      <div class="meta">
        <div>
          <div class="t">{flame().metadata?.name ?? props.plate.title}</div>
          <div class="v">{variationSummary(flame())}</div>
        </div>
      </div>
      <OpenInApp flame={flame()} />
    </div>
  )
}

export default function GalleryFlames() {
  return (
    <div class="gallery">
      <ComputeGate capacity={3}>
        <For each={PLATES}>{(plate) => <PlatePreview plate={plate} />}</For>
      </ComputeGate>
    </div>
  )
}
