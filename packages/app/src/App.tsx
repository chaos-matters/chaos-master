import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
  Suspense,
} from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec3f } from 'typegpu/data'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { Card } from './components/ControlCard/ControlCard'
import { FlameColorEditor } from './components/FlameColorEditor/FlameColorEditor'
import { Modal, useRequestModal } from './components/Modal/Modal'
import { Slider } from './components/Sliders/Slider'
import { SoftwareVersion } from './components/SoftwareVersion/SoftwareVersion'
import { lightMode, paintMode } from './flame/drawMode'
import { examples } from './flame/examples'
import {
  Flam3,
  MAX_INNER_ITERS,
  MAX_OUTER_ITERS,
  MAX_POINT_COUNT,
} from './flame/Flam3'
import {
  isParametricType,
  isVariationType,
  variationTypes,
} from './flame/variations'
import {
  getParamsEditor,
  getVariationDefault,
} from './flame/variations/parametric'
import { Cross } from './icons/Cross'
import { Plus } from './icons/Plus'
import { AutoCanvas } from './lib/AutoCanvas'
import { Root } from './lib/Root'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { addFlameDataToPng, extractFlameFromPng } from './utils/flameInPng'
import { hexToRgbNorm } from './utils/hexToRgb'
import {
  compressJsonQueryParam,
  decodeJsonQueryParam,
  encodeJsonQueryParam,
} from './utils/jsonQueryParam'
import { sum } from './utils/sum'
import type { ExampleID } from './flame/examples'
import type { FlameFunction } from './flame/flameFunction'

const { navigator } = window

