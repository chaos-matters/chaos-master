import { createEffect, createSignal, Show } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_QUALITY } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { latestSchemaVersion, validateFlameWithErrors, } from '@/flame/schema/flameSchema'
import { getTransformsForEachVariation, getTransformWithAllVariations, } from '@/flame/variations/utils'
import { Copy } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { getFlameLink } from '@/utils/jsonQueryParam'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './Migration.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const { navigator } = globalThis

const CANCEL = 'cancel'

function Preview(props: { flameDescriptor: FlameDescriptor }) {
  return (
    <Root
      adapterOptions={{
        powerPreference: 'high-performance',
      }}
    >
      <AutoCanvas pixelRatio={1}>
        <Camera2D
          position={vec2f(
            ...props.flameDescriptor.renderSettings.camera.position,
          )}
          zoom={props.flameDescriptor.renderSettings.camera.zoom}
        >
          <Flam3
            quality={DEFAULT_QUALITY}
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

type MigrationFlameModalProps = {
  respond: (flameDescriptor: FlameDescriptor | typeof CANCEL) => void
  currentFlame: FlameDescriptor
}

async function importFromFile(): Promise<File | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const fileHandles = await window
        .showOpenFilePicker({
          id: 'load-flame-from-file',
          types: [
            {
              accept: { 'image/png': ['.png'], 'application/json': ['.json'] },
            },
          ],
        })
        .catch(() => undefined)
      if (!fileHandles) {
        return null
      }
      const [fileHandle] = fileHandles
      return await fileHandle.getFile()
    }
  } catch (_) {
    // fall through to input-based picker any failure
  }

  // fallback: hidden input element (works on Firefox and Safari/iOS)
  return await new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,.png,application/json,.json'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.width = '1px'
    input.style.height = '1px'
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null
      resolve(file ?? null)
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolve(null)
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}

