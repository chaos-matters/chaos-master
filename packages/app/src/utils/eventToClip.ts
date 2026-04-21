import { vec2f } from 'typegpu/data'

// Cache bounding rect per element to avoid expensive getBoundingClientRect
// calls on every pointer move (1-2ms synchronous layout recalc each time).
// Rect is invalidated on resize (via ResizeObserver) and on scroll.
const rectCache = new WeakMap<HTMLElement, DOMRectReadOnly>()

function onScroll() {
  // Invalidate all cached rects on any scroll
  rectCache.clear()
}
window.addEventListener('scroll', onScroll, { passive: true })

const ro = new ResizeObserver(() => {
  rectCache.clear()
})
ro.observe(document.documentElement)

function getCachedRect(el: HTMLElement): DOMRectReadOnly {
  const cached = rectCache.get(el)
  if (cached) {
    return cached
  }
  const rect = el.getBoundingClientRect()
  rectCache.set(el, rect)
  return rect
}

export function getElementCenter(el: HTMLElement): {
  centerX: number
  centerY: number
} {
  const rect = getCachedRect(el)
  return {
    centerX: rect.x + rect.width / 2,
    centerY: rect.y + rect.height / 2,
  }
}

export function eventToClip(
  ev: { clientX: number; clientY: number },
  target: EventTarget | null,
) {
  if (!(target instanceof HTMLElement)) {
    return vec2f()
  }
  const rect = getCachedRect(target)
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const x = ((ev.clientX - centerX) / rect.width) * 2
  const y = ((centerY - ev.clientY) / rect.height) * 2
  return vec2f(x, y)
}
