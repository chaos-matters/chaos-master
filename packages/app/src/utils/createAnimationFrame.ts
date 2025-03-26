import { createEffect, onCleanup, untrack } from 'solid-js'

export function createAnimationFrame(fn: () => void) {
  createEffect(() => {
    let id = -1
    function run() {
      untrack(fn)
      id = requestAnimationFrame(run)
    }
    onCleanup(() => {
      cancelAnimationFrame(id)
    })
    run()
  })
}
