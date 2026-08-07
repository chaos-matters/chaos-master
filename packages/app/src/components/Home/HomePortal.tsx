import { createEffect, createMemo, createSignal, onCleanup, Show, Suspense, untrack, } from 'solid-js'
import { vec4f } from 'typegpu/data'
import { ComputeGate, useComputeGate } from '@/contexts/ComputeGateContext'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { gpuReady } from '@/lib/gpuStatus'
import { fetchHomeConfig as TEMP_fetchHomeConfig, resolvePortalTourId, } from '@/lib/homeConfig'
import { Root } from '@/lib/Root'
import { getTour, isKnownTour } from '@/tours/registry'
import { useIsScrolling } from '@/utils/isScrolling'
import { createIntersectionMeasure } from '@/utils/useIntersectionObserver'
import { setLivePreviewLive, vramLog } from '@/utils/vramLog'
import { nextPortalPlayback, stepFromFraction, usePrefersReducedMotion, visibleFraction, } from './homePlayback'
import ui from './HomeTab.module.css'
import { createPortalDriver, runPortalScript } from './portalScript'
import type { Accessor } from 'solid-js'
import type { PortalPlayback } from './homePlayback'
import type { PortalDriver, PortalScriptRun } from './portalScript'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'
import type { RenderStatus } from '@/contexts/ComputeGateContext'
import type { HomeConfig } from '@/lib/homeConfig'

/**
 * Home — Phase 5. "Made here": a flame being built, step by step, by the app's
 * own commands, scripted by a real tour.
 *
 * What this is NOT is a second copy of the editor. portalScript.ts explains at
 * length why mounting `MainWorkspace` again would write the user's localStorage,
 * undo journal and IndexedDB recents; the short version is that the portal
 * borrows the tours and the command registry — the parts that build a flame —
 * and supplies its own everything else. So the flame on screen is genuinely
 * built live by `flame.addTransform` / `flame.setAffine` / `flame.setVibrancy`
 * from `example1-creation`'s own steps, and the caption under it is that step's
 * own text. The editor chrome those steps normally spotlight is absent, which
 * is the one thing this shows less of than the plan's "live app-in-app".
 *
 * The GPU rules are the plates' rules (see HomeFlame.tsx and
 * `.agents/skills/gallery_preview_layout`), and the portal is the most
 * expensive single thing on the page, so they are applied more strictly:
 *
 *  - it mounts on SETTLED visibility (near the viewport AND not mid-scroll) and
 *    unmounts entirely when it leaves the near-window;
 *  - there is exactly ONE, in its own `<ComputeGate capacity={1}>`, so the cap
 *    is structural rather than a thing to remember;
 *  - it gets its own `<Root>`. Home already sits inside App's Root, so this is
 *    not needed to render — it is needed so the portal's buffers are a separate
 *    TgpuRoot that is destroyed as a unit on unmount, and so the section keeps
 *    working if it is ever moved into a Portal (the plan's constraint: anything
 *    outside the app Root must re-provide both — `LoadFlameModal` is the
 *    reference).
 *
 * ## Scrolling (revised after testing)
 *
 * The first cut tied the whole stage to settled visibility, so every scroll
 * event tore the portal down and the build started over — "actually annoying",
 * and correctly so. MOUNTING and PLAYING are now separate questions:
 *
 *  - mounted while the portal is in the page's near-window (the 300px-margin
 *    shared observer). Once mounted it stays mounted through any amount of
 *    scrolling, so the flame, its buffers and the script's progress survive;
 *  - PLAYING is decided by its own margin-free observer: it starts at
 *    `PORTAL_PLAY_RATIO` of the screen, ignores every scroll that keeps it
 *    there, stops and holds below it, and only resets when it is gone
 *    completely. See `nextPortalPlayback`, which is that rule on its own.
 */

