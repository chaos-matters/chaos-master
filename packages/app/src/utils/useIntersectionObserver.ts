import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function useIntersectionObserver(
  target: Accessor<HTMLElement | null | undefined>,
  root: Accessor<HTMLElement | null | undefined>,
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
        console.info('Log', entry, root())
        if (entry.isIntersecting && onIntersect !== undefined) {
          onIntersect()
        }
      },
      {
        root: root(),
        rootMargin: '200px',
        threshold: 0.2,
      },
    )
    observer.observe(t)
    onCleanup(() => {
      observer.disconnect()
    })
  })
}
