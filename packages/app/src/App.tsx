import {
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  Suspense,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec3f } from 'typegpu/data'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { Checkbox } from './components/Checkbox/Checkbox'
import { Card } from './components/ControlCard/ControlCard'
import { FlameColorEditor } from './components/FlameColorEditor/FlameColorEditor'
import { Modal, useRequestModal } from './components/Modal/Modal'
import { Slider } from './components/Sliders/Slider'
import { SoftwareVersion } from './components/SoftwareVersion/SoftwareVersion'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { lightMode, paintMode } from './flame/drawMode'
import { examples } from './flame/examples'
import { Flam3, MAX_INNER_ITERS, MAX_POINT_COUNT } from './flame/Flam3'
import {
  isParametricType,
  isVariationType,
  variationTypes,
} from './flame/variations'
import {
  getParamsEditor,
  getVariationDefault,
} from './flame/variations/parametric'
import Cross from './icons/cross.svg'
import Minus from './icons/minus.svg'
import Plus from './icons/plus.svg'
import Redo from './icons/redo.svg'
import Undo from './icons/undo.svg'
import { AutoCanvas } from './lib/AutoCanvas'
import { Root } from './lib/Root'
import { createZoom, WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { createStoreHistory } from './utils/createStoreHistory'
import { addFlameDataToPng, extractFlameFromPng } from './utils/flameInPng'
import { hexToRgbNorm } from './utils/hexToRgb'
import {
  compressJsonQueryParam,
  decodeJsonQueryParam,
  encodeJsonQueryParam,
} from './utils/jsonQueryParam'
import { sum } from './utils/sum'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import type { ExampleID } from './flame/examples'
import type { FlameFunction } from './flame/flameFunction'

const { navigator } = window

function formatPercent(x: number) {
  if (x === 1) {
    return `100 %`
  }
  return `${(x * 100).toFixed(1)} %`
}

const defaultTransform: FlameFunction = {
  probability: 0.1,
  color: { x: 0, y: 0 },
  preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  variations: [{ type: 'linear', weight: 1 }],
}

function App(props: { flameFromQuery?: FlameFunction[] }) {
  const [pixelRatio, setPixelRatio] = createSignal(0.5)
  const [skipIters, setSkipIters] = createSignal(15)
  const [pointCount, setPointCount] = createSignal(1e6)
  const [exposure, setExposure] = createSignal(0.25)
  const [renderInterval, setRenderInterval] = createSignal(1)
  const [drawMode, setDrawMode] = createSignal(lightMode)
  const [backgroundColor, setBackgroundColor] = createSignal(vec3f(0, 0, 0))
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [zoom, setZoom] = createZoom(1, [0, Infinity])
  const [flameFunctions, setFlameFunctions, history] = createStoreHistory(
    createStore(structuredClone(props.flameFromQuery ?? examples.example1)),
  )
  const totalProbability = createMemo(() =>
    sum(flameFunctions.map((f) => f.probability)),
  )
  const requestModal = useRequestModal()

  useKeyboardShortcuts({
    Escape: () => {
      document.startViewTransition(() => {
        setShowSidebar((p) => !p)
      })
      return true
    },
    KeyZ: (ev) => {
      if (ev.metaKey || ev.ctrlKey) {
        if (ev.shiftKey) {
          if (history.hasRedo()) {
            history.redo()
            return true
          }
        } else {
          if (history.hasUndo()) {
            history.undo()
            return true
          }
        }
      }
    },
    KeyY: (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && history.hasRedo()) {
        history.redo()
        return true
      }
    },
  })

  return (
    <ChangeHistoryContextProvider value={history}>
      <div class={ui.fullscreen}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <div class={ui.canvasContainer}>
            <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
              <WheelZoomCamera2D zoom={[zoom, setZoom]}>
                <Flam3
                  skipIters={skipIters()}
                  pointCount={pointCount()}
                  drawMode={drawMode()}
                  backgroundColor={backgroundColor()}
                  exposure={exposure()}
                  adaptiveFilterEnabled={adaptiveFilterEnabled()}
                  flameFunctions={flameFunctions}
                  renderInterval={renderInterval()}
                />
              </WheelZoomCamera2D>
            </AutoCanvas>
          </div>
        </Root>
        <div class={ui.viewportControls}>
          <div class={ui.buttonGroup}>
            <button onClick={() => setZoom((p) => p * 0.9)}>
              <Minus />
            </button>
            <button class={ui.resetZoomButton} onClick={() => setZoom(1)}>
              {(zoom() * 100).toFixed(0)}%
            </button>
            <button onClick={() => setZoom((p) => p / 0.9)}>
              <Plus />
            </button>
          </div>
          <div class={ui.buttonGroup}>
            <button
              disabled={!history.hasUndo()}
              onClick={() => {
                history.undo()
              }}
            >
              <Undo />
            </button>
            <button
              disabled={!history.hasRedo()}
              onClick={() => {
                history.redo()
              }}
            >
              <Redo />
            </button>
          </div>
        </div>
        <Show when={showSidebar()}>
          <div class={ui.sidebar}>
            <AffineEditor
              flameFunctions={flameFunctions}
              setFlameFunctions={setFlameFunctions}
            />
            <FlameColorEditor
              flameFunctions={flameFunctions}
              setFlameFunctions={setFlameFunctions}
            />
            <For each={flameFunctions}>
              {(flame, i) => (
                <Card>
                  <button
                    class={ui.deleteFlameButton}
                    onClick={() => {
                      setFlameFunctions((draft) => {
                        draft.splice(i(), 1)
                      })
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
                    onInput={(probability) => {
                      setFlameFunctions((draft) => {
                        draft[i()]!.probability = probability
                      })
                    }}
                    formatValue={(value) =>
                      formatPercent(value / totalProbability())
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
                            setFlameFunctions((draft) => {
                              draft[i()]!.variations[j()] = getVariationDefault(
                                type,
                                variation.weight,
                              )
                            })
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
                          onInput={(weight) => {
                            setFlameFunctions((draft) => {
                              draft[i()]!.variations[j()]!.weight = weight
                            })
                          }}
                          formatValue={formatPercent}
                        />
                        <Show
                          when={isParametricType(variation) && variation}
                          keyed
                        >
                          {(variation) => (
                            <Dynamic
                              {...getParamsEditor(variation)}
                              setValue={(value) => {
                                setFlameFunctions((draft) => {
                                  const i_ = i()
                                  const j_ = j()
                                  if (
                                    !isParametricType(
                                      draft[i_]!.variations[j_]!,
                                    )
                                  ) {
                                    throw new Error(`Unreachable code`)
                                  }
                                  draft[i_]!.variations[j_].params = value
                                })
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
                  setFlameFunctions((draft) => {
                    draft.push(structuredClone(defaultTransform))
                  })
                }}
              >
                <Plus />
              </button>
            </Card>
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
                formatValue={(value) => `${value.toString()} ms`}
              />
              <label class={ui.labeledInput}>
                Adaptive filter
                <Checkbox
                  checked={adaptiveFilterEnabled()}
                  onChange={(checked) => setAdaptiveFilterEnabled(checked)}
                />
                <span></span>
              </label>
              <label class={ui.labeledInput}>
                Background Color
                <input
                  class={ui.backgroundColorPicker}
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
                  class={ui.varInputType}
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
            </Card>
            <Card class={ui.addFlameCard}>
              <button
                class={ui.addFlameButton}
                onClick={async () => {
                  const [selectedExampleId, setSelectedExampleId] =
                    createSignal<ExampleID>('empty')
                  const result = await requestModal({
                    title: 'Load Example Flame',
                    message: () => (
                      <>
                        <p>You can undo this operation.</p>
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
                  history.replace(
                    structuredClone(examples[selectedExampleId()]),
                  )
                }}
              >
                Load Example
              </button>
            </Card>
            <Card class={ui.addFlameCard}>
              <button
                class={ui.addFlameButton}
                onClick={() => {
                  // TODO: fetch this canvas in a more robust way
                  const canvas = document
                    .getElementsByClassName(ui.canvas)
                    .item(0)
                  if (!(canvas instanceof HTMLCanvasElement)) {
                    return
                  }
                  canvas.toBlob(async (blob) => {
                    if (!blob) return
                    const imgData = await blob.arrayBuffer()
                    const pngBytes = new Uint8Array(imgData)
                    const encodedFlames =
                      await compressJsonQueryParam(flameFunctions)
                    const imgExtData = addFlameDataToPng(
                      encodedFlames,
                      pngBytes,
                    )
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
                      ok: (props) => (
                        <button onClick={props.onClick}>OK</button>
                      ),
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
                        const newFlameFunctions =
                          await extractFlameFromPng(arrBuf)
                        history.replace(structuredClone(newFlameFunctions))
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
        </Show>
        <SoftwareVersion />
      </div>
    </ChangeHistoryContextProvider>
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
