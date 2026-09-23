/**
 * The screen lock's key gate: while the pilot owns the keyboard, no key
 * listener of the page hears a key.
 *
 * The shield (components/Arcade/topLayer.ts, holdKeys) stops a key on its way
 * up, which a capture listener above it never waits for: the camera's, on
 * window, panned under the lock (#110), and every listener had to ask
 * `pilotOwnsKeyboard()` itself. The gate is one window listener in the capture
 * phase, added at boot (index.tsx) before any other key listener, so it hears
 * every key first and can stop it before anything else runs.
 *
 * Under the lock it passes two things:
 * - the theme chord, which the shield then hands to `document` as a copy
 *   (maff's call: the theme stays the viewer's);
 * - a key's default action, since it only stops propagation: Tab still moves
 *   the focus to Stop, and Enter or Space on Stop still presses it.
 * And it hands every keydown it swallows to the lock's own listener
 * (`hearLockedKeys`), which is how the pilot's Esc-twice hears Escape ahead
 * of every listener of the page.
 *
 * A press belongs to whoever heard it go down. A key the page heard go down
 * before the lock is released to the page as the lock starts, as a blur
 * would, so a camera moving on it stops there; a key that went down under the
 * lock stays the lock's until it comes up, its repeats and their defaults
 * included, so an Escape held past the end of a take does not also dismiss
 * the end card. With no lock and no such key, the gate does nothing at all.
 */
import { createEffect, createRoot, on } from 'solid-js'
import { pilotOwnsKeyboard } from './pilot'

const KEY_EVENTS = ['keydown', 'keyup', 'keypress'] as const

/**
 * Ctrl/Cmd+D, the theme toggle. The toggle, the shield and the gate all ask
 * this one question, so the key the lock lets through is exactly the key that
 * toggles the theme.
 */
export function isThemeChord(ev: KeyboardEvent): boolean {
  return ev.code === 'KeyD' && (ev.ctrlKey || ev.metaKey)
}

type LockedKeydown = (ev: KeyboardEvent) => void

let lockListener: LockedKeydown | undefined

/**
 * While the pilot owns the keyboard, `listener` hears every keydown the gate
 * swallows, before any listener of the page could. One at a time: the pilot's
 * Esc-twice.
 *
 * @returns the release.
 */
export function hearLockedKeys(listener: LockedKeydown): () => void {
  lockListener = listener
  return () => {
    if (lockListener === listener) lockListener = undefined
  }
}

const pressOf = (ev: KeyboardEvent): KeyboardEventInit => ({
  key: ev.key,
  code: ev.code,
  location: ev.location,
  ctrlKey: ev.ctrlKey,
  shiftKey: ev.shiftKey,
  altKey: ev.altKey,
  metaKey: ev.metaKey,
})

let uninstall: (() => void) | undefined

/**
 * Add the gate to `window`. Boot calls it first, before any other key
 * listener exists; a second call adds nothing.
 *
 * @returns the removal, for tests.
 */
export function installLockKeyGate(): () => void {
  if (uninstall) return uninstall

  /** Keys the page heard go down and not yet up, by code. */
  const pageHolds = new Map<string, KeyboardEventInit>()
  /** Keys that went down under the lock and are not yet up. */
  const lockHolds = new Set<string>()
  /** The keyups the gate hands the page itself. */
  const releases = new WeakSet<Event>()

  const releasePageHolds = () => {
    const held = [...pageHolds.values()]
    pageHolds.clear()
    for (const press of held) {
      const up = new KeyboardEvent('keyup', {
        ...press,
        bubbles: true,
        cancelable: true,
      })
      releases.add(up)
      document.dispatchEvent(up)
    }
  }

  const underLock = (ev: KeyboardEvent) => {
    if (isThemeChord(ev)) return
    ev.stopImmediatePropagation()
    if (ev.type === 'keyup') {
      lockHolds.delete(ev.code)
      return
    }
    if (ev.type !== 'keydown') return
    lockHolds.add(ev.code)
    lockListener?.(ev)
  }

  const gate = (event: Event) => {
    const ev = event as KeyboardEvent
    if (releases.has(ev)) return
    if (pilotOwnsKeyboard()) {
      underLock(ev)
      return
    }
    if (lockHolds.has(ev.code)) {
      // A new press (not a repeat) means its keyup was missed: it is the
      // page's again.
      if (ev.type === 'keydown' && !ev.repeat) {
        lockHolds.delete(ev.code)
      } else {
        // Its default too: a repeated Escape is a close request on the end
        // card that follows the lock.
        if (ev.type === 'keyup') lockHolds.delete(ev.code)
        ev.stopImmediatePropagation()
        ev.preventDefault()
        return
      }
    }
    if (ev.type === 'keydown') pageHolds.set(ev.code, pressOf(ev))
    else if (ev.type === 'keyup') pageHolds.delete(ev.code)
  }

  // No keyup comes for a key released while the window had no focus.
  const forget = () => {
    pageHolds.clear()
    lockHolds.clear()
  }

  for (const type of KEY_EVENTS) window.addEventListener(type, gate, true)
  window.addEventListener('blur', forget)
  const dispose = createRoot((dispose) => {
    createEffect(
      on(pilotOwnsKeyboard, (owns) => {
        if (owns) releasePageHolds()
      }),
    )
    return dispose
  })

  uninstall = () => {
    for (const type of KEY_EVENTS) window.removeEventListener(type, gate, true)
    window.removeEventListener('blur', forget)
    dispose()
    uninstall = undefined
  }
  return uninstall
}
