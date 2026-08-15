export type PointerGestureEndReason =
  | 'pointerup'
  | 'pointercancel'
  | 'lostpointercapture'
  | 'stopped'

type PointerGestureOptions = {
  pointerDownEvent: PointerEvent
  onMove: (event: PointerEvent) => void
  onEnd: (
    reason: PointerGestureEndReason,
    event: PointerEvent | undefined,
  ) => void
}

/**
 * Own one pointer for the lifetime of a window-tracked drag.
 *
 * Pointer capture keeps browser delivery reliable outside the initiating
 * element, while the pointerId checks keep a second mouse/touch/stylus from
 * mutating or ending the first gesture. The returned stop function shares the
 * same idempotent teardown path as pointerup, cancellation, lost capture, and
 * component cleanup.
 */
export function startPointerGesture({
  pointerDownEvent,
  onMove,
  onEnd,
}: PointerGestureOptions): () => void {
  const pointerId = pointerDownEvent.pointerId
  const captureTarget = pointerDownEvent.currentTarget as Element
  let active = true

  captureTarget.setPointerCapture(pointerId)

  function matchesPointer(event: PointerEvent): boolean {
    return event.pointerId === pointerId
  }

  function handleMove(event: PointerEvent) {
    if (!active || !matchesPointer(event)) return
    onMove(event)
  }

  function finish(reason: PointerGestureEndReason, event?: PointerEvent): void {
    if (!active) return
    if (event && !matchesPointer(event)) return

    active = false
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    window.removeEventListener('pointercancel', handleCancel)
    captureTarget.removeEventListener('lostpointercapture', handleLostCapture)

    if (
      reason !== 'lostpointercapture' &&
      captureTarget.hasPointerCapture(pointerId)
    ) {
      captureTarget.releasePointerCapture(pointerId)
    }

    onEnd(reason, event)
  }

  function handleUp(event: PointerEvent) {
    finish('pointerup', event)
  }

  function handleCancel(event: PointerEvent) {
    finish('pointercancel', event)
  }

  function handleLostCapture(event: Event) {
    finish('lostpointercapture', event as PointerEvent)
  }

  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
  window.addEventListener('pointercancel', handleCancel)
  captureTarget.addEventListener('lostpointercapture', handleLostCapture)

  return () => {
    finish('stopped')
  }
}
