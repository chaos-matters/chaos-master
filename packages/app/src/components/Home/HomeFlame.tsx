import { createEffect, createMemo, createSignal, onCleanup, Show, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { useComputeGate } from '@/contexts/ComputeGateContext'
import { Flam3 } from '@/flame/Flam3'
import { validateFlame } from '@/flame/schema/flameSchema'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { fetchGalleryItem } from '@/lib/galleryContent'
import { gpuReady } from '@/lib/gpuStatus'
import { useIsScrolling } from '@/utils/isScrolling'
import { applyTracksToFlame } from '@/utils/timeline'
import { setLivePreviewLive, vramLog } from '@/utils/vramLog'
import ui from './HomeTab.module.css'
import type { Accessor } from 'solid-js'
import type { RenderStatus } from '@/contexts/ComputeGateContext'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Home — Phase 2. One plate's worth of flame: a static poster with a LIVE GPU
 * render layered over it.
 *
 * "Live by default, poster on failure, freeze when done" — ported from the
 * landing's `PosterFlame`/`FlameView` pair (which cannot be imported here: the
 * landing depends on the app, not the other way round).
 *
 * The poster shows whenever the live render cannot run — no WebGPU, a lost
 * device, off-screen, mid-scroll, or not yet accumulated — and takes over for
 * good once the flame has converged (`freezeWhenConverged`), at which point the
 * canvas unmounts and its buffers are freed. That last part is the main cost
 * control: Home's plates are non-interactive, so a converged plate has no reason
 * to keep a WebGPU canvas alive when the poster is the same image.
 *
 * Three things here are load-bearing and easy to undo by accident; see
 * `.agents/skills/gallery_preview_layout`:
 *
 *  1. Mounting is gated on SETTLED visibility (`near() && !isScrolling()`).
 *     Mounting on raw intersection means a fast scroll allocates and abandons a
 *     canvas per plate that flickers past, and the abandoned buffers (freed only
 *     once pending GPU work finishes) balloon VRAM.
 *  2. Every plate is registered with the shared `<ComputeGate>`, which caps how
 *     many flames actually render at once. Mounted-but-not-allowed plates keep
 *     their accumulation (so progress is monotonic) but their render loop is
 *     parked at `renderInterval: Infinity`.
 *  3. The descriptor is fetched per plate, on demand. The list endpoint omits
 *     `flame` deliberately, and fetching all of them up front would pull every
 *     descriptor in the gallery for a page that may only ever show three.
 */

/**
 * Backing-store size per placement, all 16:9 — the same aspect the posters are
 * captured at (1600x900, see scripts/capture-gallery-posters.mjs). Paired with
 * `object-fit: cover` on the canvas this makes the live render and the poster
 * the SAME framing, so the poster cross-fade and the freeze-to-poster swap have
 * nothing to jump between. Rendering at the plate's own aspect instead would
 * reframe the flame (Camera2D fixes the vertical extent and widens horizontally,
 * while `object-fit: cover` crops vertically) and every freeze would visibly
 * shift.
 *
 * These are fixed rather than element-derived so per-plate VRAM is a known
 * quantity: Flam3 allocates 36 bytes of accumulation/postprocess/filter buffers
 * per pixel, so a plate costs ~8 MiB and the hero ~33 MiB regardless of viewport.
 */
const RESOLUTIONS = {
  hero: { width: 1280, height: 720 },
  plate: { width: 640, height: 360 },
  thumb: { width: 448, height: 252 },
} as const

export type HomeFlamePlacement = keyof typeof RESOLUTIONS

/**
 * Convergence target. Matches `capture-gallery-posters.mjs --quality` (0.97), so
 * a live plate settles on the poster's own look rather than a cleaner or noisier
 * version of it.
 */
const HOME_FLAME_QUALITY = 0.97

/**
 * Freeze at this fraction of the point target. The last couple of percent are
 * visually indistinguishable (0.97 target vs ~0.9697 reached) and waiting for
 * the exact limit would depend on where Flam3's final batch happens to land.
 */
const FREEZE_PROGRESS_FRACTION = 0.98

/** Fraction of the point target past which a plate stops being "fresh". */
const HIGH_QUALITY_PROGRESS = 0.5

/** Per-flame point budget for the mobile / low tier. */
const POINT_BUDGET_TOUCH = 1e5
/** Per-flame point budget for the desktop / high tier. */
const POINT_BUDGET_DESKTOP = 1e6

/**
 * Per-placement cap on top of the device budget. `pointCountPerBatch` sizes the
 * per-flame chain-state buffers at 32 bytes each, so the desktop budget is ~32
 * MiB — fine for one hero, far too much multiplied by every plate near the
 * viewport. Mirrors GALLERY_PREVIEW_POINT_COUNT's reasoning in defaults.ts.
 */
