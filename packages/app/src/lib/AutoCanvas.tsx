import { createEffect, createSignal, Show } from 'solid-js'
import { PreviewPoster } from '@/components/ErrorHandling/PreviewPoster'
import { gpuStatus, setGpuStatus } from '@/lib/gpuStatus'
import { useElementSize } from '@/utils/useElementSize'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { CanvasContextProvider } from './CanvasContext'
import { useRootContext } from './RootContext'
import type { JSX, ParentProps } from 'solid-js'
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
  // Accessibility: forwarded to the underlying <canvas>. The default canvas has
  // no text alternative; the main editor instance sets these so screen readers
  // get a name + description for the otherwise-opaque WebGPU surface.
  role?: JSX.HTMLAttributes<HTMLCanvasElement>['role']
  ariaLabel?: string
  ariaDescribedby?: string
}

export function AutoCanvas(props: ParentProps<AutoCanvasProps>) {
  const { device, gpuReady } = useRootContext()

  // iOS Safari fix: canvas.getContext('webgpu') returns null when called before
  // the canvas is fully mounted. Store the element via ref, then defer the signal
  // update to a createEffect so createContext runs after the canvas is in the DOM.
  let canvasRef: HTMLCanvasElement | undefined
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()

  const scaledCanvasSize = (size: ElementSize): ElementSize => {
    const pixelRatio = props.pixelRatio ?? 1
    // The size effect runs in the component body regardless of the gpuReady
    // gate, so this can be read during the live -> null mid-session transition.
    // Fall back to the WebGPU spec minimum when there's no device.
    const maxDim = device?.limits.maxTextureDimension2D ?? 8192
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

  function createContext(canEl: HTMLCanvasElement, dev: GPUDevice) {
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat()
    const context = canEl.getContext('webgpu')
    if (!context) {
      // Mark the session unavailable rather than throwing: ~18 modal canvas
      // sites have no surrounding ErrorBoundary, so a throw here would reach the
      // App-level full-screen takeover. Flipping the status re-renders this
      // gate to the poster instead.
      console.error('[WebGPU] canvas.getContext("webgpu") returned null')
      setGpuStatus('unavailable')
      return null
    }
    const alphaMode = props.alphaMode ?? 'opaque'
    context.configure({
      device: dev,
      format: canvasFormat,
      alphaMode,
    })
    return { context, canvasFormat }
  }

  return (
    <Show
      when={gpuReady()}
      fallback={<PreviewPoster status={gpuStatus()} class={props.class} />}
    >
      <canvas
        ref={(el) => {
          canvasRef = el
          props.ref?.(el)
        }}
        class={props.class}
        role={props.role}
        aria-label={props.ariaLabel}
        aria-describedby={props.ariaDescribedby}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      <Show when={canvas()} keyed>
        {(canvas) => {
          const dev = device
          if (!dev) {
            return null
          }
          const created = createContext(canvas, dev)
          if (!created) {
            return null
          }
          return (
            <CanvasContextProvider
              value={{
                canvas,
                ...created,
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
          )
        }}
      </Show>
    </Show>
  )
}
