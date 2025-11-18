import { createEffect, createSignal, Show } from 'solid-js'
import { useElementSize } from '@/utils/useElementSize'
import { CanvasContextProvider } from './CanvasContext'
import { useRootContext } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { ElementSize } from '@/utils/useElementSize'

const { navigator } = window

const { min, max, floor } = Math

type AutoCanvasProps = {
  class?: string
  pixelRatio?: number
}

export function AutoCanvas(props: ParentProps<AutoCanvasProps>) {
  const { device } = useRootContext()

  let canEl: HTMLCanvasElement | null
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
      // TODO: without this, for different resolutions, makes the preview moved
      el.style.width = `100%`
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

  function createContext(canEl: HTMLCanvasElement) {
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
    const context = canEl.getContext('webgpu')
    if (!context) {
      console.info('Context not available for some reason', context)
      throw new Error(`GPUCanvasContext failed to initialize.`)
    }
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque',
    })
    return { context, canvasFormat }
  }

  createEffect(() => {
    if (canEl) {
      setCanvas(canEl)
    }
  })

  return (
    <>
      <canvas ref={(el) => (canEl = el)} class={props.class} />
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
