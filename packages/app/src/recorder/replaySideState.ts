import type { ReplayAffineMode, ReplayAffineTab, ReplayColorView, } from './focusPreparation'
import type { TransformColorSnapshot } from './replayPaletteState'
import type { SessionViewSnapshot } from './schema'
import type { SonificationSnapshot } from './sonificationState'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor, TransformId } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'

/** Editor-only state that follow-cam may change while revealing a target. */
export type ReplayPresentationSnapshot = {
  sidebarHidden: boolean
  selectedTransformId: string | null
  collapsedTransformIds: string[]
  timelineCollapsed: boolean
  sidebarDiffView: {
    flameA: FlameDescriptor
    flameB: FlameDescriptor
  } | null
  showBlendGallery: boolean
  showAudioPanel: boolean
  showSonificationPanel: boolean
  quickPickState: {
    tid: string
    vid: string
    type: string
  } | null
  hoveredVariationType: string | null
  affineCardOpen: boolean
  colorCardOpen: boolean
  metadataCardOpen: boolean
  paletteCardOpen: boolean
  prePaletteColors: TransformColorSnapshot
  renderCardOpen: boolean
  floatingActionsCollapsed: boolean
  affineMode: ReplayAffineMode
  affineTab: ReplayAffineTab
  colorView: ReplayColorView
}

export type ReplayNonFlameSideState = {
  timeline: TimelineSnapshot
  audio: AudioWiringSnapshot
  sonification: SonificationSnapshot
  view: SessionViewSnapshot
  presentation: ReplayPresentationSnapshot
}

/**
 * A replay can delete or replace transforms before its Undo effect restores
 * the earlier presentation snapshot. Never let a stale imported/internal id
 * remain selected, and discard collapse entries that do not belong to the
 * restored flame.
 */
export function normalizeReplayPresentation(
  snapshot: ReplayPresentationSnapshot,
  flame: FlameDescriptor,
): ReplayPresentationSnapshot {
  const hasVisibleTransform = (id: string) =>
    !id.startsWith('_sym__') && Object.hasOwn(flame.transforms, id)
  const quickPickState = snapshot.quickPickState
  const hasQuickPickTarget =
    quickPickState !== null &&
    hasVisibleTransform(quickPickState.tid) &&
    Object.hasOwn(
      flame.transforms[quickPickState.tid as TransformId]?.variations ?? {},
      quickPickState.vid,
    )
  const normalizedQuickPickState = hasQuickPickTarget ? quickPickState : null

  return {
    ...snapshot,
    selectedTransformId:
      snapshot.selectedTransformId !== null &&
      hasVisibleTransform(snapshot.selectedTransformId)
        ? snapshot.selectedTransformId
        : null,
    collapsedTransformIds: Array.from(
      new Set(snapshot.collapsedTransformIds.filter(hasVisibleTransform)),
    ).sort(),
    quickPickState: normalizedQuickPickState,
    hoveredVariationType:
      normalizedQuickPickState === null ? null : snapshot.hoveredVariationType,
  }
}

/**
 * Flame changes are already represented by the primary patch history. Only
 * secondary workspace state needs Undo/Redo effects (which retain snapshots).
 */
export function replaySideStateChanged(
  before: ReplayNonFlameSideState,
  after: ReplayNonFlameSideState,
): boolean {
  return (
    JSON.stringify([
      before.timeline,
      before.audio,
      before.sonification,
      before.view,
      before.presentation,
    ]) !==
    JSON.stringify([
      after.timeline,
      after.audio,
      after.sonification,
      after.view,
      after.presentation,
    ])
  )
}
