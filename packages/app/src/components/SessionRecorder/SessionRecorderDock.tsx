import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { ChevronDown, CircleHalf, Cross } from '@/icons'
import { isSessionRecording } from '@/recorder/recorder'
import { storeSession } from '@/utils/sessionsDB'
import { clampRecorderOpacity, FADED_RECORDER_OPACITY, followCamEnabled, MIN_RECORDER_OPACITY, recorderCollapsed, recorderExportPending, recorderFadeOnPlayback, recorderOffset, recorderOpacity, recorderSavePending, recorderTaskPending, setRecorderCollapsed, setRecorderFadeOnPlayback, setRecorderOffset, setRecorderOpacity, setRecorderSavePending, setRecorderVisible, } from './recorderUi'
import { SessionLibraryPanel } from './SessionLibraryPanel'
import { SessionRecorderControls } from './SessionRecorderControls'
import styles from './SessionRecorderDock.module.css'
import { SessionReplayPanel } from './SessionReplayPanel'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ReplayFocusPreparation, ReplayFocusPreparationHandler, } from '@/recorder/focusPreparation'
import type { SessionStartExtras } from '@/recorder/recorder'
import type { ReplayTarget } from '@/recorder/replay'
import type { ReplayVideoExportRequest } from '@/recorder/replayInterfaceVideo'
import type { RecordedSession } from '@/recorder/schema'

/**
 * The recorder's home in the workspace: the record pill, plus the replay and
 * library panels it opens.
 *
 * The pieces used to sit loose in the bottom bar, which was fine until a
 * loaded session made the step list tall enough to cover a third of the
 * canvas. The dock gives them one owner, and with it the three things that
 * makes tolerable: collapse (drop the panels, keep the transport), fade
 * (get out of the way while the canvas is animating), and drag (park it
 * somewhere else entirely).
 *
 * Docked is the default and the layout the bottom bar was designed for —
 * dragging switches to fixed positioning so the bar does not keep a hole where
 * the dock used to be, and double-clicking the grip puts it back.
 */

/** Breathing room around the whole recorder bar while it is floating. */
const VIEWPORT_MARGIN_PX = 8

/** Pointer travel before a press on the grip counts as a drag. */
const DRAG_THRESHOLD_PX = 4
const KEYBOARD_MOVE_PX = 16

export function calculateFloatingPanelPlacement(input: {
  bar: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left'>
  panelWidth: number
  panelHeight: number
  viewportWidth: number
  viewportHeight: number
}): { below: boolean; maxHeight: number; offsetX: number } {
  const spaceAbove = Math.max(0, input.bar.top - VIEWPORT_MARGIN_PX)
  const spaceBelow = Math.max(
    0,
    input.viewportHeight - input.bar.bottom - VIEWPORT_MARGIN_PX,
  )
  const below = input.panelHeight > spaceAbove && spaceBelow > spaceAbove
  const maxHeight = below ? spaceBelow : spaceAbove
  const panelWidth = Math.min(
    input.panelWidth,
    input.viewportWidth - VIEWPORT_MARGIN_PX * 2,
  )
  const panelLeft = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(
      input.viewportWidth - VIEWPORT_MARGIN_PX - panelWidth,
      input.bar.left,
    ),
  )

  return {
    below,
    maxHeight,
    offsetX: panelLeft - input.bar.left,
  }
}

