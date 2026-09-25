import { createEffect, createSignal, on, onCleanup } from 'solid-js'
import { setArenaShowing } from '@/arcade/editorCover'
import { mutateFlame } from '@/flame/randomize'
import { calculateGroundedStats } from '@/flame/stats'
import { deepClone } from '@/utils/clone'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import type { Accessor, Setter } from 'solid-js'
import type { ArenaFighterStats } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface UseWorkspaceArenaParams {
  flameDescriptor: FlameDescriptor
  showSidebar: Accessor<boolean>
  setShowSidebar: Setter<boolean>
  showTimeline: Accessor<boolean>
  setShowTimeline: Setter<boolean>
}

export function useWorkspaceArena(params: UseWorkspaceArenaParams) {
  const {
    flameDescriptor,
    showSidebar,
    setShowSidebar,
    showTimeline,
    setShowTimeline,
  } = params

  const [showArena, setShowArena] = createSignal(false)
  // Mirrored for code outside the workspace that must not cover the Arena's
  // own top bar, such as the auto-save question (arcade/editorCover.ts).
  createEffect(() => {
    setArenaShowing(showArena())
  })
  onCleanup(() => setArenaShowing(false))
  const [arenaP1Stats, setArenaP1Stats] =
    createSignal<ArenaFighterStats | null>(null)
  const [arenaP2Stats, setArenaP2Stats] =
    createSignal<ArenaFighterStats | null>(null)
  const [arenaCommentary, setArenaCommentary] = createSignal<string | null>(
    null,
  )
  const [arenaEventBanner, setArenaEventBanner] = createSignal<string | null>(
    null,
  )
  const [arenaStance, setArenaStance] = createSignal<string>('balanced')

  let preArenaSidebar = true
  let preArenaTimeline = false

  createEffect(
    on(
      showArena,
      (isOpen) => {
        if (isOpen) {
          preArenaSidebar = showSidebar()
          preArenaTimeline = showTimeline()
          setShowSidebar(false)
          setShowTimeline(false)
        } else {
          setShowSidebar(preArenaSidebar)
          setShowTimeline(preArenaTimeline)
        }
      },
      { defer: true },
    ),
  )

  let isArenaModalOpen = false

  function openFlameClashUI() {
    if (isArenaModalOpen) return
    isArenaModalOpen = true
    const current = deepClone(flameDescriptor)
    const p1Stats = calculateFlameStats(current)
    const p1Grounded = calculateGroundedStats(current)
    setArenaP1Stats({
      name: current.metadata?.name || 'Cyan Guardian',
      type: p1Stats.type,
      school: p1Grounded.school,
      powerLevel: p1Grounded.powerLevel,
      flame: current,
      groundedStats: p1Grounded,
      metrics: p1Stats.metrics,
    })

    const p2 = arenaP2Stats()
    if (!p2) {
      const opponent = mutateFlame(
        current,
        {
          strength: 0.45,
          minTransforms: 2,
          maxTransforms: 6,
          minVariations: 1,
          maxVariations: 3,
          allowedVariations: [],
          dimensions: current.renderSettings.dimensions ?? 2,
        },
        {
          mutateAffine: true,
          affineMode: 'smart',
          mutateVariations: 'all',
          mutateColors: true,
        },
      )
      const p2Stats = calculateFlameStats(opponent)
      const p2Grounded = calculateGroundedStats(opponent)
      setArenaP2Stats({
        name: 'Crimson Nemesis',
        type: p2Stats.type,
        school: p2Grounded.school,
        powerLevel: p2Grounded.powerLevel,
        flame: opponent,
        groundedStats: p2Grounded,
        metrics: p2Stats.metrics,
      })
    }
    setShowArena(true)
    isArenaModalOpen = true
  }

  createEffect(() => {
    if (!showArena()) {
      isArenaModalOpen = false
    }
  })

  createEffect(() => {
    if (showArena() && !isArenaModalOpen) {
      openFlameClashUI()
    }
  })

  return {
    showArena,
    setShowArena,
    arenaP1Stats,
    setArenaP1Stats,
    arenaP2Stats,
    setArenaP2Stats,
    arenaCommentary,
    setArenaCommentary,
    arenaEventBanner,
    setArenaEventBanner,
    arenaStance,
    setArenaStance,
    openFlameClashUI,
  }
}

export type WorkspaceArenaHandle = {
  showArena: Accessor<boolean>
  setShowArena: Setter<boolean>
  arenaP1Stats: Accessor<ArenaFighterStats | null>
  setArenaP1Stats: Setter<ArenaFighterStats | null>
  arenaP2Stats: Accessor<ArenaFighterStats | null>
  setArenaP2Stats: Setter<ArenaFighterStats | null>
  arenaCommentary: Accessor<string | null>
  setArenaCommentary: Setter<string | null>
  arenaEventBanner: Accessor<string | null>
  setArenaEventBanner: Setter<string | null>
  arenaStance: Accessor<string>
  setArenaStance: Setter<string>
  openFlameClashUI: () => void
}
