import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { Cross, Zap } from '@/icons'
import { deepClone } from '@/utils/clone'
import { getWebMcpContext } from '@/webmcp/contextBridge'
import { animateClash } from '@/webmcp/tools/animateClash'
import { ARENA_ARCHETYPES, generateArchetypeOpponent, TACTICAL_STANCES, } from '@/webmcp/tools/arenaArchetypes'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import ui from './ArenaOverlay.module.css'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { TimelineTrack } from '@/utils/timeline'
import type { ArchetypeId, OpponentArchetype, TacticalStance, } from '@/webmcp/tools/arenaArchetypes'
import type { ClashRoundOutcome, SimulateClashResult, } from '@/webmcp/tools/simulateClash'

export interface ArenaOverlayProps {
  /** The overlay only mounts when the workspace actually has an arena, so it
   *  takes the concrete shape rather than the optional context member. */
  arena: NonNullable<CommandContext['arena']>
  hardwareTier?: HardwareTier | null
  onClose?: () => void
}

const PREVIEW_RES = { width: 380, height: 214 }

function ensureCamera(flame?: FlameDescriptor): FlameDescriptor | null {
  if (!flame || !flame.transforms) return null
  const rs = flame.renderSettings ?? {}
  return {
    ...flame,
    renderSettings: {
      ...rs,
      camera: rs.camera ?? { zoom: 1, position: [0, 0], rotation: 0 },
    },
  }
}

