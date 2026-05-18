import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { produce, unfreeze } from 'structurajs'
import { vec2f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import { createGateContext } from '@/contexts/GateContext'
import { COMPUTE_GATE_CAPACITY, DEFAULT_VARIATION_PREVIEW_POINT_COUNT, DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { pointInitModeToImplFn } from '@/flame/pointInitMode'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { isParametricVariation, variationTypes } from '@/flame/variations'
import { getNormalizedVariationName, getParamsEditor, getTransformPreviewTid, getTransformPreviewVid, getVariationPreviewFlame, } from '@/flame/variations/utils'
import { HoverEyePreview, HoverPreview } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { recordEntries, recordKeys } from '@/utils/record'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { vramLog } from '@/utils/vramLog'
import { AffineEditor } from '../AffineEditor/AffineEditor'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './VariationSelector.module.css'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { ExportImageType } from '@/App'
import type { PointInitMode } from '@/flame/pointInitMode'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { TransformVariationDescriptor } from '@/flame/variations'
import type { HistorySetter, ChangeHistory } from '@/utils/createStoreHistory'

const CANCEL = 'cancel'

type RenderStatus = 'low-quality' | 'high-quality' | 'done'

const { Provider: ComputeGate, useGate: useComputeGate } = createGateContext<{
  isVisible: boolean
  renderStatus: RenderStatus
  isSelected: boolean
}>('Compute', (state) =>
  state.isSelected
    ? 3
    : !state.isVisible || state.renderStatus === 'done'
      ? 0
      : state.renderStatus === 'low-quality'
        ? 2
        : 1,
)

function PreviewFinalFlame(props: {
  flame: FlameDescriptor
  setFlamePosition: Setter<v2f>
  setFlameZoom: Setter<number>
}) {
  return (
    <AutoCanvas class={ui.canvas} pixelRatio={1}>
      <WheelZoomCamera2D
        zoom={[
          () => props.flame.renderSettings.camera.zoom,
          props.setFlameZoom,
        ]}
        position={[
          () => vec2f(...props.flame.renderSettings.camera.position),
          props.setFlamePosition,
        ]}
      >
        <Flam3
          run={true}
          quality={0.99}
          pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
          adaptiveFilterEnabled={true}
          flameDescriptor={props.flame}
          renderInterval={DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS}
          edgeFadeColor={vec4f(0)}
        />
      </WheelZoomCamera2D>
    </AutoCanvas>
  )
}

function VariationPreview(props: {
  version: number
  isSelected: boolean
  flame: FlameDescriptor
  name: string
}) {
  const [container, setContainer] = createSignal<HTMLElement>()
  const [quality, setQuality] = createSignal<() => number>()
  const intersection = useIntersectionObserver(container)
  const isVisible = createMemo(() => intersection()?.isIntersecting)
  const renderStatus = createMemo<RenderStatus | undefined>(() => {
    const quality_ = quality()?.()
    if (quality_ === undefined) {
      return undefined
    }
    return quality_ > 0.98
      ? 'done'
      : quality_ > 0.9
        ? 'high-quality'
        : 'low-quality'
  })
  const allowed = useComputeGate(() => {
    const renderStatus_ = renderStatus()
    const isVisible_ = isVisible()
    if (renderStatus_ === undefined || isVisible_ === undefined) {
      return undefined
    }
    return {
      isVisible: isVisible_,
      renderStatus: renderStatus_,
      isSelected: props.isSelected,
    }
  })
  const [exportImage, setExportImage] = createSignal<ExportImageType>()
  const [image, setImage] = createSignal<string | undefined>()

  createEffect(() => {
    // When version increments (point init mode changed), discard the stale
    // cached image so the Flam3 canvas becomes visible again and re-renders.
    // Do NOT touch quality or exportImage here — resetting quality triggers
    // renderStatus -> allowed -> everAllowed in a cascade that overflows the
    // SolidJS update queue. Those signals are managed by their own effects.
    props.version
    setImage(undefined)
  })

  // Once the gate grants this preview its first compute slot, latch it mounted
  // until the image is captured. Without this, scrolling mid-render unmounts the
  // Flam3, causing repeated buffer allocation/deallocation cycles that exhaust
  // the GPU memory budget under Firefox/GFX1201.
  const [everAllowed, setEverAllowed] = createSignal(false)
  createEffect(() => {
    if (allowed()) setEverAllowed(true)
  })

  // Prevent WebGPU buffer allocation churn by keeping the component mounted
  // even when scrolled out of view, until it finishes rendering to a blob.
  const [everVisible, setEverVisible] = createSignal(false)
  createEffect(() => {
    if (isVisible() === true) setEverVisible(true)
  })



  createEffect(() => {
    if (!container() || renderStatus() !== 'done') {
      return
    }

    const { promise, resolve } = Promise.withResolvers<Blob>()
    setExportImage(() => resolve)

    let cancelled = false
    let objectUrl: string | undefined

    void promise.then((blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        if (!cancelled) setImage(img.src)
      }
      img.src = objectUrl
    })

    onCleanup(() => {
      cancelled = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
      setExportImage(undefined)
    })
  })

  // Add mount/unmount logging
  createEffect(() => {
    const isMounted =
      image() === undefined && (allowed() || everAllowed() || everVisible())

    if (isMounted) {
      vramLog(`[VariationPreview] Mounted WebGPU canvas for '${props.name}'`)
      onCleanup(() => {
        vramLog(
          `[VariationPreview] Unmounted WebGPU canvas for '${props.name}'`,
        )
      })
    }
  })

  return (
    <div
      class={ui.stretch}
      classList={{ [ui.stretchDone]: image() !== undefined }}
      ref={setContainer}
      style={{
        ['--background']:
          image() !== undefined ? `url('${image()}')` : undefined,
      }}
    >
      {/*
       * Mount the WebGPU canvas only when the image has not yet been captured AND:
       * - The preview is in the viewport (initial lazy mount — avoids allocating GPU
       *   buffers for all 57+ variations simultaneously on the modal's GPUDevice), OR
       * - The gate has ever granted this preview a compute slot (everAllowed latch) —
       *   keeps the Flam3 mounted through scroll events so a render in progress is not
       *   interrupted and forced to restart from scratch, OR
       * - The preview is currently actively computing (allowed).
       * Once image() is set the Show hides, freeing all GPU resources permanently.
       */}
      <Show
        when={
          image() === undefined && (allowed() || everAllowed() || everVisible())
        }
      >
        <AutoCanvas
          pixelRatio={1}
          fixedResolution={{ width: 256, height: 144 }}
        >
          <Camera2D
            position={vec2f(...props.flame.renderSettings.camera.position)}
            zoom={props.flame.renderSettings.camera.zoom}
          >
            <Flam3
              run={allowed()}
              quality={0.99}
              pointCountPerBatch={5e4}
              adaptiveFilterEnabled={false}
              flameDescriptor={props.flame}
              renderInterval={1}
              exportImage={exportImage()}
              edgeFadeColor={vec4f(0)}
              setCurrentQuality={(fn) => setQuality(() => fn)}
            />
          </Camera2D>
        </AutoCanvas>
      </Show>
    </div>
  )
}
type RespondType =
  | {
      transform: TransformFunction
      variation: TransformVariationDescriptor
    }
  | typeof CANCEL
type VariationSelectorModalProps = {
  currentVar: TransformVariationDescriptor
  currentFlame: FlameDescriptor
  transformId: TransformId
  variationId: VariationId
  respond: (value: RespondType) => void
  previewPointInitMode: PointInitMode
  setPreviewPointInitMode: (mode: PointInitMode) => void
}
const variationPreviewFlames: (
  p: PointInitMode,
) => Record<string, FlameDescriptor> = (pointInitMode: PointInitMode) => {
  return Object.fromEntries(
    variationTypes.map((name) => [
      name,
      unfreeze(
        produce(getVariationPreviewFlame(name), (draft) => {
          draft.renderSettings.pointInitMode = pointInitMode
        }),
      ),
    ]),
  )
}

function ShowVariationSelector(props: VariationSelectorModalProps) {
  const [version, setVersion] = createSignal(1)
  const [variationExamples, setVariationExamples] = createStoreHistory(
    createStore<Record<string, FlameDescriptor>>(
      variationPreviewFlames(props.previewPointInitMode),
    ),
  )
  const [selectedItemId, setSelectedItemId] = createSignal<string>()
  const [hoveredItemId, setHoveredItemId] = createSignal<string>()
  const [touchlessPreview, setTouchlessPreview] = createSignal<boolean>(true)
  const getPreviewSelectionId = () => {
    return (
      (touchlessPreview() ? hoveredItemId() : undefined) ??
      selectedItemId() ??
      undefined
    )
  }

  const [previewFlame, setPreviewFlame] = createStoreHistory(
    createStore<FlameDescriptor>(
      unfreeze(
        produce(structuredClone(props.currentFlame), (draft) => {
          draft.renderSettings.pointInitMode = props.previewPointInitMode
        }),
      ),
    ),
  )



  const setFlameZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        draft.renderSettings.camera.zoom = clamp(
          value(draft.renderSettings.camera.zoom),
          MIN_CAMERA_ZOOM_VALUE,
          MAX_CAMERA_ZOOM_VALUE,
        )
      })
    } else {
      setPreviewFlame((draft) => {
        draft.renderSettings.camera.zoom = clamp(
          value,
          MIN_CAMERA_ZOOM_VALUE,
          MAX_CAMERA_ZOOM_VALUE,
        )
      })
    }
    return previewFlame.renderSettings.camera.zoom
  }

  const setFlamePosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        draft.renderSettings.camera.position = value(
          vec2f(...draft.renderSettings.camera.position),
        )
      })
    } else {
      setPreviewFlame((draft) => {
        draft.renderSettings.camera.position = value
      })
    }
    return previewFlame.renderSettings.camera.position
  }

  const getVarFromPreviewFlame = (flame: FlameDescriptor) => {
    return getTransformFromPreviewFlame(flame)[1]
  }

  const getTransformFromPreviewFlame = (
    flame: FlameDescriptor,
  ): [
    TransformFunction | undefined,
    TransformVariationDescriptor | undefined,
  ] => {
    const transform = Object.values(flame.transforms)[0]
    if (transform !== undefined) {
      const variation = Object.values(transform.variations)[0]
      if (variation !== undefined) {
        return [transform, variation]
      }
    }
    return [undefined, undefined]
  }

  // Sync the big preview flame whenever the hovered/selected item changes.
  // IMPORTANT: both setPreviewFlame calls are wrapped in untrack so this effect
  // only re-runs when the *selection* changes, never when previewFlame itself
  // changes. Without untrack the createStoreHistory setter reads preview()
  // internally, which registers it as a dependency and causes an infinite loop.
  createEffect(() => {
    const itemId = getPreviewSelectionId()
    if (itemId !== undefined) {
      const selectedItem = variationExamples[itemId]
      if (selectedItem) {
        const [transform, variation] =
          getTransformFromPreviewFlame(selectedItem)
        if (transform !== undefined && variation !== undefined) {
          untrack(() => {
            setPreviewFlame((draft: FlameDescriptor) => {
              const previewTr = draft.transforms[props.transformId]
              if (previewTr !== undefined) {
                previewTr.preAffine = transform.preAffine
                previewTr.variations[props.variationId] = variation
                // in general we are swapping target variation with the selected preview one,
                // this might not be exact as the variation preview is, as
                // some variation previews are artificially beautified by adding extra variations,
                // if one wants to check such output in the preview itself -- uncomment below
                // for (const [varId, customVar] of recordEntries(
                //   transform.variations,
                // )) {
                //   if (variation.type !== customVar.type) {
                //     previewTr.variations[varId] = customVar
                //   }
                // }

                // TODO: see what else to copy from variation flame setup
                draft.renderSettings.exposure =
                  selectedItem.renderSettings.exposure
                // copy over initial camera settings
                draft.renderSettings.camera.zoom =
                  selectedItem.renderSettings.camera.zoom
                draft.renderSettings.camera.position =
                  selectedItem.renderSettings.camera.position
              }
            })
          })
        }
      }
    } else {
      // Capture the current values from props outside untrack so they are
      // tracked as dependencies (we *want* to re-run if currentFlame changes).
      const transformId = props.transformId
      const variationId = props.variationId
      const currentVar = props.currentVar
      const originalTransform = props.currentFlame.transforms[transformId]
      untrack(() => {
        setPreviewFlame((draft: FlameDescriptor) => {
          const previewTr = draft.transforms[transformId]
          if (previewTr !== undefined) {
            if (originalTransform !== undefined) {
              previewTr.preAffine = originalTransform.preAffine
            }
            previewTr.variations[variationId] = currentVar
          }
        })
      })
    }
  })

  const toggleSelectedItem = (idToToggle: string) => {
    setSelectedItemId((selectedItemId) =>
      selectedItemId === idToToggle ? undefined : idToToggle,
    )
  }

  const applySelection = () => {
    const itemId = selectedItemId()
    if (itemId !== undefined) {
      const selectedItem = variationExamples[itemId]
      if (selectedItem !== undefined) {
        const [transform, variation] =
          getTransformFromPreviewFlame(selectedItem)
        if (transform !== undefined && variation !== undefined) {
          props.respond({
            transform: {
              ...transform,
              preAffine: previewFlame.transforms[props.transformId]!.preAffine,
            },
            variation: structuredClone(JSON.parse(JSON.stringify(variation))),
          })
          return true
        }
      }
    }
    return false
  }
  useKeyboardShortcuts({
    Enter: () => {
      // TODO: sometimes goes out of focus, and does not trigger on Enter
      return applySelection()
    },
  })
  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Select Variation
        <span class={ui.undoMessage}>You can undo this operation.</span>
      </ModalTitleBar>
      <section class={ui.variationPreview}>
        <div class={ui.variationSelectorSidebar}>
          <section class={ui.gallery}>
                  <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
                  <For each={recordEntries(variationExamples)}>
                    {([id, variationExample]) => {
                      const variation = getVarFromPreviewFlame(variationExample)
                      const isSelected = () => selectedItemId() === id
                      return (
                        variation && (
                          <button
                            class={ui.item}
                            classList={{
                              [ui.selected]: isSelected(),
                            }}
                            onClick={() => {
                              toggleSelectedItem(id)
                            }}
                            onMouseEnter={() => {
                              setHoveredItemId(id)
                            }}
                            onMouseLeave={() => {
                              setHoveredItemId(undefined)
                            }}
                          >
                            <VariationPreview
                              version={version()}
                              isSelected={isSelected()}
                              flame={variationExample}
                              name={variation.type}
                            />

                            <div class={ui.itemTitle}>
                              {getNormalizedVariationName(variation.type)}
                            </div>
                          </button>
                        )
                      )
                    }}
                  </For>
                </ComputeGate>
          </section>
        </div>

        <div class={ui.variationSelectorSidebarOptions}>
          <For each={recordEntries(variationExamples)}>
            {([id, variationExample], _) => {
              const variation = getVarFromPreviewFlame(variationExample)
              return (
                variation && (
                  <>
                    <Show when={selectedItemId() === id}>
                      <Show
                        when={isParametricVariation(variation) && variation}
                        keyed
                      >
                        {(variation) => (
                          <>
                            <h2>Variation Parameters</h2>
                            <div class={ui.itemParams}>
                              <Dynamic
                                {...getParamsEditor(variation)}
                                setValue={(value) => {
                                  setVariationExamples(
                                    (
                                      draft: Record<string, FlameDescriptor>,
                                    ) => {
                                      const variationDraft =
                                        draft[id]?.transforms[
                                          getTransformPreviewTid(
                                            variation.type,
                                          )
                                        ]?.variations[
                                          getTransformPreviewVid(
                                            variation.type,
                                          )
                                        ]
                                      if (
                                        variationDraft === undefined ||
                                        !isParametricVariation(variationDraft)
                                      ) {
                                        throw new Error(`Unreachable code`)
                                      }
                                      variationDraft.params = value
                                    },
                                  )
                                }}
                              />
                            </div>
                          </>
                        )}
                      </Show>
                    </Show>
                  </>
                )
              )
            }}
          </For>
          <Show when={selectedItemId()}>
            <AffineEditor
              class={ui.affineEditor}
              transforms={{
                [props.transformId]:
                  previewFlame.transforms[props.transformId]!,
              }}
              setTransforms={(setFn) => {
                setPreviewFlame((draft) => {
                  setFn(draft.transforms)
                })
              }}
            />
          </Show>
        </div>
        <div class={ui.flamePreview}>
          <div class={ui.flamePreviewFlame}>
            <PreviewFinalFlame
              flame={previewFlame}
              setFlamePosition={setFlamePosition}
              setFlameZoom={setFlameZoom}
            />
          </div>
          <div class={ui.flamePreviewControls}>
            <ButtonGroup>
              <select
                class={ui.select}
                value={props.previewPointInitMode}
                onChange={(ev) => {
                  const mode = ev.currentTarget.value as PointInitMode
                  props.setPreviewPointInitMode(mode)
                  setVariationExamples((draft) => {
                    for (const id in draft) {
                      const item = draft[id]
                      if (item) {
                        item.renderSettings.pointInitMode = mode
                      }
                    }
                  })
                  setVersion((v) => v + 1)
                  setPreviewFlame((draft) => {
                    draft.renderSettings.pointInitMode = mode
                  })
                }}
              >
                <For each={recordKeys(pointInitModeToImplFn)}>
                  {(pointInitMode) => (
                    <option value={pointInitMode}>{pointInitMode}</option>
                  )}
                </For>
              </select>
            </ButtonGroup>
            <ButtonGroup>
              <Button
                onClick={() => {
                  setFlameZoom(1)
                  setFlamePosition(vec2f())
                }}
                style={{ 'min-width': '4rem' }}
              >
                {(previewFlame.renderSettings.camera.zoom * 100).toFixed(0)}%
              </Button>

              <Button
                onClick={() => {
                  setTouchlessPreview(!touchlessPreview())
                }}
              >
                {touchlessPreview() ? <HoverEyePreview /> : <HoverPreview />}
              </Button>
            </ButtonGroup>
            <ButtonGroup>
              <Button
                onClick={() => {
                  applySelection()
                }}
                disabled={selectedItemId() === undefined}
              >
                Apply
                <Show when={selectedItemId() !== undefined}>
                  <span> {selectedItemId()} variation</span>
                </Show>
              </Button>
            </ButtonGroup>
          </div>
        </div>
      </section>
    </>
  )
}