/**
 * Backing store, 16:9 like everything else on Home. Flam3 allocates 36 bytes of
 * accumulation/postprocess/filter per pixel, so this is ~12.4 MiB — between a
 * plate (~8 MiB at 640x360) and the hero (~33 MiB at 1280x720), which is the
 * right place for the section's centrepiece given only one exists.
 */
const PORTAL_RESOLUTION = { width: 800, height: 450 } as const

/** Chain-state budget, matching a gallery plate's cap (32 bytes per point). */
const PORTAL_POINT_COUNT = 2e5

/**
 * Convergence target. Lower than the plates' 0.97: the portal has no poster to
 * match, and the flame changes on nearly every frame while a step animates, so
 * the only moment convergence matters is the hold at the end of a loop.
 */
const PORTAL_QUALITY = 0.9

/** Fraction of the point target past which the render stops being "fresh". */
const HIGH_QUALITY_PROGRESS = 0.5

/**
 * The flame the script starts from — the same descriptor a fresh workspace
 * opens with, which is the state `example1-creation` was authored against (its
 * first step clears the transforms and takes it from there).
 */
const START_FLAME = examples.example1

export interface HomePortalProps {
  /**
   * Home's one shared IntersectionObserver, rooted on the scroll container —
   * the same tracker every plate registers with, so the portal's MOUNTING is
   * decided by the same near-window as every plate's.
   */
  track: (target: Accessor<Element | null | undefined>) => Accessor<boolean>
  /**
   * Home's scroll container, for the portal's own margin-free observer. The
   * shared tracker cannot answer "how much of this is on screen": it runs with
   * a 300px `rootMargin`, which inflates the root and lets an element well below
   * the fold report a ratio of 1.
   */
  root: Accessor<Element | null | undefined>
}

