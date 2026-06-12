import { createEffect, createSignal, Show } from 'solid-js'
import { useElementSize } from '@/utils/useElementSize'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { CanvasContextProvider } from './CanvasContext'
import { useRootContext } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { ElementSize } from '@/utils/useElementSize'

const { navigator } = window

const { min, max, floor } = Math

type AutoCanvasProps = {
  class?: string
  ref?: (el: HTMLCanvasElement) => void
  pixelRatio?: number
  fixedResolution?: { width: number; height: number }
  alphaMode?: GPUCanvasAlphaMode
  onVisibilityChange?: (isVisible: boolean) => void
}

export function AutoCanvas(props: ParentProps<AutoCanvasProps>) {
  const { device } = useRootContext()

  // iOS Safari fix: canvas.getContext('webgpu') returns null when called before
  // the canvas is fully mounted. Store the element via ref, then defer the signal
  // update to a createEffect so createContext runs after the canvas is in the DOM.
  let canvasRef: HTMLCanvasElement | undefined
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()

  const scaledCanvasSize = (size: ElementSize): ElementSize => {
    const pixelRatio = props.pixelRatio ?? 1
    const maxDim = device.limits.maxTextureDimension2D
    return {
      ...size,
      widthPX: floor(max(1, min(size.widthPX * pixelRatio, maxDim))),
      heightPX: floor(max(1, min(size.heightPX * pixelRatio, maxDim))),
    }
  }

  const autoSize = useElementSize(() =>
    props.fixedResolution ? undefined : canvas()?.parentElement,
  )

  const activeSize = (): ElementSize | undefined => {
    if (props.fixedResolution) {
      return {
        width: props.fixedResolution.width,
        height: props.fixedResolution.height,
        widthPX: props.fixedResolution.width,
        heightPX: props.fixedResolution.height,
      }
    }
    return autoSize()
  }

  createEffect(() => {
    const el = canvas()
    const size = activeSize()
    if (!el || !size) {
      return
    }
    const { widthPX, heightPX } = scaledCanvasSize(size)
    el.width = widthPX
    el.height = heightPX
    el.style.width = `100%`
    el.style.height = `100%`
    el.style.display = `block`
  })

  createEffect(() => {
    const el = canvas()
    if (el && props.onVisibilityChange) {
      useIntersectionObserver(canvas, props.onVisibilityChange)
    }
  })

  // Deferred: set the canvas signal after the element is mounted in the DOM
  createEffect(() => {
    if (canvasRef) {
      setCanvas(canvasRef)
    }
  })

  function createContext(canEl: HTMLCanvasElement) {
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
    const context = canEl.getContext('webgpu')
    if (!context) {
      console.error('[WebGPU] canvas.getContext("webgpu") returned null')
      throw new Error(`GPUCanvasContext failed to initialize.`, {
        cause: 'WebGPU',
      })
    }
    const alphaMode = props.alphaMode ?? 'opaque'
    context.configure({
      device,
      format: canvasFormat,
      alphaMode,
    })
    return { context, canvasFormat }
  }

  return (
    <>
      <canvas
        ref={(el) => {
          canvasRef = el
          props.ref?.(el)
        }}
        class={props.class}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      <Show when={canvas()} keyed>
        {(canvas) => (
          <CanvasContextProvider
            value={{
              canvas,
              ...createContext(canvas),
              pixelRatio: () => props.pixelRatio ?? 1,
              canvasSize: () => {
                const size = activeSize()
                if (!size) {
                  return { width: 0, height: 0 }
                }
                const { widthPX, heightPX } = scaledCanvasSize(size)
                return {
                  width: widthPX,
                  height: heightPX,
                }
              },
            }}
          >
            {props.children}
          </CanvasContextProvider>
        )}
      </Show>
    </>
  )
}