export function createVariationSelector(
  flameDescriptor: FlameDescriptor,
  setFlameDescriptor: HistorySetter<FlameDescriptor>,
  history: ChangeHistory<FlameDescriptor>,
) {
  const requestModal = useRequestModal()
  const [varSelectorModalIsOpen, setVarSelectorModalIsOpen] =
    createSignal(false)

  async function showVariationSelector(
    currentVar: TransformVariationDescriptor,
    currentFlame: FlameDescriptor,
    tid: TransformId,
    vid: VariationId,
  ) {
    setVarSelectorModalIsOpen(true)
    const result = await requestModal<RespondType>({
      class: ui.modalNoScroll,
      content: ({ respond }) => (
        <ChangeHistoryContextProvider value={history}>
          <ShowVariationSelector
            currentVar={currentVar}
            currentFlame={currentFlame}
            transformId={tid}
            variationId={vid}
            respond={respond}
            previewPointInitMode={flameDescriptor.renderSettings.pointInitMode}
            setPreviewPointInitMode={(mode) => {
              setFlameDescriptor((draft) => {
                draft.renderSettings.pointInitMode = mode
              })
            }}
          />
        </ChangeHistoryContextProvider>
      ),
    })
    setVarSelectorModalIsOpen(false)
    if (result === CANCEL) {
      return
    }
    return result
  }

  return {
    showVariationSelector,
    varSelectorModalIsOpen,
  }
}
