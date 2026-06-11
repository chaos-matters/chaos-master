import { createEffect, createResource, Match, onCleanup, Switch, } from 'solid-js'
import { tgpu } from 'typegpu'
import { WebgpuNotSupported } from '@/components/ErrorHandling/ErrorHandling'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { vramLog } from '@/utils/vramLog'
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
        vramLog('[Root] Destroying TgpuRoot context')
        root?.destroy()
        // Unsupported in some browsers, firefox crashes when this gets run
        //  with new WebGPU singleton interface, the devices should not be destroyed here
        // device?.destroy()
      })

      const { adapter, device } = await getWebgpuComponents(adapterOptions)

      // TODO: see whether it makes sense to make tgpu singleton as well, check docs
      root = tgpu.initFromDevice({ device })
      vramLog('[Root] Initialized new TgpuRoot context')
      return { adapter, device, root }
    },
  )

  createEffect(() => {
    const err = webgpu.error
    if (err) {
      console.error('[Root] WebGPU initialization failed:', err)
    }
  })

  return (
    <Switch>
      <Match when={webgpu.error}>
        <WebgpuNotSupported />
      </Match>
      <Match when={webgpu()}>
        {(wg) => (
          <RootContextProvider value={wg()}>
            {props.children}
          </RootContextProvider>
        )}
      </Match>
    </Switch>
  )
}