const POINT_CAP: Record<HomeFlamePlacement, number> = {
  hero: Infinity,
  plate: 2e5,
  thumb: 1e5,
}

let cachedDeviceBudget: number | undefined

/**
 * Coarse device tier for the chaos-game batch size (the app-side equivalent of
 * the landing's `devicePointBudget`). Tiers on TOUCH rather than screen size: a
 * large tablet reports a desktop-sized viewport with a mobile-class GPU, so any
 * touch device gets the small budget and only a no-touch device gets the large
 * one.
 */
function devicePointBudget(): number {
  if (cachedDeviceBudget !== undefined) {
    return cachedDeviceBudget
  }
  const touch = (globalThis.navigator?.maxTouchPoints ?? 0) > 0
  cachedDeviceBudget = touch ? POINT_BUDGET_TOUCH : POINT_BUDGET_DESKTOP
  return cachedDeviceBudget
}

function pointBudgetFor(placement: HomeFlamePlacement): number {
  return Math.min(devicePointBudget(), POINT_CAP[placement])
}

/**
 * Descriptors already fetched this session, by slug — as a PLATE renders them:
 * animated rows have their timeline baked in at the poster's frame (see
 * `loadDescriptor`). Scrolling a plate out of view and back must not re-fetch
 * it, and the same flame can appear in more than one section. Rejections are
 * evicted so a transient failure does not poison the slug for the rest of the
 * session.
 *
 * Deliberately NOT shared with HomeTab's "open in the workspace" path, for two
 * reasons now: that hands the descriptor to the editor, which owns and mutates
 * it from then on and must not be handed the same object a plate is rendering —
 * and what the editor needs is the row's own flame plus its tracks, not one
 * already frozen partway through them.
 */
const descriptorCache = new Map<string, Promise<FlameDescriptor>>()

function loadDescriptor(slug: string): Promise<FlameDescriptor> {
  const cached = descriptorCache.get(slug)
  if (cached !== undefined) {
    return cached
  }
  // Validated exactly as the poster capture validates it, so a live plate can
  // never render from a descriptor the app itself would reject.
  const pending = fetchGalleryItem(slug)
    .then((item) => {
      const flame = validateFlame(item.flame)
      const tracks = item.animation?.tracks ?? []
      /**
       * Freeze an animated row on the frame its POSTER was captured at, not on
       * frame 0. The capture page picks that frame (a fraction into the
       * timeline, slid off a vibrancy dip) and `poster_frame` is what records
       * it — so replaying the timeline here is what makes the live render and
       * the poster the same image, and the freeze-to-poster swap invisible.
       *
       * No loop options, matching scripts/posterCapture.tsx: the stored envelope
       * is `{ tracks }` only, so keyframes resolve on their own timeline exactly
       * as the capture resolved them.
       *
       * A null frame leaves the flame at its rest pose, which is safe: the only
       * such rows that reach here have no poster to disagree with, because
       * `needsPosterFrame` keeps the ones that do from going live at all.
       */
      const frame = item.poster_frame
      if (tracks.length > 0 && typeof frame === 'number') {
        applyTracksToFlame(tracks, flame, frame)
      }
      return flame
    })
    .catch((err: unknown) => {
      descriptorCache.delete(slug)
      throw err
    })
  descriptorCache.set(slug, pending)
  return pending
}

/**
 * Dev-only: keep every plate live instead of freezing to its poster. In devtools
 * run `__chaosHomeNoFreeze()`.
 *
 * A plate converges in a couple of GPU ticks, so the live phase is normally over
 * before it can be looked at — which is the point (the poster is the same image)
 * but leaves no way to check that claim. Holding the plates live is how you
 * compare the live render against the poster it replaces, and how you eyeball a
 * live plate at all. Stripped from production builds by DEV dead-code
 * elimination, exactly like `__chaosForceGpuUnavailable` in lib/gpuStatus.ts.
 */
const [noFreeze, setNoFreeze] = createSignal(false)

if (import.meta.env.DEV) {
  ;(
    globalThis as typeof globalThis & { __chaosHomeNoFreeze?: () => void }
  ).__chaosHomeNoFreeze = () => {
    setNoFreeze(true)
  }
}

export interface HomeFlameProps {
  slug: string
  /** Captured poster, or undefined for a row that has none yet. */
  poster?: string
  placement: HomeFlamePlacement
  /**
   * True while this plate is within (or near) Home's scroll container — from the
   * one shared IntersectionObserver in HomeTab, rooted on the scroll container
   * rather than the viewport so `rootMargin` can actually preload past the fold.
   */
  near: Accessor<boolean>
  /** Hover: raises this plate's ComputeGate priority so it renders first. */
  hovered?: Accessor<boolean>
  /**
   * Never go live; show the poster only. For rows whose poster this plate cannot
   * reproduce — see `needsPosterFrame` in lib/galleryContent.ts, which is the
   * one thing that should be deciding this. Today that is an animated row whose
   * poster was captured before `poster_frame` existed: its frame is unknown, so
   * a live render would be a different image and every freeze would jump.
   *
   * Animated rows in general are NOT poster-only: with the frame recorded, this
   * plate renders the timeline at exactly that frame (see `loadDescriptor`).
   */
  posterOnly?: boolean
  /**
   * Unmount the live render once converged and keep the poster (the same image,
   * zero ongoing GPU). Only for non-interactive plates.
   */
  freezeWhenConverged?: boolean
}

