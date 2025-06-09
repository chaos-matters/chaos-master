import { createEffect, onCleanup } from 'solid-js'

export function createAnimationFrame(
  fn: (frameId: number) => void,
  minDeltaTime = () => 0,
  hold?: () => Promise<void>,
) {
  let lastTime = 0

  createEffect(() => {
    let frameId: number
    const framesPending = new Set<number>()

    function run(time: number) {
      const framesNotPending = framesPending.size <= 2
      const passedEnoughTime = time - lastTime >= minDeltaTime()
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
