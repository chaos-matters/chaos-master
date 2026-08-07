import { createSignal, For, onCleanup, Show } from 'solid-js'
import { createSessionPlayer, PLAYBACK_SPEEDS } from '@/recorder/player'
import styles from './SessionReplayPanel.module.css'
import type { ReplayTarget } from '@/recorder/replay'
import type { RecordedSession } from '@/recorder/schema'

/**
 * Watch a recorded session rebuild the flame, or jump to any step
 * (semantic-recorder-plan, M4).
 *
 * Closing the panel is the "fork" gesture: the player stops, its batch is
 * committed, and whatever step is on screen becomes an ordinary editable
 * document with undo intact.
 */
export function SessionReplayPanel(props: {
  session: RecordedSession
  target: ReplayTarget
  onClose: () => void
}) {
  const [speed, setSpeed] = createSignal(1)
  const player = createSessionPlayer(props.session, props.target, {
    speed,
  })
  // A player left running past unmount would keep writing into the document.
  onCleanup(() => {
    player.stop()
  })

  const stepLabel = (index: number) => {
    const action = props.session.actions[index]
    if (!action) return ''
    return action.label ?? action.id
  }

  return (
    <div class={styles.panel}>
      <div class={styles.header}>
        <span class={styles.title}>Replay</span>
        <span class={styles.count}>
          {player.stepIndex() + 1}/{player.total}
        </span>
        <Show when={props.session.unnamedWriteCount > 0}>
          <span
            class={styles.warning}
            title={`${props.session.unnamedWriteCount} edit(s) in this session were not captured as commands, so this replay cannot reproduce them.`}
          >
            {props.session.unnamedWriteCount} not captured
          </span>
        </Show>
        <button
          type="button"
          class={styles.close}
          onClick={() => {
            // Commit wherever we are, then hand the document back.
            player.stop()
            props.onClose()
          }}
          title="Stop replaying and keep this step as the current flame"
        >
          Close
        </button>
      </div>

      <div class={styles.transport}>
        <button
          type="button"
          class={styles.button}
          onClick={() => {
            player.seek(-1)
          }}
          title="Back to the starting flame"
        >
          ⏮
        </button>
        <button
          type="button"
          class={styles.button}
          onClick={() => {
            player.seek(player.stepIndex() - 1)
          }}
          disabled={player.stepIndex() < 0}
        >
          ◀
        </button>
        <Show
          when={player.isPlaying()}
          fallback={
            <button
              type="button"
              class={styles.button}
              onClick={() => {
                player.play()
              }}
              disabled={player.total === 0}
            >
              ▶ Play
            </button>
          }
        >
          <button
            type="button"
            class={styles.button}
            onClick={() => {
              player.pause()
            }}
          >
            ⏸ Pause
          </button>
        </Show>
        <button
          type="button"
          class={styles.button}
          onClick={() => {
            player.seek(player.stepIndex() + 1)
          }}
          disabled={player.stepIndex() >= player.total - 1}
        >
          ▶|
        </button>
        <select
          class={styles.speed}
          value={speed()}
          onChange={(ev) => {
            setSpeed(Number(ev.currentTarget.value))
          }}
          title="Playback speed"
        >
          <For each={PLAYBACK_SPEEDS}>
            {(value) => <option value={value}>{value}×</option>}
          </For>
        </select>
      </div>

      <ol class={styles.steps}>
        <For each={props.session.actions}>
          {(_action, index) => (
            <li>
              <button
                type="button"
                class={styles.step}
                classList={{
                  [styles.current as string]: player.stepIndex() === index(),
                  [styles.applied as string]: player.stepIndex() >= index(),
                }}
                onClick={() => {
                  player.seek(index())
                }}
              >
                <span class={styles.stepIndex}>{index() + 1}</span>
                <span class={styles.stepLabel}>{stepLabel(index())}</span>
              </button>
            </li>
          )}
        </For>
      </ol>
    </div>
  )
}
