import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export interface HorizontalScrollDragOptions {
  dragThreshold?: number
  draggingClass?: string
}

/**
 * Enables smooth horizontal wheel scrolling and mouse click-and-drag panning
 * on horizontal overflow containers (e.g. variation preview galleries and controls rails)
 * when used on desktop PC with a mouse, while preserving native touch scrolling.
 */
export function createHorizontalScrollDrag(
  elementRef: Accessor<HTMLElement | undefined>,
  options: HorizontalScrollDragOptions = {},
) {
  const threshold = options.dragThreshold ?? 4

  createEffect(() => {
    const el = elementRef()
    if (!el) return

    const isOverInteractiveInput = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false
      return Boolean(
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest(
          'input, select, textarea, [contenteditable="true"], [data-step], [data-prevent-horizontal-scroll]',
        ),
      )
    }

    // 1. Mouse wheel handler: translate vertical deltaY into horizontal scrollLeft
    const handleWheel = (e: WheelEvent) => {
      if (isOverInteractiveInput(e.target)) return
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (delta !== 0) {
        e.preventDefault()
        el.scrollLeft += delta
      }
    }

    // 2. Mouse drag-to-scroll handler
    let isDown = false
    let startX = 0
    let startScrollLeft = 0
    let hasDragged = false
    let preventClick = false

    const handlePointerDown = (e: PointerEvent) => {
      // Do not interfere with touch events — touch browsers handle native swiping with momentum
      if (e.pointerType === 'touch') return
      // Only drag on primary (left) mouse button
      if (e.button !== 0) return
      // Do not drag if mouse down started on an interactive input
      if (isOverInteractiveInput(e.target)) return

      isDown = true
      hasDragged = false
      preventClick = false
      startX = e.clientX
      startScrollLeft = el.scrollLeft
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDown) return
      const dx = e.clientX - startX
      if (!hasDragged && Math.abs(dx) > threshold) {
        hasDragged = true
        preventClick = true
        if (options.draggingClass) {
          el.classList.add(options.draggingClass)
        }
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          // Ignore if pointer capture fails in non-standard environments
        }
      }
      if (hasDragged) {
        e.preventDefault()
        el.scrollLeft = startScrollLeft - dx
      }
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDown) return
      isDown = false
      if (options.draggingClass) {
        el.classList.remove(options.draggingClass)
      }
      try {
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId)
        }
      } catch {
        // Ignore
      }
      if (hasDragged) {
        // Keep preventClick true briefly so child click handler is suppressed
        setTimeout(() => {
          preventClick = false
          hasDragged = false
        }, 60)
      }
    }

    const handleClickCapture = (e: MouseEvent) => {
      if (preventClick || hasDragged) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointercancel', handlePointerUp)
    el.addEventListener('click', handleClickCapture, { capture: true })

    onCleanup(() => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointercancel', handlePointerUp)
      el.removeEventListener('click', handleClickCapture, { capture: true })
      if (options.draggingClass) {
        el.classList.remove(options.draggingClass)
      }
    })
  })
}
