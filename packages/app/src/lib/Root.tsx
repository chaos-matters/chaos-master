import { createResource, onCleanup, Show } from 'solid-js'
import { tgpu } from 'typegpu'
import { RootContextProvider } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { TgpuRoot } from 'typegpu'

const { navigator } = window

type RootProps = {
  adapterOptions?: GPURequestAdapterOptions
}

export function Root(props: ParentProps<RootProps>) {
  const [webgpu] = createResource(
    () => ({ adapterOptions: props.adapterOptions }),
    async ({ adapterOptions }) => {
      let root: TgpuRoot | undefined = undefined
      let device: GPUDevice | undefined = undefined
      onCleanup(() => {
        root?.destroy()
        device?.destroy()
      })
      const adapter = await navigator.gpu.requestAdapter(adapterOptions)
      if (!adapter) {
        throw new Error(
          `Failed to get GPUAdapter, make sure to use a browser with WebGPU support.`,
        )
      }
      console.info(`Using ${adapter.info.vendor} adapter.`)
      device = await adapter.requestDevice({
        requiredFeatures: ['float32-blendable', 'timestamp-query'],
      })
      root = tgpu.initFromDevice({ device })
      return { adapter, device, root }
    },
  )

  return (
    <Show when={webgpu()} keyed>
      {(webgpu) => (
        <RootContextProvider value={webgpu}>
          {props.children}
        </RootContextProvider>
      )}
    </Show>
  )
}