export function HomePortal(props: HomePortalProps) {
  const [portalEl, setPortalEl] = createSignal<HTMLDivElement>()
  const near = props.track(portalEl)
  const scrolling = useIsScrolling()
  /**
   * Mounted while near, and only ever mounted from a standstill.
   *
   * A latch rather than `near() && !scrolling()`: the settled rule is there so
   * a fast scroll does not allocate and abandon GPU buffers, which is about
   * STARTING. Applying it to stopping as well is what made every scroll destroy
   * the portal and restart the build.
   */
  const [mounted, setMounted] = createSignal(false)
  createEffect(() => {
    if (!near()) {
      setMounted(false)
      return
    }
    if (!scrolling()) {
      setMounted(true)
    }
  })
  /** Kept for the config fetch, which should still wait for a standstill. */
  const settled = createMemo(() => near() && !scrolling())

  /**
   * How much of the portal is on screen, 0..1 — the input to the play/hold/
   * reset rule. Measured against the smaller of the portal and the viewport so
   * the threshold stays reachable on a short window (see `visibleFraction`).
   */
  const shown = createIntersectionMeasure(
    portalEl,
    (entry) =>
      visibleFraction(
        entry.boundingClientRect.height,
        entry.rootBounds?.height ?? 0,
        entry.intersectionRect.height,
      ),
    { root: () => props.root() },
  )

  const [runState, setRunState] = createSignal<PortalPlayback>('idle')
  createEffect(() => {
    const fraction = shown()
    setRunState((previous) => nextPortalPlayback(previous, fraction))
  })

  /**
   * Ask for the settings the first time the portal is approached — not on page
   * load. A visitor who never scrolls this far should not pay for a request.
   *
   * `loadHomeConfig` owns the once-per-page-load part, and it has to: this
   * component is mounted and unmounted by scrolling, so a fetch owned HERE
   * would fire again every time the section came back into view — which is
   * exactly what it did, filling the console with duplicate requests and
   * duplicate fallback logs on a single page view. Every mount after the first
   * joins (or immediately reads) the one settled promise, including when it
   * settled on a failure.
   *
   * A plain flag and a promise rather than `createResource`, matching
   * `loadDescriptor` in HomeFlame. A resource here would suspend the nearest
   * boundary — App's `<Suspense>` — and blank the entire app subtree for the
   * duration of the request, which among other things drops Home's scroll
   * position. A fetch nobody awaits in a tracked scope cannot do that.
   */
  const [config, setConfig] = createSignal<HomeConfig>()
  /** True once the answer is known, whether it arrived or failed. */
  const [configResolved, setConfigResolved] = createSignal(false)
  let requested = false
  createEffect(() => {
    if (!settled() || requested) {
      return
    }
    requested = true
    // No rejection branch: `loadHomeConfig` resolves unreachable settings to an
    // empty map, which lands on the default tour exactly as an unset key does.
    // A portal that said "settings unavailable" instead of playing something
    // would be worse content.
    void TEMP_fetchHomeConfig().then(
      (settings) => {
        setConfig(settings)
        setConfigResolved(true)
      },
      (err: unknown) => {
        console.error('Home portal: using the default tour —', err)
        setConfigResolved(true)
      },
    )
  })

  /**
   * The tour to play. Unreachable settings, an unset key, and an id this build
   * does not have all land on the same default — see `resolvePortalTourId`.
   * `isKnownTour`/`getTour` are the registry the SpotlightTour system resolves
   * `#tour=` ids through, so the portal can never play a tour the rest of the
   * app does not have.
   */
  const tour = createMemo<TourGuide | undefined>(() =>
    getTour(resolvePortalTourId(config(), isKnownTour)),
  )

  /** Which step is on screen; -1 while nothing is playing. */
  const [stepIndex, setStepIndex] = createSignal(-1)
  /** Bumped by the replay control to restart the run. */
  const [replayNonce, setReplayNonce] = createSignal(0)

  const step = createMemo(() => tour()?.steps[stepIndex()])
  const stepCount = createMemo(() => tour()?.steps.length ?? 0)

  /**
   * `configResolved` is part of the gate so the stage never starts on the
   * default tour and switches a second later — changing tour restarts the
   * script, which would read as a glitch on every first visit where the
   * settings name something else.
   */
  const live = createMemo(
    () => mounted() && gpuReady() && configResolved() && tour() !== undefined,
  )

  // Reset the caption when the stage goes away, so a portal scrolled back into
  // view never opens on the step it happened to be showing when it left.
  createEffect(() => {
    if (!live()) {
      setStepIndex(-1)
    }
  })

  // ── The scrubber ────────────────────────────────────────────────────────
  // A real control, not chrome: the build is the section's content, and the one
  // thing a viewer wants is to go back and look at the step that just went by.

  const [trackEl, setTrackEl] = createSignal<HTMLDivElement>()
  /** A pointer is down on the track. */
  const [dragging, setDragging] = createSignal(false)
  /** The track has keyboard focus. */
  const [focused, setFocused] = createSignal(false)
  /**
   * While the user is working the scrubber the build holds still. Focus counts,
   * not just a held pointer: a keyboard user stepping with the arrow keys would
   * otherwise be racing the script's own advance on every press.
   */
  const scrubbing = createMemo(() => dragging() || focused())
  const [seekRequest, setSeekRequest] = createSignal<{
    index: number
    nonce: number
  }>()
  let seekNonce = 0

  function requestSeek(index: number) {
    seekNonce += 1
    setSeekRequest({ index, nonce: seekNonce })
    setStepIndex(index)
  }

  function seekToPointer(event: PointerEvent) {
    const el = trackEl()
    const total = stepCount()
    if (el === undefined || total === 0) {
      return
    }
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }
    requestSeek(
      stepFromFraction((event.clientX - rect.left) / rect.width, total),
    )
  }

  /** Steps a Page Up/Down jumps — a chapter rather than a step. */
  const PAGE_STEPS = 5

  function seekByKey(event: KeyboardEvent): number | undefined {
    const total = stepCount()
    if (total === 0) {
      return undefined
    }
    const at = Math.max(0, stepIndex())
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        return at - 1
      case 'ArrowRight':
      case 'ArrowUp':
        return at + 1
      case 'PageDown':
        return at - PAGE_STEPS
      case 'PageUp':
        return at + PAGE_STEPS
      case 'Home':
        return 0
      case 'End':
        return total - 1
      default:
        return undefined
    }
  }

  const progress = createMemo(() => {
    const total = stepCount()
    if (total === 0 || stepIndex() < 0) {
      return 0
    }
    return (stepIndex() + 1) / total
  })
  const progressScale = createMemo(() => progress().toFixed(4))
  /** ARIA counts steps from 1, and reports "nothing yet" as the first step. */
  const sliderNow = createMemo(() => Math.max(0, stepIndex()) + 1)
  const sliderMax = createMemo(() => Math.max(1, stepCount()))
  const sliderText = createMemo(
    () => `Step ${sliderNow()} of ${sliderMax()}: ${step()?.title ?? 'start'}`,
  )
  // Hoisted like every other conditional prop in this file — see the note above
  // `activeTour`. Uniform, so the rule stays a rule rather than a judgement.
  const scrubTabIndex = createMemo(() => (live() ? 0 : -1))
  const scrubDisabled = createMemo(() => (live() ? undefined : 'true'))

  // Hoisted out of the JSX: conditionals written inline in a prop compile to
  // lazily-created computations, and the ones feeding a renderer are how the
  // "computation created outside a createRoot" warning appears (see PortalCanvas
  // and memory: solid-conditional-prop-memo-leak). Doing it uniformly keeps the
  // rule easy to follow rather than a judgement call per prop.
  const activeTour = createMemo(() => (live() ? tour() : undefined))
  /**
   * What the stage should be doing. `held` while the scrubber is in use, so
   * seeking to a step and looking at it does not become a race with the script.
   */
  const stageState = createMemo<PortalPlayback>(() =>
    scrubbing() && runState() === 'playing' ? 'held' : runState(),
  )
  const idleMessage = createMemo(() =>
    gpuReady()
      ? 'The build plays once this section fills the screen.'
      : 'Live rendering is unavailable on this device.',
  )
  const captionTitle = createMemo(
    () => step()?.title ?? 'A flame, built step by step',
  )
  const captionText = createMemo(
    () =>
      step()?.description ??
      'Every value is set by the app’s own commands, from the same guided tour you can run in the editor.',
  )

  return (
    <div
      class={ui.portalFrame}
      ref={setPortalEl}
      /* Which tour is playing and where it is, readable from the DOM — by a
         person in devtools and by the Playwright run that has to prove the
         portal mounts, advances and tears down. Same reason the plates carry
         `data-home-playing`. `data-portal-live` is the mount state, so
         "unmounted when scrolled away" is one attribute rather than an
         inference from the canvas count. */
      data-portal-tour={tour()?.id}
      data-portal-step={stepIndex()}
      data-portal-live={live() ? 'true' : 'false'}
      /* The play/hold/reset state, so "a small scroll changed nothing" is
         something a person in devtools — and a Playwright run — can read
         directly instead of inferring from the step index. */
      data-portal-state={runState()}
    >
      <div class={ui.portalBar}>
        <span class={ui.portalBarName}>Lumen Apeiron</span>
        <div
          ref={setTrackEl}
          class={ui.portalBarTrack}
          role="slider"
          tabindex={scrubTabIndex()}
          aria-label="Build progress"
          aria-valuemin={1}
          aria-valuemax={sliderMax()}
          aria-valuenow={sliderNow()}
          aria-valuetext={sliderText()}
          aria-disabled={scrubDisabled()}
          onFocus={() => {
            setFocused(true)
          }}
          onBlur={() => {
            setFocused(false)
          }}
          onPointerDown={(event) => {
            if (!live()) {
              return
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            setDragging(true)
            seekToPointer(event)
          }}
          onPointerMove={(event) => {
            if (dragging()) {
              seekToPointer(event)
            }
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId)
            setDragging(false)
          }}
          onPointerCancel={() => {
            setDragging(false)
          }}
          onKeyDown={(event) => {
            if (!live()) {
              return
            }
            const target = seekByKey(event)
            if (target === undefined) {
              return
            }
            event.preventDefault()
            requestSeek(
              Math.min(stepCount() - 1, Math.max(0, Math.floor(target))),
            )
          }}
        >
          <span
            class={ui.portalBarFill}
            style={{ transform: `scaleX(${progressScale()})` }}
          />
        </div>
        <button
          type="button"
          class={ui.portalReplay}
          disabled={!live()}
          onClick={() => {
            setReplayNonce((n) => n + 1)
          }}
        >
          Replay
        </button>
      </div>
      <div class={ui.portalBody}>
        <Show
          when={activeTour()}
          keyed
          fallback={<span class={ui.portalIdle}>{idleMessage()}</span>}
        >
          {(guide) => (
            /* The local Suspense is load-bearing, not decoration. `Root` gets
               its device from a `createResource`, and reading a loading
               resource suspends the NEAREST boundary — which, without this one,
               is App's: mounting the portal would blank and re-create the whole
               app subtree (MainWorkspace included) for a frame, and the
               re-created scroll container would drop Home's scroll position
               back to the top the moment you scrolled far enough to reach this
               section. Measured, not theorised. */
            <Suspense fallback={<span class={ui.portalIdle}>Starting…</span>}>
              {/* Both providers, per the plan's Portal constraint. Capacity 1
                  is the "at most one portal instance" rule made structural. */}
              <ComputeGate capacity={1}>
                <Root adapterOptions={{ powerPreference: 'high-performance' }}>
                  <PortalStage
                    tour={guide}
                    replayNonce={replayNonce()}
                    state={stageState()}
                    seek={seekRequest()}
                    onStep={setStepIndex}
                  />
                </Root>
              </ComputeGate>
            </Suspense>
          )}
        </Show>
      </div>
      <div class={ui.portalCaption}>
        <span class={ui.portalCaptionTitle}>{captionTitle()}</span>
        <p class={ui.portalCaptionText}>{captionText()}</p>
      </div>
    </div>
  )
}

