import { createEffect, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

export function createAnimationFrame(
  fn: (frameId: number) => void,
  minDeltaTime: number | Accessor<number> = 0,
  hold?: () => Promise<void>,
) {
  let lastTime = 0

  createEffect(() => {
    let frameId: number
    const framesPending = new Set<number>()

    function getDeltaTime(): number {
      return typeof minDeltaTime === 'number' ? minDeltaTime : minDeltaTime()
    }

    function run(time: number) {
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
      frameId = requestAnimationFrame(run)
    }

    frameId = requestAnimationFrame(run)

    onCleanup(() => {
      cancelAnimationFrame(frameId)
    })
  })

  return {
    redraw() {
      lastTime = 0
    },
  }
}
