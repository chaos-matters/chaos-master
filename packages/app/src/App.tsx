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
import { Button } from './components/Button/Button'
import { ButtonGroup } from './components/Button/ButtonGroup'
import { Checkbox } from './components/Checkbox/Checkbox'
import { Card } from './components/ControlCard/ControlCard'
import { FlameColorEditor } from './components/FlameColorEditor/FlameColorEditor'
import { createLoadExampleFlame } from './components/LoadExampleFlameModal/LoadExampleFlameModal'
import { Modal } from './components/Modal/Modal'
import { createShareLinkModal } from './components/ShareLinkModal/ShareLinkModal'
import { Slider } from './components/Sliders/Slider'
import { SoftwareVersion } from './components/SoftwareVersion/SoftwareVersion'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import {
  DEFAULT_POINT_COUNT,
  DEFAULT_RENDER_INTERVAL_MS,
  DEFAULT_RESOLUTION,
} from './defaults'
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
} from './utils/jsonQueryParam'
import { sum } from './utils/sum'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import type { FlameFunction } from './flame/flameFunction'

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
export type ExportImageType = (canvas: HTMLCanvasElement) => void

function App(props: { flameFromQuery?: FlameFunction[] }) {
  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  const [skipIters, setSkipIters] = createSignal(20)
  const [pointCount, setPointCount] = createSignal(DEFAULT_POINT_COUNT)
  const [exposure, setExposure] = createSignal(0.25)
  const [drawMode, setDrawMode] = createSignal(lightMode)
  const [renderInterval, setRenderInterval] = createSignal(
    DEFAULT_RENDER_INTERVAL_MS,
  )
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()
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

  const { loadExampleModalIsOpen, showLoadExampleFlameModal } =
    createLoadExampleFlame(history)

  const finalRenderInterval = () =>
    loadExampleModalIsOpen() ? Infinity : onExportImage() ? 0 : renderInterval()

  const { showShareLinkModal } = createShareLinkModal(flameFunctions)

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
  const exportCanvasImage = (canvas: HTMLCanvasElement) => {
    setOnExportImage(undefined)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const imgData = await blob.arrayBuffer()
      const pngBytes = new Uint8Array(imgData)
      const encodedFlames = await compressJsonQueryParam(flameFunctions)
      const imgExtData = addFlameDataToPng(encodedFlames, pngBytes)
      const fileUrlExt = URL.createObjectURL(imgExtData)
      const downloadLink = window.document.createElement('a')
      downloadLink.href = fileUrlExt
      downloadLink.download = 'flame.png'
      downloadLink.click()
    })
  }

  return (
    <ChangeHistoryContextProvider value={history}>
      <div class={ui.layout}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <div
            class={ui.canvasContainer}
            classList={{ [ui.fullscreen]: !showSidebar() }}
          >
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
                  renderInterval={finalRenderInterval()}
                  onExportImage={onExportImage()}
                  edgeFade={showSidebar()}
                />
              </WheelZoomCamera2D>
            </AutoCanvas>
          </div>
        </Root>
        <div class={ui.viewportControls}>
          <ButtonGroup>
            <For each={[1, 2, 4]}>
              {(divider) => {
                const pixelRatio_ = 1 / divider
                return (
                  <Button
                    active={pixelRatio() === pixelRatio_}
                    onClick={() => setPixelRatio(pixelRatio_)}
                    style={{ 'min-width': '3rem' }}
                  >
                    <Show when={divider !== 1} fallback={'Full'}>
                      <span>
                        <sup>1</sup>/<sub>{divider}</sub>
                      </span>
                    </Show>
                  </Button>
                )
              }}
            </For>
          </ButtonGroup>
          <ButtonGroup>
            <Button onClick={() => setZoom((p) => p * 0.9)}>
              <Minus />
            </Button>
            <Button onClick={() => setZoom(1)} style={{ 'min-width': '4rem' }}>
              {(zoom() * 100).toFixed(0)}%
            </Button>
            <Button onClick={() => setZoom((p) => p / 0.9)}>
              <Plus />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button
              disabled={!history.hasUndo()}
              onClick={() => {
                history.undo()
              }}
            >
              <Undo />
            </Button>
            <Button
              disabled={!history.hasRedo()}
              onClick={() => {
                history.redo()
              }}
            >
              <Redo />
            </Button>
          </ButtonGroup>
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
            <Card class={ui.buttonCard}>
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
                label="Exposure"
                value={exposure()}
                min={-4}
                max={4}
                step={0.001}
                onInput={setExposure}
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
              <label class={ui.labeledInput}>
                Adaptive filter
                <Checkbox
                  checked={adaptiveFilterEnabled()}
                  onChange={(checked) => setAdaptiveFilterEnabled(checked)}
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
                label="Render Interval"
                value={renderInterval()}
                min={1}
                max={5000}
                step={1}
                onInput={setRenderInterval}
                formatValue={(value) =>
                  value < 1000
                    ? `${value.toFixed(0)} ms`
                    : `${(value / 1000).toFixed(1)} s`
                }
              />
            </Card>
            <Card class={ui.buttonCard}>
              <button
                class={ui.addFlameButton}
                onClick={showLoadExampleFlameModal}
              >
                Load Example
              </button>
            </Card>
            <Card class={ui.buttonCard}>
              <button
                class={ui.addFlameButton}
                onClick={() => {
                  setOnExportImage(() => exportCanvasImage)
                }}
              >
                Export PNG
              </button>
            </Card>
            <Card class={ui.buttonCard}>
              <button class={ui.addFlameButton} onClick={showShareLinkModal}>
                Share Link
              </button>
            </Card>
            <Card class={ui.buttonCard}>
              <label class={ui.addFlameButton}>
                Load Flame From Image
                <input
                  type="file"
                  hidden
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
