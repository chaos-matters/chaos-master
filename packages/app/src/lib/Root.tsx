import { createResource, onCleanup, Show } from 'solid-js'
import { tgpu } from 'typegpu'
import { gpuReady } from '@/lib/gpuStatus'
import { registerPagehideTeardown } from '@/lib/pagehideCleanup'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { vramLog } from '@/utils/vramLog'
import { RootContextProvider } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { TgpuRoot } from 'typegpu'
import type { RootContextValue } from './RootContext'

type RootProps = {
  adapterOptions?: GPURequestAdapterOptions
}

export function Root(props: ParentProps<RootProps>) {
  const [webgpu] = createResource(
    () => ({
      adapterOptions: props.adapterOptions,
    }),
    async ({ adapterOptions }): Promise<Omit<RootContextValue, 'gpuReady'>> => {
      let root: TgpuRoot | undefined = undefined

      // Experiment (flag-gated, default off): also free this root's VRAM on a
      // fast reload, where onCleanup below never runs. NEVER device.destroy()
      // (crashes the Firefox GPU process — see pagehideCleanup.ts). Registered
      // synchronously; the closure reads `root` lazily at unload time.
      const unregisterPagehide = registerPagehideTeardown(() => root?.destroy())

      onCleanup(() => {
        vramLog('[Root] Destroying TgpuRoot context')
        unregisterPagehide()
        root?.destroy()
        // Unsupported in some browsers, firefox crashes when this gets run
        //  with new WebGPU singleton interface, the devices should not be destroyed here
        // device?.destroy()
      })

      try {
        const { adapter, device } = await getWebgpuComponents(adapterOptions)
        // TODO: see whether it makes sense to make tgpu singleton as well, check docs
        root = tgpu.initFromDevice({ device })
        vramLog('[Root] Initialized new TgpuRoot context')
        return { adapter, device, root }
      } catch (err) {
        // Degraded mode: WebGPU is unavailable/unsupported. Resolve a null
        // context (instead of throwing) so the shell stays mounted and every
        // preview renders a poster — never a full-screen takeover. The status
        // signal (set in WebgpuAdapter) drives gpuReady() and the UI.
        console.error('[Root] WebGPU initialization failed:', err)
        return { adapter: null, device: null, root: null }
      }
    },
  )

  return (
    <Show when={webgpu()}>
      {(wg) => (
        <RootContextProvider value={{ ...wg(), gpuReady }}>
          {props.children}
        </RootContextProvider>
      )}
    </Show>
  )
}
