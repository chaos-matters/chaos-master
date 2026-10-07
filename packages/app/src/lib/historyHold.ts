/**
 * Hold the browser's history: while held, no history navigation changes the
 * view, and the address bar is put back to match the screen.
 *
 * The view lives in the URL fragment (lib/activeTab.ts), so Back and Forward,
 * a mouse's back button, the iOS edge swipe on the web, Alt+Left and a
 * fragment typed into the address bar all used to change it. The Arcade's
 * screen lock holds it while the agent drives, and its end card after it, as
 * holdBack (lib/backStack.ts) holds the native back button.
 *
 * How: the first hold pushes one guard entry, the current URL again. A Back
 * lands on the entry before it, in this same document, and is answered by
 * pushing the guard again, which drops the old one: however often Back is
 * pressed, history does not grow, and there is never anything to go Forward
 * to. A fragment navigation becomes the guard in place, so it adds only the
 * one entry the browser already made. Either way the fragment is
 * the one the view stands for, and the `hashchange` that follows reaches no
 * listener of the app. When the last hold goes, the guard is taken off with
 * one Back of the app's own, and the entry it lands on is given the view's
 * URL, so the page stays where it is and Back works as it did before.
 *
 * What cannot be held: a navigation to another document (another page, or a
 * history jump past the entries of this one) unloads the page. A single Back
 * never gets there, because the guard is in the way.
 */
import { shownFragment } from './activeTab'

const GUARD = 'historyHold'

type Hold = { readonly onBack: () => void }

const holds: Hold[] = []
/** Marks this hold's guard entry; undefined while nothing is held. */
let guardId: string | undefined
/** The path and query the view has; a fragment navigation keeps them. */
let path = ''
/** How long history was with the guard on top. */
let guardLength = 0
/** The Back that takes the guard off is on its way. */
let unwinding = false
let listening = false

const screenURL = () => `${path}${shownFragment()}`
const currentURL = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`

function isGuard(state: unknown): boolean {
  return (
    guardId !== undefined &&
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[GUARD] === guardId
  )
}

function guardState(): Record<string, unknown> {
  const state: unknown = history.state
  return {
    ...(typeof state === 'object' && state !== null ? state : {}),
    [GUARD]: guardId,
  }
}

/**
 * Put the address bar back and stay on (or return to) the guard. A new entry
 * (a fragment navigation, which made history longer) becomes the guard in
 * place; an older one (Back) gets the guard pushed after it again.
 */
function holdTheView(): void {
  if (isGuard(history.state)) {
    history.replaceState(history.state, '', screenURL())
  } else if (history.length > guardLength) {
    history.replaceState(guardState(), '', screenURL())
  } else {
    history.pushState(guardState(), '', screenURL())
  }
  guardLength = history.length
  holds.at(-1)?.onBack()
}

function onPopState(): void {
  if (holds.length > 0) {
    holdTheView()
    return
  }
  if (!unwinding) return
  unwinding = false
  history.replaceState(history.state, '', screenURL())
}

function onHashChange(ev: Event): void {
  if (holds.length === 0) return
  ev.stopImmediatePropagation()
  // A browser that fired no popstate for it: hold it here instead.
  if (currentURL() !== screenURL()) holdTheView()
}

function listen(): void {
  if (listening) return
  listening = true
  window.addEventListener('popstate', onPopState)
  // Capture, so it runs before the app's own hashchange listeners.
  window.addEventListener('hashchange', onHashChange, true)
}

/**
 * Hold history until the returned release. `onBack` runs on each navigation
 * held while this is the newest hold: the end card closes on one, as it does
 * on Back everywhere else.
 */
export function holdHistory(onBack: () => void = () => {}): () => void {
  listen()
  const hold: Hold = { onBack }
  holds.push(hold)
  if (guardId === undefined) {
    unwinding = false
    guardId = Math.random().toString(36).slice(2)
    path = `${window.location.pathname}${window.location.search}`
    history.pushState(guardState(), '', screenURL())
    guardLength = history.length
  }
  return () => {
    const index = holds.indexOf(hold)
    if (index !== -1) holds.splice(index, 1)
    if (holds.length > 0) return
    // A hold that hands over to the next one in the same update (the lock
    // to its end card) keeps the guard where it is.
    queueMicrotask(() => {
      if (holds.length > 0 || guardId === undefined) return
      const onGuard = isGuard(history.state)
      guardId = undefined
      if (!onGuard) return
      unwinding = true
      history.back()
    })
  }
}