export function SessionRecorderDock(props: {
  flameDescriptor: FlameDescriptor
  /** Timeline + audio wiring to snapshot when a recording starts. */
  startExtras?: () => SessionStartExtras
  /** Runs only after the recorder accepts the captured workspace. */
  onRecordingStarted?: () => void
  target: ReplayTarget
  /** The session open for replay, owned by the workspace because a dropped
   *  file opens one too. */
  session: RecordedSession | undefined
  onSessionChange: (session: RecordedSession | undefined) => void
  /** Export a publishable artwork or full-interface video from the edited take. */
  onExportVideo?: (request: ReplayVideoExportRequest) => Promise<void> | void
  /** True while the canvas is animating or exporting — the cue to fade. */
  busy: boolean
  /** True while an export temporarily owns and restores the main document. */
  replayBlocked?: boolean
  /** Makes the exact control visible before a replay step changes it. */
  onPrepareAction?: ReplayFocusPreparationHandler
  /** Lets the workspace recede playback chrome without fading the surface
   * that owns the current follow-cam target. */
  onReplayPresentationChange?: (state: {
    playing: boolean
    timelineTargeted: boolean
  }) => void
}) {
  const { showToast } = useToast()
  const [libraryOpen, setLibraryOpen] = createSignal(false)
  const [libraryRevision, setLibraryRevision] = createSignal(0)
  const [showOpacitySlider, setShowOpacitySlider] = createSignal(false)
  const [dragging, setDragging] = createSignal(false)
  const [replayPlaying, setReplayPlaying] = createSignal(false)
  const [replayPreparation, setReplayPreparation] =
    createSignal<ReplayFocusPreparation>()
  const [libraryMounted, setLibraryMounted] = createSignal(false)
  const [panelPlacement, setPanelPlacement] = createSignal({
    below: false,
    maxHeight: 0,
    offsetX: 0,
  })

  let barRef: HTMLDivElement | undefined
  let panelsRef: HTMLDivElement | undefined
  let libraryPanelRef: HTMLDivElement | undefined
  let recordingsButtonRef: HTMLButtonElement | undefined
  let opacitySliderRef: HTMLInputElement | undefined
  let transparencyButtonRef: HTMLButtonElement | undefined
  let resizeObserver: ResizeObserver | undefined
  let cleanupDrag: (() => void) | undefined

  const floating = () => recorderOffset() !== null

  const opacity = () => {
    const resting = clampRecorderOpacity(recorderOpacity())
    // Never fade what the user is currently moving.
    if (dragging()) return 1
    return (props.busy || replayPlaying()) && recorderFadeOnPlayback()
      ? Math.min(resting, FADED_RECORDER_OPACITY)
      : resting
  }

  function clampIntoView(x: number, y: number) {
    const width = barRef?.offsetWidth ?? 0
    const height = barRef?.offsetHeight ?? 0
    return {
      x: Math.max(
        VIEWPORT_MARGIN_PX,
        Math.min(window.innerWidth - VIEWPORT_MARGIN_PX - width, x),
      ),
      y: Math.max(
        VIEWPORT_MARGIN_PX,
        Math.min(window.innerHeight - VIEWPORT_MARGIN_PX - height, y),
      ),
    }
  }

  // A dock parked near the right edge of a wide window would be off-screen in
  // a narrow one, with no grip left to drag it back.
  const reclamp = () => {
    const offset = recorderOffset()
    if (!offset) return
    const next = clampIntoView(offset.x, offset.y)
    if (next.x !== offset.x || next.y !== offset.y) setRecorderOffset(next)
  }

  const placeFloatingPanels = () => {
    if (!floating() || !barRef || !panelsRef) return
    const bar = barRef.getBoundingClientRect()
    const panelWidth = Math.max(
      panelsRef.scrollWidth,
      panelsRef.getBoundingClientRect().width,
    )
    const panelHeight = Math.max(
      panelsRef.scrollHeight,
      panelsRef.getBoundingClientRect().height,
    )
    if (panelWidth === 0 || panelHeight === 0) return
    const next = calculateFloatingPanelPlacement({
      bar,
      panelWidth,
      panelHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    const current = panelPlacement()
    if (
      next.below !== current.below ||
      next.maxHeight !== current.maxHeight ||
      next.offsetX !== current.offsetX
    ) {
      setPanelPlacement(next)
    }
  }

  const handleViewportChange = () => {
    reclamp()
    placeFloatingPanels()
  }
  onMount(() => {
    handleViewportChange()
    if (typeof ResizeObserver !== 'undefined' && barRef) {
      resizeObserver = new ResizeObserver(handleViewportChange)
      resizeObserver.observe(barRef)
      if (panelsRef) resizeObserver.observe(panelsRef)
    }
    window.addEventListener('resize', handleViewportChange)
  })
  onCleanup(() => {
    window.removeEventListener('resize', handleViewportChange)
    resizeObserver?.disconnect()
    cleanupDrag?.()
    props.onReplayPresentationChange?.({
      playing: false,
      timelineTargeted: false,
    })
  })

  createEffect(() => {
    props.onReplayPresentationChange?.({
      playing: replayPlaying(),
      timelineTargeted:
        followCamEnabled() && replayPreparation()?.timeline !== undefined,
    })
  })

  createEffect(() => {
    const hasVisiblePanel =
      props.session !== undefined ||
      (libraryOpen() && !recorderCollapsed() && !isSessionRecording())
    if (recorderOffset() !== null && hasVisiblePanel) {
      placeFloatingPanels()
    }
  })

  function startDrag(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const rect = barRef?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    // Grab-point relative to the bar, so it does not jump under the cursor
    // on the first move — including the very first drag, which is also the
    // moment the dock leaves the bottom bar's flow for fixed positioning.
    const grabX = event.clientX - rect.left
    const grabY = event.clientY - rect.top
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    setDragging(true)

    let started = false
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      // A few pixels of jitter on a click — or on the double-click that docks
      // it again — must not tear the dock out of the bottom bar.
      if (
        !started &&
        Math.abs(moveEvent.clientX - event.clientX) < DRAG_THRESHOLD_PX &&
        Math.abs(moveEvent.clientY - event.clientY) < DRAG_THRESHOLD_PX
      ) {
        return
      }
      started = true
      setRecorderOffset(
        clampIntoView(moveEvent.clientX - grabX, moveEvent.clientY - grabY),
      )
    }
    let ended = false
    const onEnd = (endEvent?: PointerEvent) => {
      if (endEvent && endEvent.pointerId !== event.pointerId) return
      if (ended) return
      ended = true
      setDragging(false)
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId)
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      handle.removeEventListener('lostpointercapture', onEnd)
      cleanupDrag = undefined
    }
    cleanupDrag?.()
    cleanupDrag = onEnd
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    handle.addEventListener('lostpointercapture', onEnd)
  }

  const moveWithKeyboard = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Home') {
      if (floating()) {
        event.preventDefault()
        setRecorderOffset(null)
      }
      return
    }
    const delta = {
      ArrowLeft: { x: -KEYBOARD_MOVE_PX, y: 0 },
      ArrowRight: { x: KEYBOARD_MOVE_PX, y: 0 },
      ArrowUp: { x: 0, y: -KEYBOARD_MOVE_PX },
      ArrowDown: { x: 0, y: KEYBOARD_MOVE_PX },
    }[event.key]
    if (!delta) return
    const rect = barRef?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    const offset = recorderOffset() ?? { x: rect.left, y: rect.top }
    setRecorderOffset(clampIntoView(offset.x + delta.x, offset.y + delta.y))
  }

  const showLibrary = () =>
    libraryOpen() && !recorderCollapsed() && !isSessionRecording()

  const focusLibraryPanel = () => {
    queueMicrotask(() => {
      if (showLibrary()) libraryPanelRef?.focus()
    })
  }

  const openLibrary = () => {
    setLibraryMounted(true)
    setLibraryOpen(true)
    setRecorderCollapsed(false)
    focusLibraryPanel()
  }

  const setTransparencyOpen = (open: boolean) => {
    setShowOpacitySlider(open)
    if (open) {
      // The compact visual order keeps these controls before their trigger.
      // Move keyboard focus into the revealed group so Tab continues through
      // the controls and back to the Transparency button in DOM order.
      queueMicrotask(() => opacitySliderRef?.focus())
    }
  }

  const closeTransparency = () => {
    setShowOpacitySlider(false)
    queueMicrotask(() => transparencyButtonRef?.focus())
  }

  const replayFocusTarget = () => {
    const primary = panelsRef?.querySelector<HTMLButtonElement>(
      '[data-recorder-replay-primary]:not(:disabled)',
    )
    const close = panelsRef?.querySelector<HTMLButtonElement>(
      '[data-recorder-replay-close]',
    )
    return primary ?? close
  }

  const focusRecordingsButton = () => {
    queueMicrotask(() => {
      const idleTarget = recordingsButtonRef?.isConnected
        ? recordingsButtonRef
        : undefined
      const focusTarget = idleTarget ?? replayFocusTarget()
      focusTarget?.focus()
    })
  }

  const focusReplayTransport = () => {
    queueMicrotask(() => {
      replayFocusTarget()?.focus()
    })
  }

  const openReplay = (session: RecordedSession) => {
    props.onSessionChange(session)
    setLibraryOpen(false)
    focusReplayTransport()
  }

  return (
    <div
      class={styles.dock}
      data-replay-region="transport"
      role="region"
      aria-label="Step recorder"
      classList={{
        [styles.floating as string]: floating(),
        [styles.dragging as string]: dragging(),
      }}
      style={{
        '--recorder-opacity': `${opacity()}`,
        ...(floating()
          ? {
              left: `${recorderOffset()?.x ?? 0}px`,
              top: `${recorderOffset()?.y ?? 0}px`,
            }
          : {}),
      }}
    >
      <div
        ref={panelsRef}
        class={styles.panels}
        classList={{
          [styles.panelsBelow as string]: panelPlacement().below,
        }}
        style={{
          '--recorder-panels-x': `${panelPlacement().offsetX}px`,
          '--recorder-panels-max-height': `${panelPlacement().maxHeight}px`,
        }}
      >
        <Show when={props.session} keyed>
          {(session) => (
            <SessionReplayPanel
              session={session}
              target={props.target}
              compact={recorderCollapsed()}
              onExportVideo={props.onExportVideo}
              onSave={async (edited) => {
                // Saved as a NEW entry rather than overwriting: captions are an
                // authoring pass over a take, and the raw take is what you go
                // back to when a caption pass goes wrong.
                const name = `${
                  edited.initial.metadata?.name?.trim() || 'Recording'
                } (captioned)`
                setRecorderSavePending(true)
                try {
                  await storeSession(edited, name)
                  setLibraryRevision((n) => n + 1)
                  openLibrary()
                  showToast(`Saved "${name}" to Recordings`, 3500)
                } catch (error: unknown) {
                  console.warn(
                    '[recorder] could not save captioned session',
                    error,
                  )
                  showToast(
                    'Could not save captions locally — your caption edits are still open',
                    5000,
                  )
                  throw error
                } finally {
                  setRecorderSavePending(false)
                }
              }}
              onClose={() => {
                props.onSessionChange(undefined)
                focusRecordingsButton()
              }}
              onPlaybackChange={setReplayPlaying}
              onCurrentPreparationChange={setReplayPreparation}
              onPrepareAction={props.onPrepareAction}
              blocked={props.replayBlocked}
            />
          )}
        </Show>

        <Show when={libraryMounted()}>
          <SessionLibraryPanel
            revision={libraryRevision()}
            hidden={!showLibrary()}
            panelRef={(element) => {
              libraryPanelRef = element
            }}
            onReplay={openReplay}
            onClose={() => {
              setLibraryOpen(false)
              focusRecordingsButton()
            }}
          />
        </Show>
      </div>

      <div ref={barRef} class={styles.bar}>
        <button
          type="button"
          class={styles.grip}
          onPointerDown={startDrag}
          onKeyDown={moveWithKeyboard}
          onDblClick={() => {
            setRecorderOffset(null)
          }}
          title={
            floating()
              ? 'Drag or use arrow keys to move · double-click, Enter or Home to put it back'
              : 'Drag or use arrow keys to move the recorder anywhere'
          }
          aria-label="Move the recorder"
        >
          <span class={styles.gripDots} />
        </button>

        <Show when={props.session === undefined}>
          <SessionRecorderControls
            flameDescriptor={props.flameDescriptor}
            startExtras={props.startExtras}
            onRecordingStarted={props.onRecordingStarted}
            onOpenSession={openReplay}
            onSessionStored={() => {
              setLibraryRevision((n) => n + 1)
              openLibrary()
            }}
            libraryOpen={showLibrary()}
            recordingsButtonRef={(element) => {
              recordingsButtonRef = element
            }}
            onToggleLibrary={() => {
              if (showLibrary()) {
                setLibraryOpen(false)
              } else {
                openLibrary()
              }
            }}
            blocked={props.replayBlocked}
          />
        </Show>

        <div
          id="session-recorder-transparency-controls"
          class={styles.opacityControls}
          hidden={!showOpacitySlider()}
          role="group"
          aria-label="Transparency settings"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            closeTransparency()
          }}
        >
          <input
            ref={opacitySliderRef}
            class={styles.opacitySlider}
            type="range"
            min={MIN_RECORDER_OPACITY}
            max={1}
            step={0.05}
            value={clampRecorderOpacity(recorderOpacity())}
            onInput={(ev) => {
              setRecorderOpacity(Number(ev.currentTarget.value))
            }}
            title="Recorder opacity"
            aria-label="Recorder opacity"
          />
          <label
            class={styles.fadeToggle}
            title="Fade while the canvas is animating or exporting — hover the dock to bring it back"
          >
            <input
              type="checkbox"
              checked={recorderFadeOnPlayback()}
              onChange={(ev) => {
                setRecorderFadeOnPlayback(ev.currentTarget.checked)
              }}
            />
            fade
          </label>
        </div>

        <button
          ref={transparencyButtonRef}
          type="button"
          class={styles.iconButton}
          classList={{
            [styles.iconButtonActive as string]: showOpacitySlider(),
          }}
          onClick={() => {
            setTransparencyOpen(!showOpacitySlider())
          }}
          title="Transparency"
          aria-label="Transparency"
          aria-expanded={showOpacitySlider()}
          aria-controls="session-recorder-transparency-controls"
        >
          <CircleHalf class={styles.icon} aria-hidden="true" />
        </button>

        <button
          type="button"
          class={styles.iconButton}
          onClick={() => {
            setRecorderCollapsed((collapsed) => !collapsed)
          }}
          disabled={recorderExportPending()}
          title={
            recorderExportPending()
              ? 'Keep the replay panel visible while recording the interface'
              : recorderCollapsed()
                ? 'Show the replay steps and the recordings list'
                : 'Collapse to the pill (keeps the transport)'
          }
          aria-label={
            recorderCollapsed() ? 'Expand recorder' : 'Collapse recorder'
          }
        >
          <ChevronDown
            class={styles.icon}
            classList={{ [styles.chevronUp as string]: recorderCollapsed() }}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class={styles.iconButton}
          onClick={() => {
            setRecorderVisible(false)
          }}
          disabled={isSessionRecording() || recorderTaskPending()}
          title={
            isSessionRecording()
              ? 'Stop or discard the recording first'
              : recorderExportPending()
                ? 'Wait for the replay video recording to finish'
                : recorderSavePending()
                  ? 'Wait for the caption save to finish'
                  : 'Hide the recorder (bring it back from the toolbar)'
          }
          aria-label="Hide recorder"
        >
          <Cross class={styles.icon} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