interface PortalStageProps {
  tour: TourGuide
  /** Changes to restart the run from the beginning. */
  replayNonce: number
  /** Play, hold where it is, or go back to the start. */
  state: PortalPlayback
  /** A scrub: jump to `index`. `nonce` makes a repeat of the same step land. */
  seek?: { index: number; nonce: number }
  onStep: (index: number) => void
}

/**
 * The live surface plus the script that drives it. Mounted while the portal is
 * in Home's near-window, so its lifetime is one visit to the section: the
 * driver, its flame, its timers and its GPU buffers are created here and
 * destroyed together. Scrolling within the section does NOT remount it — see
 * the note at the top of this file.
 */
function PortalStage(props: PortalStageProps) {
  const driver = createPortalDriver(START_FLAME)
  const reducedMotion = usePrefersReducedMotion()

  const [points, setPoints] = createSignal(0)
  const [pointLimit, setPointLimit] = createSignal<() => number>()

  // ── The run ─────────────────────────────────────────────────────────────
  // Created once per tour/replay. It does not start itself: whether it plays is
  // `props.state`'s business, and separating the two is what lets a scroll stop
  // the build without destroying it.
  const [run, setRun] = createSignal<PortalScriptRun>()
  createEffect(() => {
    const guide = props.tour
    // Read in the reactive scope, so bumping it restarts the run.
    const runId = props.replayNonce
    vramLog(`[HomePortal] SCRIPT '${guide.id}' run=${runId}`)

    driver.reset()
    const script = runPortalScript({
      tour: guide,
      driver,
      onStep: props.onStep,
      autoStart: false,
    })
    if (reducedMotion()) {
      // The finished flame, static, captioned by the last step. Still built by
      // the real commands — just with every wait and every tween collapsed.
      // The scrubber still works, which makes this the one mode where the whole
      // build is inspectable without any motion at all.
      script.seek(guide.steps.length - 1)
    }
    setRun(() => script)

    onCleanup(() => {
      script.cancel()
      setRun(undefined)
    })
  })

  // Transport. Reduced motion opts out of advancing entirely — the flame is
  // already at the end and only the scrubber moves it.
  createEffect(() => {
    const script = run()
    const state = props.state
    if (script === undefined || reducedMotion()) {
      return
    }
    if (state === 'playing') {
      script.play()
    } else if (state === 'held') {
      script.pause()
    } else {
      // Gone from the screen: back to the start flame, so the next approach
      // opens on step one rather than wherever it stopped.
      script.pause()
      script.restart()
    }
  })

  /**
   * The last scrub applied here. Seeded from whatever the scrubber was last
   * asked for, so a stage created AFTER a seek (a tour change, a replay) opens
   * on its own first step rather than replaying a request meant for the run it
   * replaced. The nonce is what makes a repeat of the SAME step land: a drag
   * that wanders off a step and back must rebuild it, not stick.
   */
  let appliedSeek = untrack(() => props.seek?.nonce ?? 0)
  createEffect(() => {
    const request = props.seek
    const script = run()
    if (request === undefined || script === undefined) {
      return
    }
    if (request.nonce === appliedSeek) {
      return
    }
    appliedSeek = request.nonce
    script.seek(request.index)
  })

  // ── The live surface ────────────────────────────────────────────────────

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

  // Registers with the portal's OWN gate (capacity 1), so the portal is subject
  // to the same discipline as every other renderer on the page rather than
  // being a special case that ignores it.
  const allowed = useComputeGate(() => ({
    isVisible: true,
    renderStatus: renderStatus(),
    isSelected: true,
  }))
  // Hoisted out of the JSX prop — see the note in PortalCanvas.
  const renderInterval = createMemo(() => (allowed() ? 1 : Infinity))

  // Counts toward the page's live-preview total (the DebugPanel row, and what
  // the Playwright checks assert), so the portal can never be an invisible
  // extra canvas.
  const previewToken = Symbol('home-portal')
  setLivePreviewLive(previewToken, true)
  vramLog(`[HomePortal] MOUNT tour='${props.tour.id}'`)
  onCleanup(() => {
    setLivePreviewLive(previewToken, false)
    vramLog('[HomePortal] UNMOUNT')
  })

  return (
    <PortalCanvas
      driver={driver}
      renderInterval={renderInterval()}
      onPoints={setPoints}
      onPointLimit={(get) => {
        setPointLimit(() => get)
      }}
    />
  )
}

