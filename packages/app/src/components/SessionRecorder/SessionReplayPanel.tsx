import { createSignal, For, onCleanup, Show } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { createSessionPlayer, PLAYBACK_SPEEDS } from '@/recorder/player'
import { deepClone } from '@/utils/clone'
import { followCamEnabled, setFollowCamEnabled } from './recorderUi'
import { ReplaySpotlight } from './ReplaySpotlight'
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
  /** Drop the step list and the speed picker, keeping the transport. The step
   *  list is the tall part, and it is the reason the dock offers collapsing at
   *  all — but a collapsed dock that could not play would be pointless. */
  compact?: boolean
  /** Persist the edited session (captions and holds). Absent = no editing
   *  affordance, which is what a read-only replay surface wants. */
  onSave?: (session: RecordedSession) => void
  onClose: () => void
}) {
  const [speed, setSpeed] = createSignal(1)
  const [editing, setEditing] = createSignal<number>()

  /**
   * The session is cloned into a store so captions and holds are editable
   * here without mutating what the library holds — and the player is handed
   * the SAME object, so a hold typed mid-replay takes effect on the next step
   * instead of after a reload.
   */
  const [session, setSession] = createStore(deepClone(props.session))

  const player = createSessionPlayer(session, props.target, {
    speed,
  })
  // A player left running past unmount would keep writing into the document.
  onCleanup(() => {
    player.stop()
  })

  const stepLabel = (index: number) => {
    const action = session.actions[index]
    if (!action) return ''
    return action.note ?? action.label ?? action.id
  }

  return (
    <div
      class={styles.panel}
      classList={{ [styles.compact as string]: props.compact }}
    >
      <Show when={followCamEnabled()}>
        <ReplaySpotlight
          action={player.currentAction()}
          playing={player.isPlaying()}
        />
      </Show>
      <div class={styles.header}>
        <span class={styles.title}>Replay</span>
        <span class={styles.count}>
          {player.stepIndex() + 1}/{player.total}
        </span>
        <Show when={session.unnamedWriteCount > 0}>
          <span
            class={styles.warning}
            title={`${session.unnamedWriteCount} edit(s) in this session were not captured as commands, so this replay cannot reproduce them.`}
          >
            {session.unnamedWriteCount} not captured
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
        <button
          type="button"
          class={styles.button}
          classList={{ [styles.toggleOn as string]: followCamEnabled() }}
          onClick={() => {
            setFollowCamEnabled(!followCamEnabled())
          }}
          title={
            followCamEnabled()
              ? 'Follow-cam on — each step spotlights the control it changes'
              : 'Follow-cam off — replay without the spotlight and captions'
          }
          aria-pressed={followCamEnabled()}
        >
          ◎
        </button>
        <Show when={props.compact !== true}>
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
        </Show>
      </div>

      <Show when={props.compact !== true}>
        <ol class={styles.steps}>
          <For each={session.actions}>
            {(action, index) => (
              <li>
                <div class={styles.stepRow}>
                  <button
                    type="button"
                    class={styles.step}
                    classList={{
                      [styles.current as string]:
                        player.stepIndex() === index(),
                      [styles.applied as string]: player.stepIndex() >= index(),
                    }}
                    onClick={() => {
                      player.seek(index())
                    }}
                  >
                    <span class={styles.stepIndex}>{index() + 1}</span>
                    <span class={styles.stepLabel}>{stepLabel(index())}</span>
                  </button>
                  <button
                    type="button"
                    class={styles.stepEdit}
                    classList={{
                      [styles.stepEditOn as string]: editing() === index(),
                    }}
                    onClick={() => {
                      setEditing(editing() === index() ? undefined : index())
                    }}
                    title="Write a caption and set how long to hold this step"
                    aria-label="Edit step caption"
                  >
                    ✎
                  </button>
                </div>
                <Show when={editing() === index()}>
                  <div class={styles.stepEditor}>
                    <input
                      class={styles.noteInput}
                      value={action.note ?? ''}
                      placeholder={action.label ?? action.id}
                      onInput={(ev) => {
                        const text = ev.currentTarget.value
                        setSession(
                          'actions',
                          index(),
                          'note',
                          text.trim() === '' ? undefined : text,
                        )
                      }}
                      title="Caption shown on screen while this step runs"
                    />
                    <label class={styles.holdField}>
                      hold
                      <input
                        class={styles.holdInput}
                        type="number"
                        min={0}
                        step={100}
                        value={action.holdMs ?? ''}
                        placeholder="auto"
                        onInput={(ev) => {
                          const raw = ev.currentTarget.value
                          const parsed = Number(raw)
                          setSession(
                            'actions',
                            index(),
                            'holdMs',
                            raw === '' || !Number.isFinite(parsed) || parsed < 0
                              ? undefined
                              : parsed,
                          )
                        }}
                        title="Milliseconds to hold before the next step (blank = the pace it was recorded at)"
                      />
                      ms
                    </label>
                  </div>
                </Show>
              </li>
            )}
          </For>
        </ol>
        <Show when={props.onSave}>
          {(save) => (
            <button
              type="button"
              class={styles.button}
              onClick={() => {
                save()(deepClone(unwrap(session)))
              }}
              title="Save the captions and holds as a new recording"
            >
              Save captions
            </button>
          )}
        </Show>
      </Show>
    </div>
  )
}
