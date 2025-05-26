import { createEffect, createSignal, For } from 'solid-js'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { lightMode } from '@/flame/drawMode'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { recordKeys } from '@/utils/recordKeys'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/Modal'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './LoadExampleFlameModal.module.css'
import type { ExampleID } from '@/flame/examples'
import type { FlameFunction } from '@/flame/flameFunction'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const CANCEL = Symbol('CANCEL')

function Preview(props: { flameFunctions: FlameFunction[] }) {
  const [renderInterval, setRenderInterval] = createSignal(1)

  createEffect(() => {
    setTimeout(() => {
      setRenderInterval(Infinity)
    }, 3000)
  })

  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <AutoCanvas pixelRatio={1}>
        <Camera2D position={vec2f()} fovy={1}>
          <Flam3
            skipIters={15}
            pointCount={1e4}
            drawMode={lightMode}
            exposure={0.25}
            adaptiveFilterEnabled={true}
            flameFunctions={props.flameFunctions}
            renderInterval={renderInterval()}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
            backgroundColor={vec3f(0)}
          />
        </Camera2D>
      </AutoCanvas>
    </Root>
  )
}

type LoadExampleFlameModalProps = {
  respond: (value: ExampleID | typeof CANCEL) => void
}

function LoadExampleFlameModal(props: LoadExampleFlameModalProps) {
  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Example Gallery
      </ModalTitleBar>
      <p>You can undo this operation.</p>
      <div class={ui.gallery}>
        <For each={recordKeys(examples)}>
          {(exampleId, i) => (
            <button
              class={ui.item}
              onClick={() => {
                props.respond(exampleId)
              }}
            >
              <DelayedShow delayMs={i() * 50}>
                <Preview flameFunctions={examples[exampleId]} />
              </DelayedShow>
              <div class={ui.itemTitle}>{exampleId}</div>
            </button>
          )}
        </For>
      </div>
    </>
  )
}

export function createLoadExampleFlame(
  history: ChangeHistory<FlameFunction[]>,
) {
  const requestModal = useRequestModal()
  const [loadExampleModalIsOpen, setLoadExampleModalIsOpen] =
    createSignal(false)

  async function showLoadExampleFlameModal() {
    setLoadExampleModalIsOpen(true)
    const result = await requestModal<ExampleID | typeof CANCEL>({
      content: ({ respond }) => <LoadExampleFlameModal respond={respond} />,
    })
    setLoadExampleModalIsOpen(false)
    if (result === CANCEL) {
      return
    }
    // structuredClone required in order to not modify the original, as store in solidjs does
    history.replace(structuredClone(examples[result]))
  }

  return {
    showLoadExampleFlameModal,
    loadExampleModalIsOpen,
  }
}
