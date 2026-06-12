import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack, } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { produce, unfreeze } from 'structurajs'
import { vec2f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { ChangeHistoryContextProvider } from '@/contexts/ChangeHistoryContext'
import { CompactModeProvider } from '@/contexts/CompactModeContext'
import { ComputeGate, useComputeGate } from '@/contexts/ComputeGateContext'
import { KeyframeTargetProvider } from '@/contexts/KeyframeTargetContext'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { COMPUTE_GATE_CAPACITY, DEFAULT_VARIATION_PREVIEW_POINT_COUNT, DEFAULT_VARIATION_PREVIEW_QUALITY, DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS, DEFAULT_VARIATION_SHOW_DELAY_MS, } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { pointInitModeToImplFn } from '@/flame/pointInitMode'
import { pointInitMode3DToImplFn } from '@/flame/pointInitMode3D'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, } from '@/flame/schema/flameSchema'
import { categoryOf } from '@/flame/variationRegistry'
import { isParametricVariation, variationTypes } from '@/flame/variations'
import { CATEGORIES, CATEGORY_LABELS, sortByCategory, } from '@/flame/variations/categories'
import { getNormalizedVariationName, getParamsEditor, getTransformPreviewTid, getTransformPreviewVid, getVariationPreviewFlame, getVariationPreviewFlame3D, } from '@/flame/variations/utils'
import { variationTypes3D } from '@/flame/variations3D'
import { HoverEyePreview, HoverPreview } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { hardwareTierToQuality } from '@/utils/hardwareTier'
import { recordEntries, recordKeys } from '@/utils/record'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { useKeyboardShortcuts } from '@/utils/useKeyboardShortcuts'
import { vramLog } from '@/utils/vramLog'
import { AffineEditor } from '../AffineEditor/AffineEditor'
import { Button } from '../Button/Button'
import { ButtonGroup } from '../Button/ButtonGroup'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './VariationSelector.module.css'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { ExportImageType } from '@/App'
import type { RenderStatus } from '@/contexts/ComputeGateContext'
import type { PointInitMode } from '@/flame/pointInitMode'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { TransformVariationDescriptor } from '@/flame/variations'
import type { VariationCategory } from '@/flame/variations/categories'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ChangeHistory, HistorySetter } from '@/utils/createStoreHistory'
import type { HardwareTier } from '@/utils/hardwareTier'

const CANCEL = 'cancel'

export function PreviewFinalFlame(props: {
  flame: FlameDescriptor
  setFlamePosition: Setter<v2f>
  setFlameZoom: Setter<number>
  setFlameTheta?: Setter<number>
  setFlamePhi?: Setter<number>
  setFlameRadius?: Setter<number>
  setFlameTarget3D?: Setter<Vec3>
  setFlameFov?: Setter<number>
  hardwareTier?: HardwareTier | null
}) {
  const is3D = () => (props.flame.renderSettings.dimensions ?? 2) === 3
  const targetQuality = () =>
    props.hardwareTier ? hardwareTierToQuality[props.hardwareTier] : 0.99

  return (
    <AutoCanvas class={ui.canvas} pixelRatio={1}>
      <Show
        when={is3D()}
        fallback={
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
              animationEnabled={false}
              quality={targetQuality()}
              pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
              adaptiveFilterEnabled={true}
              flameDescriptor={props.flame}
              renderInterval={DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS}
              edgeFadeColor={vec4f(0)}
            />
          </WheelZoomCamera2D>
        }
      >
        <WheelZoomCamera3D
          theta={[
            () => props.flame.renderSettings.camera3D?.theta ?? 0,
            props.setFlameTheta ?? (() => 0),
          ]}
          phi={[
            () => props.flame.renderSettings.camera3D?.phi ?? Math.PI / 2,
            props.setFlamePhi ?? (() => 0),
          ]}
          radius={[
            () => props.flame.renderSettings.camera3D?.radius ?? 5,
            props.setFlameRadius ?? (() => 0),
          ]}
          target={[
            () =>
              new Float32Array(
                props.flame.renderSettings.camera3D?.target ?? [0, 0, 0],
              ),
            props.setFlameTarget3D ?? (() => new Float32Array([0, 0, 0])),
          ]}
          fov={[
            () => props.flame.renderSettings.camera3D?.fov ?? 60,
            props.setFlameFov ?? (() => 0),
          ]}
        >
          <Flam3
            animationEnabled={false}
            quality={targetQuality()}
            pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
            adaptiveFilterEnabled={true}
            flameDescriptor={props.flame}
            renderInterval={DEFAULT_VARIATION_PREVIEW_RENDER_INTERVAL_MS}
            edgeFadeColor={vec4f(0)}
          />
        </WheelZoomCamera3D>
      </Show>
    </AutoCanvas>
  )
}

