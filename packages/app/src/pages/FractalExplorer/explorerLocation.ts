/**
 * The explorer's location as a signal, kept in step with the URL fragment:
 * every change is written back (debounced, with `replaceState`, so history
 * does not fill with every drag), and editing the fragment by hand, or
 * following a pasted link, moves the view.
 */
import { formatExplorerHash, parseExplorerHash } from '@chaos-master/core'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import type { ExplorerLocation } from '@chaos-master/core'

const WRITE_DELAY_MS = 250

export function createExplorerLocation() {
  const initial = parseExplorerHash(window.location.hash)
  const [location, setLocation] = createSignal<ExplorerLocation>(initial)
  let written = formatExplorerHash(initial)
  let timer: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const fragment = formatExplorerHash(location())
    // A write still pending is stale either way: back where the URL already
    // is, or superseded by the fragment below.
    clearTimeout(timer)
    if (fragment === written) return
    timer = setTimeout(() => {
      written = fragment
      const { pathname, search } = window.location
      window.history.replaceState(
        window.history.state,
        '',
        `${pathname}${search}${fragment}`,
      )
    }, WRITE_DELAY_MS)
  })

  const onHashChange = () => {
    if (window.location.hash === written) return
    // The link that was followed wins over a drag not yet written.
    clearTimeout(timer)
    const next = parseExplorerHash(window.location.hash)
    written = formatExplorerHash(next)
    setLocation(next)
  }
  window.addEventListener('hashchange', onHashChange)
  onCleanup(() => {
    clearTimeout(timer)
    window.removeEventListener('hashchange', onHashChange)
  })

  function update(patch: Partial<ExplorerLocation>) {
    setLocation((current) => ({ ...current, ...patch }))
  }

  /** The shareable URL of the current location, written or not. */
  function link(): string {
    const { origin, pathname } = window.location
    return `${origin}${pathname}${formatExplorerHash(location())}`
  }

  return { location, update, link }
}
