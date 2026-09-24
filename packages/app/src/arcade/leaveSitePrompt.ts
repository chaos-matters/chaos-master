/**
 * While an agent's take records, leaving or reloading the page asks first.
 *
 * A reload, closing the tab, or a jump from the browser's history menu to
 * another page ends the take and loses its recording: the recorder keeps it
 * in memory until the take ends and is saved. So while a take records, a
 * `beforeunload` listener asks for the browser's own "Leave site?" prompt,
 * and at any other time there is no listener at all. The browser shows the
 * prompt only once the page has had a user gesture, and words it itself.
 *
 * "Records" is the pilot's `driving` phase, whatever the lock: a lesson or a
 * Cinema take under the screen lock, and a duel under a seat lock, which
 * records both seats. The recorder stops in the same tick the pilot leaves
 * `driving` (arcade/pilotActions.ts, arcade/duelActions.ts), so every way a
 * take ends, stopped, finished, saved or failed, takes the listener with it.
 */
import { createEffect, createRoot, onCleanup } from 'solid-js'
import { agentDriving } from './pilot'

/** Ask for the prompt: preventDefault for the spec, returnValue for the
 *  browsers that still read it (older Chrome, and Safari). */
function askFirst(ev: BeforeUnloadEvent): void {
  ev.preventDefault()
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- the legacy way some browsers still need
  ev.returnValue = 'An agent’s take is recording.'
}

let uninstall: (() => void) | undefined

/**
 * Keep the listener on `window` exactly while a take records. Boot calls it
 * once; a second call adds nothing.
 *
 * @returns the removal, for tests.
 */
export function installLeaveSitePrompt(): () => void {
  if (uninstall) return uninstall
  const dispose = createRoot((dispose) => {
    createEffect(() => {
      if (!agentDriving()) return
      window.addEventListener('beforeunload', askFirst)
      onCleanup(() => {
        window.removeEventListener('beforeunload', askFirst)
      })
    })
    return dispose
  })
  uninstall = () => {
    dispose()
    uninstall = undefined
  }
  return uninstall
}
