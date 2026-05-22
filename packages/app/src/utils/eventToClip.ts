import { vec2f } from 'typegpu/data'

const rectCache = new WeakMap<HTMLElement, DOMRectReadOnly>()
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    rectCache.delete(entry.target as HTMLElement)
  }
})

export function getCachedBoundingRect(el: HTMLElement): DOMRectReadOnly {
  let rect = rectCache.get(el)
  if (!rect) {
    rect = el.getBoundingClientRect()
    rectCache.set(el, rect)
    resizeObserver.observe(el)
  }
  return rect
}

export function eventToClip(
  ev: { clientX: number; clientY: number },
  target: EventTarget | null,
) {
  if (!(target instanceof HTMLElement)) {
    return vec2f()
  }
  const rect = getCachedBoundingRect(target)
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const x = ((ev.clientX - centerX) / rect.width) * 2
  const y = ((centerY - ev.clientY) / rect.height) * 2
  return vec2f(x, y)
}
