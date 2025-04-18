import { createEffect, onCleanup, untrack } from 'solid-js'

export function createAnimationFrame(fn: () => void, interval = 10) {
  createEffect(() => {
    let lastTime = 0
    let frameId: number

    function run(time: number) {
      if (time - lastTime >= interval) {
        lastTime = time
        untrack(fn)
      }
      frameId = requestAnimationFrame(run)
    }

    frameId = requestAnimationFrame(run)

    onCleanup(() => {
      cancelAnimationFrame(frameId)
    })
  })
}
