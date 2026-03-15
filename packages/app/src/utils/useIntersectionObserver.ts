import { createEffect, createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function useIntersectionObserver(
  target: Accessor<HTMLElement | null | undefined>,
  onChange?: (isVisible: boolean) => void,
) {
  const [intersection, setIntersection] =
    createSignal<IntersectionObserverEntry>()
  createEffect(() => {
    const t = target()
    if (!t) {
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry === undefined || !t.isConnected) {
        setIntersection(undefined)
        return
      }
      const isVisible = entry.isIntersecting
      if (onChange !== undefined) {
        onChange(isVisible)
      }
      setIntersection(entry)
    })
    observer.observe(t)
    onCleanup(() => {
      observer.disconnect()
    })
  })
  return intersection
}
