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
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) {
          return
        }
        if (entry.isIntersecting && onIntersect !== undefined) {
          onIntersect()
        }
      },
      {
        root: t.parentElement,
        rootMargin: '0px 0px 200px 0px',
        threshold: 0.1,
      },
    )
    observer.observe(t)
    onCleanup(() => {
      observer.disconnect()
    })
  })
}