export function HomeFlame(props: HomeFlameProps) {
  const scrolling = useIsScrolling()
  /**
   * Settled visibility: on/near screen AND not mid-scroll. Mounting on raw
   * intersection is the VRAM-balloon failure mode described in isScrolling.ts —
   * while the user scrolls we mount nothing new, and ~180ms after the last
   * scroll event the visible window mounts and renders.
   */
  const settled = createMemo(() => props.near() && !scrolling())

  const [frozen, setFrozen] = createSignal(false)
  const [flame, setFlame] = createSignal<FlameDescriptor>()
  const [points, setPoints] = createSignal(0)
  const [pointLimit, setPointLimit] = createSignal<() => number>()

  const wantsLive = createMemo(
    () => props.posterOnly !== true && gpuReady() && settled() && !frozen(),
  )

  /**
   * Freezing means "hand the picture back to the poster", so a row with no
   * poster captured yet must stay live — otherwise converging would replace the
   * flame with an empty plate. `noFreeze()` is the dev-only escape hatch used to
   * check that a frozen plate and its poster really are the same image.
   */
  const canFreeze = createMemo(
    () =>
      props.freezeWhenConverged === true &&
      props.poster !== undefined &&
      !noFreeze(),
  )

  /**
   * Fetch the descriptor the first time this plate is about to go live, never up
   * front — the list endpoint omits `flame` precisely so Home does not pull
   * every descriptor in the gallery to draw posters. A plain flag rather than a
   * signal: a slug's descriptor is immutable, so one request per plate is all
   * there will ever be.
   */
  let requested = false
  createEffect(() => {
    if (!wantsLive() || requested) {
      return
    }
    requested = true
    const slug = props.slug
    void loadDescriptor(slug).then(
      (descriptor) => {
        setFlame(() => descriptor)
      },
      (err: unknown) => {
        // The poster stays: a plate that cannot fetch its flame is still a plate.
        // Re-arm so scrolling back retries — a network blip must not disable this
        // plate's live render for the rest of the session.
        requested = false
        console.error(`Home: no live flame for '${slug}':`, err)
      },
    )
  })

  /**
   * Progress towards convergence, 0..1+, from THIS plate's own counters.
   *
   * Deliberately not Flam3's `setCurrentQuality` getter: that divides by the
   * module-global `accumulatedPointCount`, which only the main workspace renderer
   * writes (`isExportRenderer`). Home sits on top of a still-mounted workspace,
   * so that global reads as the editor's point count and every plate would look
   * converged the instant it mounted. `onAccumulatedPointCount` and
   * `setQualityPointCountLimit` are both per-instance.
   */
  const progress = createMemo(() => {
    const limit = pointLimit()?.()
    if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
      return 0
    }
    return points() / limit
  })

  const renderStatus = createMemo<RenderStatus>(() => {
    const p = progress()
    if (p >= 1) {
      return 'done'
    }
    return p >= HIGH_QUALITY_PROGRESS ? 'high-quality' : 'low-quality'
  })

  /**
   * Register with Home's shared ComputeGate — but only once this plate has
   * something to render. An undefined state is excluded from the ranking
   * altogether, so poster-only rows and frozen plates never hold a slot.
   */
  const allowed = useComputeGate(() =>
    props.posterOnly === true || frozen() || flame() === undefined
      ? undefined
      : {
          isVisible: settled(),
          renderStatus: renderStatus(),
          isSelected: props.hovered?.() ?? false,
        },
  )

  /**
   * Mount while settled-visible and unmount when scrolled away, so concurrent
   * WebGPU canvases stay bounded to the on-screen window. Mounting is gated on
   * visibility rather than on `allowed()`: a plate that lost its gate slot keeps
   * its accumulation buffers (parked, not rendering) so progress is monotonic,
   * instead of throwing the work away and restarting from zero every rotation.
   */
  const live = createMemo(() => wantsLive() && flame() !== undefined)

  const liveFlame = createMemo(() => (live() ? flame() : undefined))

  // Re-arm the poster whenever the live render stops (scrolled away, GPU lost),
  // so a re-mounted plate cross-fades from the poster again instead of revealing
  // a blank canvas that a stale point count claims is ready.
  createEffect(() => {
    if (!live()) {
      setPoints(0)
    }
  })

  createEffect(() => {
    if (!canFreeze()) {
      // Thaw: the dev hook was flipped, or this row has no poster to hand the
      // picture back to, so it must stay live.
      setFrozen(false)
      return
    }
    if (live() && progress() >= FREEZE_PROGRESS_FRACTION) {
      setFrozen(true)
    }
  })

  /** The live canvas has something on it worth revealing the poster for. */
  const liveShowing = createMemo(() => live() && points() > 0)

  // One token per plate; membership in the live set == this plate's canvas is
  // mounted. Idempotent, so the DebugPanel's count cannot drift.
  const previewToken = Symbol('home-flame')
  createEffect(() => {
    const isLive = live()
    setLivePreviewLive(previewToken, isLive)
    if (isLive) {
      vramLog(
        `[HomeFlame] MOUNT '${props.slug}' (${props.placement})` +
          ` allowed=${allowed()} near=${props.near()}`,
      )
    }
  })
  onCleanup(() => {
    setLivePreviewLive(previewToken, false)
  })

  const resolution = createMemo(() => RESOLUTIONS[props.placement])
  const pointCount = createMemo(() => pointBudgetFor(props.placement))
  // Hoisted out of the JSX prop on purpose — see the note in LiveFlame.
  const renderInterval = createMemo(() => (allowed() ? 1 : Infinity))

  return (
    <>
      <Show when={props.poster}>
        {(src) => (
          <img
            class={ui.flamePoster}
            classList={{
              [ui.isHidden!]: liveShowing(),
              [ui.isFrozen!]: frozen(),
            }}
            src={src()}
            alt=""
            aria-hidden="true"
            loading="lazy"
            draggable={false}
          />
        )}
      </Show>
      <Show when={liveFlame()} keyed>
        {(descriptor) => (
          <LiveFlame
            flame={descriptor}
            resolution={resolution()}
            pointCountPerBatch={pointCount()}
            renderInterval={renderInterval()}
            onPoints={setPoints}
            onPointLimit={(get) => {
              setPointLimit(() => get)
            }}
          />
        )}
      </Show>
    </>
  )
}