export const ArenaOverlay: Component<ArenaOverlayProps> = (props) => {
  const history = useChangeHistory()
  const timeline = useTimeline()

  // Game state
  const [gameState, setGameState] = createSignal<
    'idle' | 'clashing' | 'results'
  >('idle')
  const [commentary, setCommentary] = createSignal<string | null>(
    'Prepare for 3D territorial combat. Choose a tactical stance and initiate the clash!',
  )
  const [winner, setWinner] = createSignal<1 | 2 | null>(null)
  const [rounds, setRounds] = createSignal<ClashRoundOutcome[]>([])
  const [activeRoundIndex, setActiveRoundIndex] = createSignal<number>(0)
  const [eventBanner, setEventBanner] = createSignal<string | null>(null)
  const [winStreak, setWinStreak] = createSignal<number>(0)
  const [stance, setStance] = createSignal<TacticalStance>('balanced')
  const [opponentArchetype, setOpponentArchetype] =
    createSignal<OpponentArchetype>(ARENA_ARCHETYPES.chaos_lord)

  let activeInterval: ReturnType<typeof setInterval> | null = null
  let initialFlame: FlameDescriptor | null = null
  let initialTracks: TimelineTrack[] | null = null
  let initialDuration: number | null = null
  let initialAnimationEnabled: boolean | null = null
  let wasClashStaged = false
  let cachedSimResult: SimulateClashResult | null = null

  const captureWorkspace = () => {
    const ctx = getWebMcpContext()
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
      const ctx = getWebMcpContext()
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

  const clearActiveInterval = () => {
    if (activeInterval !== null) {
      clearInterval(activeInterval)
      activeInterval = null
    }
  }

  // Reroll opponent to a fresh procedural archetype
  const handleRerollOpponent = (specificArchetype?: ArchetypeId) => {
    const p1 = props.arena.player1Stats()
    const base = p1?.flame ?? initialFlame
    if (!base) return

    clearActiveInterval()
    restoreWorkspace()
    setGameState('idle')
    setWinner(null)
    setRounds([])
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
        powerLevel: newOpponent.powerLevel,
        flame: newOpponent.flame,
        metrics: newOpponent.metrics,
      })
    }
  }

  onMount(() => {
    // If P2 is not set, generate an archetype opponent
    const p2 = props.arena.player2Stats()
    if (!p2 || !p2.flame) {
      handleRerollOpponent()
    }
  })

  onCleanup(() => {
    clearActiveInterval()
    restoreWorkspace()
  })

  const handleClose = () => {
    clearActiveInterval()
    restoreWorkspace()
    props.arena.setOpen(false)
    props.onClose?.()
  }

  const runSimulation = () => {
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    if (!p1 || !p2 || !p1.flame || !p2.flame) return

    clearActiveInterval()
    captureWorkspace()

    setGameState('clashing')
    setWinner(null)
    setEventBanner(null)
    setCommentary(
      'Fighters engaging in shared 3D volume... Calculating territory density and entropy!',
    )

    const simRes = simulateClash.execute(
      {
        flameA: p1.flame,
        flameB: p2.flame,
        dimensions: 3,
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

    cachedSimResult = simRes
    setRounds(simRes.rounds)
    setActiveRoundIndex(0)

    // Stage Round 1 flame & keyframe 4 camera tracks across 90 frames (30 per round)
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

    // Step through round 1 -> round 2 -> round 3
    let currentIdx = 0
    activeInterval = setInterval(() => {
      if (currentIdx < simRes.rounds.length) {
        const r = simRes.rounds[currentIdx]!
        setActiveRoundIndex(currentIdx)
        if (r.event) {
          setEventBanner(r.event)
        }

        // Advance staged flame at round boundaries without extra undo entries
        if (r.clashFlame) {
          history.replaceSilently(r.clashFlame)
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
        currentIdx++
      } else {
        finishSimulation(simRes)
      }
    }, 1000)
  }

  const finishSimulation = (simRes: SimulateClashResult) => {
    clearActiveInterval()
    if (timeline) {
      timeline.pause()
    }

    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    const finalWin =
      simRes.winner === 'A' ? 1 : simRes.winner === 'B' ? 2 : null

    setWinner(finalWin)
    setGameState('results')

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
    if (gameState() !== 'clashing' || !cachedSimResult) return
    const simRes = cachedSimResult
    const lastRound = simRes.rounds[simRes.rounds.length - 1]
    if (lastRound?.clashFlame) {
      history.replaceSilently(lastRound.clashFlame)
    }
    setActiveRoundIndex(simRes.rounds.length - 1)
    finishSimulation(simRes)
  }

  const handleClash = () => {
    runSimulation()
  }

  const loadFighter = (player: 1 | 2) => {
    clearActiveInterval()
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
        if (gameState() === 'idle' || gameState() === 'results') {
          handleClash()
        } else if (gameState() === 'clashing') {
          handleSkipClash()
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (gameState() === 'idle' || gameState() === 'results') {
          e.preventDefault()
          handleRerollOpponent()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown)
    })
  })

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div class={ui.modal} data-testid="flame-clash-arena-modal">
        {/* Header */}
        <div class={ui.header}>
          <div class={ui.titleGroup}>
            <div class={ui.pulseDot} />
            <h2 class={ui.title}>Flame Clash Arena 3D</h2>
            <Show when={winStreak() > 0}>
              <div class={ui.streakBadge} title="Current Arena Win Streak">
                <span class={ui.streakFire}>★</span>
                <span>
                  Streak: {winStreak()} {winStreak() === 1 ? 'Win' : 'Wins'}
                </span>
              </div>
            </Show>
          </div>

          <div class={ui.headerActions}>
            <Show when={rounds().length > 0 && gameState() === 'results'}>
              <button
                class={ui.replayBtn}
                onClick={runSimulation}
                title="Replay Battle"
              >
                Replay Clash
              </button>
            </Show>
            <button
              class={ui.closeButton}
              onClick={handleClose}
              aria-label="Exit Arena"
              title="Exit Arena (Esc)"
            >
              <Cross width="1rem" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div class={ui.body}>
          {/* 3-Round Territory Bar */}
          <Show when={rounds().length > 0}>
            <div class={ui.roundsBar}>
              <For each={rounds()}>
                {(r, idx) => {
                  const isCur = () => activeRoundIndex() === idx()
                  return (
                    <div
                      class={ui.roundBadge}
                      classList={{
                        [ui.roundBadgeActive!]: isCur(),
                        [ui.roundBadgeP1!]: r.winner === 'A',
                        [ui.roundBadgeP2!]: r.winner === 'B',
                      }}
                    >
                      R{r.round}:{' '}
                      {r.winner === 'A'
                        ? 'P1'
                        : r.winner === 'B'
                          ? 'P2'
                          : 'DRAW'}
                    </div>
                  )
                }}
              </For>
            </div>

            {/* Active Round Territory Meter */}
            <Show when={rounds()[activeRoundIndex()]}>
              {(cur) => (
                <div class={ui.territoryBar}>
                  <div
                    class={ui.territoryA}
                    style={{ width: `${Math.round(cur().ownershipA * 100)}%` }}
                    title={`P1 Territory: ${Math.round(cur().ownershipA * 100)}%`}
                  />
                  <div
                    class={ui.territoryContested}
                    style={{ width: `${Math.round(cur().contested * 100)}%` }}
                    title={`Contested: ${Math.round(cur().contested * 100)}%`}
                  />
                  <div
                    class={ui.territoryB}
                    style={{ width: `${Math.round(cur().ownershipB * 100)}%` }}
                    title={`P2 Territory: ${Math.round(cur().ownershipB * 100)}%`}
                  />
                </div>
              )}
            </Show>
          </Show>

          {/* Battlefield */}
          <div class={ui.battlefield}>
            {/* Player 1 (Left / Cyan) */}
            <Show when={props.arena.player1Stats()}>
              {(p1) => {
                const curStance = () => TACTICAL_STANCES[stance()]
                const effPower = () =>
                  Math.round(
                    (p1().powerLevel || 0) *
                      ((curStance().effects.energyMultiplier +
                        curStance().effects.symmetryMultiplier +
                        curStance().effects.chaosMultiplier) /
                        3),
                  )

                return (
                  <div
                    class={`${ui.fighterCard} ${ui.p1Card}`}
                    classList={{ [ui.p1CardWinner!]: winner() === 1 }}
                  >
                    <div class={ui.fighterPreview}>
                      <Show
                        when={ensureCamera(p1().flame)}
                        fallback={
                          <div class={ui.fighterPreviewInner}>
                            <span class={ui.fighterLabel}>
                              {p1().name ?? 'Player 1'}
                            </span>
                          </div>
                        }
                      >
                        {(f) => (
                          <div class={ui.previewLayer}>
                            <VariationPreview
                              version={0}
                              isSelected={winner() === 1}
                              flame={f()}
                              name={p1().name ?? 'Player 1'}
                              resolution={PREVIEW_RES}
                              hardwareTier={props.hardwareTier}
                              snapshotOnly
                            />
                          </div>
                        )}
                      </Show>

                      <Show when={winner() === 1}>
                        <div class={ui.victorBadge}>VICTOR</div>
                      </Show>
                    </div>

                    <div class={ui.fighterHeader}>
                      <div>
                        <div class={`${ui.fighterName} ${ui.p1Name}`}>
                          {p1().name ?? 'Player 1'}
                        </div>
                        <div class={ui.fighterClass}>
                          Class: {p1().type || 'Fractal Guardian'}
                        </div>
                      </div>
                      <Show when={p1().flame}>
                        <button
                          class={ui.loadBtn}
                          onClick={() => {
                            loadFighter(1)
                          }}
                          title="Load this flame into main workspace"
                        >
                          Load
                        </button>
                      </Show>
                    </div>

                    <div class={ui.statList}>
                      <StatRow
                        label="Power"
                        value={effPower()}
                        max={2000}
                        color="#22d3ee"
                      />
                      <StatRow
                        label="Complexity"
                        value={
                          (p1().metrics?.complexity || 0) *
                          10 *
                          curStance().effects.complexityMultiplier
                        }
                        max={100}
                        color="#60a5fa"
                      />
                      <StatRow
                        label="Chaos"
                        value={
                          (p1().metrics?.chaosLevel || 0) *
                          10 *
                          curStance().effects.chaosMultiplier
                        }
                        max={100}
                        color="#c084fc"
                      />
                      <StatRow
                        label="Symmetry"
                        value={
                          (p1().metrics?.symmetryScore || 0) *
                          10 *
                          curStance().effects.symmetryMultiplier
                        }
                        max={100}
                        color="#818cf8"
                      />
                      <StatRow
                        label="Energy"
                        value={
                          (p1().metrics?.energyIntensity || 0) *
                          10 *
                          curStance().effects.energyMultiplier
                        }
                        max={100}
                        color="#2dd4bf"
                      />
                    </div>

                    {/* Tactical Stance Selector */}
                    <div class={ui.stanceContainer}>
                      <div class={ui.stanceTitle}>Tactical Stance</div>
                      <div class={ui.stanceGrid}>
                        <For each={Object.values(TACTICAL_STANCES)}>
                          {(s) => (
                            <button
                              class={ui.stanceBtn}
                              classList={{
                                [ui.stanceBtnActive!]: stance() === s.id,
                              }}
                              onClick={() => setStance(s.id)}
                              disabled={gameState() === 'clashing'}
                              title={s.description}
                            >
                              <span class={ui.stanceName}>{s.name}</span>
                              <span class={ui.stanceTagline}>{s.tagline}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                )
              }}
            </Show>

            {/* VS Center Graphic & Clash Button */}
            <div class={ui.vsCenter}>
              <div class={ui.vsText}>VS</div>

              <Show when={gameState() === 'idle'}>
                <button
                  class={ui.clashBtn}
                  onClick={handleClash}
                  title="Engage battle (Space)"
                >
                  <Zap width="1.2rem" height="1.2rem" />
                  <span>CLASH</span>
                  <Zap width="1.2rem" height="1.2rem" />
                </button>
                <div class={ui.keyboardHints}>Press [Space] to Clash</div>
              </Show>

              <Show when={gameState() === 'clashing'}>
                <button class={ui.clashBtn} disabled>
                  <Zap width="1.2rem" height="1.2rem" />
                  <span>CLASHING...</span>
                  <Zap width="1.2rem" height="1.2rem" />
                </button>
                <button
                  class={ui.skipBtn}
                  onClick={handleSkipClash}
                  title="Skip animation to results"
                >
                  Skip to Results
                </button>
              </Show>

              <Show when={gameState() === 'results'}>
                <div class={ui.resultsActions}>
                  <button
                    class={ui.nextChallengerBtn}
                    onClick={() => {
                      handleRerollOpponent()
                    }}
                    title="Face next procedural opponent (R)"
                  >
                    <span>Next Challenger</span>
                    <Zap width="1rem" height="1rem" />
                  </button>
                  <Show when={winner() !== null}>
                    <button
                      class={ui.loadVictorBtn}
                      onClick={() => {
                        loadFighter(winner()!)
                      }}
                      title="Load victorious flame to workspace"
                    >
                      Load Victor to Canvas
                    </button>
                  </Show>
                </div>
                <div class={ui.keyboardHints}>
                  Press [R] for Next Challenger
                </div>
              </Show>
            </div>

            {/* Player 2 (Right / Orange/Red) */}
            <Show when={props.arena.player2Stats()}>
              {(p2) => (
                <div
                  class={`${ui.fighterCard} ${ui.p2Card}`}
                  classList={{ [ui.p2CardWinner!]: winner() === 2 }}
                >
                  <div class={ui.fighterPreview}>
                    <Show
                      when={ensureCamera(p2().flame)}
                      fallback={
                        <div class={ui.fighterPreviewInner}>
                          <span class={ui.fighterLabel}>
                            {p2().name ?? 'Player 2'}
                          </span>
                        </div>
                      }
                    >
                      {(f) => (
                        <div class={ui.previewLayer}>
                          <VariationPreview
                            version={0}
                            isSelected={winner() === 2}
                            flame={f()}
                            name={p2().name ?? 'Player 2'}
                            resolution={PREVIEW_RES}
                            hardwareTier={props.hardwareTier}
                            snapshotOnly
                          />
                        </div>
                      )}
                    </Show>

                    <Show when={winner() === 2}>
                      <div class={ui.victorBadge}>VICTOR</div>
                    </Show>
                  </div>

                  <div class={ui.fighterHeader}>
                    <div>
                      <div class={`${ui.fighterName} ${ui.p2Name}`}>
                        {p2().name ?? 'Player 2'}
                      </div>
                      <div class={ui.fighterClass}>
                        Archetype: {p2().type || opponentArchetype().className}
                      </div>
                    </div>
                    <Show when={p2().flame}>
                      <button
                        class={ui.loadBtn}
                        onClick={() => {
                          loadFighter(2)
                        }}
                        title="Load this flame into main workspace"
                      >
                        Load
                      </button>
                    </Show>
                  </div>

                  <div class={ui.statList}>
                    <StatRow
                      label="Power"
                      value={p2().powerLevel || 0}
                      max={2000}
                      color="#fb923c"
                    />
                    <StatRow
                      label="Complexity"
                      value={(p2().metrics?.complexity || 0) * 10}
                      max={100}
                      color="#f87171"
                    />
                    <StatRow
                      label="Chaos"
                      value={(p2().metrics?.chaosLevel || 0) * 10}
                      max={100}
                      color="#f472b6"
                    />
                    <StatRow
                      label="Symmetry"
                      value={(p2().metrics?.symmetryScore || 0) * 10}
                      max={100}
                      color="#facc15"
                    />
                    <StatRow
                      label="Energy"
                      value={(p2().metrics?.energyIntensity || 0) * 10}
                      max={100}
                      color="#fbbf24"
                    />
                  </div>

                  {/* Opponent Lore & Actions */}
                  <div class={ui.opponentLoreBox}>
                    {opponentArchetype().lore}
                  </div>

                  <div class={ui.cardFooterActions}>
                    <button
                      class={ui.rerollBtn}
                      onClick={() => {
                        handleRerollOpponent()
                      }}
                      disabled={gameState() === 'clashing'}
                      title="Generate new opponent archetype (R)"
                    >
                      <span>Reroll Opponent</span>
                    </button>
                  </div>
                </div>
              )}
            </Show>
          </div>

          {/* Commentary Box */}
          <Show when={commentary()}>
            {(msg) => (
              <div class={ui.commentaryBox}>
                {msg()}
                <Show when={eventBanner()}>
                  {(evt) => <span class={ui.eventBanner}>{evt()}</span>}
                </Show>
              </div>
            )}
          </Show>
        </div>
      </div>
    </ComputeGate>
  )
}

function StatRow(props: {
  label: string
  value: number
  max: number
  color: string
}) {
  const percentage = () =>
    Math.min(100, Math.max(0, (props.value / props.max) * 100))

  return (
    <div class={ui.statRow}>
      <div class={ui.statLabels}>
        <span>{props.label}</span>
        <span>{Math.round(props.value)}</span>
      </div>
      <div class={ui.statTrack}>
        <div
          class={ui.statFill}
          style={{
            width: `${percentage()}%`,
            background: props.color,
          }}
        />
      </div>
    </div>
  )
}
