import { vec2f } from 'typegpu/data'

export function eventToClip(
  ev: PointerEvent | WheelEvent,
  target?: HTMLElement,
) {
  const target_ = target ?? ev.target
  if (!(target_ instanceof HTMLElement)) {
    return vec2f()
  }
  const rect = target_.getBoundingClientRect()
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const x = ((ev.clientX - centerX) / rect.width) * 2
  const y = ((centerY - ev.clientY) / rect.height) * 2
  return vec2f(x, y)
}