export function VariationPreview(props: {
  version: number
  isSelected: boolean
  flame: FlameDescriptor
  name: string
  hardwareTier?: HardwareTier | null
}) {
  const is3D = () => (props.flame.renderSettings.dimensions ?? 2) === 3
  const targetQuality = () =>
    props.hardwareTier ? hardwareTierToQuality[props.hardwareTier] : 0.99
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
    void props.version
    setImage(undefined)
  })

  const [everAllowed, setEverAllowed] = createSignal(false)
  createEffect(() => {
    if (allowed()) setEverAllowed(true)
  })

  const [everVisible, setEverVisible] = createSignal(false)
  createEffect(() => {
    if (isVisible() === true) setEverVisible(true)
  })

  createEffect(() => {
    if (!container() || renderStatus() !== 'done') {
      return
    }

    const { promise, resolve } = Promise.withResolvers<Blob>()
    setExportImage(() => (canvas: HTMLCanvasElement) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
      })
    })

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
      classList={{ [ui.stretchDone as string]: image() !== undefined }}
      ref={setContainer}
      style={{
        ['--background']:
          image() !== undefined ? `url('${image()}')` : undefined,
      }}
    >
      <Show
        when={
          image() === undefined && (allowed() || everAllowed() || everVisible())
        }
      >
        <AutoCanvas
          pixelRatio={1}
          fixedResolution={{ width: 256, height: 144 }}
        >
          <Show
            when={is3D()}
            fallback={
              <Camera2D
                position={vec2f(...props.flame.renderSettings.camera.position)}
                zoom={props.flame.renderSettings.camera.zoom}
              >
                <Flam3
                  animationEnabled={false}
                  quality={targetQuality()}
                  pointCountPerBatch={5e4}
                  adaptiveFilterEnabled={false}
                  flameDescriptor={props.flame}
                  renderInterval={allowed() ? 1 : Infinity}
                  onExportImage={exportImage()}
                  edgeFadeColor={vec4f(0)}
                  setCurrentQuality={(fn) => setQuality(() => fn)}
                />
              </Camera2D>
            }
          >
            <Default3DPreviewCamera>
              <Flam3
                animationEnabled={false}
                quality={targetQuality()}
                pointCountPerBatch={5e4}
                adaptiveFilterEnabled={true}
                flameDescriptor={props.flame}
                renderInterval={allowed() ? 1 : Infinity}
                onExportImage={exportImage()}
                edgeFadeColor={vec4f(0)}
                setCurrentQuality={(fn) => setQuality(() => fn)}
              />
            </Default3DPreviewCamera>
          </Show>
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
  hardwareTier?: HardwareTier | null
  setFlameTheta?: Setter<number>
  setFlamePhi?: Setter<number>
  setFlameRadius?: Setter<number>
  setFlameTarget3D?: Setter<Vec3>
  setFlameFov?: Setter<number>
}
export const variationPreviewFlames: (
  p: PointInitMode,
  dims?: 2 | 3,
) => Record<string, FlameDescriptor> = (
  pointInitMode: PointInitMode,
  dims: 2 | 3 = 2,
) => {
  if (dims === 3) {
    return Object.fromEntries(
      variationTypes3D.map((name) => [
        name,
        unfreeze(
          produce(getVariationPreviewFlame3D(name), (draft) => {
            draft.renderSettings.pointInitMode = pointInitMode
          }),
        ),
      ]),
    )
  }
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
  const [previewPointInitMode, setPreviewPointInitMode] =
    createSignal<PointInitMode>(props.currentFlame.renderSettings.pointInitMode)
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

  const dims = () =>
    (props.currentFlame.renderSettings.dimensions ?? 2) as 2 | 3
  let searchInputRef: HTMLInputElement | undefined
  const [variationExamples, setVariationExamples] = createStoreHistory(
    createStore<Record<string, FlameDescriptor>>(
      variationPreviewFlames(previewPointInitMode(), dims()),
    ),
  )

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

  const [categoryFilter, setCategoryFilter] =
    createSignal<VariationCategory | null>(null)

  const groupedEntries = () => {
    const items = filteredVariationEntries()
    const selectedCategory = categoryFilter()
    const groups = new Map<VariationCategory, [string, FlameDescriptor][]>()

    for (const [id, flame] of items) {
      const variation = getVarFromPreviewFlame(flame)
      if (!variation) continue
      const cat = categoryOf(dims(), variation.type)
      if (!cat || (selectedCategory && cat !== selectedCategory)) continue
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push([id, flame])
    }

    return [...groups.entries()]
      .sort(([a], [b]) => sortByCategory(a, b))
      .map(([cat, entries]) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        entries,
      }))
  }

  const activeCategories = () => {
    const cats = new Set<VariationCategory>()
    for (const [, flame] of filteredVariationEntries()) {
      const variation = getVarFromPreviewFlame(flame)
      if (!variation) continue
      const cat = categoryOf(dims(), variation.type)
      if (cat) cats.add(cat)
    }
    return CATEGORIES.filter((c) => cats.has(c))
  }

  const [selectedItemId, setSelectedItemId] = createSignal<string>()
  const [hoveredItemId, setHoveredItemId] = createSignal<string>()
  const [touchlessPreview, setTouchlessPreview] = createSignal<boolean>(true)
  const [paramsCollapsed, setParamsCollapsed] = createSignal(false)
  const [affineCollapsed, setAffineCollapsed] = createSignal(false)

  let hoverClearTimer: ReturnType<typeof setTimeout> | undefined
  const PREVIEW_CLEAR_DELAY = 120

  function handleMouseEnter(id: string) {
    clearTimeout(hoverClearTimer)
    setHoveredItemId(id)
  }

  function handleMouseLeave() {
    hoverClearTimer = setTimeout(() => {
      setHoveredItemId(undefined)
    }, PREVIEW_CLEAR_DELAY)
  }

  function handleContainerLeave() {
    clearTimeout(hoverClearTimer)
    setHoveredItemId(undefined)
  }

  onCleanup(() => {
    clearTimeout(hoverClearTimer)
  })
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
        produce(deepClone(props.currentFlame), (draft) => {
          draft.renderSettings.pointInitMode = previewPointInitMode()
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

  const setFlameTheta: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.theta = value(
          draft.renderSettings.camera3D.theta,
        )
      })
    } else {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.theta = value
      })
    }
    return previewFlame.renderSettings.camera3D?.theta ?? 0
  }

  const setFlamePhi: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.phi = value(
          draft.renderSettings.camera3D.phi,
        )
      })
    } else {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.phi = value
      })
    }
    return previewFlame.renderSettings.camera3D?.phi ?? 0
  }

  const setFlameRadius: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.radius = value(
          draft.renderSettings.camera3D.radius,
        )
      })
    } else {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.radius = value
      })
    }
    return previewFlame.renderSettings.camera3D?.radius ?? 5
  }

  const setFlameTarget3D: Setter<Vec3> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.target = value(
          new Float32Array(draft.renderSettings.camera3D.target),
        ) as [number, number, number]
      })
    } else {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.target = value
      })
    }
    return new Float32Array(
      previewFlame.renderSettings.camera3D?.target ?? [0, 0, 0],
    )
  }

  const setFlameFov: Setter<number> = (value) => {
    if (typeof value === 'function') {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.fov = value(
          draft.renderSettings.camera3D.fov,
        )
      })
    } else {
      setPreviewFlame((draft) => {
        if (!draft.renderSettings.camera3D) return
        draft.renderSettings.camera3D.fov = value
      })
    }
    return previewFlame.renderSettings.camera3D?.fov ?? 60
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
                draft.renderSettings.exposure =
                  selectedItem.renderSettings.exposure
                draft.renderSettings.gamma = selectedItem.renderSettings.gamma
                draft.renderSettings.vibrancy =
                  selectedItem.renderSettings.vibrancy
                draft.renderSettings.contrast =
                  selectedItem.renderSettings.contrast
                draft.renderSettings.depthColorPower =
                  selectedItem.renderSettings.depthColorPower
                draft.renderSettings.lightPower =
                  selectedItem.renderSettings.lightPower
                if (selectedItem.renderSettings.lightDirection) {
                  draft.renderSettings.lightDirection = [
                    ...selectedItem.renderSettings.lightDirection,
                  ] as [number, number, number]
                }

                draft.renderSettings.camera.zoom =
                  selectedItem.renderSettings.camera.zoom
                draft.renderSettings.camera.position =
                  selectedItem.renderSettings.camera.position

                if (selectedItem.renderSettings.camera3D) {
                  draft.renderSettings.camera3D = deepClone(
                    selectedItem.renderSettings.camera3D,
                  )
                }
              }
            })
          })
        }
      }
    } else {
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
            variation: deepClone(variation),
          })
          return true
        }
      }
    }
    return false
  }
  useKeyboardShortcuts({
    Enter: () => {
      return applySelection()
    },
    Escape: () => {
      props.respond(CANCEL)
      return true
    },
  })

  function handleSpeedSearch(e: KeyboardEvent) {
    const target = e.target as HTMLElement
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
    <div class={ui.variationSelectorWrapper} onKeyDown={handleSpeedSearch}>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Select Variation
        <span class={ui.undoMessage}>You can undo this operation.</span>
      </ModalTitleBar>
      <section class={ui.variationPreview}>
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
              } else if (e.key === 'Enter') {
                if (applySelection()) {
                  e.preventDefault()
                  e.stopPropagation()
                }
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
        <div class={ui.dummyHeader} />
        <div class={ui.variationSelectorSidebar}>
          <Show when={activeCategories().length > 1}>
            <div class={ui.categoryFilterRow}>
              <button
                class={ui.categoryPill}
                classList={{
                  [ui.categoryPillActive as string]: categoryFilter() === null,
                }}
                onClick={() => setCategoryFilter(null)}
              >
                All
              </button>
              <For each={activeCategories()}>
                {(cat) => (
                  <button
                    class={ui.categoryPill}
                    classList={{
                      [ui.categoryPillActive as string]:
                        categoryFilter() === cat,
                    }}
                    onClick={() =>
                      setCategoryFilter(categoryFilter() === cat ? null : cat)
                    }
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <section class={ui.gallery} onMouseLeave={handleContainerLeave}>
            <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
              <For each={groupedEntries()}>
                {({ label, entries }) => (
                  <>
                    <div class={ui.sectionHeader}>{label}</div>
                    <For each={entries}>
                      {([id, variationExample]) => {
                        const variation =
                          getVarFromPreviewFlame(variationExample)
                        const isSelected = () => selectedItemId() === id
                        return (
                          variation && (
                            <button
                              class={ui.item}
                              classList={{
                                [ui.selected as string]: isSelected(),
                              }}
                              onClick={() => {
                                toggleSelectedItem(id)
                              }}
                              onMouseEnter={() => {
                                handleMouseEnter(id)
                              }}
                              onMouseLeave={() => {
                                handleMouseLeave()
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault()
                              }}
                            >
                              <VariationPreview
                                version={version()}
                                isSelected={isSelected()}
                                flame={variationExample}
                                name={variation.type}
                                hardwareTier={props.hardwareTier}
                              />
                              <div class={ui.itemTitle}>
                                {getNormalizedVariationName(variation.type)}
                              </div>
                            </button>
                          )
                        )
                      }}
                    </For>
                  </>
                )}
              </For>
            </ComputeGate>
          </section>
          <Show when={searchBarVisible() && !searchQuery()}>
            <div class={ui.speedSearchBar}>
              <span class={ui.speedSearchLabel}>Search:</span>
              <span class={ui.speedSearchQuery}>{searchQuery() || ' '}</span>
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
                            <h2
                              class={ui.collapsibleHeader}
                              onClick={() => setParamsCollapsed((v) => !v)}
                            >
                              <span class={ui.chevron}>
                                {paramsCollapsed() ? '▶' : '▼'}
                              </span>
                              Variation Parameters
                            </h2>
                            <Show when={!paramsCollapsed()}>
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
                                        ;(
                                          variationDraft as {
                                            params: Record<string, number>
                                          }
                                        ).params = value
                                      },
                                    )
                                  }}
                                />
                              </div>
                            </Show>
                          </>
                        )}
                      </Show>
                    </Show>
                  </>
                )
              )
            }}
          </For>
          <Show when={selectedItemId() && dims() !== 3}>
            <h2
              class={ui.collapsibleHeader}
              onClick={() => setAffineCollapsed((v) => !v)}
            >
              <span class={ui.chevron}>{affineCollapsed() ? '▶' : '▼'}</span>
              Affine Editor
            </h2>
            <Show when={!affineCollapsed()}>
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
                is3D={(previewFlame.renderSettings.dimensions ?? 2) === 3}
              />
            </Show>
          </Show>
        </div>
        <div class={ui.flamePreview}>
          <div class={ui.flamePreviewFlame}>
            <PreviewFinalFlame
              flame={previewFlame}
              setFlamePosition={setFlamePosition}
              setFlameZoom={setFlameZoom}
              setFlameTheta={setFlameTheta}
              setFlamePhi={setFlamePhi}
              setFlameRadius={setFlameRadius}
              setFlameTarget3D={setFlameTarget3D}
              setFlameFov={setFlameFov}
              hardwareTier={props.hardwareTier}
            />
          </div>
          <div class={ui.flamePreviewControls}>
            <ButtonGroup>
              <select
                class={ui.select}
                value={previewPointInitMode()}
                onChange={(ev) => {
                  const mode = ev.currentTarget.value as PointInitMode
                  setPreviewPointInitMode(mode)
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
                <For
                  each={
                    dims() === 3
                      ? recordKeys(pointInitMode3DToImplFn)
                      : recordKeys(pointInitModeToImplFn)
                  }
                >
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
                  <span>
                    {' '}
                    {getNormalizedVariationName(selectedItemId()!)} variation
                  </span>
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
  hardwareTier?: HardwareTier | null,
) {
  const requestModal = useRequestModal()
  const [varSelectorModalIsOpen, setVarSelectorModalIsOpen] =
    createSignal(false)

  async function showVariationSelector(
    currentVar: TransformVariationDescriptor,
    currentFlame: FlameDescriptor,
    tid: TransformId,
    vid: VariationId,
    props: {
      setFlameTheta?: Setter<number>
      setFlamePhi?: Setter<number>
      setFlameRadius?: Setter<number>
      setFlameTarget3D?: Setter<Vec3>
      setFlameFov?: Setter<number>
    } = {},
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
                  hardwareTier={hardwareTier}
                  setFlameTheta={props.setFlameTheta}
                  setFlamePhi={props.setFlamePhi}
                  setFlameRadius={props.setFlameRadius}
                  setFlameTarget3D={props.setFlameTarget3D}
                  setFlameFov={props.setFlameFov}
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