/**
 * The live surface: the app's own AutoCanvas + preview camera + Flam3, with NO
 * `Root` of its own. Home renders inside App's `<Root>` (App.tsx), so the WebGPU
 * device comes from there; adding a Root per plate — as the landing must, having
 * no app Root — would be redundant here.
 */
function LiveFlame(props: {
  flame: FlameDescriptor
  resolution: { width: number; height: number }
  pointCountPerBatch: number
  renderInterval: number
  onPoints: (count: number) => void
  onPointLimit: (get: () => number) => void
}) {
  // Every conditional (`??`, ternary, `&&`) that feeds Flam3 or a camera is
  // hoisted into a memo owned by this component and passed as the CALLED value.
  // Written directly in a JSX prop, a conditional compiles to a lazily-created
  // memo whose first reader is Flam3's requestAnimationFrame loop — an ownerless
  // context — so Solid warns that the computation was "created outside a
  // createRoot" and will never be disposed. The memos below live in this
  // component's owner and are disposed with it.
  // See memory: solid-conditional-prop-memo-leak.
  const is3D = createMemo(
    () => (props.flame.renderSettings.dimensions ?? 2) === 3,
  )
  const cameraPosition = createMemo(() =>
    vec2f(...props.flame.renderSettings.camera.position),
  )
  const cameraZoom = createMemo(() => props.flame.renderSettings.camera.zoom)
  const camera3D = createMemo(() => props.flame.renderSettings.camera3D)
  const edgeFadeColor = createMemo(() => vec4f(0))

  const flam3 = () => (
    <Flam3
      animationEnabled={false}
      quality={HOME_FLAME_QUALITY}
      pointCountPerBatch={props.pointCountPerBatch}
      // The posters are captured with the adaptive filter on, so the live plate
      // needs it too or a converged plate is visibly grainier than the image it
      // replaced.
      adaptiveFilterEnabled={true}
      flameDescriptor={props.flame}
      renderInterval={props.renderInterval}
      edgeFadeColor={edgeFadeColor()}
      onAccumulatedPointCount={props.onPoints}
      setQualityPointCountLimit={props.onPointLimit}
    />
  )

  return (
    <AutoCanvas
      class={ui.flameCanvas}
      pixelRatio={1}
      fixedResolution={props.resolution}
    >
      <Show
        when={is3D()}
        fallback={
          <Camera2D position={cameraPosition()} zoom={cameraZoom()}>
            {flam3()}
          </Camera2D>
        }
      >
        <Default3DPreviewCamera camera3D={camera3D()}>
          {flam3()}
        </Default3DPreviewCamera>
      </Show>
    </AutoCanvas>
  )
}
