import { createEffect, onCleanup, untrack } from 'solid-js'

export function createAnimationFrame(fn: () => void, minDeltaTime = () => 0) {
  let lastTime = 0
  createEffect(() => {
    let frameId: number

    function run(time: number) {
      const passedEnoughTime = time - lastTime >= minDeltaTime()
      if (lastTime === 0 || passedEnoughTime) {
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

  return {
    redraw() {
      lastTime = 0
    },
  }
}
