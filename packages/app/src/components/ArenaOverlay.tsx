import { createEffect, createMemo, createSignal, onCleanup, onMount, Show, useContext, } from 'solid-js'
import { CANCEL, LoadFlameModal, } from '@/components/LoadFlameModal/LoadFlameModal'
import { ModalContext } from '@/components/Modal/ModalContext'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { calculateGroundedStats, getSchoolMultiplier } from '@/flame/stats'
import { applySymmetryToFlame } from '@/flame/symmetry'
import { Root } from '@/lib/Root'
import { DEFAULT_SEAT } from '@/seats/seatId'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import { animateClash } from '@/webmcp/tools/animateClash'
import { ARENA_ARCHETYPES, generateArchetypeOpponent, } from '@/webmcp/tools/arenaArchetypes'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import ui from './ArenaOverlay.module.css'
import { ArenaCenterStage } from './ArenaOverlay/ArenaCenterStage'
import { ArenaFighterCard } from './ArenaOverlay/ArenaFighterCard'
import { BattleLogDrawer, WinnerTrophyCard, } from './ArenaOverlay/ArenaResultsView'
import { ArenaTopBar } from './ArenaOverlay/ArenaTopBar'
import { exportChampionCardPng, SCHOOL_COLORS, } from './ArenaOverlay/championCardCanvas'
import loadModalUi from './LoadFlameModal/LoadFlameModal.module.css'
import type { Component } from 'solid-js'
import type { ArenaFighterStats, CommandContext } from '@/commands/types'
import type { AnimationLoad } from '@/components/LoadFlameModal/LoadFlameModal'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GroundedFlameStats } from '@/flame/stats'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { TimelineTrack } from '@/utils/timeline'
import type { ArchetypeId, OpponentArchetype, TacticalStance, } from '@/webmcp/tools/arenaArchetypes'
import type { ClashRoundOutcome, SimulateClashResult, } from '@/webmcp/tools/simulateClash'

export { SCHOOL_COLORS }

export interface ArenaOverlayProps {
  /** The overlay only mounts when the workspace actually has an arena, so it
   *  takes the concrete shape rather than the optional context member. */
  arena: NonNullable<CommandContext['arena']>
  hardwareTier?: HardwareTier | null
  onClose?: () => void
}

function ensureCamera(flame?: FlameDescriptor): FlameDescriptor | null {
  if (!flame || !flame.transforms) return null
  const rs = flame.renderSettings ?? {}
  return {
    ...flame,
    renderSettings: {
      ...rs,
      camera: rs.camera ?? { zoom: 1, position: [0, 0], rotation: 0 },
      camera3D: rs.camera3D ?? {
        position: [0, 0, -5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fov: 45,
      },
    },
  }
}

function handleArenaKeyboardNavigation(
  e: KeyboardEvent,
  actions: {
    readonly gameState: () => 'idle' | 'clashing' | 'results'
    readonly onClash: () => void
    readonly onSkipClash: () => void
    readonly onRerollOpponent: () => void
    readonly onClose: () => void
  },
): void {
  const target = e.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable)
  ) {
    return
  }

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault()
    if (actions.gameState() === 'clashing') {
      actions.onSkipClash()
    } else {
      actions.onClash()
    }
  } else if (e.key === 'r' || e.key === 'R') {
    if (actions.gameState() !== 'clashing') {
      e.preventDefault()
      actions.onRerollOpponent()
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    actions.onClose()
  }
}

