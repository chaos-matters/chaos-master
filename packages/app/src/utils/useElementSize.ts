import { createEffect, createSignal, onCleanup } from 'solid-js'
import { CANVAS_RESIZE_DEBOUNCE_MS } from '@/defaults'
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
    let resizeTimeout: number | undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || !t.isConnected) {
        return
      }

      let pixelContentBox
      let contentBox
      if (!Array.isArray(entry.devicePixelContentBoxSize)) {
        // Safari support (ios)
        contentBox = Array.isArray(entry.contentBoxSize)
          ? entry.contentBoxSize[0]
          : entry.contentBoxSize

        const dpr = window.devicePixelRatio || 1
        pixelContentBox = {
          inlineSize: contentBox.inlineSize * dpr,
          blockSize: contentBox.blockSize * dpr,
        }
      } else {
        contentBox = entry.contentBoxSize[0]
        pixelContentBox = entry.devicePixelContentBoxSize[0]
      }

      const newSize: ElementSize = {
        width: contentBox.inlineSize,
        height: contentBox.blockSize,
        widthPX: pixelContentBox.inlineSize,
        heightPX: pixelContentBox.blockSize,
      }

      // Debounce the canvas resizing.
      // Resizing a browser window triggers this at 60fps.
      // Every trigger causes AutoCanvas to change the HTMLCanvasElement resolution,
      // which cascades into Flam3 instantly reallocating all WebGPU buffers for
      // the new resolution. Rapidly allocating and destroying buffers at 60fps
      // severely fragments the Vulkan memory pool on wgpu/Firefox and immediately
      // causes OOMs, especially when multiple variation previews are on-screen.
      // A configured debounce ensures buffers are only reallocated once the drag stops.
      // CSS layout keeps the canvas visually stretched in the meantime.
      if (resizeTimeout !== undefined) {
        window.clearTimeout(resizeTimeout)
      }
      resizeTimeout = window.setTimeout(() => {
        // Skip identical-size updates. ResizeObserver also fires on layout
        // reflows that don't change the box — notably a modal opening/closing on
        // iOS (safe-area / URL-bar shifts). Committing a fresh same-size object
        // would still notify subscribers (Solid compares by reference),
        // reallocating every WebGPU buffer and resetting flame accumulation —
        // a visible flicker for no real size change.
        const prev = size()
        if (
          prev !== undefined &&
          prev.width === newSize.width &&
          prev.height === newSize.height &&
          prev.widthPX === newSize.widthPX &&
          prev.heightPX === newSize.heightPX
        ) {
          return
        }
        onChange?.(newSize)
        setSize(newSize)
      }, CANVAS_RESIZE_DEBOUNCE_MS)
    })
    observer.observe(t)
    onCleanup(() => {
      if (resizeTimeout !== undefined) window.clearTimeout(resizeTimeout)
      observer.disconnect()
    })
  })
  return size
}
