import { Accessor, onCleanup } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'

export function useSeekScrubber(frameWidth: Accessor<number>) {
  const timeline = useTimeline()!
  let seekDragging = false
  let seekDragStartX = 0
  let controller: AbortController | null = null

  function seekToPosition(e: PointerEvent) {
    const lane = e.currentTarget as HTMLElement
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const x = e.clientX - rect.left + lane.scrollLeft
    const frame = Math.round(x / frameWidth()) + timeline.config().startFrame
    const clampedFrame = Math.max(
      timeline.config().startFrame,
      Math.min(timeline.config().endFrame, frame),
    )
    timeline.goToFrame(clampedFrame)
  }

  function handleSeekPointerDown(e: PointerEvent) {
    seekDragging = true
    seekDragStartX = e.clientX
    timeline.setIsScrubbing(true)
    seekToPosition(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    if (controller) controller.abort()
    controller = new AbortController()

    // e.currentTarget might be lost in window events, so capture the element
    const laneElement = e.currentTarget as HTMLElement

    function onMove(ev: PointerEvent) {
      if (!seekDragging) return
      if (Math.abs(ev.clientX - seekDragStartX) < 4) return
      
      // We pass ev but fake the currentTarget to be the original lane
      // because seekToPosition relies on currentTarget
      Object.defineProperty(ev, 'currentTarget', { value: laneElement, configurable: true })
      seekToPosition(ev)
    }

    function onEnd() {
      seekDragging = false
      timeline.setIsScrubbing(false)
      controller?.abort()
      controller = null
    }

    window.addEventListener('pointermove', onMove, { signal: controller.signal })
    window.addEventListener('pointerup', onEnd, { signal: controller.signal })
    window.addEventListener('pointercancel', onEnd, { signal: controller.signal })
  }

  onCleanup(() => {
    if (controller) controller.abort()
  })

  return { handleSeekPointerDown }
}
