import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useToast } from '@/contexts/ToastContext'
import { ChevronDown, CircleHalf, Cross } from '@/icons'
import { isSessionRecording } from '@/recorder/recorder'
import { storeSession } from '@/utils/sessionsDB'
import { clampRecorderOpacity, FADED_RECORDER_OPACITY, MIN_RECORDER_OPACITY, recorderCollapsed, recorderFadeOnPlayback, recorderOffset, recorderOpacity, recorderSavePending, setRecorderCollapsed, setRecorderFadeOnPlayback, setRecorderOffset, setRecorderOpacity, setRecorderSavePending, setRecorderVisible, } from './recorderUi'
import { SessionLibraryPanel } from './SessionLibraryPanel'
import { SessionRecorderControls } from './SessionRecorderControls'
import styles from './SessionRecorderDock.module.css'
import { SessionReplayPanel } from './SessionReplayPanel'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SessionStartExtras } from '@/recorder/recorder'
import type { ReplayTarget } from '@/recorder/replay'
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

/** How much of the dock must stay inside the viewport while dragging, so a
 *  drag can never put the grip out of reach. */
const KEEP_ON_SCREEN_PX = 56

/** Pointer travel before a press on the grip counts as a drag. */
const DRAG_THRESHOLD_PX = 4

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
  /** True while the canvas is animating or exporting — the cue to fade. */
  busy: boolean
}) {
  const { showToast } = useToast()
  const [libraryOpen, setLibraryOpen] = createSignal(false)
  const [libraryRevision, setLibraryRevision] = createSignal(0)
  const [showOpacitySlider, setShowOpacitySlider] = createSignal(false)
  const [dragging, setDragging] = createSignal(false)

  let dockRef: HTMLDivElement | undefined

  const floating = () => recorderOffset() !== null

  const opacity = () => {
    const resting = clampRecorderOpacity(recorderOpacity())
    // Never fade what the user is currently moving.
    if (dragging()) return 1
    return props.busy && recorderFadeOnPlayback()
      ? Math.min(resting, FADED_RECORDER_OPACITY)
      : resting
  }

  function clampIntoView(x: number, y: number) {
    const width = dockRef?.offsetWidth ?? 0
    const height = dockRef?.offsetHeight ?? 0
    return {
      x: Math.max(
        KEEP_ON_SCREEN_PX - width,
        Math.min(window.innerWidth - KEEP_ON_SCREEN_PX, x),
      ),
      y: Math.max(
        0,
        Math.min(window.innerHeight - Math.min(height, KEEP_ON_SCREEN_PX), y),
      ),
    }
  }

  // A dock parked near the right edge of a wide window would be off-screen in
  // a narrow one, with no grip left to drag it back.
  const reclamp = () => {
    const offset = recorderOffset()
    if (offset) setRecorderOffset(clampIntoView(offset.x, offset.y))
  }
  onMount(reclamp)
  window.addEventListener('resize', reclamp)
  onCleanup(() => {
    window.removeEventListener('resize', reclamp)
  })

  function startDrag(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const rect = dockRef?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    // Grab-point relative to the dock, so it does not jump under the cursor
    // on the first move — including the very first drag, which is also the
    // moment the dock leaves the bottom bar's flow for fixed positioning.
    const grabX = event.clientX - rect.left
    const grabY = event.clientY - rect.top
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    setDragging(true)

    let started = false
    const onMove = (moveEvent: PointerEvent) => {
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
    const onEnd = () => {
      setDragging(false)
      handle.releasePointerCapture(event.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  return (
    <div
      ref={dockRef}
      class={styles.dock}
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
      <Show when={props.session} keyed>
        {(session) => (
          <SessionReplayPanel
            session={session}
            target={props.target}
            compact={recorderCollapsed()}
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
                setLibraryOpen(true)
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
            }}
          />
        )}
      </Show>

      <Show
        when={libraryOpen() && !recorderCollapsed() && !isSessionRecording()}
      >
        <SessionLibraryPanel
          revision={libraryRevision()}
          onReplay={(session) => {
            props.onSessionChange(session)
            setLibraryOpen(false)
          }}
          onClose={() => {
            setLibraryOpen(false)
          }}
        />
      </Show>

      <div class={styles.bar}>
        <button
          type="button"
          class={styles.grip}
          onPointerDown={startDrag}
          onDblClick={() => {
            setRecorderOffset(null)
          }}
          title={
            floating()
              ? 'Drag to move · double-click to put it back in the bottom bar'
              : 'Drag to move the recorder anywhere'
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
            onOpenSession={props.onSessionChange}
            onSessionStored={() => {
              setLibraryRevision((n) => n + 1)
              setLibraryOpen(true)
              setRecorderCollapsed(false)
            }}
            onToggleLibrary={() => {
              setLibraryOpen((open) => !open)
              setRecorderCollapsed(false)
            }}
          />
        </Show>

        <Show when={showOpacitySlider()}>
          <input
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
        </Show>

        <button
          type="button"
          class={styles.iconButton}
          classList={{
            [styles.iconButtonActive as string]: showOpacitySlider(),
          }}
          onClick={() => {
            setShowOpacitySlider((shown) => !shown)
          }}
          title="Transparency"
          aria-label="Transparency"
        >
          <CircleHalf class={styles.icon} aria-hidden="true" />
        </button>

        <button
          type="button"
          class={styles.iconButton}
          onClick={() => {
            setRecorderCollapsed((collapsed) => !collapsed)
          }}
          title={
            recorderCollapsed()
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
          disabled={isSessionRecording() || recorderSavePending()}
          title={
            isSessionRecording()
              ? 'Stop or discard the recording first'
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
