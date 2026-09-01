import { createSignal, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { Cross, Zap } from '@/icons'
import ui from './ArenaOverlay.module.css'
import type { Component } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { HardwareTier } from '@/utils/hardwareTier'

export interface ArenaOverlayProps {
  arena: CommandContext['arena']
  hardwareTier?: HardwareTier | null
  onClose?: () => void
  respond?: () => void
}

const PREVIEW_RES = 160

function ensureCamera(flame?: FlameDescriptor): FlameDescriptor | null {
  if (!flame || !flame.transforms) return null
  return {
    ...flame,
    renderSettings: {
      exposure: 0.5,
      vibrancy: 0.5,
      gamma: 2.2,
      contrast: 1,
      skipIters: 20,
      dimensions: 2,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
      ...flame.renderSettings,
    },
  }
}

export const ArenaOverlay: Component<ArenaOverlayProps> = (props) => {
  const [commentary, setCommentary] = createSignal<string | null>(null)
  const [winner, setWinner] = createSignal<1 | 2 | null>(null)
  const [clashing, setClashing] = createSignal(false)

  const handleClose = () => {
    props.arena.setOpen(false)
    props.onClose?.()
    props.respond?.()
  }

  const handleClash = () => {
    const p1 = props.arena.player1Stats()
    const p2 = props.arena.player2Stats()
    if (!p1 || !p2) return

    setClashing(true)
    setCommentary(
      'Fighters engaging... Calculating resonance and fractal entropy!',
    )

    setTimeout(() => {
      const p1Power =
        (p1.powerLevel ?? 1000) + (p1.metrics?.complexity ?? 5) * 50
      const p2Power =
        (p2.powerLevel ?? 1000) + (p2.metrics?.chaosLevel ?? 5) * 50

      if (p1Power >= p2Power) {
        setWinner(1)
        setCommentary(
          `${p1.name ?? 'Player 1'} dominates the arena with superior structural resonance! (Power: ${Math.round(p1Power)})`,
        )
      } else {
        setWinner(2)
        setCommentary(
          `${p2.name ?? 'Player 2'} overwhelms with pure chaotic energy! (Power: ${Math.round(p2Power)})`,
        )
      }
      setClashing(false)
    }, 800)
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
            <h2 class={ui.title}>Flame Clash Arena</h2>
          </div>
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
          {/* Commentary Box */}
          <Show when={commentary()}>
            {(msg) => <div class={ui.commentaryBox}>{msg()}</div>}
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
