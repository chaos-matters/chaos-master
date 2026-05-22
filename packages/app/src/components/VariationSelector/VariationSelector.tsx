import { createSignal, For, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import { CompactModeProvider } from '@/contexts/CompactModeContext'
import { KeyframeTargetProvider } from '@/contexts/KeyframeTargetContext'
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
import { createStoreHistory } from '@/utils/createStoreHistory'
import { recordEntries } from '@/utils/record'
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

function PreviewFinalFlame(props: {
  flame: FlameDescriptor
  setFlamePosition: Setter<v2f>
  setFlameZoom: Setter<number>
}) {
  return (
    <>
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
            animationEnabled={false}
            flameDescriptor={props.flame}
            renderInterval={DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS}
            edgeFadeColor={vec4f(0)}
          />
        </WheelZoomCamera2D>
      </AutoCanvas>
    </>
  )
}

export function VariationPreview(props: { flame: FlameDescriptor }) {
  const [renderInterval, setRenderInterval] = createSignal<number>(Infinity)
  const onVisibilityChange = (isVisible: boolean) => {
    setRenderInterval(
      isVisible ? DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS : Infinity,
    )
  }
  return (
    <>
      <AutoCanvas onVisibilityChange={onVisibilityChange} pixelRatio={1}>
        <Camera2D
          position={vec2f(...props.flame.renderSettings.camera.position)}
          zoom={props.flame.renderSettings.camera.zoom}
        >
          <Flam3
            quality={0.99}
            pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
            adaptiveFilterEnabled={false}
            animationEnabled={false}
            flameDescriptor={props.flame}
            renderInterval={renderInterval()}
            edgeFadeColor={vec4f(0)}
          />
        </Camera2D>
      </AutoCanvas>
    </>
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
export const variationPreviewFlames: Record<string, FlameDescriptor> =
  Object.fromEntries(
    variationTypes.map((name) => [name, getVariationPreviewFlame(name)]),
  )

function ShowVariationSelector(props: VariationSelectorModalProps) {
  // Speed search state
  const [searchQuery, setSearchQuery] = createSignal('')
  let searchBarTimeoutId: ReturnType<typeof setTimeout> | null = null
  const [searchBarVisible, setSearchBarVisible] = createSignal(false)

  const showSearchBar = () => {
    setSearchBarVisible(true)
    if (searchBarTimeoutId !== null) clearTimeout(searchBarTimeoutId)
    if (searchQuery() === '') {
      searchBarTimeoutId = setTimeout(() => setSearchBarVisible(false), 1800)
    }
  }

  let searchInputRef: HTMLInputElement | undefined

  const filteredVariationEntries = () => {
    const q = searchQuery().trim().toLowerCase()
    if (!q) return recordEntries(variationExamples)
    return recordEntries(variationExamples).filter(([id]) => {
      const flame = variationExamples[id]
      const variation = flame ? getVarFromPreviewFlame(flame) : undefined
      if (!variation) return false
      return getNormalizedVariationName(variation.type)
        .toLowerCase()
        .includes(q)
    })
  }
  const [variationExamples, setVariationExamples] = createStoreHistory(
    createStore<Record<string, FlameDescriptor>>(variationPreviewFlames),
  )
  const [selectedItemId, setSelectedItemId] = createSignal<string | null>(null)
  const [selectedPreviewItemId, setSelectedPreviewItemId] = createSignal<
    string | null
  >(null)
  const [touchlessPreview, setTouchlessPreview] = createSignal<boolean>(true)

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
              previewTr.preAffine = { ...transform.preAffine }
              previewTr.variations[props.variationId] = { ...variation }
              // in general we are swapping target variation with the selected preview one,
              // this might not be exact as the variation preview is, as
              // some variation previews are artifitially beutified by adding extra variations,
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
              // Keep the user's own camera — don't copy zoom/position
              // from the example flame which may have arbitrary values
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
            previewTr.preAffine = { ...originalTransform.preAffine }
          }
          previewTr.variations[props.variationId] = { ...props.currentVar }
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

  // Capture typing for speed search — attach to the modal root via a ref
  function handleSpeedSearch(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    // Don't intercept when user is in an input/textarea or using modifiers
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Escape') {
      if (searchQuery()) {
        setSearchQuery('')
        setSearchBarVisible(false)
        e.stopPropagation()
      }
      return
    }
    if (e.key === 'Backspace') {
      if (searchQuery()) {
        setSearchQuery((q) => q.slice(0, -1))
        showSearchBar()
        e.stopPropagation()
      }
      return
    }
    if (e.key.length === 1) {
      setSearchQuery((q) => q + e.key)
      showSearchBar()
      e.stopPropagation()
    }
  }
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: speed search captures keyboard globally
    <div onKeyDown={handleSpeedSearch}>
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
          <div class={ui.searchBar}>
            <input
              ref={searchInputRef}
              class={ui.searchInput}
              type="text"
              placeholder="Search variations..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchQuery('')
                  e.stopPropagation()
                }
              }}
            />
            <Show when={searchQuery()}>
              <button
                class={ui.searchClear}
                onClick={() => {
                  setSearchQuery('')
                  searchInputRef?.focus()
                }}
                title="Clear search"
              >
                &times;
              </button>
            </Show>
          </div>
          <section class={ui.gallery}>
            <For each={filteredVariationEntries()}>
              {([id, variationExample], i) => {
                const variation = getVarFromPreviewFlame(variationExample)
                return (
                  variation && (
                    <div>
                      <button
                        class={ui.item}
                        classList={{
                          [ui.selected as string]: selectedItemId() === id,
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
                        <div class={ui.itemTitle}>
                          {getNormalizedVariationName(variation.type)}
                        </div>
                      </button>
                    </div>
                  )
                )
              }}
            </For>
          </section>
          {/* Speed-search bar — shows on keyboard typing as a complement */}
          <Show when={searchBarVisible() && !searchQuery()}>
            <div class={ui.speedSearchBar}>
              <span class={ui.speedSearchLabel}>Search:</span>
              <span class={ui.speedSearchQuery}>
                {searchQuery() || '\u00a0'}
              </span>
            </div>
          </Show>
        </div>

        <div class={ui.variationSelectorSidebarOptions}>
          <For each={filteredVariationEntries()}>
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
                                dataParameterPath={`${getTransformPreviewTid(variation.type)}.${getTransformPreviewVid(variation.type)}`}
                                setValue={(value) => {
                                  setVariationExamples(
                                    (
                                      draft: Record<string, FlameDescriptor>,
                                    ) => {
                                      const variationDraft =
                                        draft[id]?.transforms[
                                          getTransformPreviewTid(variation.type)
                                        ]?.variations[
                                          getTransformPreviewVid(variation.type)
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
    </div>
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
          <CompactModeProvider>
            <ChangeHistoryContextProvider value={history}>
              <KeyframeTargetProvider>
                <ShowVariationSelector
                  currentVar={currentVar}
                  currentFlame={currentFlame}
                  transformId={tid}
                  variationId={vid}
                  respond={respond}
                />
              </KeyframeTargetProvider>
            </ChangeHistoryContextProvider>
          </CompactModeProvider>
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