function App(props: { flameFromQuery?: FlameFunction[] }) {
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [outerIters, setOuterIters] = createSignal(1)
  const [skipIters, setSkipIters] = createSignal(15)
  const [pointCount, setPointCount] = createSignal(1e6)
  const [exposure, setExposure] = createSignal(0.25)
  const [renderInterval, setRenderInterval] = createSignal(100)
  const [drawMode, setDrawMode] = createSignal(lightMode)
  const [backgroundColor, setBackgroundColor] = createSignal(vec3f(0, 0, 0))
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [flameFunctions, setFlameFunctions] = createStore(
    structuredClone(props.flameFromQuery ?? examples.example1),
  )
  const totalProbability = createMemo(() =>
    sum(flameFunctions.map((f) => f.probability)),
  )
  const requestModal = useRequestModal()

  createEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.code === 'Escape') {
        setShowSidebar((p) => !p)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown)
    })
  })

  return (
    <div class={ui.fullscreen}>
      <div class={`${ui.sidebar} ${showSidebar() ? ui.show : ''}`}>
        <AffineEditor
          flameFunctions={flameFunctions}
          setFlameFunctions={setFlameFunctions}
        />
        <FlameColorEditor
          flameFunctions={flameFunctions}
          setFlameFunctions={setFlameFunctions}
        />
        <Card>
          <Slider
            label="Resolution"
            value={pixelRatio()}
            min={0.125}
            max={1}
            step={0.125}
            onInput={setPixelRatio}
            formatValue={(value) => value.toString()}
          />
          <Slider
            label="Outer Iterations"
            value={outerIters()}
            min={0}
            max={MAX_OUTER_ITERS}
            step={1}
            onInput={setOuterIters}
            formatValue={(value) => value.toString()}
          />
          <Slider
            label="Skip Iterations"
            value={skipIters()}
            min={0}
            max={MAX_INNER_ITERS}
            step={1}
            onInput={setSkipIters}
            formatValue={(value) => value.toString()}
          />
          <Slider
            label="Point Count"
            value={pointCount()}
            min={1e3}
            max={MAX_POINT_COUNT}
            step={1e4}
            onInput={setPointCount}
            formatValue={(value) => `${(value / 1000).toFixed(0)} K`}
          />
          <Slider
            label="Exposure"
            value={exposure()}
            min={-4}
            max={4}
            step={0.001}
            onInput={setExposure}
            formatValue={(value) => value.toString()}
          />
          <Slider
            label="Render Interval"
            value={renderInterval()}
            min={1}
            max={5000}
            step={1}
            onInput={setRenderInterval}
            formatValue={(value) => value.toString()}
          />
          <label class={ui.labeledInput}>
            Enable adaptive filter
            <input
              type="checkbox"
              checked={adaptiveFilterEnabled()}
              onInput={(ev) => setAdaptiveFilterEnabled(ev.target.checked)}
            />
            <span></span>
          </label>
          <label class={ui.labeledInput}>
            Background Color
            <input
              type="color"
              onInput={(ev) =>
                setBackgroundColor(hexToRgbNorm(ev.target.value))
              }
            />
            <span></span>
          </label>
          <label class={ui.labeledInput}>
            Draw Mode
            <select
              onChange={(ev) =>
                setDrawMode(() =>
                  ev.target.value === 'light' ? lightMode : paintMode,
                )
              }
            >
              <option value="light">Light</option>
              <option value="paint">Paint</option>
            </select>
            <span></span>
          </label>
          <button
            onClick={async () => {
              const [selectedExampleId, setSelectedExampleId] =
                createSignal<ExampleID>('empty')
              const result = await requestModal({
                title: 'Load Example Flame',
                message: () => (
                  <>
                    <p>You will lose any unsaved changes.</p>
                    <select
                      value={selectedExampleId()}
                      onChange={(ev) =>
                        setSelectedExampleId(ev.target.value as ExampleID)
                      }
                    >
                      <For each={Object.keys(examples) as ExampleID[]}>
                        {(exampleId) => (
                          <option value={exampleId}>{exampleId}</option>
                        )}
                      </For>
                    </select>
                  </>
                ),
                options: {
                  cancel: (props) => (
                    <button onClick={props.onClick}>Cancel</button>
                  ),
                  load: (props) => (
                    <button onClick={props.onClick}>Load</button>
                  ),
                },
              })
              if (result === 'cancel') {
                return
              }
              // structuredClone required in order to not modify the original, as store in solidjs does
              setFlameFunctions(structuredClone(examples[selectedExampleId()]))
            }}
          >
            Load Example
          </button>
        </Card>
        <For each={flameFunctions}>
          {(flame, i) => (
            <Card>
              <button
                class={ui.deleteFlameButton}
                onClick={() => {
                  setFlameFunctions(
                    produce((flames) => {
                      flames.splice(i(), 1)
                    }),
                  )
                }}
              >
                <Cross />
              </button>
              <Slider
                label="Probability"
                value={flame.probability}
                min={0}
                max={1}
                step={0.001}
                onInput={(value) => {
                  setFlameFunctions(i(), 'probability', value)
                }}
                formatValue={(value) =>
                  `${((100 * value) / totalProbability()).toFixed(1)} %`
                }
              />
              <For each={flame.variations}>
                {(variation, j) => (
                  <>
                    <select
                      class={ui.varInputType}
                      value={variation.type}
                      onInput={(ev) => {
                        const type = ev.target.value
                        if (!isVariationType(type)) {
                          return
                        }
                        setFlameFunctions(
                          i(),
                          'variations',
                          j(),
                          getVariationDefault(type, variation.weight),
                        )
                      }}
                    >
                      {variationTypes.map((varName) => (
                        <option value={varName}>{varName}</option>
                      ))}
                    </select>
                    <Slider
                      value={variation.weight}
                      min={0}
                      max={1}
                      step={0.001}
                      onInput={(value) => {
                        setFlameFunctions(
                          i(),
                          'variations',
                          j(),
                          'weight',
                          value,
                        )
                      }}
                      formatValue={(value) => `${(100 * value).toFixed(1)} %`}
                    />
                    <Show when={isParametricType(variation) && variation} keyed>
                      {(variation) => (
                        <Dynamic
                          {...getParamsEditor(variation)}
                          setValue={(value) => {
                            setFlameFunctions(
                              i(),
                              'variations',
                              j(),
                              produce((draft) => {
                                if (!isParametricType(draft)) {
                                  throw new Error(`Unreachable code`)
                                }
                                draft.params = value
                              }),
                            )
                          }}
                        />
                      )}
                    </Show>
                  </>
                )}
              </For>
            </Card>
          )}
        </For>
        <Card class={ui.addFlameCard}>
          <button
            class={ui.addFlameButton}
            onClick={() => {
              setFlameFunctions(
                produce((flames) => {
                  flames.push({
                    probability: 0.1,
                    color: { x: 0, y: 0 },
                    preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
                    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
                    variations: [{ type: 'linear', weight: 1 }],
                  })
                }),
              )
            }}
          >
            <Plus />
          </button>
        </Card>
        <Card class={ui.addFlameCard}>
          <button
            class={ui.addFlameButton}
            onClick={() => {
              // TODO: fetch this canvas in a more robust way
              const canvas = document.getElementsByClassName(ui.canvas).item(0)
              if (!(canvas instanceof HTMLCanvasElement)) {
                return
              }
              canvas.toBlob(async (blob) => {
                if (!blob) return
                const imgData = await blob.arrayBuffer()
                const pngBytes = new Uint8Array(imgData)
                const encodedFlames =
                  await compressJsonQueryParam(flameFunctions)
                const imgExtData = addFlameDataToPng(encodedFlames, pngBytes)
                const fileUrlExt = URL.createObjectURL(imgExtData)
                const downloadLink = document.createElement('a')
                downloadLink.href = fileUrlExt
                downloadLink.download = 'flame.png'
                downloadLink.click()
              })
            }}
          >
            Export PNG
          </button>
        </Card>
        <Card class={ui.addFlameCard}>
          <button
            class={ui.addFlameButton}
            onClick={async () => {
              const encoded = await encodeJsonQueryParam(flameFunctions)
              const url = `${window.location.origin}/?flame=${encoded}`
              await navigator.clipboard.writeText(url)
              await requestModal({
                title: 'Flame URL copied to clipboard!',
                message: url,
                options: {
                  ok: (props) => <button onClick={props.onClick}>OK</button>,
                },
              })
            }}
          >
            Share Link
          </button>
        </Card>
        <Card class={ui.addFlameCard}>
          <label class={ui.addFlameButton}>
            Load Flame From Image
            <input
              id="png-files"
              class={ui.loadImageType}
              type="file"
              accept="image/png"
              onChange={(ev) => {
                const file = ev.target.files?.item(0)
                if (file && file.type === 'image/png') {
                  const reader = new FileReader()
                  reader.onload = async (e) => {
                    const fr = e.target
                    const arrBuf = new Uint8Array(fr?.result as ArrayBuffer)
                    const newFlameFunctions = await extractFlameFromPng(arrBuf)
                    setFlameFunctions(structuredClone(newFlameFunctions))
                  }
                  reader.onerror = function () {
                    console.warn(reader.error)
                  }
                  reader.readAsArrayBuffer(file)
                  // reset target value so same file can be reuploaded
                  ev.target.value = ''
                }
              }}
            />
          </label>
        </Card>
      </div>
      <Root adapterOptions={{ powerPreference: 'high-performance' }}>
        <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
          <WheelZoomCamera2D>
            <Flam3
              outerIters={outerIters()}
              skipIters={skipIters()}
              pointCount={pointCount()}
              renderInterval={renderInterval()}
              drawMode={drawMode()}
              backgroundColor={backgroundColor()}
              exposure={exposure()}
              adaptiveFilterEnabled={adaptiveFilterEnabled()}
              flameFunctions={flameFunctions}
            />
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Root>
      <SoftwareVersion />
    </div>
  )
}

export function Wrappers() {
  const [flameFromQuery] = createResource(async () => {
    const param = new URLSearchParams(window.location.search)
    const flameDef = param.get('flame')
    if (flameDef !== null) {
      try {
        return await decodeJsonQueryParam(flameDef)
      } catch (ex) {
        console.error(ex)
      }
    }
    return undefined
  })
  return (
    <Modal>
      <Suspense>
        <Show when={flameFromQuery.state === 'ready'}>
          <App flameFromQuery={flameFromQuery()} />
        </Show>
      </Suspense>
    </Modal>
  )
}