export const ArenaOverlay: Component<ArenaOverlayProps> = (props) => {
  const history = useChangeHistory()
  const timeline = useTimeline()

  // Game state
  const [gameState, setGameState] = createSignal<
    'idle' | 'clashing' | 'results'
  >('idle')
  const [localCommentary, setLocalCommentary] = createSignal<string | null>(
    'Prepare for 3D territorial combat. Choose a tactical stance and initiate the clash!',
  )
  const [winner, setWinner] = createSignal<1 | 2 | null>(null)
  const [rounds, setRounds] = createSignal<ClashRoundOutcome[]>([])
  const [activeRoundIndex, setActiveRoundIndex] = createSignal<number>(0)
  const [localEventBanner, setLocalEventBanner] = createSignal<string | null>(
    null,
  )
  const [winStreak, setWinStreak] = createSignal<number>(0)
  const [localStance, setLocalStance] = createSignal<TacticalStance>('balanced')
  const [opponentArchetype, setOpponentArchetype] =
    createSignal<OpponentArchetype>(ARENA_ARCHETYPES.chaos_lord)
  const [battleLog, setBattleLog] = createSignal<string[]>([])
  const [showBattleLog, setShowBattleLog] = createSignal<boolean>(false)
  const [exportingCard, setExportingCard] = createSignal<boolean>(false)

  // Reactive version counters & memos for fighter preview invalidation
  const [p1Version, setP1Version] = createSignal<number>(0)
  const [p2Version, setP2Version] = createSignal<number>(0)

  createEffect(() => {
    const f1 = props.arena.player1Stats()?.flame
    if (f1) setP1Version((v) => v + 1)
  })

  createEffect(() => {
    const f2 = props.arena.player2Stats()?.flame
    if (f2) setP2Version((v) => v + 1)
  })

  const p1PreviewFlame = createMemo(() =>
    ensureCamera(props.arena.player1Stats()?.flame),
  )
  const p2PreviewFlame = createMemo(() =>
    ensureCamera(props.arena.player2Stats()?.flame),
  )

  // Kinetic impact VFX signals for spectator mode
  const [isShaking, setIsShaking] = createSignal<boolean>(false)
  const [shockwaveActive, setShockwaveActive] = createSignal<boolean>(false)
  const [combatFloater, setCombatFloater] = createSignal<{
    text: string
    color: string
  } | null>(null)

  const commentary = () => props.arena.commentary?.() || localCommentary()
  const setCommentary = (val: string | null) => {
    setLocalCommentary(val)
    props.arena.setCommentary?.(val)
  }

  const eventBanner = () => props.arena.eventBanner?.() ?? localEventBanner()
  const setEventBanner = (val: string | null) => {
    setLocalEventBanner(val)
    props.arena.setEventBanner?.(val)
  }

  const stance = () =>
    (props.arena.stance?.() as TacticalStance) || localStance()
  const setStance = (val: TacticalStance) => {
    setLocalStance(val)
    props.arena.setStance?.(val)
  }

  const p1Grounded = createMemo<GroundedFlameStats | null>(() => {
    const p1 = props.arena.player1Stats()
    if (!p1?.flame) return null
    return p1.groundedStats ?? calculateGroundedStats(p1.flame)
  })

  const p2Grounded = createMemo<GroundedFlameStats | null>(() => {
    const p2 = props.arena.player2Stats()
    if (!p2?.flame) return null
    return p2.groundedStats ?? calculateGroundedStats(p2.flame)
  })

  const p1Advantage = createMemo(() => {
    const s1 = p1Grounded()?.school
    const s2 = p2Grounded()?.school
    if (!s1 || !s2) return 1.0
    return getSchoolMultiplier(s1, s2)
  })

  const p2Advantage = createMemo(() => {
    const s1 = p1Grounded()?.school
    const s2 = p2Grounded()?.school
    if (!s1 || !s2) return 1.0
    return getSchoolMultiplier(s2, s1)
  })

  const victorStats = createMemo(() => {
    const win = winner()
    if (win === 1) return props.arena.player1Stats()
    if (win === 2) return props.arena.player2Stats()
    return props.arena.player1Stats()
  })

  const victorGrounded = createMemo(() => {
    const win = winner()
    if (win === 1) return p1Grounded()
    if (win === 2) return p2Grounded()
    return p1Grounded()
  })

  const handleExportCard = async () => {
    const win = winner()
    if (!win) return
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    const victor = win === 1 ? p1 : p2
    const rival = win === 1 ? p2 : p1
    const vGrounded = win === 1 ? p1Grounded() : p2Grounded()
    if (!victor || !vGrounded) return

    setExportingCard(true)
    try {
      const ok = await exportChampionCardPng({
        victor,
        rival,
        grounded: vGrounded,
        winStreak: winStreak(),
        stance: stance(),
        isWinner1: win === 1,
      })
      if (ok) {
        setCommentary(
          `Exported Champion Card for ${victor.name ?? 'Champion'}!`,
        )
      }
    } finally {
      setExportingCard(false)
    }
  }

  let activeInterval: ReturnType<typeof setInterval> | null = null
  let activeTimeouts: ReturnType<typeof setTimeout>[] = []
  let initialFlame: FlameDescriptor | null = null
  let initialTracks: TimelineTrack[] | null = null
  let initialDuration: number | null = null
  let initialAnimationEnabled: boolean | null = null
  let wasClashStaged = false
  const [cachedSimResult, setCachedSimResult] =
    createSignal<SimulateClashResult | null>(null)

  const registerTimeout = (
    fn: () => void,
    ms: number,
  ): ReturnType<typeof setTimeout> => {
    const id = setTimeout(() => {
      activeTimeouts = activeTimeouts.filter((t) => t !== id)
      fn()
    }, ms)
    activeTimeouts.push(id)
    return id
  }

  const clearAllTimers = () => {
    if (activeInterval !== null) {
      clearInterval(activeInterval)
      activeInterval = null
    }
    for (const id of activeTimeouts) {
      clearTimeout(id)
    }
    activeTimeouts = []
  }

  // Pinned to the player throughout: the target follows a duel to the rival
  // seat, and restoring through it would write the agent's flame into the
  // viewer's document.
  const captureWorkspace = () => {
    const ctx = getWebMcpContext(DEFAULT_SEAT)
    if (!wasClashStaged && ctx && timeline) {
      initialFlame = deepClone(ctx.flameDescriptor())
      initialTracks = deepClone(timeline.tracks())
      initialDuration =
        timeline.config().endFrame - timeline.config().startFrame
      initialAnimationEnabled = ctx.timeline.animationEnabled()
    }
  }

  const restoreWorkspace = () => {
    if (wasClashStaged && initialFlame) {
      if (timeline) {
        timeline.pause()
      }
      history.replaceSilently(initialFlame)
      if (initialTracks && timeline) {
        timeline.loadTracks(initialTracks)
      }
      const ctx = getWebMcpContext(DEFAULT_SEAT)
      if (initialDuration !== null && ctx) {
        ctx.timeline.setDuration(initialDuration)
      }
      if (initialAnimationEnabled !== null && ctx) {
        ctx.timeline.setAnimationEnabled(initialAnimationEnabled)
      }
      if (timeline) {
        timeline.setCurrentFrame(0)
      }
      wasClashStaged = false
    }
  }

  // Reroll opponent to a fresh procedural archetype
  const handleRerollOpponent = (specificArchetype?: ArchetypeId) => {
    const p1 = props.arena.player1Stats()
    const base = p1?.flame ?? initialFlame
    if (!base) return

    clearAllTimers()
    restoreWorkspace()
    setGameState('idle')
    setWinner(null)
    setRounds([])
    setBattleLog([])
    setCachedSimResult(null)
    setEventBanner(null)
    setCommentary(
      'A new challenger enters the arena! Inspect their traits and prepare for battle.',
    )

    const newOpponent = generateArchetypeOpponent(base, specificArchetype)
    setOpponentArchetype(newOpponent.archetype)

    if (props.arena.setPlayer2Stats) {
      props.arena.setPlayer2Stats({
        name: newOpponent.name,
        type: newOpponent.className,
        school: newOpponent.school,
        powerLevel: newOpponent.powerLevel,
        flame: newOpponent.flame,
        groundedStats: newOpponent.groundedStats,
        metrics: newOpponent.metrics,
      })
    }
  }

  const requestModal = useContext(ModalContext)

  // Open existing Flame Gallery modal and load chosen flame into fighter slot
  const openGalleryForFighter = async (player: 1 | 2) => {
    if (gameState() === 'clashing' || !requestModal) return
    const result = await requestModal<
      FlameDescriptor | AnimationLoad | typeof CANCEL
    >({
      class: loadModalUi.loadFlameModal,
      content: ({ respond }) => (
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <LoadFlameModal
            respond={respond}
            currentDimensions={3}
            mode="gallery"
          />
        </Root>
      ),
    })
    if (!result || result === CANCEL) return
    const chosenFlame: FlameDescriptor =
      'flame' in result ? result.flame : result
    const cloned = deepClone(chosenFlame)
    const fStats = calculateFlameStats(cloned)
    const gStats = calculateGroundedStats(cloned)
    const newFighterStats: ArenaFighterStats = {
      name: cloned.metadata?.name || (player === 1 ? 'Player 1' : 'Player 2'),
      type: fStats.type,
      school: gStats.school,
      powerLevel: gStats.powerLevel,
      flame: cloned,
      groundedStats: gStats,
      metrics: fStats.metrics,
    }
    if (player === 1) {
      props.arena.setPlayer1Stats?.(newFighterStats)
      setP1Version((v) => v + 1)
    } else {
      props.arena.setPlayer2Stats?.(newFighterStats)
      setP2Version((v) => v + 1)
    }
    setWinner(null)
    setRounds([])
    setBattleLog([])
    setCachedSimResult(null)
    setGameState('idle')
    setCommentary(
      `${player === 1 ? 'Player 1' : 'Player 2'} loaded ${newFighterStats.name} from gallery.`,
    )
  }

  // Sync active flame from the main IFS workspace into Player 1
  const handleSyncActiveFlame = () => {
    if (gameState() === 'clashing') return
    const current = getWebMcpContext()?.flameDescriptor?.()
    if (!current) return
    const cloned = deepClone(current)
    const fStats = calculateFlameStats(cloned)
    const gStats = calculateGroundedStats(cloned)
    const newFighterStats: ArenaFighterStats = {
      name: cloned.metadata?.name || 'Active Flame',
      type: fStats.type,
      school: gStats.school,
      powerLevel: gStats.powerLevel,
      flame: cloned,
      groundedStats: gStats,
      metrics: fStats.metrics,
    }
    props.arena.setPlayer1Stats?.(newFighterStats)
    setP1Version((v) => v + 1)
    setWinner(null)
    setRounds([])
    setBattleLog([])
    setCachedSimResult(null)
    setGameState('idle')
    setCommentary(
      `Synced active editor flame "${newFighterStats.name}" to Player 1.`,
    )
  }

  // Apply rotational symmetry order (C1 to C8) to fighter
  const handleApplySymmetry = (player: 1 | 2, folds: number) => {
    if (gameState() === 'clashing') return
    const currentStats =
      player === 1 ? props.arena.player1Stats() : props.arena.player2Stats()
    if (!currentStats?.flame) return
    const updatedFlame = applySymmetryToFlame(
      currentStats.flame,
      folds,
      'rotational',
    )
    const fStats = calculateFlameStats(updatedFlame)
    const gStats = calculateGroundedStats(updatedFlame)
    const updatedFighter: ArenaFighterStats = {
      ...currentStats,
      flame: updatedFlame,
      powerLevel: gStats.powerLevel,
      groundedStats: gStats,
      metrics: fStats.metrics,
    }
    if (player === 1) {
      props.arena.setPlayer1Stats?.(updatedFighter)
      setP1Version((v) => v + 1)
    } else {
      props.arena.setPlayer2Stats?.(updatedFighter)
      setP2Version((v) => v + 1)
    }
    setWinner(null)
    setRounds([])
    setBattleLog([])
    setCachedSimResult(null)
    setGameState('idle')
    setCommentary(
      folds > 1
        ? `Applied C${folds} rotational symmetry to ${player === 1 ? 'Player 1' : 'Player 2'}.`
        : `Reset symmetry to C1 for ${player === 1 ? 'Player 1' : 'Player 2'}.`,
    )
  }

  onMount(() => {
    // Register programmatic clash runner and gameState
    props.arena.gameState = gameState
    props.arena.startClash = (opts) => {
      if (opts?.stance) {
        setStance(opts.stance as TacticalStance)
      }
      return new Promise((resolve) => {
        runSimulation((res) => {
          resolve(res)
        })
      })
    }

    // If P2 is not set, generate an archetype opponent
    const p2 = props.arena.player2Stats()
    if (!p2 || !p2.flame) {
      handleRerollOpponent()
    }
  })

  onCleanup(() => {
    clearAllTimers()
    restoreWorkspace()
  })

  const handleClose = () => {
    clearAllTimers()
    restoreWorkspace()
    props.arena.setOpen(false)
    props.onClose?.()
  }

  const runSimulation = (
    onComplete?: (simRes: SimulateClashResult) => void,
  ) => {
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    if (!p1 || !p2 || !p1.flame || !p2.flame) return

    clearAllTimers()
    captureWorkspace()

    setGameState('clashing')
    setWinner(null)
    setEventBanner(null)
    setCommentary(
      'Fighters engaging in shared arena volume... Calculating trajectory and impact dynamics!',
    )

    const flameDimensions = (p1.flame.renderSettings?.dimensions as 2 | 3) ?? 3

    const simRes = simulateClash.execute(
      {
        flameA: p1.flame,
        flameB: p2.flame,
        dimensions: flameDimensions,
        rounds: 3,
        stanceA: stance(),
        stanceB: 'balanced',
      },
      {},
    ) as SimulateClashResult

    if (!simRes || !simRes.rounds) {
      setGameState('idle')
      return
    }

    setCachedSimResult(simRes)
    setRounds(simRes.rounds)
    setActiveRoundIndex(0)

    // Stage flame & keyframe 2D/3D kinetic combat tracks across 90 frames (30 per round)
    animateClash.execute(
      {
        simulation: simRes,
        flameA: p1.flame,
        flameB: p2.flame,
        framesPerRound: 30,
      },
      {},
    )
    wasClashStaged = true

    // Start timeline playback
    if (timeline) {
      timeline.setCurrentFrame(0)
      timeline.play()
    }

    // Step through rounds with impact VFX sync
    let currentIdx = 0
    activeInterval = setInterval(() => {
      if (currentIdx < simRes.rounds.length) {
        const r = simRes.rounds[currentIdx]!
        setActiveRoundIndex(currentIdx)
        if (r.event) {
          setEventBanner(r.event)
        }

        const winnerName =
          r.winner === 'A'
            ? (p1.name ?? 'Player 1')
            : r.winner === 'B'
              ? (p2.name ?? 'Player 2')
              : 'Contested'
        setCommentary(
          `Round ${r.round}: ${winnerName} takes territory (${Math.round(r.ownershipA * 100)}% vs ${Math.round(r.ownershipB * 100)}%)${r.event ? ` — [${r.event}]` : ''}`,
        )

        // Trigger visual impact flash, screen shake, and floating text at mid-round collision
        registerTimeout(() => {
          if (gameState() !== 'clashing') return
          setIsShaking(true)
          registerTimeout(() => setIsShaking(false), 300)
          setShockwaveActive(true)
          registerTimeout(() => setShockwaveActive(false), 600)
          const isWinnerP1 = r.winner === 'A'
          const floaterText = r.event
            ? `CRITICAL [${r.event}]!`
            : isWinnerP1
              ? '+150 TERRITORY'
              : r.winner === 'B'
                ? '-150 TERRITORY'
                : 'CLASH DEADLOCK'
          const floaterColor = isWinnerP1
            ? '#22d3ee'
            : r.winner === 'B'
              ? '#fb923c'
              : '#fbbf24'
          setCombatFloater({ text: floaterText, color: floaterColor })
          registerTimeout(() => setCombatFloater(null), 850)
        }, 350)

        currentIdx++
      } else {
        finishSimulation(simRes)
        onComplete?.(simRes)
      }
    }, 1000)
  }

  const finishSimulation = (simRes: SimulateClashResult) => {
    clearAllTimers()
    if (timeline) {
      timeline.pause()
    }

    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    const finalWin =
      simRes.winner === 'A' ? 1 : simRes.winner === 'B' ? 2 : null

    setWinner(finalWin)
    setGameState('results')
    if (simRes.battleLog) {
      setBattleLog(simRes.battleLog)
    }

    if (finalWin === 1) {
      const nextStreak = winStreak() + 1
      setWinStreak(nextStreak)
      setCommentary(
        `${p1?.name ?? 'Player 1'} secures decisive victory (${simRes.finalScore.A} - ${simRes.finalScore.B})! Current Streak: ${nextStreak} ${nextStreak === 1 ? 'Win' : 'Wins'}.`,
      )
    } else if (finalWin === 2) {
      setWinStreak(0)
      setCommentary(
        `${p2?.name ?? 'Player 2'} claims the territory (${simRes.finalScore.A} - ${simRes.finalScore.B}). Streak reset.`,
      )
    } else {
      setCommentary(
        `The clash ends in a deadlock! Neither flame could establish total dominance (${simRes.finalScore.A} - ${simRes.finalScore.B}).`,
      )
    }
  }

  // Fast forward directly to results
  const handleSkipClash = () => {
    const simRes = cachedSimResult()
    if (gameState() !== 'clashing' || !simRes) return
    setActiveRoundIndex(simRes.rounds.length - 1)
    finishSimulation(simRes)
  }

  const handleClash = () => {
    runSimulation()
  }

  const loadFighter = (player: 1 | 2) => {
    clearAllTimers()
    wasClashStaged = false
    if (props.arena.selectFighter) {
      props.arena.selectFighter(player)
      props.arena.setOpen(false)
      props.onClose?.()
    }
  }

  // Keyboard shortcut handler
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      handleArenaKeyboardNavigation(e, {
        gameState,
        onClash: handleClash,
        onSkipClash: handleSkipClash,
        onRerollOpponent: handleRerollOpponent,
        onClose: handleClose,
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown)
    })
  })

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div
        class={ui.modal}
        classList={{ [ui.isClashing!]: gameState() === 'clashing' }}
        data-testid="flame-clash-arena-modal"
      >
        <ArenaTopBar
          winStreak={winStreak()}
          gameState={gameState()}
          rounds={rounds()}
          activeRoundIndex={activeRoundIndex()}
          winner={winner()}
          commentary={commentary()}
          eventBanner={eventBanner()}
          onReplay={() => {
            runSimulation()
          }}
          onClose={handleClose}
        />

        <div class={ui.body}>
          <div class={ui.battlefield}>
            <Show when={props.arena.player1Stats()}>
              {(p1) => (
                <ArenaFighterCard
                  player={1}
                  fighter={p1()}
                  grounded={p1Grounded()}
                  advantage={p1Advantage()}
                  isWinner={winner() === 1}
                  previewFlame={p1PreviewFlame()}
                  version={p1Version()}
                  hardwareTier={props.hardwareTier}
                  gameState={gameState()}
                  onLoad={() => {
                    loadFighter(1)
                  }}
                  onApplySymmetry={(order) => {
                    handleApplySymmetry(1, order)
                  }}
                  onOpenGallery={() => {
                    void openGalleryForFighter(1)
                  }}
                  stance={stance()}
                  onSetStance={setStance}
                  onSyncActiveFlame={handleSyncActiveFlame}
                />
              )}
            </Show>

            <ArenaCenterStage
              gameState={gameState()}
              isShaking={isShaking()}
              shockwaveActive={shockwaveActive()}
              combatFloater={combatFloater()}
              onClash={handleClash}
              onSkipClash={handleSkipClash}
              resultsView={
                <WinnerTrophyCard
                  winner={winner()}
                  winStreak={winStreak()}
                  victorStats={victorStats()}
                  victorGrounded={victorGrounded()}
                  victorPreviewFlame={
                    winner() === 2 ? p2PreviewFlame() : p1PreviewFlame()
                  }
                  previewVersion={winner() === 2 ? p2Version() : p1Version()}
                  cachedSimResult={cachedSimResult()}
                  hardwareTier={props.hardwareTier}
                  exportingCard={exportingCard()}
                  onNextChallenger={() => {
                    handleRerollOpponent()
                  }}
                  onReplay={() => {
                    runSimulation()
                  }}
                  onLoadVictor={(win) => {
                    loadFighter(win)
                  }}
                  onExportCard={handleExportCard}
                />
              }
            />

            <Show when={props.arena.player2Stats()}>
              {(p2) => (
                <ArenaFighterCard
                  player={2}
                  fighter={p2()}
                  grounded={p2Grounded()}
                  advantage={p2Advantage()}
                  isWinner={winner() === 2}
                  previewFlame={p2PreviewFlame()}
                  version={p2Version()}
                  hardwareTier={props.hardwareTier}
                  gameState={gameState()}
                  onLoad={() => {
                    loadFighter(2)
                  }}
                  onApplySymmetry={(order) => {
                    handleApplySymmetry(2, order)
                  }}
                  onOpenGallery={() => {
                    void openGalleryForFighter(2)
                  }}
                  opponentArchetype={opponentArchetype()}
                  onRerollOpponent={() => {
                    handleRerollOpponent()
                  }}
                />
              )}
            </Show>
          </div>

          <BattleLogDrawer
            battleLog={battleLog()}
            showBattleLog={showBattleLog()}
            onToggle={() => {
              setShowBattleLog(!showBattleLog())
            }}
          />
        </div>
      </div>
    </ComputeGate>
  )
}
