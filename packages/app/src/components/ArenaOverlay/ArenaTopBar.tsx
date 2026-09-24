import { Show } from 'solid-js'
import { Cross, Star } from '@/icons'
import ui from '../ArenaOverlay.module.css'
import type { ClashRoundOutcome } from '@/webmcp/tools/simulateClash'

export interface ArenaTopBarProps {
  readonly winStreak: number
  readonly gameState: 'idle' | 'clashing' | 'results'
  readonly rounds: ClashRoundOutcome[]
  readonly activeRoundIndex: number
  readonly winner: 1 | 2 | null
  readonly commentary: string | null
  readonly eventBanner: string | null
  /** The arena the clash is staged in: player 1's flame's dimension. */
  readonly dimensions: 2 | 3
  readonly onReplay: () => void
  readonly onClose: () => void
}

export function ArenaTopBar(props: ArenaTopBarProps) {
  return (
    <div class={ui.topBarStrip}>
      <div class={ui.topBarLeft}>
        <div class={ui.pulseDot} />
        <h2 class={ui.title}>{`Flame Clash Arena ${props.dimensions}D`}</h2>
        <Show when={props.winStreak > 0}>
          <div class={ui.streakBadge} title="Current Arena Win Streak">
            <Star class={ui.streakFire} aria-hidden="true" />
            <span>
              Streak: {props.winStreak} {props.winStreak === 1 ? 'Win' : 'Wins'}
            </span>
          </div>
        </Show>
      </div>

      <div class={ui.topBarCenter}>
        <div class={ui.topRoundRow}>
          <span class={ui.topRoundPill}>
            {props.gameState === 'clashing'
              ? `ROUND ${props.rounds[props.activeRoundIndex]?.round ?? props.activeRoundIndex + 1} / 3`
              : props.gameState === 'results'
                ? props.winner === 1
                  ? 'VICTORY: PLAYER 1'
                  : props.winner === 2
                    ? 'VICTORY: OPPONENT'
                    : 'MATCH DRAW'
                : 'READY TO CLASH'}
          </span>
          <div class={ui.territoryMiniTrack}>
            <div
              class={ui.territoryMiniA}
              style={{
                width: `${Math.round(
                  (props.rounds[props.activeRoundIndex]?.ownershipA ?? 0.5) *
                    100,
                )}%`,
              }}
              title={`P1 Territory: ${Math.round(
                (props.rounds[props.activeRoundIndex]?.ownershipA ?? 0.5) * 100,
              )}%`}
            />
            <div
              class={ui.territoryMiniContested}
              style={{
                width: `${Math.round(
                  (props.rounds[props.activeRoundIndex]?.contested ?? 0) * 100,
                )}%`,
              }}
              title="Contested"
            />
            <div
              class={ui.territoryMiniB}
              style={{
                width: `${Math.round(
                  (props.rounds[props.activeRoundIndex]?.ownershipB ?? 0.5) *
                    100,
                )}%`,
              }}
              title={`P2 Territory: ${Math.round(
                (props.rounds[props.activeRoundIndex]?.ownershipB ?? 0.5) * 100,
              )}%`}
            />
          </div>
        </div>

        <div class={ui.topCommentaryBox}>
          {props.commentary ??
            'Choose a tactical stance and initiate the clash!'}
          <Show when={props.eventBanner}>
            {(evt) => <span class={ui.eventBanner}>{evt()}</span>}
          </Show>
        </div>
      </div>

      <div class={ui.topBarRight}>
        <Show when={props.rounds.length > 0 && props.gameState === 'results'}>
          <button
            class={ui.replayBtn}
            onClick={props.onReplay}
            title="Replay Battle"
          >
            Replay
          </button>
        </Show>
        <button
          class={ui.closeButton}
          onClick={props.onClose}
          aria-label="Exit Arena"
          title="Exit Arena (Esc)"
        >
          <Cross width="1rem" />
        </button>
      </div>
    </div>
  )
}
