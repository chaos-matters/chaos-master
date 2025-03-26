import { createEffect, createSignal, ParentProps, Show } from 'solid-js'
import { ElementSize, useElementSize } from '@/utils/useElementSize'
import { CanvasContextProvider } from './CanvasContext'
import { useRootContext } from './RootContext'

const { navigator } = window

const { min, max, floor } = Math

type AutoCanvasProps = {
  class?: string
  pixelRatio?: number
}

export function AutoCanvas(props: ParentProps<AutoCanvasProps>) {
  const { device } = useRootContext()

  const scaledCanvasSize = (size: ElementSize): ElementSize => {
    const pixelRatio = props.pixelRatio ?? 1
    const maxDim = device.limits.maxTextureDimension2D
    return {
      ...size,
      widthPX: floor(max(1, min(size.widthPX * pixelRatio, maxDim))),
      heightPX: floor(max(1, min(size.heightPX * pixelRatio, maxDim))),
    }
  }

  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()
  const canvasSize = useElementSize(
    () => canvas()?.parentElement,
    (size) => {
      const el = canvas()
      if (!el) {
        return
      }
      const { widthPX, heightPX } = scaledCanvasSize(size)
      el.width = widthPX
      el.height = heightPX
      el.style.width = `${size.width.toFixed(0)}px`
      el.style.height = `${size.height.toFixed(0)}px`
    },
  )

  // also update canvas size when props.pixelRatio changes
  createEffect(() => {
    const el = canvas()
    const size = canvasSize()
    if (!el || !size) {
      return
    }
    const { widthPX, heightPX } = scaledCanvasSize(size)
    el.width = widthPX
    el.height = heightPX
  })

  function createContext(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('webgpu')
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
    if (!context) {
      throw new Error(`GPUCanvasContext failed to initialize.`)
    }
    context.configure({
      device,
      format: canvasFormat,
    })
    return { context, canvasFormat }
  }

  return (
    <>
      <canvas ref={setCanvas} class={props.class} />
      <Show when={canvas()} keyed>
        {(canvas) => (
          <CanvasContextProvider
            value={{
              canvas,
              ...createContext(canvas),
              pixelRatio: () => props.pixelRatio ?? 1,
              canvasSize: () => {
                const size = canvasSize()
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
