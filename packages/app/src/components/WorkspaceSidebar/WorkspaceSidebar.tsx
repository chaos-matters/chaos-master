import { lazy, Show, Suspense } from 'solid-js'
import ui from '@/App.module.css'
import { AudioReactivePanel } from '@/components/AudioReactivePanel/AudioReactivePanel'
import { BlendFlameGallery } from '@/components/BlendFlameGallery/BlendFlameGallery'
import diffUi from '@/components/DiffViewModal/DiffViewModal.module.css'
import { ExportActions } from '@/components/ExportJobs/ExportActions'
import { QuickVariationPicker } from '@/components/QuickVariationPicker/QuickVariationPicker'
import { SonificationPanel } from '@/components/SonificationPanel/SonificationPanel'
import { isVariationType } from '@/flame/variations'
import { getVariationDefault } from '@/flame/variations/utils'
import { workspaceIsVisible } from '@/lib/activeTab'
import { snapshotOrigin } from '@/recorder/snapshotOrigin'
import { deepClone } from '@/utils/clone'
import { AffineEditorSection } from './AffineEditorSection'
import { ColorAndPaletteSection } from './ColorAndPaletteSection'
import { CustomVariationsSection } from './CustomVariationsSection'
import { RandomizerSection } from './RandomizerSection'
import { RenderSettingsSection } from './RenderSettingsSection'
import { TransformsSection } from './TransformsSection'
import type { Accessor, Setter } from 'solid-js'
import type { Vec3 } from 'wgpu-matrix'
import type { AffineEditorSectionProps } from './AffineEditorSection'
import type { ColorAndPaletteSectionProps } from './ColorAndPaletteSection'
import type { CustomVariationsSectionProps } from './CustomVariationsSection'
import type { RandomizerSectionProps } from './RandomizerSection'
import type { RenderSettingsSectionProps } from './RenderSettingsSection'
import type { TransformsSectionProps } from './TransformsSection'
import type { TransformInfo } from '@/components/AudioReactivePanel/AudioReactivePanel'
import type { RequestModalFn } from '@/components/Modal/ModalContext'
import type { QuickPickerMode } from '@/components/QuickVariationPicker/QuickVariationPicker'
import type { RespondType } from '@/components/VariationSelector/VariationSelector'
import type { AudioMapping } from '@/flame/schema/audioWiring'
import type { FlameDescriptor, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { Dims } from '@/flame/variationRegistry'
import type { TransformVariationDescriptor, TransformVariationType, } from '@/flame/variations'
import type { TransformVariationType3D } from '@/flame/variations3D'
import type { SnapshotOrigin } from '@/recorder/snapshotOrigin'
import type { AudioAnalyzer, LiveAudioAnalyzer } from '@/utils/audioAnalysis'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { SonificationConfig } from '@/utils/sonification'

// Lazy, like MainWorkspace's DiffViewModal: a static import of this module from
// here pinned it into the eager bundle and defeated that lazy boundary.
const DiffViewContent = lazy(() =>
  import('@/components/DiffViewModal/DiffViewModal').then((m) => ({
    default: m.DiffViewContent,
  })),
)

const BreedGallery = lazy(() =>
  import('@/components/BreedGallery/BreedGallery').then((m) => ({
    default: m.BreedGallery,
  })),
)

const EvolutionChamber = lazy(() =>
  import('@/components/EvolutionChamber/EvolutionChamber').then((m) => ({
    default: m.EvolutionChamber,
  })),
)

export interface WorkspaceSidebarProps {
  showSidebar: Accessor<boolean>
  isPlaying: Accessor<boolean>
  sidebarHidden: Accessor<boolean>
  setSidebarHidden: (hidden: boolean) => void
  duelShowing: Accessor<boolean>
  duelSidebarOpen: Accessor<boolean>
  sidebarWidth: Accessor<number>
  animationExportRunning: Accessor<boolean>
  onTogglePlay: () => void
  onForceAnimationExportNow: () => void
  animationExportCancel: Accessor<(() => void) | undefined>
  isMobile: Accessor<boolean>
  hideMobileSidebarAsAuthoredAction: () => void
  setSidebarEl?: (el: HTMLDivElement) => void

  sidebarDiffView: Accessor<{
    flameA: FlameDescriptor
    flameB: FlameDescriptor
  } | null>
  closeSidebarDiff: () => void
  showBlendGallery: Accessor<boolean>
  setShowBlendGallery: (show: boolean) => void
  showAudioPanel: Accessor<boolean>
  setShowAudioPanel: (show: boolean) => void
  showSonificationPanel: Accessor<boolean>
  closeSonificationPanelAsAuthoredAction: () => void
  sonificationEnabled: Accessor<boolean>
  sonificationConfig: () => SonificationConfig
  keepAudioPlayingWhenClosed: Accessor<boolean>
  setKeepPlayingWhenClosedAsAuthoredAction: (keep: boolean) => void
  breakRecordingCoalescing: () => void

  audioBuffer: Accessor<AudioBuffer | undefined>
  /** Adopt a decoded file as the audio source, or clear it with undefined. */
  onAudioChange: (buf: AudioBuffer | undefined, fileName?: string) => void
  analysisProgress: Accessor<number | null>
  setPlaybackPaused: (paused: boolean) => void
  setSeekTarget: (target: number | null) => void
  audioMapping: Accessor<AudioMapping>
  audioEnabled: Accessor<boolean>
  audioSource: Accessor<'file' | 'mic'>
  liveAnalyzer: Accessor<LiveAudioAnalyzer | undefined>
  setLiveAnalyzer: (analyzer: LiveAudioAnalyzer | undefined) => void
  playbackPaused: Accessor<boolean>
  playbackTime: Accessor<number>
  fileAnalyzer: Accessor<AudioAnalyzer | undefined>
  transformInfos: Accessor<TransformInfo[]>
  blendIntent: Accessor<unknown>
  setupMorph: (flame: FlameDescriptor) => void
  breedPreviewChild: Accessor<FlameDescriptor | undefined>
  endBreedPreview: () => void
  _requestModal: RequestModalFn
  showToast: (msg: string, duration?: number) => void
  executeFlameLoad: (
    flame: FlameDescriptor,
    label: string,
    origin: SnapshotOrigin,
  ) => void
  pickBreedFlame: () => void
  pickEvolveFlame: () => void
  openDiffAsModal: (flameA: FlameDescriptor, flameB: FlameDescriptor) => void
  openDiffView: (a: FlameDescriptor, b: FlameDescriptor) => void
  /** Commit a partner picked in the blend gallery (see useWorkspaceBlendPick). */
  commitBlendPick: (flame: FlameDescriptor) => void
  blendFlame: Accessor<FlameDescriptor | undefined>
  handlePreviewBlend: (flame: FlameDescriptor | null) => void
  setHoveredBlendName: (name: string | null) => void
  history: { takeOverOwnedPreview?: () => void; [k: string]: unknown }
  hardwareTier?: HardwareTier | null

  quickPickState: Accessor<{
    tid: TransformId
    vid: VariationId
    type: TransformVariationType | TransformVariationType3D
  } | null>
  setQuickPickState: (
    state: {
      tid: TransformId
      vid: VariationId
      type: TransformVariationType | TransformVariationType3D
    } | null,
  ) => void
  setHoveredVariationType: (
    type: TransformVariationType | TransformVariationType3D | null,
  ) => void
  quickPickerMode: Accessor<QuickPickerMode>
  setQuickPickerMode: (mode: QuickPickerMode) => void
  showVariationSelector: (
    currentVar: TransformVariationDescriptor,
    currentFlame: FlameDescriptor,
    tid: TransformId,
    vid: VariationId,
    cameraSetters?: {
      setFlameTheta?: Setter<number>
      setFlamePhi?: Setter<number>
      setFlameRadius?: Setter<number>
      setFlameTarget3D?: (v: Vec3 | ((prev: Vec3) => Vec3)) => void
      setFlameFov?: Setter<number>
    },
  ) => Promise<RespondType | undefined>
  setFlameTheta?: Setter<number>
  setFlamePhi?: Setter<number>
  setFlameRadius?: Setter<number>
  setFlameTarget3D?: (v: Vec3 | ((prev: Vec3) => Vec3)) => void
  setFlameFov?: Setter<number>

  affineSectionProps: AffineEditorSectionProps
  colorAndPaletteSectionProps: ColorAndPaletteSectionProps
  customVariationsSectionProps: CustomVariationsSectionProps
  randomizerSectionProps: RandomizerSectionProps
  transformsSectionProps: TransformsSectionProps
  renderSettingsSectionProps: RenderSettingsSectionProps
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  let sidebarScrollRef: HTMLDivElement | undefined
  let savedScrollTop = 0

  return (
    <Show when={props.showSidebar()}>
      <div
        class={ui.sidebar}
        data-replay-region="dim"
        classList={{
          [ui.sidebarLocked as string]: props.isPlaying(),
          [ui.sidebarHidden as string]: props.sidebarHidden(),
          [ui.sidebarOverDuel as string]:
            props.duelShowing() && props.duelSidebarOpen(),
        }}
        style={{ '--sidebar-width': `${props.sidebarWidth()}rem` }}
        data-tour-target="sidebar"
        ref={(el) => {
          if (props.setSidebarEl) props.setSidebarEl(el)
        }}
      >
        <Show when={props.isPlaying() || props.animationExportRunning()}>
          <div
            class={ui.playbackOverlay}
            classList={{
              [ui.exportOverlay as string]: props.animationExportRunning(),
            }}
            onClick={() => {
              if (props.isPlaying()) {
                props.onTogglePlay()
              }
            }}
          >
            <span class={ui.playbackOverlayText}>
              {props.animationExportRunning()
                ? 'Rendering animation...'
                : 'Tap to stop animation'}
            </span>
            <Show when={props.animationExportRunning()}>
              <div
                onClick={(e) => {
                  e.stopPropagation()
                }}
              >
                <ExportActions
                  variant="overlay"
                  stopLabel="Stop & Save"
                  stopTitle="Stop after current frame and save"
                  onStop={props.onForceAnimationExportNow}
                  cancelTitle="Cancel and discard"
                  onCancel={() => {
                    const cancelFn = props.animationExportCancel()
                    if (cancelFn) cancelFn()
                  }}
                />
              </div>
            </Show>
          </div>
        </Show>
        <Show when={props.isMobile()}>
          <div class={ui.sidebarCloseRow}>
            <button
              class={ui.sidebarCloseBtn}
              onClick={props.hideMobileSidebarAsAuthoredAction}
              aria-label="Collapse sidebar"
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  fill="currentColor"
                  d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                />
              </svg>
            </button>
          </div>
        </Show>
        <div class={ui.sidebarScroll} ref={sidebarScrollRef}>
          <Show
            when={props.sidebarDiffView()}
            keyed
            fallback={
              <Show
                when={
                  props.showBlendGallery() ||
                  props.showAudioPanel() ||
                  props.showSonificationPanel()
                }
                fallback={
                  <>
                    <Show when={props.quickPickState()} keyed>
                      {(state) => (
                        <QuickVariationPicker
                          currentType={
                            props.affineSectionProps.transforms[state.tid]
                              ?.variations[state.vid]?.type ?? state.type
                          }
                          dims={
                            (props.renderSettingsSectionProps.flameDescriptor
                              .renderSettings.dimensions ?? 2) as Dims
                          }
                          hardwareTier={props.hardwareTier}
                          pointInitMode={
                            props.renderSettingsSectionProps.flameDescriptor
                              .renderSettings.pointInitMode
                          }
                          onSelect={(newType) => {
                            const existingVar =
                              props.affineSectionProps.transforms[state.tid]
                                ?.variations[state.vid]
                            if (!existingVar) return
                            props.transformsSectionProps.executeCommand(
                              'flame.setVariation',
                              props.transformsSectionProps.cmdContext,
                              state.tid,
                              state.vid,
                              deepClone(
                                getVariationDefault(
                                  newType,
                                  existingVar.weight,
                                ),
                              ),
                              'type',
                            )
                          }}
                          onClose={() => {
                            savedScrollTop = sidebarScrollRef?.scrollTop ?? 0
                            props.setHoveredVariationType(null)
                            props.setQuickPickState(null)
                            queueMicrotask(() => {
                              if (sidebarScrollRef) {
                                sidebarScrollRef.scrollTop = savedScrollTop
                              }
                            })
                          }}
                          onHoverType={(type) => {
                            props.setHoveredVariationType(type)
                          }}
                          onHoverClear={() => {
                            props.setHoveredVariationType(null)
                          }}
                          mode={props.quickPickerMode()}
                          onModeChange={props.setQuickPickerMode}
                          onOpenFullSelector={() => {
                            const currentVar =
                              props.affineSectionProps.transforms[state.tid]
                                ?.variations[state.vid]
                            if (!currentVar) return
                            props.setQuickPickState(null)
                            queueMicrotask(() => {
                              props
                                .showVariationSelector(
                                  deepClone(currentVar),
                                  deepClone(
                                    props.renderSettingsSectionProps
                                      .flameDescriptor,
                                  ),
                                  state.tid,
                                  state.vid,
                                  {
                                    setFlameTheta: props.setFlameTheta,
                                    setFlamePhi: props.setFlamePhi,
                                    setFlameRadius: props.setFlameRadius,
                                    setFlameTarget3D: props.setFlameTarget3D,
                                    setFlameFov: props.setFlameFov,
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
                                  props.transformsSectionProps.executeCommand(
                                    'flame.applyVariationSelection',
                                    props.transformsSectionProps.cmdContext,
                                    state.tid,
                                    state.vid,
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
                            })
                          }}
                        />
                      )}
                    </Show>
                    <Show when={!props.quickPickState()}>
                      <AffineEditorSection {...props.affineSectionProps} />
                      <ColorAndPaletteSection
                        {...props.colorAndPaletteSectionProps}
                      />
                      <CustomVariationsSection
                        {...props.customVariationsSectionProps}
                      />
                      <RandomizerSection {...props.randomizerSectionProps} />
                      <TransformsSection {...props.transformsSectionProps} />
                      <RenderSettingsSection
                        {...props.renderSettingsSectionProps}
                      />
                    </Show>
                  </>
                }
              >
                <Show
                  when={props.showBlendGallery()}
                  fallback={
                    <Show
                      when={props.showAudioPanel()}
                      fallback={
                        <SonificationPanel
                          onClose={props.closeSonificationPanelAsAuthoredAction}
                          enabled={props.sonificationEnabled}
                          onEnabledChange={(enabled) => {
                            props.transformsSectionProps.executeCommand(
                              'sonification.setEnabled',
                              props.transformsSectionProps.cmdContext,
                              enabled,
                            )
                          }}
                          config={props.sonificationConfig}
                          onConfigChange={(config, key) => {
                            props.transformsSectionProps.executeCommand(
                              'sonification.setConfig',
                              props.transformsSectionProps.cmdContext,
                              config,
                              key,
                            )
                          }}
                          onConfigGestureBoundary={
                            props.breakRecordingCoalescing
                          }
                          keepPlayingWhenClosed={
                            props.keepAudioPlayingWhenClosed
                          }
                          onKeepPlayingChange={
                            props.setKeepPlayingWhenClosedAsAuthoredAction
                          }
                        />
                      }
                    >
                      <AudioReactivePanel
                        onClose={() => {
                          props.setShowAudioPanel(false)
                        }}
                        audioBuffer={props.audioBuffer}
                        onAudioChange={props.onAudioChange}
                        audioMapping={props.audioMapping}
                        onMappingChange={(mapping) => {
                          props.transformsSectionProps.executeCommand(
                            'audio.setMapping',
                            props.transformsSectionProps.cmdContext,
                            mapping,
                          )
                        }}
                        onMappingGestureBoundary={
                          props.breakRecordingCoalescing
                        }
                        audioEnabled={props.audioEnabled}
                        onEnabledChange={(enabled) => {
                          props.transformsSectionProps.executeCommand(
                            'audio.setEnabled',
                            props.transformsSectionProps.cmdContext,
                            enabled,
                          )
                        }}
                        audioSource={props.audioSource}
                        onSourceChange={(source) => {
                          props.transformsSectionProps.executeCommand(
                            'audio.setSource',
                            props.transformsSectionProps.cmdContext,
                            source,
                          )
                        }}
                        liveAnalyzer={props.liveAnalyzer}
                        onLiveAnalyzerChange={(analyzer) => {
                          props.history.takeOverOwnedPreview?.()
                          props.setLiveAnalyzer(analyzer)
                        }}
                        playbackPaused={props.playbackPaused}
                        onPausedChange={(paused) => {
                          props.history.takeOverOwnedPreview?.()
                          props.setPlaybackPaused(paused)
                        }}
                        playbackTime={props.playbackTime}
                        onSeek={(seconds) => {
                          props.history.takeOverOwnedPreview?.()
                          props.setSeekTarget(seconds)
                        }}
                        fileAnalyzer={props.fileAnalyzer}
                        analysisProgress={props.analysisProgress}
                        flameName={
                          props.renderSettingsSectionProps.flameDescriptor
                            .metadata?.name
                        }
                        keepPlayingWhenClosed={props.keepAudioPlayingWhenClosed}
                        onKeepPlayingChange={
                          props.setKeepPlayingWhenClosedAsAuthoredAction
                        }
                        transforms={props.transformInfos()}
                      />
                    </Show>
                  }
                >
                  <BlendFlameGallery
                    dimensions={
                      props.blendIntent() === 'breed' ||
                      props.blendIntent() === 'evolve' ||
                      props.blendIntent() === 'diff'
                        ? (props.renderSettingsSectionProps.flameDescriptor
                            .renderSettings.dimensions ?? 2)
                        : 2
                    }
                    heading={
                      props.blendIntent() === 'morph'
                        ? 'Pick End Flame'
                        : props.blendIntent() === 'breed' ||
                            props.blendIntent() === 'evolve'
                          ? 'Pick Second Parent'
                          : props.blendIntent() === 'diff'
                            ? 'Pick Flame to Compare'
                            : 'Pick Blend Flame'
                    }
                    onSelect={(flame) => {
                      // Evolve and Diff open a view of the document instead of
                      // committing a partner, so the hover preview comes off
                      // before anything reads it: the view is handed the flame
                      // the user has, and the document keeps no blend nobody
                      // picked. Blend and morph end it inside their commit.
                      if (
                        props.blendIntent() === 'evolve' ||
                        props.blendIntent() === 'diff'
                      ) {
                        props.handlePreviewBlend(null)
                      }
                      if (props.blendIntent() === 'morph') {
                        props.setupMorph(flame)
                      } else if (props.blendIntent() === 'breed') {
                        const seed = props.breedPreviewChild()
                        props.endBreedPreview()
                        void props._requestModal({
                          content: ({ respond }: { respond: () => void }) => (
                            <Suspense>
                              <BreedGallery
                                parentA={
                                  props.renderSettingsSectionProps
                                    .flameDescriptor
                                }
                                parentB={deepClone(flame)}
                                seedChild={seed}
                                parentInfo={{
                                  nameA:
                                    props.renderSettingsSectionProps
                                      .flameDescriptor.metadata?.name ||
                                    'Current',
                                  nameB: flame.metadata?.name || 'Selected',
                                }}
                                hardwareTier={props.hardwareTier}
                                onApply={(child) => {
                                  if (props.blendFlame())
                                    props.showToast(
                                      'Blend is still active — the loaded flame will look mixed',
                                      4000,
                                    )
                                  props.executeFlameLoad(
                                    child,
                                    'Load Bred Flame',
                                    snapshotOrigin('flame.breed'),
                                  )
                                }}
                                onChangeParent={() => {
                                  respond()
                                  props.pickBreedFlame()
                                }}
                                onCompare={props.openDiffAsModal}
                                respond={respond}
                              />
                            </Suspense>
                          ),
                        })
                      } else if (props.blendIntent() === 'evolve') {
                        void props._requestModal({
                          content: ({ respond }: { respond: () => void }) => (
                            <Suspense>
                              <EvolutionChamber
                                parentA={
                                  props.renderSettingsSectionProps
                                    .flameDescriptor
                                }
                                parentB={deepClone(flame)}
                                parentInfo={{
                                  nameA:
                                    props.renderSettingsSectionProps
                                      .flameDescriptor.metadata?.name ||
                                    'Current',
                                  nameB: flame.metadata?.name || 'Selected',
                                }}
                                hardwareTier={props.hardwareTier}
                                onApply={(child) => {
                                  if (props.blendFlame())
                                    props.showToast(
                                      'Blend is still active — the loaded flame will look mixed',
                                      4000,
                                    )
                                  props.executeFlameLoad(
                                    child,
                                    'Load Evolved Flame',
                                    snapshotOrigin('flame.evolve'),
                                  )
                                }}
                                onChangeParent={() => {
                                  respond()
                                  props.pickEvolveFlame()
                                }}
                                onCompare={props.openDiffAsModal}
                                respond={respond}
                              />
                            </Suspense>
                          ),
                        })
                      } else if (props.blendIntent() === 'diff') {
                        props.openDiffView(
                          props.renderSettingsSectionProps.flameDescriptor,
                          flame,
                        )
                      } else {
                        props.commitBlendPick(deepClone(flame))
                      }
                      props.setShowBlendGallery(false)
                    }}
                    onPreviewBlend={props.handlePreviewBlend}
                    visible={workspaceIsVisible}
                    onPreviewName={(name) => {
                      props.setHoveredBlendName(name)
                    }}
                    onClose={() => {
                      props.handlePreviewBlend(null)
                      props.setHoveredBlendName(null)
                      props.setShowBlendGallery(false)
                    }}
                  />
                </Show>
              </Show>
            }
          >
            {(dv) => (
              <div class={diffUi.panel}>
                <div class={diffUi.panelHeader}>
                  <button
                    class={diffUi.backBtn}
                    onClick={props.closeSidebarDiff}
                  >
                    ← Back to Editor
                  </button>
                </div>
                <div class={diffUi.panelScroll}>
                  <Suspense>
                    <DiffViewContent flameA={dv.flameA} flameB={dv.flameB} />
                  </Suspense>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </Show>
  )
}
