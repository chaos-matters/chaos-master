import { onCleanup, createEffect, createSignal } from 'solid-js'

function createAbortOnCleanup() {
  const ctrl = new AbortController()
  onCleanup(() => {
    ctrl.abort()
  })
  return ctrl.signal
}

export function usePointer(element: HTMLElement) {
  const [pointer, setPointer] = createSignal<PointerEvent | undefined>()
  createEffect(() => {
    const signal = createAbortOnCleanup()
    element.addEventListener(
      'pointermove',
      (ev) => {
        setPointer(ev)
      },
      { signal },
    )
    element.addEventListener(
      'pointercancel',
      () => {
        setPointer(undefined)
      },
      { signal },
    )
  })
  return pointer
}
