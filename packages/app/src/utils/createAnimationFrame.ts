import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

// A hold promise (e.g. device.queue.onSubmittedWorkDone) that neither resolves
// nor rejects within this window is treated as stuck and its frame slot is
// released, so the rAF loop can never stall permanently. Set far above any real
// frame time — an interactive tick submits a bounded amount of work and settles
// in milliseconds — so this only fires on a genuinely wedged GPU queue (seen on
// iOS Safari, where onSubmittedWorkDone can hang on an idle queue or reject
// during visibility/device transitions).
const HOLD_TIMEOUT_MS = 2000

export function createAnimationFrame(
  fn: (frameId: number) => void,
  minDeltaTime: number | Accessor<number> = 0,
  hold?: () => Promise<void>,
  /** While true, the rAF loop is torn down (another driver owns the ticks). */
  paused?: Accessor<boolean>,
) {
  let lastTime = 0

  createEffect(() => {
    if (paused?.()) {
      return
    }
    let frameId: number
    let disposed = false
    const framesPending = new Set<number>()

    // Throttled diagnostics for stuck holds. A wedged GPU queue can reject or
    // hang on every frame; log the first occurrence and then only every 60th so
    // a persistent fault surfaces once without flooding the console (console
    // spam being one of the symptoms this loop is meant to avoid).
    let holdStalls = 0

    function reportHoldStall(reason: 'rejected' | 'timeout', err?: unknown) {
      holdStalls += 1
      if (holdStalls === 1 || holdStalls % 60 === 0) {
        console.warn(
          `[createAnimationFrame] hold ${reason} (${holdStalls} total) — ` +
            'released frame slot to keep the render loop alive',
          reason === 'rejected' ? err : `no settle within ${HOLD_TIMEOUT_MS}ms`,
        )
      }
    }

    function getDeltaTime(): number {
      return typeof minDeltaTime === 'number' ? minDeltaTime : minDeltaTime()
    }

    function run(time: number) {
      if (disposed) return
      const framesNotPending = framesPending.size <= 2
      const passedEnoughTime = time - lastTime >= getDeltaTime()
      if (framesNotPending && (lastTime === 0 || passedEnoughTime)) {
        lastTime = time
        fn(frameId)
        if (hold) {
          framesPending.add(time)
          // Release the slot exactly once — whichever comes first: the hold
          // settles (resolve OR reject) or the timeout fires. Leaving the entry
          // in framesPending on a rejected or hung hold lets the set fill to its
          // cap of 3 and stall the loop permanently, which was the root bug: a
          // `.catch()` only handled rejection, and nothing handled a hold that
          // never settles at all.
          let released = false
          const release = (reason?: 'rejected' | 'timeout', err?: unknown) => {
            if (released || disposed) return
            released = true
            framesPending.delete(time)
            if (reason !== undefined) reportHoldStall(reason, err)
          }
          const timeoutId = setTimeout(() => {
            release('timeout')
          }, HOLD_TIMEOUT_MS)
          hold().then(
            () => {
              clearTimeout(timeoutId)
              release()
            },
            (err: unknown) => {
              clearTimeout(timeoutId)
              release('rejected', err)
            },
          )
        }
      }
      if (!disposed) {
        frameId = requestAnimationFrame(run)
      }
    }

    frameId = requestAnimationFrame(run)

    onCleanup(() => {
      disposed = true
      cancelAnimationFrame(frameId)
    })
  })

  return {
    redraw() {
      lastTime = 0
    },
  }
}
