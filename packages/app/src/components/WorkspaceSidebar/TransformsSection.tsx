import { For, Show, Suspense } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { vec2f } from 'typegpu/data'
import ui from '@/App.module.css'
import { CollapsibleCard } from '@/components/CollapsibleCard/CollapsibleCard'
import { Card } from '@/components/ControlCard/ControlCard'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { handleColor } from '@/components/FlameColorEditor/FlameColorEditor'
import { AngleEditor } from '@/components/Sliders/ParametricEditors/AngleEditor'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { Slider } from '@/components/Sliders/Slider'
import { random01, randomizeVariationParams } from '@/flame/randomize'
import { isAnyParametricVariationType, isVariationType, } from '@/flame/variations'
import { getNormalizedVariationName, getParamsEditor, } from '@/flame/variations/utils'
import { Cross, Eye, EyeOff, Plus, Shuffle } from '@/icons'
import { affineFocusId, transformColorRandomizeFocusId, transformFocusId, transformVisibilityFocusId, variationParamsFocusId, variationRandomizeFocusId, variationTypeFocusId, variationVisibilityFocusId, } from '@/recorder/focusIds'
import { deepClone } from '@/utils/clone'
import { recordEntries } from '@/utils/record'
import { sortedTransformEntries } from '@/utils/transformOrder'
import type { Accessor, Setter } from 'solid-js'
import type { Vec3 } from 'wgpu-matrix'
import type { CommandContext } from '@/commands/types'
import type { RespondType } from '@/components/VariationSelector/VariationSelector'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { TransformVariationDescriptor, TransformVariationType, } from '@/flame/variations'
import type { TransformVariationType3D } from '@/flame/variations3D'
import type { ReadableIds } from '@/utils/readableIds'

function formatPercent(x: number) {
  if (x === 1) {
    return '100 %'
  }
  return `${(x * 100).toFixed(1)} %`
}

export interface TransformsSectionProps {
  flameDescriptor: FlameDescriptor
  theme: Accessor<'dark' | 'light'>
  readableIds: Accessor<ReadableIds>
  collapsedTransforms: Accessor<Set<string>>
  toggleTransformCollapsed: (tid: string) => void
  anyTransformOpen: Accessor<boolean>
  toggleCollapseAllTransforms: () => void
  selectedTransformId: Accessor<string | null>
  toggleSelectedTransform: (tid: string) => void
  hideDiceButtons: Accessor<boolean>
  cmdContext: CommandContext
  executeCommand: (
    name: string,
    ctx: CommandContext,
    ...args: unknown[]
  ) => unknown
  totalProbability: Accessor<number>
  setTargetedParameter: (param: string) => void
  animationEnabled: Accessor<boolean>
  customStatus: (type: string) => 'none' | 'available' | 'unavailable'
  isMobile: Accessor<boolean>
  sidebarHidden: Accessor<boolean>
  setSidebarHidden: (hidden: boolean) => void
  setQuickPickState: (
    state: {
      tid: TransformId
      vid: VariationId
      type: TransformVariationType | TransformVariationType3D
    } | null,
  ) => void
  showVariationSelector: (
    variation: TransformVariationDescriptor,
    flame: FlameDescriptor,
    tid: TransformId,
    vid: VariationId,
    cameraSetters?: {
      setFlameTheta?: Setter<number>
      setFlamePhi?: Setter<number>
      setFlameRadius?: Setter<number>
      setFlameTarget3D?: Setter<Vec3>
      setFlameFov?: Setter<number>
    },
  ) => Promise<RespondType | undefined>
  setFlameTheta: Setter<number>
  setFlamePhi: Setter<number>
  setFlameRadius: Setter<number>
  setFlameTarget3D: (value: Vec3 | ((prev: Vec3) => Vec3)) => void
  setFlameFov: Setter<number>
  symmetryCardOpen: Accessor<boolean>
  setSymmetryCardOpen: Setter<boolean>
  currentSymType: Accessor<'rotational' | 'dihedral'>
  currentSymFolds: Accessor<number>
  applySymmetry: (
    folds: number,
    type: 'rotational' | 'dihedral',
    mode?: 'type' | 'folds' | 'add',
  ) => void
  symTransformIds: Accessor<string[]>
  symTransforms: Accessor<[string, TransformFunction][]>
  showMigrationModal: (flame: FlameDescriptor) => void
}

