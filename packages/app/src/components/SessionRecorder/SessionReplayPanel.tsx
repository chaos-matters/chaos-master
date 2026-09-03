import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, Show, untrack, } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { ChevronLeft, ChevronRight, Download, Focus, Pause, Pencil, PlayPause, SkipBack, Speech, } from '@/icons'
import { deriveReplayFocusPreparation } from '@/recorder/focusPreparation'
import { createSessionPlayer, PLAYBACK_SPEEDS } from '@/recorder/player'
import { replayInterfaceCaptureSupported } from '@/recorder/replayInterfaceVideo'
import { MAX_ACTION_HOLD_MS, MAX_ACTION_NOTE_CHARS, validateSession, } from '@/recorder/schema'
import { deepClone } from '@/utils/clone'
import { agentRailEnabled, followCamEnabled, setAgentRailEnabled, setFollowCamEnabled, setRecorderExportPending, } from './recorderUi'
import { ReplayAgentRail } from './ReplayAgentRail'
import { ReplaySpotlight } from './ReplaySpotlight'
import styles from './SessionReplayPanel.module.css'
import type { ReplayFocusPreparation, ReplayFocusPreparationHandler, } from '@/recorder/focusPreparation'
import type { ReplayTarget } from '@/recorder/replay'
import type { ReplayVideoExportMode, ReplayVideoExportRequest, } from '@/recorder/replayInterfaceVideo'
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
  /** Export either a detached artwork composition or the live interface using
   *  the currently edited captions, holds and selected replay speed. */
  onExportVideo?: (request: ReplayVideoExportRequest) => Promise<void> | void
  onClose: () => void
  /** Lets the owning dock recede while timed replay is advancing. */
  onPlaybackChange?: (playing: boolean) => void
  /** Reports the semantic surface owned by the current replay step. */
  onCurrentPreparationChange?: (
    preparation: ReplayFocusPreparation | undefined,
  ) => void
  /** Makes the exact control visible before a replay step changes it. */
  onPrepareAction?: ReplayFocusPreparationHandler
  /** True while another process temporarily owns and restores the document. */
  blocked?: boolean
}) {
  const [speed, setSpeed] = createSignal(1)
  const [editing, setEditing] = createSignal<number>()
  const [saving, setSaving] = createSignal(false)
  const [exporting, setExporting] = createSignal(false)
  const [exportMode, setExportMode] =
    createSignal<ReplayVideoExportMode>('artwork')
  const [exportError, setExportError] = createSignal<string>()
  const panelId = createUniqueId()

  type LiveReplayWaiter = {
    resolve: () => void
    reject: (error: Error) => void
    cleanup: () => void
  }
  let liveReplayWaiter: LiveReplayWaiter | undefined

  const settleLiveReplay = (error?: Error) => {
    const waiter = liveReplayWaiter
    if (!waiter) return
    liveReplayWaiter = undefined
    waiter.cleanup()
    if (error) waiter.reject(error)
    else waiter.resolve()
  }

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
    onFinished: () => {
      settleLiveReplay()
    },
    onError: (message) => {
      settleLiveReplay(new Error(message))
    },
  })
  const currentPreparation = createMemo(() => {
    const action = player.currentAction()
    if (!action) return undefined
    return deriveReplayFocusPreparation(action)
  })
  const spotlightAction = createMemo(() => {
    const action = player.currentAction()
    if (!action) return undefined
    const focus = currentPreparation()?.spotlightFocus
    return focus === action.focus ? action : { ...action, focus }
  })
  createEffect(() => {
    props.onPlaybackChange?.(player.isPlaying())
  })
  createEffect(() => {
    props.onCurrentPreparationChange?.(currentPreparation())
  })
  createEffect(() => {
    if (props.blocked && player.isPlaying()) player.pause()
  })
  // A player left running past unmount would keep writing into the document.
  onCleanup(() => {
    settleLiveReplay(new Error('Full-interface recording was interrupted'))
    player.stop()
    setRecorderExportPending(false)
    props.onPlaybackChange?.(false)
    props.onCurrentPreparationChange?.(undefined)
  })

  const stepLabel = (index: number) => {
    const action = session.actions[index]
    if (!action) return ''
    return action.note ?? action.label ?? action.id
  }
  const interactionBlocked = () => props.blocked || exporting()
  const interfaceCaptureAvailable = () =>
    props.onExportVideo !== undefined && replayInterfaceCaptureSupported()

  const prepareLiveReplay = () => {
    setFollowCamEnabled(true)
    player.stop()
    player.seek(-1)
    const error = player.lastError()
    if (error) throw new Error(error)
  }

  const playLiveReplay = (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error('Full-interface recording was cancelled'),
      )
    }
    if (liveReplayWaiter) {
      return Promise.reject(
        new Error('A full-interface replay is already running'),
      )
    }

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        player.stop()
        settleLiveReplay(
          signal.reason instanceof Error
            ? signal.reason
            : new Error('Full-interface recording was cancelled'),
        )
      }
      signal.addEventListener('abort', onAbort, { once: true })
      liveReplayWaiter = {
        resolve,
        reject,
        cleanup: () => {
          signal.removeEventListener('abort', onAbort)
        },
      }
      player.play()
      if (!player.isPlaying()) {
        settleLiveReplay(
          new Error(player.lastError() ?? 'The replay could not start'),
        )
      }
    })
  }
  const replayStatus = createMemo(() => {
    const index = player.stepIndex()
    const finished = player.isFinished()
    if (player.total === 0) return 'Replay has no steps.'
    if (index < 0) return `Replay ready. ${player.total} steps.`

    // Announce captions when transport advances, not on every keystroke while
    // the current caption is being edited.
    const caption = untrack(() => stepLabel(index))
    const prefix = finished ? 'Replay complete. ' : ''
    return `${prefix}Step ${index + 1} of ${player.total}: ${caption}.`
  })

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
      <Show when={agentRailEnabled()}>
        <ReplayAgentRail
          actions={session.actions}
          stepIndex={player.stepIndex()}
        />
      </Show>
      <div class={styles.header}>
        <span class={styles.title}>Replay</span>
        <span class={styles.count}>
          {player.stepIndex() + 1}/{player.total}
        </span>
        <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {replayStatus()}
        </p>
        <Show when={session.unnamedWriteCount > 0}>
          <span
            class={styles.warning}
            title={`${session.unnamedWriteCount} edit(s) in this session were not captured as commands, so this replay cannot reproduce them.`}
          >
            {session.unnamedWriteCount} not captured
          </span>
        </Show>
        <button
          data-recorder-replay-close
          type="button"
          class={styles.close}
          disabled={saving() || exporting()}
          onClick={() => {
            // Commit wherever we are, then hand the document back.
            player.stop()
            props.onClose()
          }}
          title={
            saving() || exporting()
              ? 'Wait for the recorder task to finish before closing'
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
          disabled={interactionBlocked()}
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
          disabled={interactionBlocked() || player.stepIndex() < 0}
          title="Previous step"
          aria-label="Previous step"
        >
          <ChevronLeft class={styles.buttonIcon} aria-hidden="true" />
        </button>
        <Show
          when={player.isPlaying()}
          fallback={
            <button
              data-recorder-replay-primary
              type="button"
              class={styles.button}
              onClick={() => {
                player.play()
              }}
              disabled={interactionBlocked() || player.total === 0}
              title="Play replay"
            >
              <PlayPause class={styles.buttonIcon} aria-hidden="true" />
              <span>Play</span>
            </button>
          }
        >
          <button
            data-recorder-replay-primary
            type="button"
            class={styles.button}
            onClick={() => {
              player.pause()
            }}
            disabled={exporting()}
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
          disabled={
            interactionBlocked() || player.stepIndex() >= player.total - 1
          }
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
          disabled={exporting()}
        >
          <Focus class={styles.buttonIcon} aria-hidden="true" />
        </button>
        <button
          type="button"
          class={styles.button}
          classList={{ [styles.toggleOn as string]: agentRailEnabled() }}
          onClick={() => setAgentRailEnabled((on) => !on)}
          title={
            agentRailEnabled()
              ? 'Agent rail on — what the agent did and said, step by step'
              : 'Agent rail off — replay without the running commentary'
          }
          aria-pressed={agentRailEnabled()}
          aria-label={
            agentRailEnabled() ? 'Hide the agent rail' : 'Show the agent rail'
          }
          disabled={exporting()}
        >
          <Speech class={styles.buttonIcon} aria-hidden="true" />
        </button>
        <Show when={props.compact !== true}>
          <label class="sr-only" for={`${panelId}-playback-speed`}>
            Playback speed
          </label>
          <select
            id={`${panelId}-playback-speed`}
            class={styles.speed}
            value={speed()}
            disabled={exporting()}
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
            {(action, index) => {
              const editorId = `${panelId}-step-${index()}-editor`
              const captionId = `${panelId}-step-${index()}-caption`
              let captionInput: HTMLInputElement | undefined

              return (
                <li>
                  <div class={styles.stepRow}>
                    <button
                      type="button"
                      class={styles.step}
                      classList={{
                        [styles.current as string]:
                          player.stepIndex() === index(),
                        [styles.applied as string]:
                          player.stepIndex() >= index(),
                      }}
                      onClick={() => {
                        player.seek(index())
                      }}
                      disabled={interactionBlocked()}
                      aria-current={
                        player.stepIndex() === index() ? 'step' : undefined
                      }
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
                        const opening = editing() !== index()
                        setEditing(opening ? index() : undefined)
                        if (opening) {
                          queueMicrotask(() => captionInput?.focus())
                        }
                      }}
                      title="Write a caption and set how long to hold this step"
                      aria-label={
                        editing() === index()
                          ? `Close editor for step ${index() + 1}`
                          : `Edit caption for step ${index() + 1}`
                      }
                      aria-expanded={editing() === index()}
                      aria-controls={editorId}
                      disabled={exporting()}
                    >
                      <Pencil class={styles.stepEditIcon} aria-hidden="true" />
                    </button>
                  </div>
                  <Show when={editing() === index()}>
                    <div
                      id={editorId}
                      class={styles.stepEditor}
                      role="group"
                      aria-label={`Step ${index() + 1} caption settings`}
                    >
                      <label class="sr-only" for={captionId}>
                        Caption for step {index() + 1}
                      </label>
                      <input
                        ref={captionInput}
                        id={captionId}
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
              )
            }}
          </For>
        </ol>
        <Show when={props.onSave || props.onExportVideo}>
          <div class={styles.footerActions}>
            <Show when={props.onExportVideo}>
              {(exportVideo) => (
                <div class={styles.videoExport}>
                  <div
                    class={styles.videoModes}
                    role="group"
                    aria-label="Video export mode"
                  >
                    <button
                      type="button"
                      class={styles.videoMode}
                      classList={{
                        [styles.videoModeActive as string]:
                          exportMode() === 'artwork',
                      }}
                      aria-pressed={exportMode() === 'artwork'}
                      disabled={exporting()}
                      onClick={() => {
                        setExportMode('artwork')
                        setExportError(undefined)
                      }}
                    >
                      Artwork
                    </button>
                    <button
                      type="button"
                      class={styles.videoMode}
                      classList={{
                        [styles.videoModeActive as string]:
                          exportMode() === 'interface',
                      }}
                      aria-pressed={exportMode() === 'interface'}
                      disabled={exporting() || !interfaceCaptureAvailable()}
                      title={
                        interfaceCaptureAvailable()
                          ? 'Record the actual app, spotlight and flame in real time'
                          : 'Full-interface capture is unavailable in this browser'
                      }
                      onClick={() => {
                        setExportMode('interface')
                        setExportError(undefined)
                      }}
                    >
                      Full interface
                    </button>
                  </div>
                  <p id={`${panelId}-video-mode-help`} class={styles.videoHelp}>
                    {exportMode() === 'artwork'
                      ? 'Widescreen 1080p MP4 · full flame and captions · renders in the background.'
                      : 'Live capture · actual panels, timeline and spotlight. Choose This Tab when asked and keep it visible.'}
                  </p>
                  <button
                    type="button"
                    class={styles.button}
                    disabled={
                      saving() ||
                      exporting() ||
                      session.unnamedWriteCount > 0 ||
                      player.total === 0
                    }
                    aria-busy={exporting()}
                    aria-describedby={`${panelId}-video-mode-help`}
                    onClick={() => {
                      const validated = validateSession(
                        deepClone(unwrap(session)),
                      )
                      if (validated === undefined || saving() || exporting()) {
                        return
                      }

                      const mode = exportMode()
                      const previousFollowCam = followCamEnabled()
                      const request: ReplayVideoExportRequest =
                        mode === 'interface'
                          ? {
                              mode,
                              session: validated,
                              playbackSpeed: speed(),
                              prepareReplay: prepareLiveReplay,
                              playReplay: playLiveReplay,
                            }
                          : {
                              mode,
                              session: validated,
                              playbackSpeed: speed(),
                            }

                      setExportError(undefined)
                      setExporting(true)
                      setRecorderExportPending(true)
                      try {
                        // Invoke directly from the click. Full-interface mode
                        // must reach getDisplayMedia while transient user
                        // activation is still available.
                        const result = exportVideo()(request)
                        void Promise.resolve(result)
                          .catch((error: unknown) => {
                            setExportError(
                              error instanceof Error
                                ? error.message
                                : 'Could not export the replay video',
                            )
                          })
                          .finally(() => {
                            if (mode === 'interface') {
                              setFollowCamEnabled(previousFollowCam)
                            }
                            setRecorderExportPending(false)
                            setExporting(false)
                          })
                      } catch (error: unknown) {
                        if (mode === 'interface') {
                          setFollowCamEnabled(previousFollowCam)
                        }
                        setExportError(
                          error instanceof Error
                            ? error.message
                            : 'Could not export the replay video',
                        )
                        setRecorderExportPending(false)
                        setExporting(false)
                      }
                    }}
                    title={
                      session.unnamedWriteCount > 0
                        ? 'Record a clean take before publishing a replay video'
                        : player.total === 0
                          ? 'Record at least one authored step before publishing a replay video'
                          : exporting()
                            ? exportMode() === 'interface'
                              ? 'Recording the visible interface in real time'
                              : 'Adding artwork video to Exports'
                            : exportMode() === 'interface'
                              ? 'Share this tab, replay the take and download the visible interface'
                              : 'Render a widescreen, captioned artwork replay as MP4'
                    }
                  >
                    <Download class={styles.buttonIcon} aria-hidden="true" />
                    <span>
                      {exporting()
                        ? exportMode() === 'interface'
                          ? 'Recording interface…'
                          : 'Queuing artwork…'
                        : exportMode() === 'interface'
                          ? 'Record full interface'
                          : 'Export artwork'}
                    </span>
                  </button>
                  <Show when={exportError()}>
                    {(message) => (
                      <div class={styles.exportError} role="alert">
                        {message()}
                      </div>
                    )}
                  </Show>
                </div>
              )}
            </Show>
            <Show when={props.onSave}>
              {(save) => (
                <button
                  type="button"
                  class={styles.button}
                  disabled={saving() || exporting()}
                  aria-busy={saving()}
                  onClick={() => {
                    // The controls above constrain authored fields, and this
                    // store-boundary check makes the guarantee explicit even
                    // if a future editor adds a field without matching limits.
                    const validated = validateSession(
                      deepClone(unwrap(session)),
                    )
                    if (validated === undefined || saving() || exporting()) {
                      return
                    }

                    setSaving(true)
                    void save()(validated)
                      .catch(() => {
                        // The owner reports the storage error. Keeping the
                        // panel mounted and editable is the recovery path.
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
          </div>
        </Show>
      </Show>
    </div>
  )
}
