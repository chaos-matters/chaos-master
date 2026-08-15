import { createEffect, createMemo, createSignal, For, onCleanup, Show, } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { ChevronLeft, ChevronRight, Focus, Pause, Pencil, PlayPause, SkipBack, } from '@/icons'
import { deriveReplayFocusPreparation } from '@/recorder/focusPreparation'
import { createSessionPlayer, PLAYBACK_SPEEDS } from '@/recorder/player'
import { MAX_ACTION_HOLD_MS, MAX_ACTION_NOTE_CHARS, validateSession, } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { followCamEnabled, setFollowCamEnabled } from './recorderUi'
import { ReplaySpotlight } from './ReplaySpotlight'
import styles from './SessionReplayPanel.module.css'
import type { ReplayFocusPreparationHandler } from '@/recorder/focusPreparation'
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
  onSave?: (session: RecordedSession) => Promise<void>
  onClose: () => void
  /** Lets the owning dock recede while timed replay is advancing. */
  onPlaybackChange?: (playing: boolean) => void
  /** Makes the exact control visible before a replay step changes it. */
  onPrepareAction?: ReplayFocusPreparationHandler
  /** True while another process temporarily owns and restores the document. */
  blocked?: boolean
}) {
  const [speed, setSpeed] = createSignal(1)
  const [editing, setEditing] = createSignal<number>()
  const [saving, setSaving] = createSignal(false)

  /**
   * The session is cloned into a store so captions and holds are editable
   * here without mutating what the library holds — and the player is handed
   * the SAME object, so a hold typed mid-replay takes effect on the next step
   * instead of after a reload.
   */
  const [session, setSession] = createStore(deepClone(props.session))

  const player = createSessionPlayer(session, props.target, {
    speed,
    beforeAction: (action) => {
      if (followCamEnabled()) {
        props.onPrepareAction?.(deriveReplayFocusPreparation(action))
      }
    },
  })
  const spotlightAction = createMemo(() => {
    const action = player.currentAction()
    if (!action) return undefined
    const focus = deriveReplayFocusPreparation(action).spotlightFocus
    return focus === action.focus ? action : { ...action, focus }
  })
  createEffect(() => {
    props.onPlaybackChange?.(player.isPlaying())
  })
  createEffect(() => {
    if (props.blocked && player.isPlaying()) player.pause()
  })
  // A player left running past unmount would keep writing into the document.
  onCleanup(() => {
    player.stop()
    props.onPlaybackChange?.(false)
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
          action={spotlightAction()}
          finished={player.isFinished()}
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
          disabled={saving()}
          onClick={() => {
            // Commit wherever we are, then hand the document back.
            player.stop()
            props.onClose()
          }}
          title={
            saving()
              ? 'Wait for the caption save to finish before closing'
              : 'Stop replaying and keep this step as the current flame'
          }
        >
          Close
        </button>
      </div>

      <div class={styles.transport}>
        <button
          type="button"
          class={styles.button}
          classList={{ [styles.transportIconButton as string]: true }}
          onClick={() => {
            player.seek(-1)
          }}
          disabled={props.blocked}
          title="Back to the starting flame"
          aria-label="Back to the starting flame"
        >
          <SkipBack class={styles.buttonIcon} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={styles.button}
          classList={{ [styles.transportIconButton as string]: true }}
          onClick={() => {
            player.seek(player.stepIndex() - 1)
          }}
          disabled={props.blocked || player.stepIndex() < 0}
          title="Previous step"
          aria-label="Previous step"
        >
          <ChevronLeft class={styles.buttonIcon} aria-hidden="true" />
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
              disabled={props.blocked || player.total === 0}
              title="Play replay"
            >
              <PlayPause class={styles.buttonIcon} aria-hidden="true" />
              <span>Play</span>
            </button>
          }
        >
          <button
            type="button"
            class={styles.button}
            onClick={() => {
              player.pause()
            }}
            title="Pause replay"
          >
            <Pause class={styles.buttonIcon} aria-hidden="true" />
            <span>Pause</span>
          </button>
        </Show>
        <button
          type="button"
          class={styles.button}
          classList={{ [styles.transportIconButton as string]: true }}
          onClick={() => {
            player.seek(player.stepIndex() + 1)
          }}
          disabled={props.blocked || player.stepIndex() >= player.total - 1}
          title="Next step"
          aria-label="Next step"
        >
          <ChevronRight class={styles.buttonIcon} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={styles.button}
          classList={{ [styles.toggleOn as string]: followCamEnabled() }}
          onClick={() => {
            const enable = !followCamEnabled()
            if (enable) {
              const action = player.currentAction()
              if (action) {
                // Prepare while the spotlight is still unmounted. Resolving
                // first would frame whichever stale editor surface happened
                // to be visible while follow-cam was off.
                props.onPrepareAction?.(deriveReplayFocusPreparation(action))
              }
            }
            setFollowCamEnabled(enable)
          }}
          title={
            followCamEnabled()
              ? 'Follow-cam on — each step spotlights the control it changes'
              : 'Follow-cam off — replay without the spotlight and captions'
          }
          aria-pressed={followCamEnabled()}
          aria-label={
            followCamEnabled()
              ? 'Disable replay follow-cam'
              : 'Enable replay follow-cam'
          }
        >
          <Focus class={styles.buttonIcon} aria-hidden="true" />
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

      <Show when={player.lastError()}>
        {(message) => (
          <div class={styles.replayError} role="alert">
            {message()}. The replay stopped before applying this step.
          </div>
        )}
      </Show>

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
                    disabled={props.blocked}
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
                    <Pencil class={styles.stepEditIcon} aria-hidden="true" />
                  </button>
                </div>
                <Show when={editing() === index()}>
                  <div class={styles.stepEditor}>
                    <input
                      class={styles.noteInput}
                      value={action.note ?? ''}
                      maxLength={MAX_ACTION_NOTE_CHARS}
                      placeholder={action.label ?? action.id}
                      onInput={(ev) => {
                        // `maxLength` covers ordinary typing; slicing also
                        // covers paste/programmatic input consistently.
                        const text = ev.currentTarget.value.slice(
                          0,
                          MAX_ACTION_NOTE_CHARS,
                        )
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
                        max={MAX_ACTION_HOLD_MS}
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
                            raw === '' || !Number.isFinite(parsed)
                              ? undefined
                              : Math.min(
                                  MAX_ACTION_HOLD_MS,
                                  Math.max(0, parsed),
                                ),
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
              disabled={saving()}
              aria-busy={saving()}
              onClick={() => {
                // The controls above constrain authored fields, and this
                // store-boundary check makes the guarantee explicit even if a
                // future editor adds another field without matching limits.
                const validated = validateSession(deepClone(unwrap(session)))
                if (validated === undefined || saving()) return

                setSaving(true)
                void save()(validated)
                  .catch(() => {
                    // The owner reports the storage error. Keeping the panel
                    // mounted and editable is the recovery path here.
                  })
                  .finally(() => {
                    setSaving(false)
                  })
              }}
              title={
                saving()
                  ? 'Saving captions locally'
                  : 'Save the captions and holds as a new recording'
              }
            >
              {saving() ? 'Saving captions…' : 'Save captions'}
            </button>
          )}
        </Show>
      </Show>
    </div>
  )
}
