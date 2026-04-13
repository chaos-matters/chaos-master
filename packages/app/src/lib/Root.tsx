import { createMemo, Loading, onCleanup, Show } from 'solid-js'
import { tgpu } from 'typegpu'
import { getWebgpuComponents } from '@/lib/WebgpuAdapter'
import { RootContextProvider } from './RootContext'
import type { ParentProps } from 'solid-js'
import type { TgpuRoot } from 'typegpu'

type RootProps = {
  adapterOptions?: GPURequestAdapterOptions
}

export function Root(props: ParentProps<RootProps>) {
  // In Solid v2, createResource is replaced by async createMemo + Loading
  const webgpu = createMemo(async () => {
    let root: TgpuRoot | undefined = undefined
    onCleanup(() => {
      root?.destroy()
    })

    const { adapter, device } = await getWebgpuComponents(
      props.adapterOptions,
      {
        requiredFeatures: ['timestamp-query'],
      },
    )

    root = tgpu.initFromDevice({ device })
    return { adapter, device, root }
  })

  return (
    <Loading>
      <Show when={webgpu()} keyed>
        {(webgpuAccessor) => {
          const webgpu = webgpuAccessor()
          return (
          <RootContextProvider value={webgpu}>
            {props.children}
          </RootContextProvider>
          )
        }}
      </Show>
    </Loading>
  )
}
