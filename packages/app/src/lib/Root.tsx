import { createResource, onCleanup, Show } from 'solid-js'
import { tgpu } from 'typegpu'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { RootContextProvider } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { TgpuRoot } from 'typegpu'

type RootProps = {
  adapterOptions?: GPURequestAdapterOptions
}

export function Root(props: ParentProps<RootProps>) {
  const [webgpu] = createResource(
    () => ({
      adapterOptions: props.adapterOptions,
    }),
    async ({ adapterOptions }) => {
      let root: TgpuRoot | undefined = undefined
      onCleanup(() => {
        root?.destroy()
        // Unsupported in some browsers, firefox crashes when this gets run
        //  with new WebGPU singleton interface, the devices should not be destroyed here
        // device?.destroy()
      })

      const { adapter, device } = await getWebgpuComponents(adapterOptions, {
        requiredFeatures: ['timestamp-query'],
      })

      // TODO: see whether it makes sense to make tgpu singleton as well, check docs
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
