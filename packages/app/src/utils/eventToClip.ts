import { vec2f } from 'typegpu/data'

export function eventToClip(
  ev: { clientX: number; clientY: number },
  target: EventTarget | null,
) {
  if (!(target instanceof HTMLElement)) {
    return vec2f()
  }
  // TODO: cache getBoundingClientRect
  // because this causes a relayout which is pretty slow, 1-2ms
  const rect = target.getBoundingClientRect()
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const x = ((ev.clientX - centerX) / rect.width) * 2
  const y = ((centerY - ev.clientY) / rect.height) * 2
  return vec2f(x, y)
}
