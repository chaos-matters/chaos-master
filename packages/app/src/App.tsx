import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  Suspense,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec3f, vec4f } from 'typegpu/data'
import { recordEntries, recordKeys } from '@/utils/record'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { Button } from './components/Button/Button'
import { Checkbox } from './components/Checkbox/Checkbox'
import { ColorPicker } from './components/ColorPicker/ColorPicker'
import { Card } from './components/ControlCard/ControlCard'
import { Dropzone } from './components/Dropzone/Dropzone'
import { FlameColorEditor } from './components/FlameColorEditor/FlameColorEditor'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { Modal } from './components/Modal/Modal'
import { createShareLinkModal } from './components/ShareLinkModal/ShareLinkModal'
import { Slider } from './components/Sliders/Slider'
import { ViewControls } from './components/ViewControls/ViewControls'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { ThemeContextProvider, useTheme } from './contexts/ThemeContext'
import {
  DEFAULT_POINT_COUNT,
  DEFAULT_RENDER_INTERVAL_MS,
  DEFAULT_RESOLUTION,
} from './defaults'
import { drawModeToImplFn } from './flame/drawMode'
import { examples } from './flame/examples'
import { Flam3, MAX_INNER_ITERS, MAX_POINT_COUNT } from './flame/Flam3'
import {
  generateTransformId,
  generateVariationId,
} from './flame/transformFunction'
import {
  isParametricType,
  isVariationType,
  variationTypes,
} from './flame/variations'
import {
  getParamsEditor,
  getVariationDefault,
} from './flame/variations/parametric'
import { Cross, Plus } from './icons'
import { AutoCanvas } from './lib/AutoCanvas'
import { Root } from './lib/Root'
import { createZoom, WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { createStoreHistory } from './utils/createStoreHistory'
import { addFlameDataToPng } from './utils/flameInPng'
import {
  compressJsonQueryParam,
  decodeJsonQueryParam,
} from './utils/jsonQueryParam'
import { sum } from './utils/sum'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import { useLoadFlameFromFile } from './utils/useLoadFlameFromFile'
import type { DrawMode } from './flame/drawMode'
import type {
  FlameDescriptor,
  TransformFunction,
} from './flame/transformFunction'

const EDGE_FADE_COLOR = {
  light: vec4f(0.96, 0.96, 0.96, 1),
  dark: vec4f(0, 0, 0, 0.8),
}

function formatPercent(x: number) {
  if (x === 1) {
    return `100 %`
  }
  return `${(x * 100).toFixed(1)} %`
}

function newDefaultTransform(): TransformFunction {
  return {
    probability: 0.1,
    color: { x: 0, y: 0 },
    preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: { [generateVariationId()]: { type: 'linear', weight: 1 } },
  }
}

export type ExportImageType = (canvas: HTMLCanvasElement) => void

type AppProps = {
  flameFromQuery?: FlameDescriptor
}

function App(props: AppProps) {
  const { theme, setTheme } = useTheme()
  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  const [pointCount, setPointCount] = createSignal(DEFAULT_POINT_COUNT)
  const [renderInterval, setRenderInterval] = createSignal(
    DEFAULT_RENDER_INTERVAL_MS,
  )
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [showSidebar, setShowSidebar] = createSignal(true)
  const [zoom, setZoom] = createZoom(1, [0, Infinity])
  const [flameDescriptor, setFlameDescriptor, history] = createStoreHistory(
    createStore(
      structuredClone(
        props.flameFromQuery ? props.flameFromQuery : examples.example1,
      ),
    ),
  )
  const totalProbability = createMemo(() =>
    sum(Object.values(flameDescriptor.transforms).map((f) => f.probability)),
  )

  const { loadModalIsOpen, showLoadFlameModal } = createLoadFlame(history)

  const finalRenderInterval = () =>
    loadModalIsOpen() ? Infinity : onExportImage() ? 0 : renderInterval()

  const { showShareLinkModal } = createShareLinkModal(flameDescriptor)

  useKeyboardShortcuts({
    KeyF: () => {
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
    KeyD: () => {
      setFlameDescriptor((draft) => {
        draft.renderSettings.drawMode =
          draft.renderSettings.drawMode === 'light' ? 'paint' : 'light'
      })
      return true
    },
  })
  const exportCanvasImage = (canvas: HTMLCanvasElement) => {
    setOnExportImage(undefined)
    canvas.toBlob(async (blob) => {
      if (!blob) return
      const imgData = await blob.arrayBuffer()
      const pngBytes = new Uint8Array(imgData)
      const encodedFlames = await compressJsonQueryParam(flameDescriptor)
      const imgExtData = addFlameDataToPng(encodedFlames, pngBytes)
      const fileUrlExt = URL.createObjectURL(imgExtData)
      const downloadLink = window.document.createElement('a')
      downloadLink.href = fileUrlExt
      downloadLink.download = 'flame.png'
      downloadLink.click()
    })
  }

  createEffect(() => {
    setTheme(
      flameDescriptor.renderSettings.drawMode === 'light' ? 'dark' : 'light',
    )
  })

  const loadFlameFromFile = useLoadFlameFromFile()

  async function onDrop(file: File) {
    const flameDescriptor = await loadFlameFromFile(file)
    if (flameDescriptor) {
      history.replace(flameDescriptor)
    }
  }

  return (
    <ChangeHistoryContextProvider value={history}>
      <Dropzone class={ui.layout} onDrop={onDrop}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <div
            class={ui.canvasContainer}
            classList={{ [ui.fullscreen]: !showSidebar() }}
          >
            <AutoCanvas class={ui.canvas} pixelRatio={pixelRatio()}>
              <WheelZoomCamera2D zoom={[zoom, setZoom]}>
                <Flam3
                  pointCount={pointCount()}
                  adaptiveFilterEnabled={adaptiveFilterEnabled()}
                  flameDescriptor={flameDescriptor}
                  renderInterval={finalRenderInterval()}
                  onExportImage={onExportImage()}
                  edgeFadeColor={
                    showSidebar() ? EDGE_FADE_COLOR[theme()] : vec4f(0)
                  }
                />
              </WheelZoomCamera2D>
            </AutoCanvas>
          </div>
        </Root>
        <ViewControls
          zoom={zoom()}
          setZoom={setZoom}
          pixelRatio={pixelRatio()}
          setPixelRatio={setPixelRatio}
        />
        <Show when={showSidebar()}>
          <div class={ui.sidebar}>
            <AffineEditor
              transforms={flameDescriptor.transforms}
              setTransforms={(setFn) => {
                setFlameDescriptor((draft) => {
                  setFn(draft.transforms)
                })
              }}
            />
            <FlameColorEditor
              transforms={flameDescriptor.transforms}
              setTransforms={(setFn) => {
                setFlameDescriptor((draft) => {
                  setFn(draft.transforms)
                })
              }}
            />
            <For each={recordEntries(flameDescriptor.transforms)}>
              {([tid, transform]) => (
                <Card>
                  <button
                    class={ui.deleteFlameButton}
                    onClick={() => {
                      setFlameDescriptor((draft) => {
                        delete draft.transforms[tid]
                      })
                    }}
                  >
                    <Cross />
                  </button>
                  <Slider
                    label="Probability"
                    value={transform.probability}
                    min={0}
                    max={1}
                    step={0.001}
                    onInput={(probability) => {
                      setFlameDescriptor((draft) => {
                        draft.transforms[tid]!.probability = probability
                      })
                    }}
                    formatValue={(value) =>
                      formatPercent(value / totalProbability())
                    }
                  />
                  <For each={recordEntries(transform.variations)}>
                    {([vid, variation]) => (
                      <>
                        <select
                          class={ui.select}
                          value={variation.type}
                          onInput={(ev) => {
                            const type = ev.target.value
                            if (!isVariationType(type)) {
                              return
                            }
                            setFlameDescriptor((draft) => {
                              draft.transforms[tid]!.variations[vid] =
                                getVariationDefault(type, variation.weight)
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
                            setFlameDescriptor((draft) => {
                              draft.transforms[tid]!.variations[vid]!.weight =
                                weight
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
                                setFlameDescriptor((draft) => {
                                  const variationDraft =
                                    draft.transforms[tid]?.variations[vid]
                                  if (
                                    variationDraft === undefined ||
                                    !isParametricType(variationDraft)
                                  ) {
                                    throw new Error(`Unreachable code`)
                                  }
                                  variationDraft.params = value
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
                  setFlameDescriptor((draft) => {
                    draft.transforms[generateTransformId()] = structuredClone(
                      newDefaultTransform(),
                    )
                  })
                }}
              >
                <Plus />
              </button>
            </Card>
            <Card>
              <Slider
                label="Exposure"
                value={flameDescriptor.renderSettings.exposure}
                min={-4}
                max={4}
                step={0.001}
                onInput={(newExp) => {
                  setFlameDescriptor((draft) => {
                    draft.renderSettings.exposure = newExp
                  })
                }}
                formatValue={(value) => value.toString()}
              />
              <Slider
                label="Skip Iterations"
                value={flameDescriptor.renderSettings.skipIters}
                min={0}
                max={MAX_INNER_ITERS}
                step={1}
                onInput={(newSkipIters) => {
                  setFlameDescriptor((draft) => {
                    draft.renderSettings.skipIters = newSkipIters
                  })
                }}
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
                  class={ui.select}
                  value={flameDescriptor.renderSettings.drawMode}
                  onChange={(ev) => {
                    setFlameDescriptor((draft) => {
                      draft.renderSettings.drawMode = ev.currentTarget
                        .value as DrawMode
                    })
                  }}
                >
                  <For each={recordKeys(drawModeToImplFn)}>
                    {(drawMode) => <option value={drawMode}>{drawMode}</option>}
                  </For>
                </select>
                <span></span>
              </label>
              <label class={ui.labeledInput}>
                Background Color
                <ColorPicker
                  value={
                    flameDescriptor.renderSettings.backgroundColor
                      ? vec3f(...flameDescriptor.renderSettings.backgroundColor)
                      : undefined
                  }
                  setValue={(newBgColor) => {
                    setFlameDescriptor((draft) => {
                      draft.renderSettings.backgroundColor = newBgColor
                    })
                  }}
                />
              </label>
              <Show
                when={
                  flameDescriptor.renderSettings.backgroundColor !== undefined
                }
                fallback={<span />}
              >
                <Button
                  onClick={() => {
                    setFlameDescriptor((draft) => {
                      delete draft.renderSettings.backgroundColor
                    })
                  }}
                >
                  Auto
                </Button>
              </Show>
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
            <div class={ui.actionButtons}>
              <Card class={ui.buttonCard}>
                <button class={ui.addFlameButton} onClick={showLoadFlameModal}>
                  Load Flame
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
            </div>
          </div>
        </Show>
      </Dropzone>
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
    <ThemeContextProvider>
      <Modal>
        <Suspense>
          <Show when={flameFromQuery.state === 'ready'}>
            <App flameFromQuery={flameFromQuery()} />
          </Show>
        </Suspense>
      </Modal>
    </ThemeContextProvider>
  )
}
