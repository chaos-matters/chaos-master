import { createEffect, onCleanup, untrack } from 'solid-js'

export function createAnimationFrame(
  fn: () => void,
  minDeltaTime = () => 0,
  hold?: () => Promise<void>,
) {
  let lastTime = 0
  let lastHold: Promise<void> | undefined = undefined
  createEffect(() => {
    let frameId: number

    async function run(time: number) {
      await lastHold
      lastHold = hold?.()
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
