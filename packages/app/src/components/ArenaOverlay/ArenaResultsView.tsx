import { For, Show } from 'solid-js'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { Zap } from '@/icons'
import ui from '../ArenaOverlay.module.css'
import { SCHOOL_COLORS } from './championCardCanvas'
import type { ArenaFighterStats } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { GroundedFlameStats } from '@/flame/stats'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'

const PREVIEW_RES = { width: 380, height: 214 }

export interface WinnerTrophyCardProps {
  readonly winner: 1 | 2 | null
  readonly winStreak: number
  readonly victorStats: ArenaFighterStats | null
  readonly victorGrounded: GroundedFlameStats | null
  readonly victorPreviewFlame: FlameDescriptor | null
  readonly previewVersion: number
  readonly cachedSimResult: SimulateClashResult | null
  readonly hardwareTier?: HardwareTier | null
  readonly exportingCard: boolean
  readonly onNextChallenger: () => void
  readonly onReplay: () => void
  readonly onLoadVictor: (winner: 1 | 2) => void
  readonly onExportCard: () => void
}

export function WinnerTrophyCard(props: WinnerTrophyCardProps) {
  const victorColor = () => {
    if (props.winner === 1) return '#22d3ee'
    if (props.winner === 2) return '#fb923c'
    return '#fbbf24'
  }

  return (
    <div class={ui.winnerTrophyCard}>
      <div class={ui.winnerTrophyHeader}>
        <span class={ui.winnerTrophyTitle}>Chaos Master • Arena Champion</span>
        <Show when={props.winStreak > 0}>
          <div class={ui.streakBadge} title="Current Arena Win Streak">
            <span class={ui.streakFire}>★</span>
            <span>
              Streak: {props.winStreak} {props.winStreak === 1 ? 'Win' : 'Wins'}
            </span>
          </div>
        </Show>
      </div>

      <div class={ui.winnerArtContainer}>
        <Show
          when={props.victorPreviewFlame}
          fallback={
            <div class={ui.fighterPreviewInner}>
              <span class={ui.fighterLabel}>
                {props.victorStats?.name ?? 'Champion'}
              </span>
            </div>
          }
        >
          {(f) => (
            <div class={ui.previewLayer}>
              <VariationPreview
                version={props.previewVersion}
                isSelected={true}
                flame={f()}
                name={props.victorStats?.name ?? 'Champion'}
                resolution={PREVIEW_RES}
                hardwareTier={props.hardwareTier}
                snapshotOnly
              />
            </div>
          )}
        </Show>
        <div class={ui.winnerCrownBadge}>
          {props.winner !== null ? 'VICTOR' : 'DRAW'}
        </div>
        <Show when={props.victorGrounded?.school}>
          {(sch) => (
            <span
              class={`${ui.schoolBadge} ${ui.winnerSchoolBadgeOverlay}`}
              style={{
                'background-color': SCHOOL_COLORS[sch()].bg,
                color: SCHOOL_COLORS[sch()].text,
                'border-color': SCHOOL_COLORS[sch()].border,
              }}
            >
              {sch()}
            </span>
          )}
        </Show>
      </div>

      <div class={ui.winnerInfoRow}>
        <div>
          <div class={ui.winnerBigName} style={{ color: victorColor() }}>
            {props.victorStats?.name ?? 'Arena Champion'}
          </div>
          <div class={ui.fighterClass}>
            Class: {props.victorStats?.type ?? 'Fractal Guardian'}
          </div>
        </div>
        <div class={ui.winnerPowerBadge}>
          PWR{' '}
          {props.victorGrounded?.powerLevel ??
            props.victorStats?.powerLevel ??
            1000}
        </div>
      </div>

      <Show when={props.cachedSimResult}>
        {(sim) => (
          <div class={ui.winnerScoreBanner}>
            <span>Territory Dominance</span>
            <span class={ui.winnerFinalScore}>
              {sim().finalScore.A} - {sim().finalScore.B}
            </span>
          </div>
        )}
      </Show>

      <Show when={props.victorGrounded}>
        {(g) => (
          <div class={ui.groundedMetrics}>
            <div
              class={ui.groundedMetricItem}
              title="Moran similarity dimension"
            >
              <span class={ui.groundedMetricKey}>Dim</span>
              <span class={ui.groundedMetricVal}>
                {g().dimension.toFixed(2)}
              </span>
            </div>
            <div
              class={ui.groundedMetricItem}
              title="Spectral stability / contractivity"
            >
              <span class={ui.groundedMetricKey}>Stab</span>
              <span class={ui.groundedMetricVal}>
                {Math.round(g().stability * 100)}%
              </span>
            </div>
            <div
              class={ui.groundedMetricItem}
              title="Shannon entropy of transform weights"
            >
              <span class={ui.groundedMetricKey}>Ent</span>
              <span class={ui.groundedMetricVal}>{g().entropy.toFixed(2)}</span>
            </div>
            <div
              class={ui.groundedMetricItem}
              title="Rotational symmetry order"
            >
              <span class={ui.groundedMetricKey}>Sym</span>
              <span class={ui.groundedMetricVal}>C{g().symmetryOrder}</span>
            </div>
          </div>
        )}
      </Show>

      <div class={ui.centerActionsBar}>
        <button
          class={ui.centerNextBtn}
          onClick={props.onNextChallenger}
          title="Face next procedural opponent (R)"
        >
          <Zap width="1.1rem" height="1.1rem" />
          <span>Next Challenger</span>
          <Zap width="1.1rem" height="1.1rem" />
        </button>
        <div class={ui.centerSubActions}>
          <button
            class={ui.centerReplayBtn}
            onClick={props.onReplay}
            title="Replay Clash (Space)"
          >
            Replay Clash
          </button>
          <Show when={props.winner !== null}>
            <button
              class={ui.centerLoadBtn}
              onClick={() => {
                props.onLoadVictor(props.winner!)
              }}
              title="Load Victor to Canvas"
            >
              Load Victor
            </button>
          </Show>
        </div>
        <button
          class={ui.centerExportBtn}
          onClick={props.onExportCard}
          disabled={props.exportingCard}
          title="Export collectible Champion Card as PNG"
        >
          <span>
            {props.exportingCard ? 'Exporting...' : 'Download Card (PNG)'}
          </span>
        </button>
        <div class={ui.keyboardHints}>
          [Space] Replay • [R] Next Challenger • [Esc] Exit
        </div>
      </div>
    </div>
  )
}

export function BattleLogDrawer(props: {
  readonly battleLog: readonly string[]
  readonly showBattleLog: boolean
  readonly onToggle: () => void
}) {
  return (
    <Show when={props.battleLog.length > 0}>
      <div class={ui.battleLogSection}>
        <div class={ui.battleLogHeader} onClick={props.onToggle}>
          <span class={ui.battleLogTitle}>
            Tactical Battle Log ({props.battleLog.length} events)
          </span>
          <span class={ui.battleLogToggle}>
            {props.showBattleLog ? '[Hide]' : '[Show]'}
          </span>
        </div>
        <Show when={props.showBattleLog}>
          <div class={ui.battleLogList}>
            <For each={props.battleLog}>
              {(logItem) => <div class={ui.battleLogItem}>{logItem}</div>}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