function Migration(props: MigrationFlameModalProps) {
  const [sourceJson, setSourceJson] = createSignal('')
  const [inputFlameVersion, setInputFlameVersion] = createSignal('')
  const [outputData, setOutputData] = createSignal('')
  const [previewFlame, setPreviewFlame] = createSignal<
    FlameDescriptor | undefined
  >(structuredClone(props.currentFlame))

  function getPrettyJson(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }

  function stringifyError(err: unknown): string {
    if (err instanceof Error) {
      return err.stack ?? err.message
    }
    if (typeof err === 'string') {
      return err
    }
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }

  createEffect(() => {
    setSourceJson(getPrettyJson(JSON.stringify(props.currentFlame)))
    if (props.currentFlame.version !== undefined) {
      setInputFlameVersion(props.currentFlame.version)
    }
  })

  const setFlame = (flame: FlameDescriptor) => {
    setPreviewFlame(flame)
    //         (draft) => {
    //   draft.metadata = flame.metadata
    //   draft.transforms = flame.transforms
    //   draft.renderSettings = flame.renderSettings
    //   draft.version = flame.version
    // })
  }

  async function loadFromFile() {
    const file = await importFromFile()
    if (!file) return
    try {
      if (file.type.startsWith('image/png')) {
        const arrBuf = new Uint8Array(await file.arrayBuffer())
        const extractedData: unknown = await extractFlameFromPng(arrBuf).catch(
          () => undefined,
        )
        setSourceJson(getPrettyJson(JSON.stringify(extractedData)))
        validateInputJson()
      } else if (file.type.startsWith('application/json')) {
        const fileJson = await file.text()
        setSourceJson(getPrettyJson(fileJson))
        validateInputJson()
      }
    } catch (err) {
      console.warn(err)
    }
  }

  function validateInputJson() {
    setOutputData('')
    const errorData: string[] = []
    if (sourceJson()) {
      try {
        const newFlame = validateFlameWithErrors(
          JSON.parse(sourceJson()),
          (err) => errorData.push(err),
        )
        if (newFlame !== undefined) {
          setFlame(newFlame)
        }
      } catch (err) {
        console.warn(err)
        errorData.unshift(stringifyError(err))
      }
    }
    if (errorData.length !== 0) {
      setPreviewFlame(undefined)
      setInputFlameVersion('?.?')
    }
    setOutputData(errorData.join('\n'))
    return errorData
  }

  function handleMigrate() {
    setOutputData('')
    const errors = validateInputJson()
    if (errors.length === 0) {
      setPreviewFlame((draft) => {
        if (draft !== undefined) {
          draft.version = latestSchemaVersion
          return draft
        }
      })
      setOutputData(getPrettyJson(JSON.stringify(previewFlame())))
    }
    // TODO: find a neat way to fill in missing keys and variation params as a minimal
    // migration strategy
    console.warn('migration not implemented')
    errors.forEach((err) => {
      console.info(err)
    })
  }

  function handleCreateTransformsExampleSet() {
    const flames = getTransformsForEachVariation()
    setSourceJson(getPrettyJson(JSON.stringify(flames)))
    validateInputJson()
  }

  function handleCreateVariationsExampleSet() {
    const flames = getTransformWithAllVariations()
    setSourceJson(getPrettyJson(JSON.stringify(flames)))
    validateInputJson()
  }

  function isJsonString(value: string): boolean {
    try {
      JSON.parse(value)
      return true
    } catch {
      return false
    }
  }

  async function toClipboard(text: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.warn(err)
    }
  }

  function handleCopyInput() {
    void toClipboard(sourceJson().trim())
  }

  function handleCopyOutput() {
    void toClipboard(outputData().trim())
  }

  async function handleCopyUrl() {
    const outJson = outputData()
    const inJson = sourceJson()
    const json = isJsonString(outJson)
      ? outJson
      : isJsonString(inJson)
        ? inJson
        : ''
    let flameUrl: string = ''
    if (json === '') {
      // generate preview flame URL
      flameUrl = await getFlameLink(previewFlame)
    } else {
      flameUrl = await getFlameLink(JSON.parse(json))
    }
    await toClipboard(flameUrl)
  }

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Migration Toolbox
      </ModalTitleBar>
      <div class={ui.previewHeader}>
        <Button onClick={loadFromFile}>Load Flame</Button>
      </div>
      <section class={ui.migration}>
        <div class={ui.previewColumn}>
          <div class={ui.textPanel}>
            <div class={ui.textPanelHeader}>
              <h3 class={ui.textPanelTitle}>
                Input Flame (v
                {inputFlameVersion() ? inputFlameVersion() : '0.0'})
              </h3>
              <button
                class={ui.inlineCopyButton}
                type="button"
                title="Copy source JSON"
                aria-label="Copy source JSON"
                onClick={handleCopyInput}
              >
                <Copy />
              </button>
            </div>
            <div class={ui.textPanelBody}>
              <textarea
                class={ui.jsonInput}
                autofocus
                placeholder="Paste JSON here..."
                value={sourceJson()}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault()
                    validateInputJson()
                  }
                }}
                onInput={(event) => {
                  setSourceJson(event.currentTarget.value)
                }}
              />
            </div>
          </div>
        </div>
        <div class={ui.previewColumn} classList={{ [ui.outputColumn]: true }}>
          <div class={ui.outputSplit}>
            <div class={ui.textPanel}>
              <div class={ui.textPanelHeader}>
                <h3 class={ui.textPanelTitle}>
                  Output Flame (v{previewFlame.version ?? latestSchemaVersion})
                </h3>
                <button
                  class={ui.inlineCopyButton}
                  type="button"
                  title="Copy output"
                  aria-label="Copy output"
                  onClick={handleCopyOutput}
                >
                  <Copy />
                </button>
              </div>
              <div class={ui.textPanelBody}>
                <pre class={ui.outputPreview}>{outputData()}</pre>
              </div>
            </div>
            <section class={ui.previewFlame}>
              <Show when={previewFlame()}>
                <button
                  class={ui.item}
                  onClick={() => {
                    props.respond(previewFlame())
                  }}
                >
                  <Preview flameDescriptor={previewFlame()} />
                  <div class={ui.itemTitle}>
                    {previewFlame().metadata.author}
                  </div>
                </button>
              </Show>
            </section>
          </div>
        </div>
      </section>
      <section class={ui.actions}>
        <Button onClick={validateInputJson}>Validate</Button>
        <Button onClick={handleMigrate}>Migrate</Button>
        <Button onClick={handleCopyUrl}>Get link</Button>
        <Button onClick={handleCreateVariationsExampleSet}>
          Create Variations Set
        </Button>
        <Button onClick={handleCreateTransformsExampleSet}>
          Create Transforms Set
        </Button>
      </section>
    </>
  )
}

export function createMigrationModal(history: ChangeHistory<FlameDescriptor>) {
  const requestModal = useRequestModal()
  const [loadModalIsOpen, setLoadModalIsOpen] = createSignal(false)

  async function showMigrationModal(currentFlame: FlameDescriptor) {
    setLoadModalIsOpen(true)
    const result = await requestModal<FlameDescriptor | typeof CANCEL>({
      content: ({ respond }) => (
        <Migration respond={respond} currentFlame={currentFlame} />
      ),
    })
    setLoadModalIsOpen(false)
    if (result === CANCEL) {
      return
    }
    // structuredClone required in order to not modify the original, as store in solidjs does
    history.replace(structuredClone(unwrap(result)))
  }

  return {
    showMigrationModal,
    loadModalIsOpen,
  }
}
