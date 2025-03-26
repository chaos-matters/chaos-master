import { createEffect, createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export type ElementSize = {
  /** width of the element rectangle */
  width: number
  /** height of the element rectangle */
  height: number
  /** width of the element rectangle in physical pixels (integer) */
  widthPX: number
  /** height of the element rectangle in physical pixels (integer) */
  heightPX: number
}

export function useElementSize(
  target: Accessor<HTMLElement | null | undefined>,
  onChange?: (size: ElementSize) => void,
) {
  const [size, setSize] = createSignal<ElementSize>()
  createEffect(() => {
    const t = target()
    if (!t) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]?.devicePixelContentBoxSize[0]
      // Don't measure the element if not connected to the document.
      // Element existing but not connected to document can happen while
      // Suspense mechanism is rendering the fallback.
      if (!t.isConnected || !entry) {
        return
      }
      const { width, height } = t.getBoundingClientRect()
      const widthPX = entry.inlineSize
      const heightPX = entry.blockSize
      const newSize: ElementSize = {
        width,
        height,
        widthPX,
        heightPX,
      }
      onChange?.(newSize)
      setSize(newSize)
    })
    observer.observe(t)
    onCleanup(() => {
      observer.disconnect()
    })
  })
  return size
}
