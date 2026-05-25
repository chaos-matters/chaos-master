import { createSignal, createMemo, createEffect, onCleanup, Accessor } from 'solid-js'
import { createPinchHandler } from '@/utils/createPinchHandler'
import { useTimeline } from '@/contexts/TimelineContext'

export function useZoomGestures(
  containerRef: Accessor<HTMLDivElement | undefined>,
  seekRulerRef: Accessor<HTMLDivElement | undefined>,
  tracksScrollRef: Accessor<HTMLDivElement | undefined>,
  seekLaneRef: Accessor<HTMLDivElement | undefined>,
  totalFrames: Accessor<number>,
  baseFrameWidth: number,
  baseTrackHeight: number,
  trackNameWidth: number
) {
  const timeline = useTimeline()!
  const [containerHeight, setContainerHeight] = createSignal(200)
  const [zoomLevel, setZoomLevel] = createSignal(1)

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
    onCleanup(() => ro.disconnect())
  })

  const startPinch = createPinchHandler((initEvent) => {
    let prevDistance = initEvent.distance
    return {
      onPinchMove(event) {
        const ratio = event.distance / prevDistance
        prevDistance = event.distance
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
    const availableWidth = ruler.clientWidth - trackNameWidth - 16
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

  // Auto-fit only on initial track appearance
  let prevTrackPaths: Set<string> | undefined
  createEffect(() => {
    const tracks = timeline.tracks()
    const paths = new Set(tracks.map((t) => t.parameterPath))
    if (!prevTrackPaths) {
      prevTrackPaths = paths
      if (paths.size > 0) autoFitZoom()
      return
    }
    prevTrackPaths = paths
  })

  return { zoomLevel, setZoomLevel, frameWidth, trackHeight, autoFitZoom }
}
