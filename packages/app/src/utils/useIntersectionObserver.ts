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

/**
 * A single IntersectionObserver shared across many elements — e.g. every tile in
 * a large gallery — rooted on an optional scroll container. Returns a `track`
 * function: call it (inside a reactive owner) with an element accessor and get
 * back a boolean accessor that is `true` while that element is within — or near,
 * per `options.rootMargin` — the root.
 *
 * One observer for N elements is far cheaper than N separate observers, and
 * gating a mount on the returned accessor keeps live content (such as WebGPU
 * preview canvases) bounded to the on-screen window instead of one per item.
 * Root it on the scroll container (not the viewport) so `rootMargin` can preload
 * rows just past the fold — a viewport root can't, because the inner scroll
 * clips them first.
 */
export function createSharedIntersectionObserver(
  root: Accessor<Element | null | undefined>,
  options?: { rootMargin?: string; threshold?: number | number[] },
) {
  const setters = new Map<Element, (visible: boolean) => void>()
  let observer: IntersectionObserver | undefined
  createEffect(() => {
    const rootEl = root()
    observer?.disconnect()
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setters.get(entry.target)?.(entry.isIntersecting)
        }
      },
      {
        root: rootEl ?? null,
        rootMargin: options?.rootMargin,
        threshold: options?.threshold,
      },
    )
    // Re-observe elements that registered before the observer (or its root)
    // existed, and after a root change recreates the observer.
    for (const el of setters.keys()) {
      observer.observe(el)
    }
  })
  onCleanup(() => {
    observer?.disconnect()
  })

  return function track(
    target: Accessor<Element | null | undefined>,
  ): Accessor<boolean> {
    const [visible, setVisible] = createSignal(false)
    createEffect(() => {
      const el = target()
      if (!el) {
        return
      }
      setters.set(el, setVisible)
      observer?.observe(el)
      onCleanup(() => {
        observer?.unobserve(el)
        setters.delete(el)
        setVisible(false)
      })
    })
    return visible
  }
}
