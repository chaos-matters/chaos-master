import { Show } from 'solid-js'
import { Zap } from '@/icons'
import ui from '../ArenaOverlay.module.css'
import type { JSX } from 'solid-js'

export interface ArenaCenterStageProps {
  readonly gameState: 'idle' | 'clashing' | 'results'
  readonly isShaking: boolean
  readonly shockwaveActive: boolean
  readonly combatFloater: {
    readonly text: string
    readonly color: string
  } | null
  readonly onClash: () => void
  readonly onSkipClash: () => void
  readonly resultsView?: JSX.Element
}

export function ArenaCenterStage(props: ArenaCenterStageProps) {
  return (
    <div class={ui.centerColumn}>
      <Show when={props.gameState === 'idle'}>
        <div class={ui.vsCenter}>
          <div class={ui.vsText}>VS</div>
          <button
            class={ui.clashBtn}
            onClick={props.onClash}
            title="Engage battle (Space)"
          >
            <Zap width="1.2rem" height="1.2rem" />
            <span>CLASH</span>
            <Zap width="1.2rem" height="1.2rem" />
          </button>
          <div class={ui.keyboardHints}>Press [Space] to Clash</div>
        </div>
      </Show>

      <Show when={props.gameState === 'clashing'}>
        <div class={ui.clashActiveArea}>
          <div
            class={ui.clashStage}
            classList={{ [ui.shakeEffect!]: props.isShaking }}
          >
            <Show when={props.shockwaveActive}>
              <div class={ui.shockwaveRing} />
            </Show>
            <Show when={props.combatFloater}>
              {(floater) => (
                <div
                  class={ui.combatFloater}
                  style={{ color: floater().color }}
                >
                  {floater().text}
                </div>
              )}
            </Show>
          </div>
          <div class={ui.clashBottomBar}>
            <button
              class={ui.skipBtn}
              onClick={props.onSkipClash}
              title="Skip animation to results"
            >
              Skip to Results
            </button>
          </div>
        </div>
      </Show>

      <Show when={props.gameState === 'results'}>
        <div class={ui.centerWinnerContainer}>{props.resultsView}</div>
      </Show>
    </div>
  )
}
