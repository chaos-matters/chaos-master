import { createEffect, createSignal, For } from 'solid-js'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { lightMode } from '@/flame/drawMode'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { recordKeys } from '@/utils/recordKeys'
import { Button } from '../Button/Button'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/Modal'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './LoadFlameModal.module.css'
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

type LoadFlameModalProps = {
  respond: (flameDescriptor: FlameFunction[] | typeof CANCEL) => void
}

function LoadFlameModal(props: LoadFlameModalProps) {
  async function loadFromFile() {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{ accept: { 'image/png': ['.png'] } }],
    })
    const file = await fileHandle.getFile()
    const arrBuf = new Uint8Array(await file.arrayBuffer())
    const newFlameFunctions = await extractFlameFromPng(arrBuf)
    props.respond(newFlameFunctions)
  }

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Load Flame
        <span class={ui.undoMessage}>You can undo this operation.</span>
      </ModalTitleBar>
      <section>
        From disk <Button onClick={loadFromFile}>Choose File</Button>
      </section>
      <h2>Example Gallery</h2>
      <section class={ui.gallery}>
        <For each={recordKeys(examples)}>
          {(exampleId, i) => (
            <button
              class={ui.item}
              onClick={() => {
                props.respond(examples[exampleId])
              }}
            >
              <DelayedShow delayMs={i() * 50}>
                <Preview flameFunctions={examples[exampleId]} />
              </DelayedShow>
              <div class={ui.itemTitle}>{exampleId}</div>
            </button>
          )}
        </For>
      </section>
    </>
  )
}

export function createLoadFlame(history: ChangeHistory<FlameFunction[]>) {
  const requestModal = useRequestModal()
  const [loadModalIsOpen, setLoadModalIsOpen] = createSignal(false)

  async function showLoadFlameModal() {
    setLoadModalIsOpen(true)
    const result = await requestModal<FlameFunction[] | typeof CANCEL>({
      content: ({ respond }) => <LoadFlameModal respond={respond} />,
    })
    setLoadModalIsOpen(false)
    if (result === CANCEL) {
      return
    }
    // structuredClone required in order to not modify the original, as store in solidjs does
    history.replace(structuredClone(result))
  }

  return {
    showLoadFlameModal,
    loadModalIsOpen,
  }
}
