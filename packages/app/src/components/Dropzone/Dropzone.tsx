import { createEffect, createSignal, onCleanup } from 'solid-js'
import ui from './Dropzone.module.css'
import type { ParentProps } from 'solid-js'

function preventDraggingAnyElement() {
  createEffect(() => {
    function preventDefault(ev: Event) {
      ev.preventDefault()
    }
    document.addEventListener('dragstart', preventDefault)
    onCleanup(() => {
      document.removeEventListener('dragstart', preventDefault)
    })
  })
}

type DropzoneProps = {
  class?: string
  onDrop: (file: File) => void
}

export function Dropzone(props: ParentProps<DropzoneProps>) {
  const [dropping, setDropping] = createSignal(false)

  preventDraggingAnyElement()

  return (
    <div
      class={ui.dropzone}
      classList={{
        [props.class ?? '']: true,
        [ui.dropping]: dropping(),
      }}
      onDragEnter={() => {
        setDropping(true)
      }}
      onDragLeave={() => {
        setDropping(false)
      }}
      onDragOver={(ev) => {
        // needed for drop to work
        ev.preventDefault()
      }}
      onDrop={(ev) => {
        const file = ev.dataTransfer?.files.item(0)
        if (file) {
          ev.preventDefault()
          props.onDrop(file)
          setDropping(false)
        }
      }}
    >
      {props.children}
    </div>
  )
}
