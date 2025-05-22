import { createSignal, For } from 'solid-js'
import { vec2f, vec3f } from 'typegpu/data'
import { lightMode } from '@/flame/drawMode'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import Cross from '@/icons/cross.svg'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { useRequestModal } from '../Modal/Modal'
import ui from './LoadExampleFlameModal.module.css'
import type { ExampleID } from '@/flame/examples'
import type { FlameFunction } from '@/flame/flameFunction'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const CANCEL = Symbol('CANCEL')

type LoadExampleFlameModalProps = {
  respond: (value: ExampleID | typeof CANCEL) => void
}

function LoadExampleFlameModal(props: LoadExampleFlameModalProps) {
  useKeyboardShortcuts(
    {
      Escape: () => {
        props.respond(CANCEL)
        return true
      },
    },
    // force it to go before sidebar closing event
    // using the capturing phase
    { capture: true },
  )
  return (
    <>
      <div class={ui.galleryTitle}>
        <h1>Example Gallery</h1>
        <button
          class={ui.closeButton}
          onClick={() => {
            props.respond(CANCEL)
          }}
        >
          <Cross width="1rem" height="1rem" />
        </button>
      </div>
      <p>You can undo this operation.</p>
      <div class={ui.gallery}>
        <For each={Object.keys(examples) as ExampleID[]}>
          {(exampleId) => (
            <div
              class={ui.canvasContainer}
              onClick={() => {
                props.respond(exampleId)
              }}
            >
              <Root adapterOptions={{ powerPreference: 'high-performance' }}>
                <AutoCanvas pixelRatio={1}>
                  <Camera2D position={vec2f()} fovy={1}>
                    <Flam3
                      skipIters={15}
                      pointCount={1e5}
                      drawMode={lightMode}
                      backgroundColor={vec3f()}
                      exposure={0.25}
                      adaptiveFilterEnabled={true}
                      flameFunctions={examples[exampleId]}
                      renderInterval={Infinity}
                      onExportImage={() => {}}
                    />
                  </Camera2D>
                </AutoCanvas>
              </Root>
              <div class={ui.itemTitle}>{exampleId}</div>
            </div>
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
