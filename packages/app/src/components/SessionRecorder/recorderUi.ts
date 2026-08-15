import { createSignal } from 'solid-js'
import { persistentSignal } from '@/utils/persistentSignal'

/**
 * Chrome state for the recorder dock — where it sits, how visible it is, and
 * whether its panels are expanded.
 *
 * Module-level (and persisted) rather than owned by MainWorkspace because the
 * FloatingActions toolbar toggles visibility from the other side of the tree,
 * and because a dock the user has parked somewhere should still be there after
 * a reload. Same shape as the rest of the app's UI preferences.
 */

/** Caption persistence is transient UI state, never a saved preference. It is
 * shared because both the dock and the floating toolbar can hide the panel. */
export const [recorderSavePending, setRecorderSavePending] = createSignal(false)

/** Whether the dock is mounted at all. The toolbar's recorder toggle. */
const [recorderVisibleValue, setRecorderVisibleValue] = persistentSignal(
  'recorder/visible',
  true,
)

export const recorderVisible = recorderVisibleValue

/** Keep the local caption draft mounted until its store attempt settles. */
export function setRecorderVisible(visible: boolean): void {
  if (!visible && recorderSavePending()) return
  setRecorderVisibleValue(visible)
}

/**
 * Collapsed = the pill only, without the replay step list and the library.
 * Those are what make the dock tall once a session is loaded, and the pill
 * still carries the transport, so collapsing costs nothing but height.
 */
export const [recorderCollapsed, setRecorderCollapsed] = persistentSignal(
  'recorder/collapsed',
  false,
)

/** Resting opacity, 0.2–1. */
export const [recorderOpacity, setRecorderOpacity] = persistentSignal(
  'recorder/opacity',
  1,
)

/** Fade the dock while the canvas is animating or exporting, so it stays out
 *  of the shot. Hovering or focusing it brings it back (see the CSS). */
export const [recorderFadeOnPlayback, setRecorderFadeOnPlayback] =
  persistentSignal('recorder/fade-on-playback', true)

/**
 * Viewport position once the user has dragged the dock out of the bottom bar.
 * `null` means "still docked", which is the default and the layout the bar was
 * designed for — dragging is opt-in, and double-clicking the grip returns it.
 */
export const [recorderOffset, setRecorderOffset] = persistentSignal<{
  x: number
  y: number
} | null>('recorder/offset', null)

/**
 * The follow-cam: during a replay, spotlight the control each step touches and
 * caption the action (docs/channel-content-plan.md §7).
 *
 * A mode, not a behaviour — nobody wants their editor dimming itself while
 * they work, and a viewer who just wants the flame back can switch it off
 * mid-replay. On by default because a replay nobody can follow is the problem
 * it exists to solve.
 */
export const [followCamEnabled, setFollowCamEnabled] = persistentSignal(
  'recorder/follow-cam',
  true,
)

export const MIN_RECORDER_OPACITY = 0.2

/** Opacity while the canvas is animating, when fading is on. Low enough to
 *  stay out of a recording, high enough to still be findable. */
export const FADED_RECORDER_OPACITY = 0.25

/** localStorage is user-writable and a NaN or 0 here would make the dock
 *  invisible with no way back, so the stored value is clamped on read. */
export function clampRecorderOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(MIN_RECORDER_OPACITY, value))
}
