import { createSignal, For, onCleanup, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { Cross, Zap } from '@/icons'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import ui from './ArenaOverlay.module.css'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { ClashRoundOutcome, SimulateClashResult, } from '@/webmcp/tools/simulateClash'

export interface ArenaOverlayProps {
  arena: CommandContext['arena']
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
  const [commentary, setCommentary] = createSignal<string | null>(null)
  const [winner, setWinner] = createSignal<1 | 2 | null>(null)
  const [clashing, setClashing] = createSignal(false)
  const [rounds, setRounds] = createSignal<ClashRoundOutcome[]>([])
  const [activeRoundIndex, setActiveRoundIndex] = createSignal<number>(0)
  const [eventBanner, setEventBanner] = createSignal<string | null>(null)

  let activeInterval: ReturnType<typeof setInterval> | null = null

  const clearActiveInterval = () => {
    if (activeInterval !== null) {
      clearInterval(activeInterval)
      activeInterval = null
    }
  }

  onCleanup(clearActiveInterval)

  const handleClose = () => {
    clearActiveInterval()
    props.arena.setOpen(false)
    props.onClose?.()
  }

  const runSimulation = () => {
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    if (!p1 || !p2 || !p1.flame || !p2.flame) return

    clearActiveInterval()
    setClashing(true)
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
      },
      {},
    ) as SimulateClashResult

    if (!simRes || !simRes.rounds) {
      setClashing(false)
      return
    }

    setRounds(simRes.rounds)
    setActiveRoundIndex(0)

    // Step through round 1 -> round 2 -> round 3
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
        currentIdx++
      } else {
        clearActiveInterval()
        const finalWin =
          simRes.winner === 'A' ? 1 : simRes.winner === 'B' ? 2 : null
        setWinner(finalWin)
        if (finalWin === null) {
          setCommentary(
            `The arena is deadlocked! Neither flame could claim dominance (${simRes.finalScore.A} - ${simRes.finalScore.B}).`,
          )
        } else {
          const winnerObj = finalWin === 1 ? p1 : p2
          setCommentary(
            `${winnerObj.name ?? `Player ${finalWin}`} secures victory in the 3D territory clash (${simRes.finalScore.A} - ${simRes.finalScore.B})!`,
          )
        }
        setClashing(false)
      }
    }, 900)
  }

  const handleClash = () => {
    runSimulation()
  }

  const loadFighter = (player: 1 | 2) => {
    if (props.arena.selectFighter) {
      props.arena.selectFighter(player)
      handleClose()
    }
  }

  return (
    <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
      <div class={ui.modal} data-testid="flame-clash-arena-modal">
        {/* Header */}
        <div class={ui.header}>
          <div class={ui.titleGroup}>
            <div class={ui.pulseDot} />
            <h2 class={ui.title}>Flame Clash Arena 3D</h2>
          </div>
          <Show when={rounds().length > 0 && !clashing()}>
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
            title="Exit Arena"
          >
            <Cross width="1rem" />
          </button>
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
              {(p1) => (
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
                      >
                        Load
                      </button>
                    </Show>
                  </div>

                  <div class={ui.statList}>
                    <StatRow
                      label="Power"
                      value={p1().powerLevel || 0}
                      max={2000}
                      color="#22d3ee"
                    />
                    <StatRow
                      label="Complexity"
                      value={(p1().metrics?.complexity || 0) * 10}
                      max={100}
                      color="#60a5fa"
                    />
                    <StatRow
                      label="Chaos"
                      value={(p1().metrics?.chaosLevel || 0) * 10}
                      max={100}
                      color="#c084fc"
                    />
                    <StatRow
                      label="Symmetry"
                      value={(p1().metrics?.symmetryScore || 0) * 10}
                      max={100}
                      color="#818cf8"
                    />
                    <StatRow
                      label="Energy"
                      value={(p1().metrics?.energyIntensity || 0) * 10}
                      max={100}
                      color="#2dd4bf"
                    />
                  </div>
                </div>
              )}
            </Show>

            {/* VS Center Graphic & Clash Button */}
            <div class={ui.vsCenter}>
              <div class={ui.vsText}>VS</div>
              <button
                class={ui.clashBtn}
                onClick={handleClash}
                disabled={clashing()}
              >
                <Zap width="1.2rem" height="1.2rem" />
                <span>{clashing() ? 'CLASHING...' : 'CLASH'}</span>
                <Zap width="1.2rem" height="1.2rem" />
              </button>
            </div>

            {/* Player 2 (Right / Orange) */}
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
                        Class: {p2().type || 'Chaos Lord'}
                      </div>
                    </div>
                    <Show when={p2().flame}>
                      <button
                        class={ui.loadBtn}
                        onClick={() => {
                          loadFighter(2)
                        }}
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
