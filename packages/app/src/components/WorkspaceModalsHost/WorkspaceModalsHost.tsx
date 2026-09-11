import { lazy, Show, Suspense } from 'solid-js'
import { PilotOverlay } from '@/components/Arcade/PilotOverlay'
import { SoftwareVersion } from '@/components/SoftwareVersion/SoftwareVersion'
import { SpotlightTour } from '@/components/SpotlightTour/SpotlightTour'
import type { Accessor, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { CommandContext } from '@/commands/types'
import type { TourContext } from '@/components/SpotlightTour/tourTypes'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ReplayFocusPreparationHandler } from '@/recorder/focusPreparation'
import type { Seat3DCamera } from '@/seats/seat'
import type { TouchLayoutPreference } from '@/stores/workspaceLayoutStore'
import type { HardwareTier } from '@/utils/hardwareTier'

const DuelStage = lazy(() =>
  import('@/components/Duel/DuelStage').then((m) => ({ default: m.DuelStage })),
)

const ArenaOverlay = lazy(() =>
  import('@/components/ArenaOverlay').then((m) => ({
    default: m.ArenaOverlay,
  })),
)

export interface WorkspaceModalsHostProps {
  tourContext: TourContext
  cmdContext: CommandContext
  prepareReplayFocus: ReplayFocusPreparationHandler
  showBenchmark: () => void
  showDocs: () => void
  showHelp: () => void
  devCrashTest: Accessor<boolean>
  duelShowing: Accessor<boolean>
  playerFlame: Accessor<FlameDescriptor>
  playerZoom: Signal<number>
  playerPosition: Signal<v2f>
  playerCamera3D: Seat3DCamera
  quality: number
  adaptiveFilter: boolean
  stochasticFilter: boolean
  sidebarWidthRem: Accessor<number>
  showArena: Accessor<boolean>
  arena: NonNullable<CommandContext['arena']>
  hardwareTier?: HardwareTier | null
  onCloseArena: () => void
  touchLayoutPreference?: () => TouchLayoutPreference
  setTouchLayoutPreference?: (pref: TouchLayoutPreference) => void
  isTouchLayout?: () => boolean
  /** True where the editor's top bar is drawn; see SoftwareVersion. */
  hideVersionTrigger?: () => boolean
  onPickGallery?: () => void
}

export function WorkspaceModalsHost(props: WorkspaceModalsHostProps) {
  return (
    <>
      <SpotlightTour tourContext={props.tourContext} />
      <SoftwareVersion
        showBenchmark={props.showBenchmark}
        showDocs={props.showDocs}
        showHelp={props.showHelp}
        touchLayoutPreference={props.touchLayoutPreference}
        setTouchLayoutPreference={props.setTouchLayoutPreference}
        isTouchLayout={props.isTouchLayout}
        hideTrigger={props.hideVersionTrigger}
        onPickGallery={props.onPickGallery}
      />
      <Show when={props.devCrashTest()}>
        {(() => {
          throw new Error('[DEV] Injected crash from About panel')
        })()}
      </Show>

      <PilotOverlay
        ctx={props.cmdContext}
        onPrepareFocus={props.prepareReplayFocus}
      />

      <Show when={props.duelShowing()}>
        <Suspense>
          <DuelStage
            ctx={props.cmdContext}
            playerFlame={props.playerFlame}
            playerZoom={props.playerZoom}
            playerPosition={props.playerPosition}
            playerCamera3D={props.playerCamera3D}
            quality={props.quality}
            adaptiveFilter={props.adaptiveFilter}
            stochasticFilter={props.stochasticFilter}
            sidebarWidthRem={props.sidebarWidthRem}
          />
        </Suspense>
      </Show>

      <Show when={props.showArena()}>
        <Suspense>
          <ArenaOverlay
            arena={props.arena}
            hardwareTier={props.hardwareTier}
            onClose={props.onCloseArena}
          />
        </Suspense>
      </Show>
    </>
  )
}
