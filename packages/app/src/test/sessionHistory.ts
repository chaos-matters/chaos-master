/**
 * The browser's list of history entries for this document, for a test that
 * drives Back and Forward.
 *
 * happy-dom does not traverse history the way a browser does, so this stands
 * in for it: it watches the page's own pushState and replaceState (spies,
 * undone by `vi.restoreAllMocks()`), and Back, Forward and a followed link
 * move the URL first and then fire popstate, then hashchange when the
 * fragment changed, as a browser does. Only the fragment is tracked; the
 * path stays `path`.
 */
import { vi } from 'vitest'

type Url = string | URL | null | undefined

export function sessionHistory(path: string) {
  const realPush = History.prototype.pushState.bind(window.history)
  const realReplace = History.prototype.replaceState.bind(window.history)
  const entries = [window.location.hash]
  let index = 0
  const push = vi
    .spyOn(window.history, 'pushState')
    .mockImplementation((state: unknown, unused: string, url?: Url) => {
      realPush(state, unused, url)
      entries.splice(index + 1, Infinity, window.location.hash)
      index += 1
    })
  vi.spyOn(window.history, 'replaceState').mockImplementation(
    (state: unknown, unused: string, url?: Url) => {
      realReplace(state, unused, url)
      entries[index] = window.location.hash
    },
  )
  const arrive = (fragment: string) => {
    const left = window.location.hash
    realReplace(null, '', `${path}${fragment}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
    if (fragment !== left) {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    }
  }
  const go = (delta: number) => {
    const next = index + delta
    if (next < 0 || next >= entries.length) {
      throw new Error(`no history entry ${String(delta)} from ${String(index)}`)
    }
    index = next
    arrive(entries[index] ?? '')
  }
  return {
    /** Each entry's fragment, oldest first. */
    entries: () => [...entries],
    /** Which entry the tab is on. */
    index: () => index,
    /** How many entries the page pushed itself. */
    pushes: () => push.mock.calls.length,
    back: () => {
      go(-1)
    },
    forward: () => {
      go(1)
    },
    /** A link followed in this tab: the browser makes the entry. */
    follow: (hash: string) => {
      entries.splice(index + 1, Infinity, hash)
      index += 1
      arrive(hash)
    },
  }
}
