import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function useIntersectionObserver(
  target: Accessor<HTMLElement | null | undefined>,
  onChange?: (isVisible: boolean) => void,
) {
  createEffect(() => {
    const t = target()
    if (!t) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined || !t.isConnected) {
        return
      }
      const isVisible = entry.isIntersecting
      if (onChange !== undefined) {
        onChange(isVisible)
      }
    })
    observer.observe(t)
    onCleanup(() => {
      observer.disconnect()
    })
  })
}
