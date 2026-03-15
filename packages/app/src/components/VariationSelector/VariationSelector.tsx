import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import { createGateContext } from '@/contexts/GateContext'
import { DEFAULT_VARIATION_PREVIEW_POINT_COUNT, DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS, DEFAULT_VARIATION_SHOW_DELAY_MS, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { isParametricVariation, variationTypes } from '@/flame/variations'
import { getNormalizedVariationName, getParamsEditor, getTransformPreviewTid, getTransformPreviewVid, getVariationPreviewFlame, } from '@/flame/variations/utils'
import { HoverEyePreview, HoverPreview } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { recordEntries } from '@/utils/record'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { AffineEditor } from '../AffineEditor/AffineEditor'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './VariationSelector.module.css'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { TransformVariationDescriptor } from '@/flame/variations'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const CANCEL = 'cancel'

type RenderStatus = 'low-quality' | 'high-quality' | 'done'

const { Provider: ComputeGate, useGate: useComputeGate } = createGateContext<{
  isVisible: boolean
  renderStatus: RenderStatus
}>('Compute', (state) =>
  !state.isVisible || state.renderStatus === 'done'
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
          adaptiveFilterEnabled={false}
          flameDescriptor={props.flame}
          renderInterval={DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS}
          edgeFadeColor={vec4f(0)}
        />
      </WheelZoomCamera2D>
    </AutoCanvas>
  )
}

function VariationPreview(props: { flame: FlameDescriptor }) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()
  const [quality, setQuality] = createSignal<() => number>()
  const intersection = useIntersectionObserver(canvas)
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
    }
  })

  return (
    <AutoCanvas ref={setCanvas} pixelRatio={1}>
      <Camera2D
        position={vec2f(...props.flame.renderSettings.camera.position)}
        zoom={props.flame.renderSettings.camera.zoom}
      >
        <Flam3
          run={allowed()}
          quality={0.99}
          pointCountPerBatch={2e4}
          adaptiveFilterEnabled={false}
          flameDescriptor={props.flame}
          renderInterval={1}
          edgeFadeColor={vec4f(0)}
          setCurrentQuality={(fn) => setQuality(() => fn)}
        />
      </Camera2D>
    </AutoCanvas>
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
}
const variationPreviewFlames: Record<string, FlameDescriptor> =
  Object.fromEntries(
    variationTypes.map((name) => [name, getVariationPreviewFlame(name)]),
  )

function ShowVariationSelector(props: VariationSelectorModalProps) {
  const [variationExamples, setVariationExamples] = createStore<
    Record<string, FlameDescriptor>
  >(variationPreviewFlames)
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

  const [previewFlame, setPreviewFlame] = createStore<FlameDescriptor>(
    structuredClone(props.currentFlame),
  )

  const setFlameZoom: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame(
        produce((draft) => {
          draft.renderSettings.camera.zoom = clamp(
            value(draft.renderSettings.camera.zoom),
            MIN_CAMERA_ZOOM_VALUE,
            MAX_CAMERA_ZOOM_VALUE,
          )
        }),
      )
    } else {
      setPreviewFlame(
        produce((draft) => {
          draft.renderSettings.camera.zoom = clamp(
            value,
            MIN_CAMERA_ZOOM_VALUE,
            MAX_CAMERA_ZOOM_VALUE,
          )
        }),
      )
    }
    return previewFlame.renderSettings.camera.zoom
  }

  const setFlamePosition: Setter<v2f> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame(
        produce((draft) => {
          draft.renderSettings.camera.position = value(
            vec2f(...draft.renderSettings.camera.position),
          )
        }),
      )
    } else {
      setPreviewFlame(
        produce((draft) => {
          draft.renderSettings.camera.position = value
        }),
      )
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

  // TODO: convert to computed
  createEffect(() => {
    const itemId = getPreviewSelectionId()
    if (itemId !== undefined) {
      const selectedItem = variationExamples[itemId]
      if (selectedItem) {
        const [transform, variation] =
          getTransformFromPreviewFlame(selectedItem)
        if (transform !== undefined && variation !== undefined) {
          setPreviewFlame(
            produce((draft: FlameDescriptor) => {
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
            }),
          )
        }
      }
    } else {
      setPreviewFlame(
        produce((draft: FlameDescriptor) => {
          const previewTr = draft.transforms[props.transformId]
          if (previewTr !== undefined) {
            const originalTransform =
              props.currentFlame.transforms[props.transformId]
            if (originalTransform !== undefined) {
              previewTr.preAffine = originalTransform.preAffine
            }
            previewTr.variations[props.variationId] = props.currentVar
          }
        }),
      )
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
            <ComputeGate capacity={5}>
              <For each={recordEntries(variationExamples)}>
                {([id, variationExample], i) => {
                  const variation = getVarFromPreviewFlame(variationExample)
                  return (
                    variation && (
                      <button
                        class={ui.item}
                        classList={{
                          [ui.selected]: selectedItemId() === id,
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
                        <DelayedShow
                          delayMs={i() * DEFAULT_VARIATION_SHOW_DELAY_MS}
                        >
                          <VariationPreview flame={variationExample} />
                        </DelayedShow>
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
                                    produce(
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
                                    ),
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
                setPreviewFlame(
                  produce((draft) => {
                    setFn(draft.transforms)
                  }),
                )
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
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <ChangeHistoryContextProvider value={history}>
            <ShowVariationSelector
              currentVar={currentVar}
              currentFlame={currentFlame}
              transformId={tid}
              variationId={vid}
              respond={respond}
            />
          </ChangeHistoryContextProvider>
        </Root>
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
