import { createEffect, createMemo, createSignal, onCleanup, untrack, } from 'solid-js'
import { agentDriving } from '@/arcade/pilot'
import { createPinchHandler } from '@/utils/createPinchHandler'
import { autoFitDecision } from './autoFit'
import type { Accessor } from 'solid-js'

export function useZoomGestures(
  containerRef: Accessor<HTMLDivElement | undefined>,
  seekRulerRef: Accessor<HTMLDivElement | undefined>,
  tracksScrollRef: Accessor<HTMLDivElement | undefined>,
  seekLaneRef: Accessor<HTMLDivElement | undefined>,
  totalFrames: Accessor<number>,
  baseFrameWidth: number,
  baseTrackHeight: number,
  trackNameWidth: Accessor<number>,
  /** Bumped by the timeline whenever a whole animation is loaded. */
  loadRevision: Accessor<number> = () => 0,
) {
  const [containerHeight, setContainerHeight] = createSignal(200)
  const [zoomLevel, setZoomLevel] = createSignal(1)
  // Set by a zoom or a scroll the person performed. Only their own gestures
  // count: every scrollLeft this module writes is programmatic, so the flag is
  // raised from the input events rather than from `scroll`.
  const [userAdjusted, setUserAdjusted] = createSignal(false)
  /** The zoom setter the header buttons get: pressing one is an adjustment. */
  const setZoomLevelByUser = (value: number) => {
    setUserAdjusted(true)
    setZoomLevel(value)
  }

  const frameWidth = createMemo(() => {
    const h = containerHeight()
    const scale = Math.max(0.8, Math.min(3, h / 140))
    return baseFrameWidth * scale * zoomLevel()
  })

  const trackHeight = createMemo(() => {
    const h = containerHeight()
    const scale = Math.max(0.8, Math.min(3, h / 140))
    // Minimum 18px so diamond keyframes (14px) remain clickable
    return Math.max(18, baseTrackHeight * scale * zoomLevel())
  })

  // ResizeObserver for container height
  createEffect(() => {
    const el = containerRef()
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    onCleanup(() => {
      ro.disconnect()
    })
  })

  // The ruler lane and the tracks area are SEPARATE horizontal scrollers (only
  // JS-synced), so any frameWidth change — zoom buttons, Alt+wheel, pinch, or
  // the panel resize handle driving containerHeight — narrows/widens both
  // contents and lets the browser clamp each scrollLeft independently. A clamp
  // on one side shifts the ruler playhead off the tracks playhead. Re-anchor
  // on every frameWidth change: keep the frame at the lane's left edge stable
  // (scrollLeft scales linearly with frameWidth) and write the SAME value,
  // clamped to the smaller of the two scroll ranges, to both panes.
  let prevFrameWidth: number | undefined
  createEffect(() => {
    const fw = frameWidth()
    const ratio = prevFrameWidth ? fw / prevFrameWidth : 1
    prevFrameWidth = fw
    const ts = tracksScrollRef()
    const sl = seekLaneRef()
    if (!ts || !sl) return
    // The ruler wrapper itself must never scroll (it holds the fixed name-
    // column spacer); reset it in case the browser nudged it.
    const ruler = seekRulerRef()
    if (ruler && ruler.scrollLeft !== 0) ruler.scrollLeft = 0
    const maxShared = Math.max(
      0,
      Math.min(
        ts.scrollWidth - ts.clientWidth,
        sl.scrollWidth - sl.clientWidth,
      ),
    )
    const target = Math.max(0, Math.min(maxShared, ts.scrollLeft * ratio))
    ts.scrollLeft = target
    sl.scrollLeft = target
  })

  const startPinch = createPinchHandler((initEvent) => {
    let prevDistance = initEvent.distance
    return {
      onPinchMove(event) {
        const ratio = event.distance / prevDistance
        prevDistance = event.distance
        setUserAdjusted(true)
        setZoomLevel(Math.max(0.1, Math.min(5, zoomLevel() * ratio)))
      },
    }
  })

  // Pinch-to-zoom for touch devices
  createEffect(() => {
    const el = containerRef()
    if (!el) return
    el.addEventListener('touchmove', startPinch, { passive: false })
    onCleanup(() => {
      el.removeEventListener('touchmove', startPinch)
    })
  })

  // Alt+mouse-wheel zoom
  createEffect(() => {
    const el = containerRef()
    if (!el) return

    function onWheel(e: WheelEvent) {
      if (!e.altKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.002)
      setUserAdjusted(true)
      setZoomLevel(Math.max(0.1, Math.min(5, zoomLevel() * factor)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    onCleanup(() => {
      el.removeEventListener('wheel', onWheel)
    })
  })

  function autoFitZoom() {
    const ruler = seekRulerRef()
    if (!ruler) return
    const availableWidth = ruler.clientWidth - trackNameWidth() - 16
    if (availableWidth <= 0 || totalFrames() <= 0) return
    const h = containerHeight()
    const containerScale = Math.max(0.8, Math.min(3, h / 140))
    const targetFrameWidth = availableWidth / totalFrames()
    const targetZoom = targetFrameWidth / (baseFrameWidth * containerScale)
    setZoomLevel(Math.max(0.1, Math.min(5, targetZoom)))

    // Reset scroll positions
    const ts = tracksScrollRef()
    if (ts) ts.scrollLeft = 0
    const sl = seekLaneRef()
    if (sl) sl.scrollLeft = 0
  }

  // Auto-fit on first valid resize of the ruler
  let hasAutoFit = false
  createEffect(() => {
    const ruler = seekRulerRef()
    if (!ruler) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && !hasAutoFit) {
        hasAutoFit = true
        autoFitZoom()
      }
    })
    ro.observe(ruler)
    onCleanup(() => {
      ro.disconnect()
    })
  })

  // A wheel or a drag on either lane is the person moving the view. Listening
  // to the input rather than to `scroll` keeps this module's own scrollLeft
  // writes — the re-anchor effect above, and autoFitZoom — from looking like
  // a gesture.
  createEffect(() => {
    const lanes = [tracksScrollRef(), seekLaneRef()].filter(
      (el): el is HTMLDivElement => el !== undefined,
    )
    const note = () => setUserAdjusted(true)
    for (const el of lanes) {
      el.addEventListener('wheel', note, { passive: true })
      el.addEventListener('pointerdown', note, { passive: true })
    }
    onCleanup(() => {
      for (const el of lanes) {
        el.removeEventListener('wheel', note)
        el.removeEventListener('pointerdown', note)
      }
    })
  })

  // Fit whatever just arrived.
  //
  // Fit is a button, and neither an agent nor a dropped file has a pointer to
  // press it with. A loaded animation is usually a different length from the
  // one on the timeline — a twelve-second morph over a preset's ninety frames
  // is four times the span — and the dope sheet used to keep the zoom it had,
  // so the frames that had just been loaded ran off the right edge of the
  // panel. `autoFitDecision` owns the rule; see that module for why a load and
  // a span change are treated differently.
  let seen: { loadRevision: number; totalFrames: number } | undefined
  createEffect(() => {
    const inputs = {
      loadRevision: loadRevision(),
      totalFrames: totalFrames(),
      userAdjusted: untrack(userAdjusted),
      agentDriving: agentDriving(),
    }
    const decision = autoFitDecision(inputs, seen)
    seen = {
      loadRevision: inputs.loadRevision,
      totalFrames: inputs.totalFrames,
    }
    if (decision.resetUserAdjusted) setUserAdjusted(false)
    if (!decision.fit) return
    // Untracked: autoFitZoom reads containerHeight, and this effect must
    // depend on the load and the span alone or a panel resize would re-run it.
    untrack(() => {
      autoFitZoom()
    })
  })

  return {
    zoomLevel,
    setZoomLevel: setZoomLevelByUser,
    frameWidth,
    trackHeight,
    autoFitZoom,
    userAdjusted,
  }
}