/**
 * Canvas + camera + Flam3 for the driver's flame.
 *
 * Every conditional feeding Flam3 or a camera is hoisted into a memo owned by
 * this component and passed as the CALLED value. Written inline in a JSX prop,
 * a conditional compiles to a lazily-created memo whose first reader is Flam3's
 * requestAnimationFrame loop — an ownerless context — and Solid warns that the
 * computation was created outside a createRoot and will never be disposed.
 * See memory: solid-conditional-prop-memo-leak, and the same note in HomeFlame.
 */
function PortalCanvas(props: {
  driver: PortalDriver
  renderInterval: number
  onPoints: (count: number) => void
  onPointLimit: (get: () => number) => void
}) {
  const is3D = createMemo(
    () => (props.driver.flame.renderSettings.dimensions ?? 2) === 3,
  )
  const cameraPosition = createMemo(() => props.driver.position())
  const cameraZoom = createMemo(() => props.driver.zoom())
  const camera3D = createMemo(() => props.driver.flame.renderSettings.camera3D)
  const edgeFadeColor = createMemo(() => vec4f(0))

  const flam3 = () => (
    <Flam3
      animationEnabled={false}
      quality={PORTAL_QUALITY}
      pointCountPerBatch={PORTAL_POINT_COUNT}
      adaptiveFilterEnabled={true}
      flameDescriptor={props.driver.flame}
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
      fixedResolution={PORTAL_RESOLUTION}
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
