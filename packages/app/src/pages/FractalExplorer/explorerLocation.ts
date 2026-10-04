/**
 * The explorer's location as a signal, kept in step with the URL fragment:
 * every change is written back (debounced, with `replaceState`, so history
 * does not fill with every drag), and editing the fragment by hand, or
 * following a pasted link, moves the view.
 *
 * It also keeps the undo stack (core `explorerHistory.ts`). A continuous
 * move (`update`) becomes one entry when it settles, on the same 250 ms rest
 * that writes the fragment; a discrete jump (`jump`, and a followed link) is
 * an entry at once. Undo and redo show an entry without recording one.
 */
import { canRedoExplorer, canUndoExplorer, createExplorerHistory, formatExplorerHash, jumpExplorerHistory, parseExplorerHash, redoExplorerHistory, settleExplorerHistory, undoExplorerHistory, } from '@chaos-master/core'
import { batch, createEffect, createMemo, createSignal, onCleanup, } from 'solid-js'
import type { ExplorerHistory, ExplorerLocation } from '@chaos-master/core'

const WRITE_DELAY_MS = 250

export function createExplorerLocation() {
  const initial = parseExplorerHash(window.location.hash)
  const [location, setLocation] = createSignal<ExplorerLocation>(initial)
  const [history, setHistory] = createSignal<ExplorerHistory>(
    createExplorerHistory(initial),
  )
  let written = formatExplorerHash(initial)
  let timer: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const current = location()
    const fragment = formatExplorerHash(current)
    // A rest still pending is stale: superseded by the one below.
    clearTimeout(timer)
    timer = setTimeout(() => {
      // The undo stack hears every rest, even one back where the URL
      // already is: a drag that ends where a jump not yet written began is
      // still a step.
      setHistory((h) => settleExplorerHistory(h, current))
      if (fragment === written) return
      written = fragment
      const { pathname, search } = window.location
      window.history.replaceState(
        window.history.state,
        '',
        `${pathname}${search}${fragment}`,
      )
    }, WRITE_DELAY_MS)
  })

  /** Shows `next` as an entry of its own, after any move still pending. */
  function jump(next: ExplorerLocation) {
    batch(() => {
      setHistory((h) => jumpExplorerHistory(h, location(), next))
      setLocation(next)
    })
  }

  const onHashChange = () => {
    if (window.location.hash === written) return
    // The link that was followed wins over a drag not yet written.
    clearTimeout(timer)
    const next = parseExplorerHash(window.location.hash)
    written = formatExplorerHash(next)
    jump(next)
  }
  window.addEventListener('hashchange', onHashChange)
  onCleanup(() => {
    clearTimeout(timer)
    window.removeEventListener('hashchange', onHashChange)
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
