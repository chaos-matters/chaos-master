import { createSignal, For, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import {
  DEFAULT_VARIATION_PREVIEW_POINT_COUNT,
  DEFAULT_VARIATION_SHOW_DELAY_MS,
} from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import {
  MAX_CAMERA_ZOOM_VALUE,
  MIN_CAMERA_ZOOM_VALUE,
} from '@/flame/schema/flameSchema'
import { isParametricVariation, variationTypes } from '@/flame/variations'
import {
  getParamsEditor,
  getVariationPreviewFlame,
  transformPreviewId,
  variationPreviewId,
} from '@/flame/variations/utils'
import { HoverEyePreview, HoverPreview } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { createStoreHistory } from '@/utils/createStoreHistory'
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
import type {
  FlameDescriptor,
  TransformFunction,
  TransformId,
  VariationId,
} from '@/flame/schema/flameSchema'
import type { TransformVariationDescriptor } from '@/flame/variations'
import type { ChangeHistory } from '@/utils/createStoreHistory'

const CANCEL = 'cancel'

function PreviewFinalFlame(props: {
  flame: FlameDescriptor
  setFlamePosition: Setter<v2f>
  setFlameZoom: Setter<number>
}) {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
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
            quality={0.99}
            pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
            adaptiveFilterEnabled={false}
            flameDescriptor={props.flame}
            renderInterval={10}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
          />
        </WheelZoomCamera2D>
      </AutoCanvas>
    </Root>
  )
}

function VariationPreview(props: { flame: FlameDescriptor }) {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <AutoCanvas class={ui.canvas} pixelRatio={1}>
        <Camera2D
          position={vec2f(...props.flame.renderSettings.camera.position)}
          zoom={props.flame.renderSettings.camera.zoom}
        >
          <Flam3
            quality={0.99}
            pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
            adaptiveFilterEnabled={false}
            flameDescriptor={props.flame}
            renderInterval={10}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
          />
        </Camera2D>
      </AutoCanvas>
    </Root>
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
const lazyLoadAmount = 10
const variationPreviewFlames: Record<string, FlameDescriptor> =
  Object.fromEntries(
    variationTypes.map((name) => [name, getVariationPreviewFlame(name)]),
  )

function ShowVariationSelector(props: VariationSelectorModalProps) {
  const [variationExamples, setVariationExamples] = createStoreHistory(
    createStore<Record<string, FlameDescriptor>>(variationPreviewFlames),
  )
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [selectedPreviewItemId, setSelectedPreviewItemId] = createSignal<
    string | null
  >(null)
  const [touchlessPreview, setTouchlessPreview] = createSignal<boolean>(true)
  const [examplesShown, setExamplesShown] = createSignal<number>(lazyLoadAmount)
  const loadMoreExamples = () => {
    setExamplesShown((prev) =>
      Math.min(prev + lazyLoadAmount, variationTypes.length),
    )
  }
  const [sentinel, setSentinel] = createSignal<HTMLDivElement | null>(null)
  const [scrollableSidebar, setScrollableSidebar] =
    createSignal<HTMLDivElement | null>(null)
  useIntersectionObserver(
    () => sentinel(),
    () => scrollableSidebar(),
    loadMoreExamples,
  )

  const [previewFlame, setPreviewFlame] = createStoreHistory(
    createStore<FlameDescriptor>(structuredClone(props.currentFlame)),
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
  const setPreviewFlameShowcaseVariation = () => {
    const itemId = getPreviewSelectionId()
    if (itemId !== null) {
      const selectedItem = variationExamples[itemId]
      if (selectedItem) {
        const [transform, variation] =
          getTransformFromPreviewFlame(selectedItem)
        if (transform !== undefined && variation !== undefined) {
          setPreviewFlame((draft: FlameDescriptor) => {
            const previewTr = draft.transforms[props.transformId]
            if (previewTr !== undefined) {
              previewTr.preAffine = transform.preAffine
              previewTr.variations[props.variationId] = variation
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
        }
      }
    } else {
      setPreviewFlame((draft: FlameDescriptor) => {
        const previewTr = draft.transforms[props.transformId]
        if (previewTr !== undefined) {
          const originalTransform =
            props.currentFlame.transforms[props.transformId]
          if (originalTransform !== undefined) {
            previewTr.preAffine = originalTransform.preAffine
          }
          previewTr.variations[props.variationId] = props.currentVar
        }
      })
    }
  }
  const toggleSelectedItem = (idToToggle: string) => {
    setSelectedItemId(selectedItemId() === idToToggle ? null : idToToggle)
    setPreviewFlameShowcaseVariation()
  }

  const getPreviewSelectionId = () => {
    return selectedPreviewItemId() ?? selectedItemId() ?? null
  }

  const setPreviewSelection = (id: string | null) => {
    setSelectedPreviewItemId(id)
    setPreviewFlameShowcaseVariation()
  }

  const applySelection = () => {
    const itemId = selectedItemId()
    if (itemId !== null) {
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
        <div ref={setScrollableSidebar} class={ui.variationSelectorSidebar}>
          <section class={ui.gallery}>
            <For each={recordEntries(variationExamples)}>
              {([id, variationExample], i) => {
                const variation = getVarFromPreviewFlame(variationExample)
                return (
                  variation && (
                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                    <Show when={i() < examplesShown()}>
                      <div>
                        <button
                          class={ui.item}
                          classList={{
                            [ui.selected]: selectedItemId() === id,
                          }}
                          onClick={() => {
                            toggleSelectedItem(id)
                          }}
                          onMouseEnter={() => {
                            if (touchlessPreview()) {
                              setPreviewSelection(id)
                            }
                          }}
                          onMouseLeave={() => {
                            setPreviewSelection(null)
                          }}
                        >
                          <DelayedShow
                            delayMs={i() * DEFAULT_VARIATION_SHOW_DELAY_MS}
                          >
                            <VariationPreview flame={variationExample} />
                          </DelayedShow>
                          <div class={ui.itemTitle}>{variation.type}</div>
                        </button>
                      </div>
                    </Show>
                  )
                )
              }}
            </For>
            <div ref={setSentinel} class={ui.sentinel}></div>
          </section>
        </div>

        <div class={ui.variationSelectorSidebarOptions}>
          <For each={recordEntries(variationExamples)}>
            {([id, variationExample], _) => {
              const variation = getVarFromPreviewFlame(variationExample)
              return (
                variation && (
                  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                  <>
                    <Show when={selectedItemId() === id}>
                      <Show
                        when={
                          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                          isParametricVariation(variation) && variation
                        }
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
                                          transformPreviewId
                                        ]?.variations[variationPreviewId]
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
          <AffineEditor
            class={ui.affineEditor}
            transforms={{
              [props.transformId]: previewFlame.transforms[props.transformId]!,
            }}
            setTransforms={(setFn) => {
              setPreviewFlame((draft) => {
                setFn(draft.transforms)
              })
            }}
          />
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
                disabled={selectedItemId() === null}
              >
                Apply
                <Show when={selectedItemId() !== null}>
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
        <ChangeHistoryContextProvider value={history}>
          <ShowVariationSelector
            currentVar={currentVar}
            currentFlame={currentFlame}
            transformId={tid}
            variationId={vid}
            respond={respond}
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