export function TransformsSection(props: TransformsSectionProps) {
  const {
    flameDescriptor,
    theme,
    readableIds,
    collapsedTransforms,
    toggleTransformCollapsed,
    anyTransformOpen,
    toggleCollapseAllTransforms,
    selectedTransformId,
    toggleSelectedTransform,
    hideDiceButtons,
    cmdContext,
    executeCommand,
    totalProbability,
    setTargetedParameter,
    animationEnabled,
    customStatus,
    isMobile,
    sidebarHidden,
    setSidebarHidden,
    setQuickPickState,
    showVariationSelector,
    setFlameTheta,
    setFlamePhi,
    setFlameRadius,
    setFlameTarget3D,
    setFlameFov,
    symmetryCardOpen,
    setSymmetryCardOpen,
    currentSymType,
    currentSymFolds,
    applySymmetry,
    symTransformIds,
    symTransforms,
    showMigrationModal,
  } = props

  return (
    <>
      <div class={ui.transformsToolbar} data-tour-target="transform-list">
        <span class={ui.transformsToolbarLabel}>Transforms</span>
        <span
          class={ui.transformHeaderAction}
          role="button"
          tabindex={0}
          title={
            anyTransformOpen()
              ? 'Collapse all transform cards'
              : 'Expand all transform cards'
          }
          onClick={toggleCollapseAllTransforms}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleCollapseAllTransforms()
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <Show
              when={anyTransformOpen()}
              fallback={
                <>
                  <polyline points="6 5 12 11 18 5" />
                  <polyline points="6 13 12 19 18 13" />
                </>
              }
            >
              <polyline points="18 11 12 5 6 11" />
              <polyline points="18 19 12 13 6 19" />
            </Show>
          </svg>
        </span>
      </div>
      <For
        each={sortedTransformEntries(
          recordEntries(flameDescriptor.transforms),
        ).filter(([tid]) => !tid.startsWith('_sym__'))}
      >
        {([tid, transform]) => (
          <CollapsibleCard
            title={readableIds().transformLabel[tid]!}
            data-focus-id={transformFocusId(tid)}
            open={!collapsedTransforms().has(tid)}
            onToggleOpen={() => {
              toggleTransformCollapsed(tid)
            }}
            selected={selectedTransformId() === tid}
            dimmed={
              selectedTransformId() !== null && selectedTransformId() !== tid
            }
            accentColor={handleColor(
              theme(),
              vec2f(transform.color.x, transform.color.y),
            )}
            onToggleSelect={() => {
              toggleSelectedTransform(tid)
            }}
            headerActions={
              <>
                <Show when={!hideDiceButtons()}>
                  <span
                    class={ui.transformHeaderAction}
                    data-focus-id={transformColorRandomizeFocusId(tid)}
                    role="button"
                    tabindex={0}
                    title="Randomize transform color"
                    onClick={(e) => {
                      e.stopPropagation()
                      const hue = random01() * 2 * Math.PI
                      const chroma = 0.25 + random01() * 0.15
                      executeCommand(
                        'flame.setTransformColor',
                        cmdContext,
                        tid,
                        chroma * Math.cos(hue),
                        chroma * Math.sin(hue),
                        'card-randomize',
                      )
                    }}
                  >
                    <Shuffle />
                  </span>
                </Show>
                <span
                  class={ui.transformHeaderAction}
                  data-focus-id={transformVisibilityFocusId(tid)}
                  role="button"
                  tabindex={0}
                  title={
                    transform.visible ? 'Hide transform' : 'Show transform'
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    executeCommand(
                      'flame.setTransformVisible',
                      cmdContext,
                      tid,
                      !transform.visible,
                    )
                  }}
                >
                  {transform.visible ? <Eye /> : <EyeOff />}
                </span>
                <span
                  class={ui.transformHeaderAction}
                  role="button"
                  tabindex={0}
                  title="Delete transform"
                  onClick={(e) => {
                    e.stopPropagation()
                    executeCommand('flame.deleteTransform', cmdContext, tid)
                  }}
                >
                  <Cross />
                </span>
              </>
            }
          >
            <div class={ui.transformGrid}>
              <div
                data-tour-target="probability"
                classList={{
                  [ui.transformGridRow as string]: true,
                  [ui.transformGridFirstRow as string]: true,
                }}
                onClick={() => {
                  setTargetedParameter(`transform.${tid}.probability`)
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
                    executeCommand(
                      'flame.setProbability',
                      cmdContext,
                      tid,
                      probability,
                    )
                  }}
                  formatValue={(value) =>
                    formatPercent(value / totalProbability())
                  }
                  dataParameterPath={`transform.${tid}.probability`}
                />
              </div>
              <div
                classList={{
                  [ui.transformGridRow as string]: true,
                }}
                onClick={() => {
                  setTargetedParameter(`transform.${tid}.colorSpeed`)
                }}
              >
                <Slider
                  class={ui.transformGridFirstRow}
                  label="Color Speed"
                  value={transform.colorSpeed ?? 0.4}
                  min={0}
                  max={1}
                  step={0.01}
                  onInput={(val) => {
                    executeCommand('flame.setColorSpeed', cmdContext, tid, val)
                  }}
                  dataParameterPath={`transform.${tid}.colorSpeed`}
                  data-tour-target="colorSpeed-slider"
                />
              </div>
              <For each={recordEntries(transform.variations)}>
                {([vid, variation]) => (
                  <>
                    <div class={ui.transformGridRow}>
                      <button
                        class={ui.variationButton}
                        data-tour-target="variation-type"
                        data-focus-id={variationTypeFocusId(tid, vid)}
                        value={variation.type}
                        title={
                          customStatus(variation.type) === 'unavailable'
                            ? `${getNormalizedVariationName(variation.type)} — custom variation unavailable (deleted from your library)`
                            : getNormalizedVariationName(variation.type)
                        }
                        onClick={() => {
                          if (isMobile() && sidebarHidden()) {
                            setSidebarHidden(false)
                          }
                          setQuickPickState({
                            tid: tid,
                            vid: vid,
                            type: variation.type,
                          })
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          showVariationSelector(
                            deepClone(variation),
                            deepClone(flameDescriptor),
                            tid,
                            vid,
                            {
                              setFlameTheta,
                              setFlamePhi,
                              setFlameRadius,
                              setFlameTarget3D:
                                setFlameTarget3D as unknown as Setter<Vec3>,
                              setFlameFov,
                            },
                          )
                            .then((newValue) => {
                              if (
                                !newValue ||
                                typeof newValue === 'string' ||
                                !isVariationType(newValue.variation.type)
                              ) {
                                return
                              }
                              executeCommand(
                                'flame.applyVariationSelection',
                                cmdContext,
                                tid,
                                vid,
                                newValue.transform.preAffine,
                                newValue.variation,
                              )
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
                          <Show when={animationEnabled()}>
                            <span class={ui.readableId}>
                              {readableIds().variationLabel[vid]}
                            </span>
                          </Show>
                          <span class={ui.variationName}>
                            {getNormalizedVariationName(variation.type)}
                          </span>
                        </div>
                        <Show when={customStatus(variation.type) !== 'none'}>
                          <span
                            class={ui.customBadge}
                            classList={{
                              [ui.customBadgeUnavailable as string]:
                                customStatus(variation.type) === 'unavailable',
                            }}
                            title={
                              customStatus(variation.type) === 'unavailable'
                                ? 'Custom variation — unavailable (deleted from your library)'
                                : `Custom Variation ${getNormalizedVariationName(variation.type)}`
                            }
                          />
                        </Show>
                      </button>
                      <div
                        class={ui.sliderGridWrapper}
                        classList={{
                          [ui.parameterTarget as string]: true,
                        }}
                        data-tour-target="variation-weight"
                        onClick={() => {
                          setTargetedParameter(`${tid}.${vid}`)
                        }}
                      >
                        <Slider
                          value={variation.weight}
                          min={0}
                          max={1}
                          step={0.001}
                          dataParameterPath={`${tid}.${vid}`}
                          onInput={(weight) => {
                            executeCommand(
                              'flame.setVariationWeight',
                              cmdContext,
                              tid,
                              vid,
                              weight,
                            )
                          }}
                          formatValue={formatPercent}
                        />
                      </div>
                      <Show when={!hideDiceButtons()}>
                        <DiceButton
                          focusId={variationRandomizeFocusId(tid, vid)}
                          onClick={() => {
                            const params = randomizeVariationParams(
                              variation.type,
                            )
                            executeCommand(
                              'flame.setVariation',
                              cmdContext,
                              tid,
                              vid,
                              {
                                ...deepClone(variation),
                                weight: random01(),
                                ...(params ? { params } : {}),
                              },
                              'randomize',
                            )
                          }}
                          title="Randomize variation"
                        />
                      </Show>
                      <button
                        class={ui.visibilityButton}
                        data-focus-id={variationVisibilityFocusId(tid, vid)}
                        title={
                          variation.visible
                            ? 'Hide variation'
                            : 'Show variation'
                        }
                        onClick={() => {
                          executeCommand(
                            'flame.setVariationVisible',
                            cmdContext,
                            tid,
                            vid,
                            !variation.visible,
                          )
                        }}
                      >
                        {variation.visible ? <Eye /> : <EyeOff />}
                      </button>
                      <button
                        class={ui.deleteVariationButton}
                        onClick={() => {
                          executeCommand(
                            'flame.deleteVariation',
                            cmdContext,
                            tid,
                            vid,
                          )
                        }}
                      >
                        <Cross />
                      </button>
                    </div>
                    <Show
                      when={
                        isAnyParametricVariationType(variation.type) &&
                        variation
                      }
                      keyed
                    >
                      {(variation) => (
                        <div
                          data-focus-id={variationParamsFocusId(tid, vid)}
                          classList={{
                            [ui.transformGridRow as string]: true,
                            [ui.variationParamsRow as string]: true,
                            [ui.parameterTarget as string]: true,
                          }}
                          onClick={() => {
                            setTargetedParameter(`${tid}.${vid}`)
                          }}
                        >
                          <Suspense
                            fallback={<div>Loading parameter editor...</div>}
                          >
                            <Dynamic
                              {...getParamsEditor(variation)}
                              dataParameterPath={`${tid}.${vid}`}
                              setValue={(value: unknown) => {
                                executeCommand(
                                  'flame.setVariation',
                                  cmdContext,
                                  tid,
                                  vid,
                                  {
                                    ...deepClone(variation),
                                    params: value as Record<string, number>,
                                  },
                                  'params',
                                )
                              }}
                              setParamValue={(
                                paramName: string,
                                value: unknown,
                              ) => {
                                executeCommand(
                                  'flame.setVariationParams',
                                  cmdContext,
                                  tid,
                                  vid,
                                  paramName,
                                  value,
                                )
                              }}
                            />
                          </Suspense>
                        </div>
                      )}
                    </Show>
                  </>
                )}
              </For>

              <button
                class={ui.addTransformVariationButton}
                onClick={() => {
                  executeCommand('flame.addVariation', cmdContext, tid)
                }}
              >
                <Plus />
                Add variation
              </button>
            </div>
          </CollapsibleCard>
        )}
      </For>
      <Show
        when={recordEntries(flameDescriptor.transforms).some(([tid]) =>
          tid.startsWith('_sym__'),
        )}
      >
        <CollapsibleCard
          title={`Symmetry (${recordEntries(flameDescriptor.transforms).filter(([tid]) => tid.startsWith('_sym__')).length})`}
          data-tour-target="symmetry-card"
          open={symmetryCardOpen()}
          onToggleOpen={() => setSymmetryCardOpen((open) => !open)}
        >
          <div class={ui.symPanel}>
            <div class={ui.symControls}>
              <span class={ui.symControlsLabel}>Type</span>
              <select
                class={ui.select}
                data-tour-target="symmetry-type"
                value={currentSymType()}
                onChange={(e) => {
                  applySymmetry(
                    currentSymFolds(),
                    e.currentTarget.value as 'rotational' | 'dihedral',
                    'type',
                  )
                }}
              >
                <option value="rotational">Rotational</option>
                <option value="dihedral">Dihedral</option>
              </select>
              <span class={ui.symControlsLabel}>Folds</span>
              <ScrubInput
                label=""
                data-tour-target="symmetry-folds"
                value={currentSymFolds()}
                step={1}
                onInput={(val: number) => {
                  const newN = Math.max(2, Math.round(val))
                  if (newN !== currentSymFolds()) {
                    applySymmetry(newN, currentSymType(), 'folds')
                  }
                }}
              />
            </div>

            <div class={ui.symGallery}>
              <For each={symTransformIds()}>
                {(tid) => {
                  const transform = () =>
                    flameDescriptor.transforms[tid as TransformId]!
                  const preAffine = () => transform().preAffine
                  const isReflection = () => {
                    const a = preAffine()
                    return a.a === -1 && a.d === 0 && a.b === 0 && a.e === 1
                  }
                  const angle = () => {
                    const a = preAffine()
                    let v = Math.atan2(a.d, a.a)
                    if (v < 0) v += 2 * Math.PI
                    return v
                  }
                  return (
                    <div
                      class={ui.symItem}
                      classList={{
                        [ui.symItemHidden as string]: !transform().visible,
                      }}
                    >
                      <span
                        class={ui.symBadge}
                        classList={{
                          [ui.symBadgeReflection as string]: isReflection(),
                        }}
                      >
                        {readableIds().transformLabel[tid]}
                      </span>
                      <div
                        class={ui.symAngle}
                        data-focus-id={affineFocusId(tid)}
                      >
                        <Show
                          when={!isReflection()}
                          fallback={
                            <span
                              style={{
                                'font-size': '0.65rem',
                                color: 'var(--neutral-500)',
                                'white-space': 'nowrap',
                              }}
                            >
                              Reflection
                            </span>
                          }
                        >
                          <AngleEditor
                            mode="inline"
                            value={angle()}
                            dataParameterPath={`transform.${tid}.preAffine.a`}
                            keyframePaths={[
                              `transform.${tid}.preAffine.a`,
                              `transform.${tid}.preAffine.b`,
                              `transform.${tid}.preAffine.d`,
                              `transform.${tid}.preAffine.e`,
                            ]}
                            setValue={(newAngle) => {
                              const cos = Math.cos(newAngle)
                              const sin = Math.sin(newAngle)
                              executeCommand(
                                'flame.setTransformAffine',
                                cmdContext,
                                tid,
                                'pre',
                                {
                                  a: cos,
                                  b: -sin,
                                  c: 0,
                                  d: sin,
                                  e: cos,
                                  f: 0,
                                },
                              )
                            }}
                          />
                        </Show>
                      </div>
                      <div class={ui.symActions}>
                        <button
                          class={ui.symActionBtn}
                          data-focus-id={transformVisibilityFocusId(tid)}
                          title={transform().visible ? 'Hide' : 'Show'}
                          onClick={() => {
                            executeCommand(
                              'flame.setTransformVisible',
                              cmdContext,
                              tid,
                              !transform().visible,
                            )
                          }}
                        >
                          {transform().visible ? <Eye /> : <EyeOff />}
                        </button>
                        <button
                          class={ui.symActionBtn}
                          title="Remove"
                          onClick={() => {
                            executeCommand(
                              'flame.removeTransform',
                              cmdContext,
                              tid,
                            )
                          }}
                        >
                          <Cross />
                        </button>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        </CollapsibleCard>
      </Show>
      <Card class={ui.buttonCard}>
        <button
          class={ui.addFlameButton}
          onClick={() => {
            executeCommand('flame.addTransform', cmdContext)
          }}
        >
          New transform
        </button>
        <button
          class={ui.addFlameButton}
          data-tour-target="add-symmetry"
          disabled={symTransforms().length > 0}
          title={
            symTransforms().length > 0
              ? 'Symmetry already applied'
              : 'Add 3-fold rotational symmetry'
          }
          onClick={() => {
            applySymmetry(3, 'rotational', 'add')
          }}
        >
          Add symmetry
        </button>
        <button
          class={ui.addFlameButton}
          onClick={() => {
            showMigrationModal(
              structuredClone(JSON.parse(JSON.stringify(flameDescriptor))),
            )
          }}
        >
          Migration
        </button>
      </Card>
    </>
  )
}
