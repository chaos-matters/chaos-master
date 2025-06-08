import { createSignal, For } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { examples } from '@/flame/examples'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { recordEntries } from '@/utils/record'
import { Button } from '../Button/Button'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './LoadFlameModal.module.css'
import type { FlameDescriptor } from '@/flame/transformFunction'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const CANCEL = 'cancel'

function zoomToFovy(zoom: number, fovyMin = 1, fovyMax = 60): number {
  return fovyMin + (1 - zoom) * (fovyMax - fovyMin)
}

function Preview(props: { flameDescriptor: FlameDescriptor }) {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <AutoCanvas pixelRatio={1}>
        <Camera2D
          position={vec2f(
            ...props.flameDescriptor.renderSettings.camera.position,
          )}
          fovy={zoomToFovy(props.flameDescriptor.renderSettings.camera.zoom)}
        >
          <Flam3
            quality={0.8}
            pointCountPerBatch={2e4}
            adaptiveFilterEnabled={true}
            flameDescriptor={props.flameDescriptor}
            renderInterval={1}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
          />
        </Camera2D>
      </AutoCanvas>
    </Root>
  )
}

type LoadFlameModalProps = {
  respond: (flameDescriptor: FlameDescriptor | typeof CANCEL) => void
}

function LoadFlameModal(props: LoadFlameModalProps) {
  async function loadFromFile() {
    const fileHandles = await window
      .showOpenFilePicker({
        id: 'load-flame-from-file',
        types: [{ accept: { 'image/png': ['.png'] } }],
      })
      .catch(() => undefined)
    if (!fileHandles) {
      return
    }
    const [fileHandle] = fileHandles
    const file = await fileHandle.getFile()
    const arrBuf = new Uint8Array(await file.arrayBuffer())
    const newFlameDescriptor = await extractFlameFromPng(arrBuf)
    props.respond(newFlameDescriptor)
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
        <For each={recordEntries(examples)}>
          {([exampleId, example], i) => (
            <button
              class={ui.item}
              onClick={() => {
                props.respond(example)
              }}
            >
              <DelayedShow delayMs={i() * 50}>
                <Preview flameDescriptor={example} />
              </DelayedShow>
              <div class={ui.itemTitle}>{exampleId}</div>
            </button>
          )}
        </For>
      </section>
    </>
  )
}

export function createLoadFlame(history: ChangeHistory<FlameDescriptor>) {
  const requestModal = useRequestModal()
  const [loadModalIsOpen, setLoadModalIsOpen] = createSignal(false)

  async function showLoadFlameModal() {
    setLoadModalIsOpen(true)
    const result = await requestModal<FlameDescriptor | typeof CANCEL>({
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
