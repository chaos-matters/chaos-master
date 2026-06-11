import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

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
          hold()
            .then(() => framesPending.delete(time))
            .catch(console.error)
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
