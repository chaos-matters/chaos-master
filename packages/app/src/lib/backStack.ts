import { createEffect, createSignal, onCleanup } from 'solid-js'

interface BackEntry {
  readonly handler: () => void
  readonly label: string
}

/**
 * One registry for "back". The Android back gesture and the iOS edge swipe
 * pop it - lib/lifecycle.ts and components/Home/edgeSwipe.ts are popBack's
 * only two callers. A sheet's downward drag does not: it settles its own
 * detent directly. Every layer that can be dismissed pushes itself while it
 * is open: a modal, the drawer, the top bar's menu, the rail's detents, Home
 * over the editor. The order is the order things
 * opened, so the newest layer answers first. When the stack is empty the
 * app minimises (lib/lifecycle.ts); nothing here ever calls history.back(),
 * because the tab switches use replaceState and "back" must leave the app,
 * not retrace which tab you looked at.
 */
const [entries, setEntries] = createSignal<readonly BackEntry[]>([])

export const backDepth = () => entries().length
export const backLabels = () => entries().map((entry) => entry.label)

export function pushBackHandler(
  handler: () => void,
  label: string,
): () => void {
  const entry: BackEntry = { handler, label }
  setEntries((list) => [...list, entry])
  return () => {
    setEntries((list) => list.filter((candidate) => candidate !== entry))
  }
}

/**
 * Registers `handler` for as long as `when()` is true, and removes it again
 * when it is not. Every dismissible layer wants exactly this, and wrote it by
 * hand eight times.
 *
 * The condition is deliberately "open or not" and never the layer's inner
 * state: a sheet that changes detent, or a menu that changes its items, must
 * not re-push itself above whatever opened over it in the meantime.
 */
export function createBackLayer(
  when: () => boolean,
  handler: () => void,
  label: string,
): void {
  createEffect(() => {
    if (!when()) return
    onCleanup(pushBackHandler(handler, label))
  })
}

const holds = new Set<object>()

/** Back does nothing until the returned release: nothing closes and the app
 *  does not minimise. The Arcade's screen lock holds it while the agent
 *  drives, over layers opened before it and during the take alike. */
export function holdBack(): () => void {
  const hold = {}
  holds.add(hold)
  return () => holds.delete(hold)
}

/** Runs the top handler. False when there was nothing to pop. */
export function popBack(): boolean {
  if (holds.size > 0) return true
  const top = entries().at(-1)
  if (!top) return false
  top.handler()
  return true
}
