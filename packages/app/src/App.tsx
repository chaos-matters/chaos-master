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
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { recordEntries, recordKeys } from '@/utils/record'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { Button } from './components/Button/Button'
import { Checkbox } from './components/Checkbox/Checkbox'
import { ColorPicker } from './components/ColorPicker/ColorPicker'
import { Card } from './components/ControlCard/ControlCard'
import { Dropzone } from './components/Dropzone/Dropzone'
import {
  FlameColorEditor,
  handleColor,
} from './components/FlameColorEditor/FlameColorEditor'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { Modal } from './components/Modal/Modal'
import { createShareLinkModal } from './components/ShareLinkModal/ShareLinkModal'
import { Slider } from './components/Sliders/Slider'
import { createVariationSelector } from './components/VariationSelector/VariationSelector'
import { ViewControls } from './components/ViewControls/ViewControls'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { ThemeContextProvider, useTheme } from './contexts/ThemeContext'
import {
  DEFAULT_POINT_COUNT,
  DEFAULT_QUALITY,
  DEFAULT_RENDER_INTERVAL_MS,
  DEFAULT_RESOLUTION,
} from './defaults'
import { colorInitModeToImplFn } from './flame/colorInitMode'
import { drawModeToImplFn } from './flame/drawMode'
import { examples } from './flame/examples'
import { Flam3 } from './flame/Flam3'
import {
  accumulatedPointCount,
  currentQuality,
  qualityPointCountLimit,
  setCurrentQuality,
  setQualityPointCountLimit,
} from './flame/renderStats'
import {
  MAX_CAMERA_ZOOM_VALUE,
  MIN_CAMERA_ZOOM_VALUE,
} from './flame/schema/flameSchema'
import {
  generateTransformId,
  generateVariationId,
} from './flame/transformFunction'
import { isParametricVariation, isVariationType } from './flame/variations'
import { getParamsEditor, getVariationDefault } from './flame/variations/utils'
import { Cross, Plus } from './icons'
import { AutoCanvas } from './lib/AutoCanvas'
import { Root } from './lib/Root'
import { WheelZoomCamera2D } from './lib/WheelZoomCamera2D'
import { createStoreHistory } from './utils/createStoreHistory'
import { addFlameDataToPng } from './utils/flameInPng'
import {
  compressJsonQueryParam,
  decodeJsonQueryParam,
} from './utils/jsonQueryParam'
import { sum } from './utils/sum'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import { useLoadFlameFromFile } from './utils/useLoadFlameFromFile'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { ColorInitMode } from './flame/colorInitMode'
import type { DrawMode } from './flame/drawMode'
import type {
  FlameDescriptor,
  TransformFunction,
} from './flame/schema/flameSchema'

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
    probability: 1,
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
  const [quality, setQuality] = createSignal(DEFAULT_QUALITY)
  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [showSidebar, setShowSidebar] = createSignal(true)
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
  const { showVariationSelector, varSelectorModalIsOpen } =
    createVariationSelector(history)

  const finalRenderInterval = () =>
    loadModalIsOpen() || varSelectorModalIsOpen()
      ? Infinity
      : onExportImage()
        ? 0
        : DEFAULT_RENDER_INTERVAL_MS

  const { showShareLinkModal } = createShareLinkModal(flameDescriptor)

  const setFlameZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.zoom = clamp(
          value(draft.renderSettings.camera.zoom),
          MIN_CAMERA_ZOOM_VALUE,
          MAX_CAMERA_ZOOM_VALUE,
        )
      })
    } else {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.zoom = clamp(
          value,
          MIN_CAMERA_ZOOM_VALUE,
          MAX_CAMERA_ZOOM_VALUE,
        )
      })
    }
    return flameDescriptor.renderSettings.camera.zoom
  }
  const setFlamePosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.position = value(
          vec2f(...draft.renderSettings.camera.position),
        )
      })
    } else {
      setFlameDescriptor((draft) => {
        draft.renderSettings.camera.position = value
      })
    }
    return flameDescriptor.renderSettings.camera.position
  }

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
      document.startViewTransition(() => {
        setFlameDescriptor((draft) => {
          draft.renderSettings.drawMode =
            draft.renderSettings.drawMode === 'light' ? 'paint' : 'light'
        })
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
              <WheelZoomCamera2D
                zoom={[
                  () => flameDescriptor.renderSettings.camera.zoom,
                  setFlameZoom,
                ]}
                position={[
                  () =>
                    vec2f(...flameDescriptor.renderSettings.camera.position),
                  setFlamePosition,
                ]}
              >
                <Flam3
                  quality={quality()}
                  pointCountPerBatch={DEFAULT_POINT_COUNT}
                  adaptiveFilterEnabled={adaptiveFilterEnabled()}
                  flameDescriptor={flameDescriptor}
                  renderInterval={finalRenderInterval()}
                  onExportImage={onExportImage()}
                  edgeFadeColor={
                    showSidebar() ? EDGE_FADE_COLOR[theme()] : vec4f(0)
                  }
                  setCurrentQuality={(fn) => setCurrentQuality(() => fn)}
                  setQualityPointCountLimit={(fn) =>
                    setQualityPointCountLimit(() => fn)
                  }
                />
              </WheelZoomCamera2D>
            </AutoCanvas>
          </div>
        </Root>
        <ViewControls
          zoom={flameDescriptor.renderSettings.camera.zoom}
          setZoom={setFlameZoom}
          setPosition={setFlamePosition}
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
                <div class={ui.transformGrid}>
                  <svg class={ui.variationButtonSvgColor}>
                    <g
                      class={ui.variationButtonColor}
                      style={{
                        '--color': handleColor(
                          theme(),
                          vec2f(transform.color.x, transform.color.y),
                        ),
                      }}
                    >
                      <circle class={ui.variationButtonColorCircle} />
                    </g>
                  </svg>
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
                  <div
                    // class={ui.transformGridRow}
                    classList={{
                      [ui.transformGridRow]: true,
                      [ui.transformGridFirstRow]: true,
                    }}
                  >
                    <Slider
                      class={ui.transformGridFirstRow}
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
                  </div>
                  <For each={recordEntries(transform.variations)}>
                    {([vid, variation]) => (
                      <>
                        <div class={ui.transformGridRow}>
                          <button
                            class={ui.variationButton}
                            value={variation.type}
                            onClick={(_) => {
                              showVariationSelector(
                                structuredClone(
                                  JSON.parse(JSON.stringify(variation)),
                                ),
                                structuredClone(
                                  JSON.parse(JSON.stringify(flameDescriptor)),
                                ),
                                tid,
                                vid,
                              )
                                .then((newValue) => {
                                  if (
                                    newValue === undefined ||
                                    !isVariationType(newValue.variation.type)
                                  ) {
                                    return
                                  }
                                  setFlameDescriptor((draft) => {
                                    // TODO: what else to update from preview selector,
                                    // if one transform can have multiple variations,
                                    // then transform preAffine should be preserved?
                                    draft.transforms[tid]!.preAffine =
                                      newValue.transform.preAffine
                                    draft.transforms[tid]!.variations[vid] =
                                      newValue.variation
                                  })
                                })
                                .catch((err: unknown) => {
                                  console.warn(
                                    'Cannot load this variation, reason: ',
                                    err,
                                  )
                                })
                            }}
                          >
                            <div class={ui.variationButtonText}>
                              {variation.type}
                            </div>
                          </button>
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
                          <button
                            class={ui.deleteVariationButton}
                            onClick={() => {
                              setFlameDescriptor((draft) => {
                                delete draft.transforms[tid]!.variations[vid]
                              })
                            }}
                          >
                            <Cross />
                          </button>
                        </div>
                        <Show
                          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                          when={isParametricVariation(variation) && variation}
                          keyed
                        >
                          {(variation) => (
                            <div class={ui.transformGridRow}>
                              <Dynamic
                                {...getParamsEditor(variation)}
                                setValue={(value) => {
                                  setFlameDescriptor((draft) => {
                                    const variationDraft =
                                      draft.transforms[tid]?.variations[vid]
                                    if (
                                      variationDraft === undefined ||
                                      !isParametricVariation(variationDraft)
                                    ) {
                                      throw new Error(`Unreachable code`)
                                    }
                                    variationDraft.params = value
                                  })
                                }}
                              />
                            </div>
                          )}
                        </Show>
                      </>
                    )}
                  </For>

                  <button
                    class={ui.addTransformVariationButton}
                    onClick={() => {
                      setFlameDescriptor((draft) => {
                        draft.transforms[tid]!.variations[
                          generateVariationId()
                        ] = structuredClone(getVariationDefault('linear', 1))
                      })
                    }}
                  >
                    <Plus />
                  </button>
                </div>
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
                max={30}
                step={1}
                onInput={(newSkipIters) => {
                  setFlameDescriptor((draft) => {
                    draft.renderSettings.skipIters = newSkipIters
                  })
                }}
                formatValue={(value) => value.toString()}
              />
              <label class={ui.labeledInput}>
                Draw Mode
                <select
                  class={ui.select}
                  value={flameDescriptor.renderSettings.drawMode}
                  onChange={(ev) => {
                    const mode = ev.currentTarget.value as DrawMode
                    document.startViewTransition(() => {
                      setFlameDescriptor((draft) => {
                        draft.renderSettings.drawMode = mode
                      })
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
                Color Init Mode
                <select
                  class={ui.select}
                  value={flameDescriptor.renderSettings.colorInitMode}
                  onChange={(ev) => {
                    const mode = ev.currentTarget.value as ColorInitMode
                    document.startViewTransition(() => {
                      setFlameDescriptor((draft) => {
                        draft.renderSettings.colorInitMode = mode
                      })
                    })
                  }}
                >
                  <For each={recordKeys(colorInitModeToImplFn)}>
                    {(colorInitMode) => (
                      <option value={colorInitMode}>{colorInitMode}</option>
                    )}
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
                label="Quality"
                value={quality()}
                trackFill={true}
                trackFillValue={Math.min(currentQuality()(), quality())}
                animateFill={
                  accumulatedPointCount() < qualityPointCountLimit()()
                }
                min={0.7}
                max={1}
                step={0.001}
                onInput={(quality) => {
                  setQuality(quality)
                }}
                formatValue={(value) =>
                  value === 1 ? 'Infinite' : `${(value * 100).toFixed(1)} %`
                }
              />
            </Card>
            <Card>
              <label class={ui.labeledInput}>
                Adaptive filter
                <Checkbox
                  checked={adaptiveFilterEnabled()}
                  onChange={(checked) => setAdaptiveFilterEnabled(checked)}
                />
                <span></span>
              </label>
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
