/**
 * The explorer's location as a signal, kept in step with the URL fragment,
 * and the explorer's undo stack (core `explorerHistory.ts`) beside it.
 *
 * Two histories, two walks. Back and Forward walk the places you jumped to;
 * Undo and Redo walk every step.
 *
 * - A continuous move or a colour change (`update`) is written to the
 *   fragment once it rests (250 ms, debounced, with `replaceState`), so the
 *   browser's history never fills with drags. The same rest makes it one
 *   undo step.
 * - A discrete jump (`jump`: a dropped picture, Home, a mode switch, the
 *   Julia set of the view centre) is an undo step at once and a browser
 *   entry at once (`pushState`). The place being left is written into its
 *   own entry first, a drag not yet written included, so Back returns to
 *   exactly where the jump began.
 * - A history navigation (Back, Forward, a followed or hand-edited link)
 *   fires `popstate`, then `hashchange`; it is handled once. When the place
 *   it lands on is an entry of the undo stack, the stack moves there as
 *   repeated undo or redo would, and records nothing. Otherwise it is a
 *   followed link: a jump, with the entry the browser already made.
 * - Undo and redo push and pop no browser entries. They show a step, and the
 *   fragment of the current entry follows on the next rest.
 *
 * Back from the first entry leaves the explorer, as on any page.
 */
import { canRedoExplorer, canUndoExplorer, createExplorerHistory, formatExplorerHash, jumpExplorerHistory, parseExplorerHash, redoExplorerHistory, seekExplorerHistory, settleExplorerHistory, undoExplorerHistory, } from '@chaos-master/core'
import { batch, createEffect, createMemo, createSignal, onCleanup, } from 'solid-js'
import type { ExplorerHistory, ExplorerLocation } from '@chaos-master/core'

const WRITE_DELAY_MS = 250

export function createExplorerLocation() {
  const initial = parseExplorerHash(window.location.hash)
  const [location, setLocation] = createSignal<ExplorerLocation>(initial)
  const [history, setHistory] = createSignal<ExplorerHistory>(
    createExplorerHistory(initial),
  )
  /** The fragment the current browser entry holds, as this page last saw it. */
  let written = formatExplorerHash(initial)
  /** The rest still pending, if any. */
  let timer: ReturnType<typeof setTimeout> | undefined

  function writeFragment(fragment: string, entry: 'push' | 'replace') {
    written = fragment
    const { pathname, search } = window.location
    const url = `${pathname}${search}${fragment}`
    if (entry === 'push') window.history.pushState(null, '', url)
    else window.history.replaceState(window.history.state, '', url)
  }

  /**
   * `current` has come to rest: a step for the undo stack, and the fragment
   * of the current entry. The undo stack hears every rest, even one back
   * where the URL already is: a drag that ends where a jump not yet written
   * began is still a step.
   */
  function rest(current: ExplorerLocation) {
    clearTimeout(timer)
    timer = undefined
    setHistory((h) => settleExplorerHistory(h, current))
    const fragment = formatExplorerHash(current)
    if (fragment !== written) writeFragment(fragment, 'replace')
  }

  createEffect(() => {
    const current = location()
    // A rest still pending is stale: superseded by this one.
    clearTimeout(timer)
    timer = setTimeout(() => {
      rest(current)
    }, WRITE_DELAY_MS)
  })

  /**
   * Shows `next` as an undo step and a browser entry of its own. A move
   * still pending rests first, so the entry being left keeps it.
   */
  function jump(next: ExplorerLocation) {
    if (timer !== undefined) rest(location())
    batch(() => {
      setHistory((h) => jumpExplorerHistory(h, location(), next))
      setLocation(next)
    })
    const fragment = formatExplorerHash(next)
    if (fragment !== written) writeFragment(fragment, 'push')
  }

  /** Back, Forward, or a followed link: the browser has moved already. */
  const onNavigate = () => {
    const landed = window.location.hash
    // The hashchange after a popstate already handled, or an entry that
    // holds the place on screen.
    if (landed === written) return
    // The entry a pending rest belonged to is no longer the current one.
    clearTimeout(timer)
    timer = undefined
    written = landed
    const target = parseExplorerHash(landed)
    const sought = seekExplorerHistory(history(), location(), target)
    batch(() => {
      if (sought === undefined) {
        setHistory((h) => jumpExplorerHistory(h, location(), target))
        setLocation(target)
      } else {
        setHistory(sought)
        setLocation(sought.present)
      }
    })
  }
  window.addEventListener('popstate', onNavigate)
  window.addEventListener('hashchange', onNavigate)
  onCleanup(() => {
    clearTimeout(timer)
    window.removeEventListener('popstate', onNavigate)
    window.removeEventListener('hashchange', onNavigate)
  })

  /** A continuous move or a colour change: recorded when it settles. */
  function update(patch: Partial<ExplorerLocation>) {
    setLocation((current) => ({ ...current, ...patch }))
  }

  function show(next: ExplorerHistory | undefined) {
    if (next === undefined) return
    batch(() => {
      setHistory(next)
      setLocation(next.present)
    })
  }

  // Read on every pan for the buttons; a memo each, so a pan that changes
  // neither answer does not reach them.
  const canUndo = createMemo(() => canUndoExplorer(history(), location()))
  const canRedo = createMemo(() => canRedoExplorer(history(), location()))

  /** The shareable URL of the current location, written or not. */
  function link(): string {
    const { origin, pathname } = window.location
    return `${origin}${pathname}${formatExplorerHash(location())}`
  }

  return {
    location,
    update,
    jump,
    undo: () => {
      show(undoExplorerHistory(history(), location()))
    },
    redo: () => {
      show(redoExplorerHistory(history(), location()))
    },
    canUndo,
    canRedo,
    link,
  }
}
