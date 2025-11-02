import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function useIntersectionObserver(
  target: Accessor<HTMLElement | null | undefined>,
  onIntersect?: () => void,
) {
  createEffect(() => {
    const t = target()
    if (!t) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined) {
        return
      }
      if (entry.isIntersecting && onIntersect !== undefined) {
        onIntersect()
      }
    })
    observer.observe(t)
    onCleanup(() => {
      observer.disconnect()
    })
  })
}
